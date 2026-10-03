import type { AppConfig } from '@sap/config';
import type { Sql, TransactionSql } from 'postgres';
import { createHash } from 'node:crypto';
import { ObjectStore } from './object-store.js';

type Row=Record<string,any>;
type ReviewEvent={topic:string;aggregate_id:string;payload_minimal:Record<string,unknown>};
type Executor=Sql|TransactionSql;
const reasons=new Set(['LOCATION_UNCONFIRMED','TIME_UNCONFIRMED','POSSIBLE_DUPLICATE','MORE_EVIDENCE_REQUIRED','EVIDENCE_CONFLICT','IMAGE_UNCLEAR','PUBLIC_PRIVACY_RISK','NO_NEW_EVIDENCE','PARTIAL_CLEANUP','MEASUREMENT_UNCONFIRMED']);

/** Private AI transport. This processor cannot issue any moderation or publication command. */
export class ReviewProcessor {
  constructor(private readonly sql: Sql,private readonly config: AppConfig,private readonly objects: ObjectStore) {}

  async process(event: ReviewEvent): Promise<void> {
    if(event.topic!=='review.requested') throw new Error('REVIEW_TOPIC_INVALID');
    const row=await this.claim(event.aggregate_id); if(!row) return;
    try {
      if(!this.config.SAP_EXTENSION_ENABLED||!this.config.SAP_HERMES_ENABLED) throw new Error('HERMES_DISABLED');
      if(!this.config.HERMES_REVIEW_URL||!this.config.HERMES_REVIEW_SECRET) throw new Error('HERMES_UNCONFIGURED');
      if(createHash('sha256').update(canonical(row.snapshot)).digest('hex')!==row.snapshot_hash) throw new Error('REVIEW_EVIDENCE_INVALID');
      if(!(await this.isCurrent(row))) {await this.finishSuperseded(row.id);return;}
      const evidence=row.snapshot.evidence as {mediaId:string;sha256:string;mime:string;width:number;height:number}[];
      let byteCount=0;
      const images=[];
      for(const reference of evidence) {
        const media=await this.sql<Row[]>`SELECT m.id,m.object_key,m.mime,m.sha256 FROM media m WHERE m.id=${reference.mediaId}
          AND m.state='stored' AND m.deleted_at IS NULL AND m.sha256=${reference.sha256}`;
        if(!media[0]) throw new Error('REVIEW_EVIDENCE_INVALID');
        const bytes=await this.objects.getObject(media[0].object_key); byteCount+=bytes.length;
        if(byteCount>24*1024*1024) throw new Error('REVIEW_MEDIA_BUDGET_EXCEEDED');
        images.push({mediaId:reference.mediaId,mime:media[0].mime,data:bytes.toString('base64')});
      }
      const response=await fetch(`${this.config.HERMES_REVIEW_URL.replace(/\/$/,'')}/review`,{
        method:'POST',redirect:'error',headers:{'content-type':'application/json','authorization':`Bearer ${this.config.HERMES_REVIEW_SECRET}`},
        body:JSON.stringify({runId:row.id,modelVersion:row.model_version,policyVersion:row.policy_version,snapshotHash:row.snapshot_hash,snapshot:row.snapshot,images,
          limits:{timeoutMs:this.config.HERMES_TIMEOUT_MS,maxIterations:this.config.HERMES_MAX_ITERATIONS,maxInputTokens:this.config.HERMES_MAX_INPUT_TOKENS,
            maxOutputTokens:this.config.HERMES_MAX_OUTPUT_TOKENS,maxCostUsd:this.config.HERMES_RUN_BUDGET_USD}}),
        signal:AbortSignal.timeout(this.config.HERMES_TIMEOUT_MS+5000),
      });
      if(!response.ok) throw new Error(response.status===429?'HERMES_BUDGET_EXHAUSTED':response.status===409?'HERMES_INTENT_PENDING':'HERMES_UNAVAILABLE');
      const raw=await boundedBody(response,65536);
      const payload=JSON.parse(raw) as {result:unknown;usage?:{inputTokens:number;outputTokens:number;costUsd:number}};
      validateReviewResult(payload.result,row);
      const usage=payload.usage;
      if(!usage||!Number.isFinite(usage.costUsd)||usage.costUsd<0||usage.costUsd>this.config.HERMES_RUN_BUDGET_USD
        ||!Number.isInteger(usage.inputTokens)||usage.inputTokens<=0||usage.inputTokens>this.config.HERMES_MAX_INPUT_TOKENS
        ||!Number.isInteger(usage.outputTokens)||usage.outputTokens<=0||usage.outputTokens>this.config.HERMES_MAX_OUTPUT_TOKENS) throw new Error('HERMES_USAGE_INVALID');
      await this.sql.begin(async tx=>{
        const reports=await tx<Row[]>`SELECT revision FROM reports WHERE id=${row.report_id} FOR SHARE`;
        const current=await this.subjectRevision(tx,row,true);
        const refs=row.snapshot.evidence as {mediaId:string;sha256:string}[];
        const live=refs.length?await tx<Row[]>`SELECT id,sha256 FROM media WHERE id=ANY(${refs.map(e=>e.mediaId)}::uuid[])
          AND state='stored' AND deleted_at IS NULL FOR SHARE`:[];
        const valid=reports[0]?.revision===row.source_report_revision&&current===row.subject_revision
          &&live.length===refs.length&&refs.every(e=>live.some(m=>m.id===e.mediaId&&m.sha256===e.sha256));
        await tx`UPDATE review_runs SET status=${valid?'completed':'superseded'},result=${valid?tx.json(payload.result as never):null},
          usage_input_tokens=${valid?usage.inputTokens:null},usage_output_tokens=${valid?usage.outputTokens:null},
          usage_cost_usd=${valid?usage.costUsd:null},error_code=NULL,finished_at=now(),lease_expires_at=NULL
          WHERE id=${row.id} AND status='running' AND attempts=${row.attempts} AND lease_expires_at>now()`;
      });
    } catch(error) {
      const message=error instanceof Error?error.message:'HERMES_UNAVAILABLE';
      const safe=/^(HERMES_(?:DISABLED|UNCONFIGURED|UNAVAILABLE|BUDGET_EXHAUSTED|INVALID_RESPONSE|USAGE_INVALID|INTENT_PENDING)|REVIEW_(?:EVIDENCE_INVALID|MEDIA_BUDGET_EXCEEDED))$/.test(message)?message:
        error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError')?'HERMES_TIMEOUT':'HERMES_INVALID_RESPONSE';
      await this.sql`UPDATE review_runs SET status='failed',result=NULL,error_code=${safe},finished_at=now(),lease_expires_at=NULL
        WHERE id=${row.id} AND status='running' AND attempts=${row.attempts}`;
    }
  }

  private async claim(id:string):Promise<Row|null> {
    return this.sql.begin(async tx=>{
      const rows=await tx<Row[]>`SELECT * FROM review_runs WHERE id=${id} FOR UPDATE`; const row=rows[0];
      if(!row||['completed','failed','superseded'].includes(row.status)) return null;
      if(row.status==='running'&&row.lease_expires_at&&new Date(row.lease_expires_at).getTime()>Date.now()) return null;
      // Unknown previous inference is not automatically repeated after a crash. Human rerun creates a fresh intent.
      if(row.status==='running') {await tx`UPDATE review_runs SET status='failed',error_code='HERMES_INTERRUPTED',result=NULL,finished_at=now(),lease_expires_at=NULL WHERE id=${id}`;return null;}
      if(!this.config.SAP_EXTENSION_ENABLED||!this.config.SAP_HERMES_ENABLED||!this.config.HERMES_REVIEW_URL||!this.config.HERMES_REVIEW_SECRET) {
        await tx`UPDATE review_runs SET status='failed',error_code=${!this.config.SAP_EXTENSION_ENABLED||!this.config.SAP_HERMES_ENABLED?'HERMES_DISABLED':'HERMES_UNCONFIGURED'},finished_at=now() WHERE id=${id}`;
        return null;
      }
      await tx`INSERT INTO review_daily_budgets(budget_date) VALUES((now() AT TIME ZONE 'Asia/Jakarta')::date) ON CONFLICT DO NOTHING`;
      const budget=await tx<Row[]>`SELECT reserved_usd FROM review_daily_budgets WHERE budget_date=(now() AT TIME ZONE 'Asia/Jakarta')::date FOR UPDATE`;
      if(Number(budget[0]?.reserved_usd??0)+this.config.HERMES_RUN_BUDGET_USD>this.config.HERMES_DAILY_BUDGET_USD) {
        await tx`UPDATE review_runs SET status='failed',error_code='HERMES_BUDGET_EXHAUSTED',finished_at=now() WHERE id=${id}`;return null;
      }
      await tx`UPDATE review_daily_budgets SET reserved_usd=reserved_usd+${this.config.HERMES_RUN_BUDGET_USD} WHERE budget_date=(now() AT TIME ZONE 'Asia/Jakarta')::date`;
      const updated=await tx<Row[]>`UPDATE review_runs SET status='running',started_at=now(),attempts=attempts+1,cost_reserved_usd=${this.config.HERMES_RUN_BUDGET_USD},
        lease_expires_at=now()+${this.config.HERMES_TIMEOUT_MS+30000}*interval '1 millisecond' WHERE id=${id} RETURNING *`;
      return updated[0]??null;
    }) as Promise<Row|null>;
  }
  private async subjectRevision(sql:Executor,row:Row,lock=false):Promise<number|null> {
    const suffix=lock?sql`FOR SHARE`:sql``;
    const subjects=row.subject_type==='report'?await sql<Row[]>`SELECT revision FROM reports WHERE id=${row.subject_id} ${suffix}`:
      row.subject_type==='community_update'?await sql<Row[]>`SELECT revision FROM community_updates WHERE id=${row.subject_id} ${suffix}`:
      await sql<Row[]>`SELECT revision FROM activity_results WHERE id=${row.subject_id} ${suffix}`;
    return subjects[0]?.revision??null;
  }
  private async isCurrent(row:Row):Promise<boolean> {
    const reports=await this.sql<Row[]>`SELECT revision FROM reports WHERE id=${row.report_id}`;
    return reports[0]?.revision===row.source_report_revision&&(await this.subjectRevision(this.sql,row))===row.subject_revision;
  }
  private async finishSuperseded(id:string):Promise<void> {await this.sql`UPDATE review_runs SET status='superseded',finished_at=now(),lease_expires_at=NULL WHERE id=${id} AND status='running'`;}
}

export function validateReviewResult(value:unknown,row:Row):void {
  const invalid=()=>{throw new Error('HERMES_INVALID_RESPONSE');};
  if(!value||typeof value!=='object'||Array.isArray(value)) invalid();
  const result=value as Row;
  const keys=['schemaVersion','subjectType','subjectId','subjectRevision','sourceReportId','sourceReportRevision','snapshotHash','recommendation','reasonCodes','evidence','duplicateCandidates','missingEvidence','publicSummaryProposal','publicationWarnings'];
  if(Object.keys(result).length!==keys.length||Object.keys(result).some(k=>!keys.includes(k))) invalid();
  if(result.schemaVersion!=='sap-evidence-review-v1'||result.subjectType!==row.subject_type||result.subjectId!==row.subject_id||result.subjectRevision!==row.subject_revision
    ||result.sourceReportId!==row.report_id||result.sourceReportRevision!==row.source_report_revision||result.snapshotHash!==row.snapshot_hash) invalid();
  if(!['recommend_accept','human_review','recommend_reject','recommend_duplicate'].includes(result.recommendation)) invalid();
  if(result.recommendation==='recommend_duplicate'&&row.subject_type!=='report') invalid();
  const array=(v:unknown,max:number)=>{if(!Array.isArray(v)||v.length>max)invalid();return v as unknown[];};
  const text=(v:unknown,max:number)=>{if(typeof v!=='string'||[...v].length<1||[...v].length>max)invalid();};
  const codeList=array(result.reasonCodes,10);if(new Set(codeList).size!==codeList.length||codeList.some(c=>typeof c!=='string'||!reasons.has(c)))invalid();
  const allowedMedia=new Set((row.snapshot.evidence as Row[]).map(e=>e.mediaId));
  const evidence=array(result.evidence,9); const seen=new Set();
  for(const v of evidence){if(!v||typeof v!=='object'||Array.isArray(v))invalid();const e=v as Row;
    if(Object.keys(e).length!==2||Object.keys(e).some(k=>k!=='mediaId'&&k!=='observation')||!allowedMedia.has(e.mediaId)||seen.has(e.mediaId))invalid();seen.add(e.mediaId);text(e.observation,500);}
  const candidates=array(result.duplicateCandidates,5); const allowedCandidates=new Set((row.snapshot.duplicateCandidates as Row[]).map(c=>c.id));
  if(new Set(candidates).size!==candidates.length||candidates.some(c=>!allowedCandidates.has(c))||(row.subject_type!=='report'&&candidates.length))invalid();
  if(result.recommendation==='recommend_duplicate'&&!candidates.length)invalid();
  for(const v of array(result.missingEvidence,3))text(v,300);
  for(const v of array(result.publicationWarnings,5))text(v,300);
  if(result.publicSummaryProposal!==null)text(result.publicSummaryProposal,500);
}

function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value)??'null';
}

async function boundedBody(response:Response,maxBytes:number):Promise<string> {
  const reader=response.body?.getReader(); if(!reader) throw new Error('HERMES_INVALID_RESPONSE');
  const chunks:Uint8Array[]=[];let length=0;
  try {for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;
    if(length>maxBytes){await reader.cancel();throw new Error('HERMES_INVALID_RESPONSE');}chunks.push(part.value);}}
  finally {reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
