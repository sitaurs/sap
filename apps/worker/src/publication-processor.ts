import {createHash,createHmac,createDecipheriv,randomUUID} from 'node:crypto';
import type {Sql, TransactionSql} from 'postgres';
import {PosterRenderer, type PosterSource} from './poster/poster-renderer.js';
import type {AppConfig} from '@sap/config';
import type {ObjectStore} from './object-store.js';
type Row=Record<string,any>;
type Event={topic:string;aggregate_id:string;payload_minimal:Record<string,unknown>};
type Executor=Sql|TransactionSql;
class LeaseLost extends Error {}
const INVALID={status:'invalidated',contentRevision:null,sourceRevision:null,renditionId:null,approvedAt:null};
class ProviderError extends Error{constructor(readonly code:string,readonly uncertain=false){super(code);}}
/** Durable stages are committed before network calls so timeout cannot become a second publish. */
export class PublicationProcessor{
 private readonly poster:PosterRenderer;
 constructor(private readonly sql:Sql,private readonly config:AppConfig,private readonly objects:ObjectStore){this.poster=new PosterRenderer(sql,config);}
 async process(event:Event):Promise<void>{
  const enabled=this.config.SAP_EXTENSION_ENABLED&&this.config.SAP_INSTAGRAM_ENABLED;
  if(event.topic==='instagram.render.requested'){if(enabled)await this.render(event.aggregate_id);return;}
  if((event.topic==='instagram.publish.requested')&&!enabled)return;
  if(event.topic==='publication.source.changed'||event.topic==='report.moderated'||event.topic==='report.verified'||event.topic==='activity.result.approved'||event.topic==='community.update.approved'){
   await this.reconcileSource(String(event.payload_minimal.reportId??event.aggregate_id),!enabled||event.payload_minimal.suppressAutomaticDraft===true);return;
  }
  if(event.topic==='media.consent.changed'){
   const rows=await this.sql`SELECT DISTINCT report_id FROM instagram_posts WHERE media_id=${event.aggregate_id}`;for(const r of rows)await this.reconcileSource(r.report_id,!enabled);return;
  }
  if(!enabled&&event.topic!=='instagram.retract.requested'&&event.topic!=='instagram.disconnect.requested')return;
  await this.operation(event.aggregate_id);
 }
 private async operation(id:string){
  const owner=randomUUID(),[op]=await this.sql`UPDATE instagram_operations SET status='running',lease_owner=${owner},lease_expires_at=now()+${this.config.EXTENSION_JOB_LEASE_MS}*interval '1 millisecond',attempt_count=attempt_count+1,updated_at=now()
   WHERE id=${id} AND status IN ('queued','running') AND (next_retry_at IS NULL OR next_retry_at<=now()) AND (lease_expires_at IS NULL OR lease_expires_at<now()) RETURNING *`;
  if(!op)return;
  try{
   if(op.kind==='disconnect'){await this.disconnect(op);return;}
   const [post]=await this.sql`SELECT * FROM instagram_posts WHERE id=${op.post_id}`;
   if(!post){await this.fail(op,'POST_NOT_FOUND',false);return;}
   const [proof]=await this.sql`SELECT id FROM instagram_publication_attempts WHERE operation_id=${op.id} AND stage IN ('publish_response','delete_response') AND outcome='confirmed' LIMIT 1`;
   if(op.attempt_count>this.config.EXTENSION_JOB_MAX_ATTEMPTS&&!proof&&!(op.kind==='publish'&&post.provider_media_id)){await this.fail(op,'PUBLICATION_ATTEMPTS_EXHAUSTED',['publish_requested','uncertain'].includes(op.stage));return;}
   if(op.kind==='publish')await this.publish(op,post);else await this.retract(op,post);
  }catch(error){
   if(error instanceof LeaseLost)return;
   const code=error instanceof ProviderError?error.code:'PUBLICATION_PROCESS_FAILED',uncertain=error instanceof ProviderError&&error.uncertain;
   try{await this.fail(op,code,uncertain);}catch(failure){if(!(failure instanceof LeaseLost))throw failure;}
  }finally{await this.sql`UPDATE instagram_operations SET lease_owner=NULL,lease_expires_at=NULL WHERE id=${id} AND lease_owner=${owner}`;}
 }
 /** Every state transition locks parent → post → operation and checks the lease token. */
 private async owned<T>(op:Row,work:(tx:TransactionSql,current:Row)=>Promise<T>):Promise<T>{
  return this.sql.begin(async tx=>{
   if(op.post_id){
    const [ref]=await tx`SELECT report_id FROM instagram_posts WHERE id=${op.post_id}`;
    if(ref){await tx`SELECT id FROM reports WHERE id=${ref.report_id} FOR UPDATE`;await tx`SELECT id FROM instagram_posts WHERE id=${op.post_id} FOR UPDATE`;await tx`SELECT id FROM instagram_accounts WHERE id=${op.account_id} FOR SHARE`;}
   }else await tx`SELECT id FROM instagram_accounts WHERE id=${op.account_id} FOR UPDATE`;
   const [current]=await tx`SELECT * FROM instagram_operations WHERE id=${op.id} AND lease_owner=${op.lease_owner} AND status='running' FOR UPDATE`;
   if(!current)throw new LeaseLost();
   await tx`UPDATE instagram_operations SET lease_expires_at=now()+${this.config.EXTENSION_JOB_LEASE_MS}*interval '1 millisecond' WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;
   return work(tx,current);
  }) as Promise<T>;
 }
 private async publish(op:Row,post:Row){
  const [proof]=await this.sql`SELECT provider_media_id FROM instagram_publication_attempts WHERE operation_id=${op.id} AND stage='publish_response' AND outcome='confirmed' ORDER BY created_at LIMIT 1`;
  if(proof?.provider_media_id){await this.successPublish(op,post,proof.provider_media_id,post.permalink);return;}
  // Recovery inspects a potentially completed media_publish even if its source was withdrawn.
  if(post.provider_media_id){await this.successPublish(op,post,post.provider_media_id,post.permalink);return;}
  if(['published','retracted','cancelled'].includes(post.status)){
   await this.finish(op,'cancelled','not_created','Publikasi dibatalkan.');return;
  }
  const [account]=await this.sql`SELECT * FROM instagram_accounts WHERE id=${post.account_id}`;
  if(['publish_requested','uncertain'].includes(op.stage)){
   if(!this.accountReady(account,['instagram_basic'])){await this.fail(op,'INSTAGRAM_ACCOUNT_REQUIRED',true);return;}
   await this.inspectUncertain(op,post,this.credentials(account).pageToken);return;
  }
  if(!this.config.SAP_INSTAGRAM_PUBLISH_ENABLED){await this.fail(op,'PUBLISH_DISABLED',false);return;}
  if(!await this.eligible(post)||!this.approved(post)){await this.fail(op,'SOURCE_REVISION_CHANGED',false);return;}
  if(!this.accountReady(account,['instagram_basic','instagram_content_publish'])){await this.fail(op,'META_PERMISSION_REQUIRED',false);return;}
  const token=this.credentials(account).pageToken;
  let containerId=post.provider_container_id;
  if(!containerId){
   await this.stage(op,'container_requested');
   const expires=Date.now()+30*60*1000,signature=createHmac('sha256',this.config.SESSION_SECRET).update(`${post.id}:${expires}:${post.content_revision}`).digest('base64url');
   const mediaUrl=new URL(`/api/v1/publication-assets/${post.id}`,this.config.META_MEDIA_DELIVERY_ORIGIN!).toString()+`?token=${expires}.${post.content_revision}.${signature}`;
   const container=await this.graph(`${account!.ig_user_id}/media`,token,{image_url:mediaUrl,caption:post.caption,alt_text:post.alt_text},'POST');
   if(typeof container.id!=='string')throw new ProviderError('META_CONTAINER_INVALID',true);
   containerId=container.id;
   await this.owned(op,async tx=>{
    await tx`UPDATE instagram_posts SET provider_container_id=${containerId},updated_at=now() WHERE id=${post.id} AND content_revision=${post.content_revision}`;
    await tx`UPDATE instagram_operations SET stage='container_created',updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;
   });
  }
  await this.stage(op,'container_poll');
  const container=await this.graph(containerId,token,{fields:'id,status_code,status'});
  if(container.status_code==='ERROR'||container.status_code==='EXPIRED'){await this.fail(op,'META_CONTAINER_FAILED',false);return;}
  if(container.status_code==='PUBLISHED'){await this.fail(op,'PUBLICATION_UNCERTAIN',true);return;}
  if(container.status_code!=='FINISHED'){
   await this.owned(op,async tx=>{await tx`UPDATE instagram_operations SET status='queued',next_retry_at=now()+interval '15 seconds',message='Media sedang disiapkan Meta.',updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;});return;
  }
  // The source, exact approval and pending withdrawal are checked in the same commit as this stage.
  await this.stage(op,'publish_requested',true);
  const published=await this.graph(`${account!.ig_user_id}/media_publish`,token,{creation_id:containerId},'POST');
  if(typeof published.id!=='string')throw new ProviderError('META_PUBLISH_RESPONSE_INVALID',true);
  // This immutable provider fact may be recorded by a delayed owner. State transitions remain fenced.
  await this.sql`INSERT INTO instagram_publication_attempts(operation_id,stage,outcome,provider_media_id) VALUES(${op.id},'publish_response','confirmed',${published.id}) ON CONFLICT DO NOTHING`;
  await this.sql`UPDATE instagram_operations SET status='queued',next_retry_at=NULL WHERE id=${op.id} AND status='needs_action' AND stage='uncertain'`;
  await this.successPublish(op,post,published.id,null);
  // A permalink is enrichment after durable confirmation, never a publication prerequisite.
  try{
   const media=await this.graph(published.id,token,{fields:'id,permalink,timestamp'});
   if(media.id===published.id&&typeof media.permalink==='string'&&/^https:\/\//.test(media.permalink))await this.sql`UPDATE instagram_posts SET permalink=${media.permalink} WHERE id=${post.id} AND provider_media_id=${published.id}`;
  }catch{}
 }
 private approved(post:Row){return post.approval?.status==='approved'&&post.approval.contentRevision===post.content_revision&&post.approval.sourceRevision===post.source_revision&&post.approval.renditionId===post.rendition_id&&post.rendition_status==='ready'&&!!post.rendition_object_key;}
 private async inspectUncertain(op:Row,post:Row,token:string){
  if(post.provider_media_id){await this.successPublish(op,post,post.provider_media_id,post.permalink);return;}
  if(post.provider_container_id){try{await this.stage(op,'uncertain');await this.graph(post.provider_container_id,token,{fields:'id,status_code'});}catch(error){if(error instanceof LeaseLost)throw error;}}
  // A container's PUBLISHED status or matching caption cannot establish the exact media ID.
  await this.fail(op,'PUBLICATION_UNCERTAIN',true);
 }
 private async retract(op:Row,post:Row){
  if(post.status==='retracted'){await this.finish(op,'succeeded','deleted','Penghapusan telah dikonfirmasi.');return;}
  const mediaId=post.provider_media_id;
  const [proof]=await this.sql`SELECT provider_media_id FROM instagram_publication_attempts WHERE operation_id=${op.id} AND stage='delete_response' AND outcome='confirmed' ORDER BY created_at LIMIT 1`;
  if(mediaId&&proof?.provider_media_id===mediaId){await this.successRetract(op,post);return;}
  const [publish]=await this.sql`SELECT * FROM instagram_operations WHERE post_id=${post.id} AND kind='publish' ORDER BY created_at DESC LIMIT 1`;
  if(!mediaId&&publish?.status==='running'&&publish.lease_expires_at&&new Date(publish.lease_expires_at).getTime()>Date.now()){
   await this.owned(op,async tx=>{await tx`UPDATE instagram_operations SET status='queued',next_retry_at=now()+interval '15 seconds',message='Menunggu hasil publish yang sedang berjalan.',updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;});return;
  }
  if(!mediaId&&publish&&['publish_requested','uncertain','published'].includes(publish.stage)){await this.fail(op,'PUBLICATION_UNCERTAIN',true);return;}
  if(!mediaId){
   await this.owned(op,async tx=>{
    await tx`UPDATE instagram_posts SET status='cancelled',approval=${tx.json(INVALID)},revision=revision+1,updated_at=now() WHERE id=${post.id}`;
    await tx`UPDATE instagram_operations SET status='succeeded',stage='not_created',channels=${tx.json({...op.channels,instagram:'not_created'})},message='Publish belum dilakukan; draf dibatalkan.',error_code=NULL,next_retry_at=NULL,updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;
   });return;
  }
  const [account]=await this.sql`SELECT * FROM instagram_accounts WHERE id=${post.account_id}`;
  if(!this.config.META_DELETE_ENABLED||!this.accountReady(account,['instagram_basic','instagram_manage_contents'])){
   await this.fail(op,!this.config.META_DELETE_ENABLED?'DELETE_READINESS_REQUIRED':'META_PERMISSION_REQUIRED',true);return;
  }
  // Instagram deletion uses the Facebook User token. 404 alone is not proof of deletion.
  const {userToken}=this.credentials(account!);await this.stage(op,'delete_requested');
  const deleted=await this.graph(mediaId,userToken,{},'DELETE');
  if(deleted.success!==true||String(deleted.deleted_id)!==String(mediaId))throw new ProviderError('META_DELETE_UNCONFIRMED',true);
  await this.sql`INSERT INTO instagram_publication_attempts(operation_id,stage,outcome,provider_media_id) VALUES(${op.id},'delete_response','confirmed',${mediaId}) ON CONFLICT DO NOTHING`;
  await this.sql`UPDATE instagram_operations SET status='queued',next_retry_at=NULL WHERE id=${op.id} AND status='needs_action'`;
  await this.successRetract(op,post);
 }
 private async successRetract(op:Row,post:Row){
  await this.owned(op,async tx=>{
   await tx`UPDATE instagram_posts SET status='retracted',retracted_at=now(),approval=${tx.json(INVALID)},revision=revision+1,updated_at=now() WHERE id=${post.id}`;
   await tx`UPDATE instagram_operations SET status='succeeded',stage='delete_confirmed',channels=${tx.json({...op.channels,instagram:'deleted'})},error_code=NULL,message='Penghapusan dikonfirmasi Meta.',next_retry_at=NULL,updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;
   await tx`INSERT INTO instagram_publication_attempts(operation_id,stage,outcome) VALUES(${op.id},'delete_confirmed','confirmed')`;
  });
 }
 private async successPublish(op:Row,post:Row,id:string,permalink:string|null){
  await this.owned(op,async tx=>{
   const [pending]=await tx`SELECT * FROM instagram_operations WHERE post_id=${post.id} AND kind='retract' AND status NOT IN ('succeeded','cancelled') LIMIT 1`;
   const [current]=await tx`SELECT status FROM instagram_posts WHERE id=${post.id}`;
   // Retraction or manual confirmation may finish while a delayed provider response is returning.
   const status=current?.status==='retracted'?'retracted':pending?'retracting':'published';
   await tx`UPDATE instagram_posts SET provider_media_id=${id},published_at=COALESCE(published_at,now()),status=${status},permalink=COALESCE(${permalink},permalink),publish_error=NULL,revision=revision+1,updated_at=now() WHERE id=${post.id}`;
   await tx`UPDATE instagram_operations SET status='succeeded',stage='published',channels=${tx.json({...op.channels,instagram:'published'})},message='Publikasi dikonfirmasi Meta.',error_code=NULL,next_retry_at=NULL,updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;
   await tx`INSERT INTO instagram_publication_attempts(operation_id,stage,outcome) VALUES(${op.id},'published','confirmed')`;
   if(pending?.status==='needs_action'&&pending.error_code==='PUBLICATION_UNCERTAIN'){
    await tx`UPDATE instagram_operations SET status='queued',error_code=NULL,next_retry_at=NULL,message='Identitas publikasi telah dikonfirmasi; menunggu penarikan.',updated_at=now() WHERE id=${pending.id}`;
    await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key) VALUES('instagram.retract.requested',${pending.id},${tx.json({aggregateRevision:pending.attempt_count+2})},${`instagram.retract.requested:${pending.id}:${pending.attempt_count+2}`}) ON CONFLICT DO NOTHING`;
   }
  });
 }
 private async fail(op:Row,code:string,uncertain:boolean){
  await this.owned(op,async(tx,current)=>{
   const publishUncertain=op.kind==='publish'&&(uncertain||['publish_requested','uncertain'].includes(current.stage));
   const action=publishUncertain||uncertain||op.kind==='retract';
   const retry=!action&&code==='META_RATE_LIMITED'&&op.attempt_count<this.config.EXTENSION_JOB_MAX_ATTEMPTS;
   const channels={...current.channels,instagram:action?'needs_action':current.channels.instagram};
   const status=retry?'queued':action?'needs_action':'failed',wait=Math.min(300,15*2**Math.max(0,op.attempt_count-1));
   await tx`UPDATE instagram_operations SET status=${status},stage=${publishUncertain?'uncertain':current.stage},error_code=${code},message=${retry?'Provider membatasi permintaan; percobaan ulang dijadwalkan.':action?'Memerlukan tindakan admin; hasil provider belum dikonfirmasi.':'Proses gagal; periksa prasyarat sebelum mencoba lagi.'},channels=${tx.json(channels)},next_retry_at=${retry?new Date(Date.now()+wait*1000):null},updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;
   if(op.post_id){
    const [retraction]=await tx`SELECT id FROM instagram_operations WHERE post_id=${op.post_id} AND kind='retract' AND status NOT IN ('succeeded','cancelled') LIMIT 1`;
    await tx`UPDATE instagram_posts SET status=CASE WHEN status IN ('cancelled','retracted') THEN status ELSE ${action?'needs_action':retraction?'retracting':retry?'publishing':'failed'} END,publish_error=${code},revision=revision+1,updated_at=now() WHERE id=${op.post_id}`;
   }
   await tx`INSERT INTO instagram_publication_attempts(operation_id,stage,outcome,error_code) VALUES(${op.id},${current.stage},${publishUncertain||uncertain?'uncertain':'failed'},${code})`;
  });
  if(code==='META_TOKEN_EXPIRED'||code==='META_PERMISSION_REQUIRED')await this.sql`UPDATE instagram_accounts SET status=${code==='META_TOKEN_EXPIRED'?'expired':'needs_action'},updated_at=now() WHERE id=${op.account_id} AND status<>'disconnected'`;
 }
 private async finish(op:Row,status:string,instagram:string,message:string){
  await this.owned(op,async tx=>{await tx`UPDATE instagram_operations SET status=${status},channels=${tx.json({...op.channels,instagram})},message=${message},error_code=NULL,next_retry_at=NULL,updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;});
 }
 private async stage(op:Row,stage:string,beforePublish=false){
  await this.owned(op,async tx=>{
   const [post]=op.post_id?await tx`SELECT * FROM instagram_posts WHERE id=${op.post_id}`:[];
   if(beforePublish){
    const [account]=await tx`SELECT * FROM instagram_accounts WHERE id=${op.account_id} FOR SHARE`;
    const [retract]=await tx`SELECT id FROM instagram_operations WHERE post_id=${op.post_id} AND kind='retract' AND status NOT IN ('succeeded','cancelled') LIMIT 1`;
    if(!post||retract||!this.approved(post)||!await this.eligible(post,tx)||!this.accountReady(account,['instagram_basic','instagram_content_publish']))throw new ProviderError('SOURCE_REVISION_CHANGED');
   }
   const fingerprint=createHash('sha256').update(JSON.stringify({operationId:op.id,stage,postId:op.post_id,contentRevision:post?.content_revision,containerId:post?.provider_container_id})).digest('hex');
   await tx`UPDATE instagram_operations SET stage=${stage},updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;
   await tx`INSERT INTO instagram_publication_attempts(operation_id,stage,outcome,request_fingerprint,attempt_number) VALUES(${op.id},${stage},'started',${fingerprint},${op.attempt_count})`;
  });
 }
 private async disconnect(op:Row){
  await this.owned(op,async tx=>{
   // Close submissions first, but retain credentials until in-flight provider calls have settled.
   const [active]=await tx`SELECT id FROM instagram_operations WHERE account_id=${op.account_id} AND kind IN ('publish','retract') AND status='running' AND lease_expires_at>now() LIMIT 1`;
   if(active){await tx`UPDATE instagram_operations SET status='queued',next_retry_at=now()+interval '15 seconds',message='Menunggu operasi provider yang sedang berjalan.',updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;return;}
   await tx`UPDATE instagram_operations SET status=CASE WHEN stage IN ('publish_requested','uncertain') THEN 'needs_action' ELSE 'cancelled' END,error_code='INSTAGRAM_ACCOUNT_REQUIRED',message='Koneksi diputus sebelum operasi dikonfirmasi.',updated_at=now() WHERE account_id=${op.account_id} AND kind='publish' AND status IN ('queued','running')`;
   const pending=await tx`SELECT id FROM instagram_operations WHERE account_id=${op.account_id} AND kind IN ('publish','retract') AND status='needs_action' OR account_id=${op.account_id} AND kind='retract' AND status NOT IN ('succeeded','cancelled')`;
   await tx`UPDATE instagram_accounts SET status='disconnected',encrypted_credentials=NULL,updated_at=now() WHERE id=${op.account_id}`;
   await tx`UPDATE instagram_operations SET status=${pending.length?'needs_action':'succeeded'},stage='credentials_removed',channels=${tx.json({sap:'unaffected',instagram:pending.length?'needs_action':'not_created'})},message=${pending.length?'Koneksi diputus; penarikan memerlukan koneksi ulang atau konfirmasi manual.':'Koneksi SAP diputus.'},next_retry_at=NULL,updated_at=now() WHERE id=${op.id} AND lease_owner=${op.lease_owner}`;
   await tx`UPDATE instagram_operations SET status='needs_action',error_code='INSTAGRAM_ACCOUNT_REQUIRED',message='Hubungkan kembali akun atau konfirmasikan penghapusan manual.',updated_at=now() WHERE account_id=${op.account_id} AND kind='retract' AND status IN ('queued','running')`;
  });
 }
 private async eligible(post:Row,db:Executor=this.sql):Promise<boolean>{
  const [r]=await db`SELECT p.id FROM instagram_posts p JOIN reports r ON r.id=p.report_id JOIN media_publication_approvals a ON a.report_id=r.id AND a.media_id=p.media_id AND a.rendition_id=p.evidence_rendition_id AND a.channel='instagram' JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=a.media_id JOIN media m ON m.id=a.media_id WHERE p.id=${post.id} AND r.revision=p.source_revision AND r.public_visibility='public' AND r.instagram_allowed AND r.status IN ('verified','in_progress','resolved') AND r.duplicate_of_id IS NULL AND r.public_summary IS NOT NULL AND a.approved AND er.status='ready' AND 'instagram'=ANY(mc.channels) AND m.state='stored' AND m.deleted_at IS NULL AND p.status IN ('draft','failed','publishing','published')`;
  if(!r)return false;
  const milestone=post.kind==='resolution'?await this.milestone(db,post.report_id,post.milestone_id):null;
  return this.hasEvidenceSource(db,post.report_id,post.media_id,post.evidence_rendition_id,post.kind,milestone);
 }
 private evidenceSources(reportId:string,mediaId:string,kind:'initial'|'resolution',milestone:Row|null|undefined):Row[]{
  return kind==='initial'?[{media_id:mediaId,subject_type:'report',subject_id:reportId}]:((milestone?.allowedSources??[]) as Row[]).filter(s=>s.media_id===mediaId);
 }
 private async hasEvidenceSource(db:Executor,reportId:string,mediaId:string,renditionId:string,kind:'initial'|'resolution',milestone:Row|null|undefined):Promise<boolean>{
  for(const source of this.evidenceSources(reportId,mediaId,kind,milestone)){
   const [row]=await db`SELECT a.id FROM media_publication_approvals a JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=a.media_id JOIN media m ON m.id=a.media_id WHERE a.report_id=${reportId} AND a.media_id=${mediaId} AND a.rendition_id=${renditionId} AND a.subject_type=${source.subject_type} AND a.subject_id=${source.subject_id} AND a.channel='instagram' AND a.approved AND er.status='ready' AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id AND er.media_id=a.media_id AND 'instagram'=ANY(mc.channels) AND m.state='stored' AND m.deleted_at IS NULL`;
   if(row)return true;
  }
  return false;
 }
 private accountReady(a:Row|undefined,scopes:string[]):a is Row{return !!a&&a.status==='connected'&&!!a.encrypted_credentials&&!!a.ig_user_id&&(!a.token_expires_at||new Date(a.token_expires_at).getTime()>Date.now())&&scopes.every(s=>a.scopes.includes(s));}
 private credentials(a:Row):{userToken:string;pageToken:string}{
  try{const [iv,tag,body]=String(a.encrypted_credentials).split('.'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(this.config.META_CREDENTIAL_KEY!,'hex'),Buffer.from(iv!,'base64url'));cipher.setAuthTag(Buffer.from(tag!,'base64url'));const parsed=JSON.parse(Buffer.concat([cipher.update(Buffer.from(body!,'base64url')),cipher.final()]).toString('utf8'));if(!parsed.userToken||!parsed.pageToken)throw new Error();return parsed;}catch{throw new ProviderError('META_CREDENTIAL_INVALID');}
 }
 private async graph(path:string,token:string,params:Record<string,string>={},method:'GET'|'POST'|'DELETE'='GET'):Promise<Row>{
  if(!this.config.META_GRAPH_VERSION||!/^v\d+\.\d+$/.test(this.config.META_GRAPH_VERSION)||!/^[a-zA-Z0-9_/-]+$/.test(path))throw new ProviderError('META_CONFIGURATION_REQUIRED');
  const url=new URL(`https://graph.facebook.com/${this.config.META_GRAPH_VERSION}/${path}`),form=new URLSearchParams(params);if(method==='GET')url.search=form.toString();
  try{
   const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(method==='GET'?{}:{'Content-Type':'application/x-www-form-urlencoded'})},...(method==='GET'?{}:{body:form.toString()}),signal:AbortSignal.timeout(20000),redirect:'error'}),payload=await response.json() as Row;
   if(!response.ok||payload.error){const code=Number(payload.error?.code);throw new ProviderError(code===190?'META_TOKEN_EXPIRED':code===10||code===200?'META_PERMISSION_REQUIRED':response.status===429||code===4||code===32?'META_RATE_LIMITED':response.status===404?'META_NOT_FOUND':'META_REQUEST_FAILED',method!=='GET'&&response.status>=500);}return payload;
  }catch(error){if(error instanceof ProviderError)throw error;throw new ProviderError('META_RESPONSE_UNCERTAIN',method!=='GET');}
 }
 async render(id:string){
  if(!this.config.SAP_EXTENSION_ENABLED||!this.config.SAP_INSTAGRAM_ENABLED)return;
  const [post]=await this.sql`SELECT p.*,er.object_key AS evidence_key,r.public_code FROM instagram_posts p JOIN evidence_renditions er ON er.id=p.evidence_rendition_id JOIN reports r ON r.id=p.report_id WHERE p.id=${id}`;
  if(!post||post.rendition_status==='ready'||!['draft','failed'].includes(post.status))return;
  let objectKey:string|null=null;
  try{
   if(!this.config.SAP_INSTAGRAM_RENDER_ENABLED)throw new Error('RENDER_DISABLED');
   if(!await this.eligible(post))throw new Error('SOURCE_NOT_APPROVED');
   const milestone=post.kind==='resolution'?await this.milestone(this.sql,post.report_id,post.milestone_id):null;
   if(post.kind==='resolution'&&!milestone)throw new Error('SOURCE_REVISION_CHANGED');
   const outcome=post.kind==='initial'?'initial':milestone?.outcome==='partial'?'partial':'complete';
   const rendered=await this.poster.render({source:post.source_snapshot as PosterSource,photo:await this.objects.getObject(post.evidence_key),outcome,reportCode:post.public_code});
   const enriched=JSON.stringify(rendered.source)!==JSON.stringify(post.source_snapshot),revision=post.content_revision+(enriched?1:0),renditionId=enriched?randomUUID():post.rendition_id;
   objectKey=`instagram/${post.id}/${revision}/${randomUUID()}.jpg`;
   const reserved=await this.sql.begin(async tx=>{
    await tx`SELECT id FROM reports WHERE id=${post.report_id} FOR UPDATE`;
    const [current]=await tx`SELECT * FROM instagram_posts WHERE id=${post.id} FOR UPDATE`;
    if(!current||current.rendition_status==='ready'||!['draft','failed'].includes(current.status)||current.content_revision!==post.content_revision||current.rendition_id!==post.rendition_id||!await this.eligible(current,tx))return false;
    await tx`INSERT INTO instagram_rendition_objects(post_id,content_revision,object_key,map_metadata,map_data,reservation_expires_at) VALUES(${post.id},${revision},${objectKey!},${tx.json(rendered.map as never)},${tx.json(rendered.mapData as never)},now()+${this.config.EXTENSION_JOB_LEASE_MS+60000}*interval '1 millisecond')`;
    return true;
   });
   if(!reserved)return;
   await this.objects.putObject({key:objectKey,body:rendered.bytes,contentType:'image/jpeg',sha256:createHash('sha256').update(rendered.bytes).digest('hex')});
   const accepted=await this.sql.begin(async tx=>{
    await tx`SELECT id FROM reports WHERE id=${post.report_id} FOR UPDATE`;
    const [current]=await tx`SELECT * FROM instagram_posts WHERE id=${post.id} FOR UPDATE`;
    if(!current||current.rendition_status==='ready'||!['draft','failed'].includes(current.status)||current.content_revision!==post.content_revision||current.source_revision!==post.source_revision||current.rendition_id!==post.rendition_id||current.evidence_rendition_id!==post.evidence_rendition_id||!await this.eligible(current,tx))return false;
    if(current.kind==='resolution'&&!await this.milestone(tx,current.report_id,current.milestone_id))return false;
    await tx`UPDATE instagram_rendition_objects SET reservation_expires_at=now() WHERE object_key=${objectKey!}`;
    await tx`UPDATE instagram_posts SET source_snapshot=${tx.json(rendered.source as never)},content_revision=${revision},rendition_id=${renditionId},rendition_revision=rendition_revision+${enriched?1:0},rendition_status='ready',rendition_object_key=${objectKey!},rendition_metadata=${tx.json(rendered.map as never)},template_version=${rendered.templateVersion},provider_container_id=CASE WHEN ${enriched} THEN NULL ELSE provider_container_id END,approval=CASE WHEN ${enriched} OR approval->>'status'='approved' THEN ${tx.json(INVALID)} ELSE approval END,publish_error=NULL,revision=revision+1,updated_at=now() WHERE id=${post.id}`;
    return true;
   });
   if(!accepted)await this.discardRendered(objectKey,post.media_id);
  }catch(error){
   if(objectKey)await this.discardRendered(objectKey,post.media_id);
   const allowed=new Set(['MAP_PROVIDER_UNCONFIGURED','MAP_GEOMETRY_UNAVAILABLE','MAP_LOCATION_UNAVAILABLE','MAP_PROVIDER_UNAVAILABLE','MAP_DAILY_BUDGET_EXHAUSTED','RENDER_DISABLED','POSTER_TEXT_OVERFLOW','POSTER_SOURCE_INVALID','POSTER_TEXT_INVALID','POSTER_SIZE_EXCEEDED','SOURCE_NOT_APPROVED','SOURCE_REVISION_CHANGED']);
   const code=error instanceof Error&&allowed.has(error.message)?error.message:'RENDITION_FAILED';
   await this.sql`UPDATE instagram_posts SET rendition_status='failed',publish_error=${code},revision=revision+1,updated_at=now() WHERE id=${post.id} AND content_revision=${post.content_revision} AND rendition_id=${post.rendition_id} AND rendition_status<>'ready' AND status IN ('draft','failed')`;
  }
 }
 private async discardRendered(key:string,mediaId:string){
  const [referenced]=await this.sql`SELECT id FROM instagram_posts WHERE rendition_object_key=${key}`;if(referenced)return;
  const [cleanup]=await this.sql`INSERT INTO media_cleanup_tasks(object_key,media_id) VALUES(${key},${mediaId}) ON CONFLICT(object_key) DO UPDATE SET status='pending',completed_at=NULL,revision=media_cleanup_tasks.revision+1 RETURNING revision`;
  if(!cleanup)return;
  try{await this.objects.deleteObject(key);await this.sql`UPDATE media_cleanup_tasks SET status='completed',completed_at=now() WHERE object_key=${key} AND revision=${cleanup.revision}`;}catch{}
 }
 private async milestone(db:Executor,reportId:string,id:string):Promise<Row|undefined>{
  const [row]=await db`SELECT id,verified_outcome AS outcome,public_summary AS summary,observed_at,data AS payload,'activity_result'::text AS source_type FROM activity_results WHERE id=${id} AND report_id=${reportId} AND status='approved'
   UNION ALL SELECT d.id,'complete' AS outcome,COALESCE(d.decision_payload->>'publicSummary',r.public_summary) AS summary,COALESCE((d.decision_payload->>'observedAt')::timestamptz,d.created_at) AS observed_at,d.decision_payload AS payload,'moderation_decision'::text AS source_type FROM moderation_decisions d JOIN reports r ON r.id=d.report_id WHERE d.id=${id} AND d.report_id=${reportId} AND d.decision_payload->>'nextStatus'='resolved' AND r.status='resolved'`;
  if(!row)return undefined;
  let allowedSources:Row[]=[];
  if(row.source_type==='activity_result'){
   const ids=Array.isArray(row.payload?.afterMediaIds)?row.payload.afterMediaIds:[];allowedSources=ids.map((media_id:string)=>({media_id,subject_type:'activity_result',subject_id:row.id}));
  }else{
   const direct=Array.isArray(row.payload?.resolutionMediaIds)?row.payload.resolutionMediaIds:[];allowedSources.push(...direct.map((media_id:string)=>({media_id,subject_type:'report',subject_id:reportId})));
   const claimIds=Array.isArray(row.payload?.resolutionEvidenceIds)?row.payload.resolutionEvidenceIds:[];
   if(claimIds.length){const claims=await db`SELECT media_id,source_type AS subject_type,source_id AS subject_id FROM approved_resolution_evidence WHERE id=ANY(${claimIds}::uuid[]) AND report_id=${reportId} AND status='valid'`;allowedSources.push(...claims);}
  }
  return {...row,allowedSources};
 }
 private async requestRetraction(tx:TransactionSql,post:Row,sap:'hidden'|'unaffected'){
  const [existing]=await tx`SELECT * FROM instagram_operations WHERE post_id=${post.id} AND kind='retract' AND status NOT IN ('succeeded','cancelled') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
  const [publish]=await tx`SELECT * FROM instagram_operations WHERE post_id=${post.id} AND kind='publish' AND (status='running' OR stage IN ('publish_requested','uncertain','published')) ORDER BY created_at DESC LIMIT 1`;
  const harmless=!post.provider_media_id&&!post.published_at&&!publish;
  const [created]=existing?[]:await tx`INSERT INTO instagram_operations(post_id,account_id,kind,status,stage,channels,message) VALUES(${post.id},${post.account_id},'retract',${harmless?'succeeded':'queued'},${harmless?'not_created':'queued'},${tx.json({sap,instagram:harmless?'not_created':'pending'})},${harmless?'Sumber ditarik sebelum publikasi.':'Menunggu penarikan publikasi.'}) RETURNING *`;
  const op=existing??created;if(!op)throw new Error('RETRACTION_INTENT_MISSING');
  await tx`UPDATE instagram_posts SET status=${harmless?'cancelled':op.status==='needs_action'?'needs_action':'retracting'},approval=${tx.json(INVALID)},last_operation_id=${op.id},revision=revision+1,updated_at=now() WHERE id=${post.id}`;
  await tx`UPDATE instagram_operations SET status='cancelled',message='Sumber ditarik sebelum publikasi.',updated_at=now() WHERE post_id=${post.id} AND kind='publish' AND status='queued' AND stage NOT IN ('publish_requested','uncertain')`;
  if(!existing&&!harmless)await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key) VALUES('instagram.retract.requested',${op.id},${tx.json({aggregateRevision:1})},${`instagram.retract.requested:${op.id}:1`}) ON CONFLICT DO NOTHING`;
 }
 private async reconcileSource(reportId:string,suppressDraft:boolean){
  await this.sql.begin(async tx=>{
   // Source and publication intents are reconciled from one locked, current snapshot.
   const [report]=await tx`SELECT r.*,c.name_id AS category_name FROM reports r LEFT JOIN categories c ON c.id=r.category_id WHERE r.id=${reportId} FOR UPDATE OF r`;
   if(!report)return;
   const posts=await tx`SELECT * FROM instagram_posts WHERE report_id=${reportId} AND status NOT IN ('cancelled','retracted') ORDER BY id FOR UPDATE`;
   const [account]=await tx`SELECT * FROM instagram_accounts WHERE singleton=true FOR SHARE`,[settings]=await tx`SELECT payload FROM instagram_settings WHERE singleton=true FOR SHARE`;
   const publicEligible=report.public_visibility==='public'&&report.instagram_allowed&&['verified','in_progress','resolved'].includes(report.status)&&!report.duplicate_of_id&&!!report.public_summary;
   const assets=await tx`SELECT a.media_id,a.rendition_id,a.subject_type,a.subject_id FROM media_publication_approvals a JOIN evidence_renditions er ON er.id=a.rendition_id AND er.media_id=a.media_id AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id JOIN media_consents mc ON mc.media_id=a.media_id JOIN media m ON m.id=a.media_id WHERE a.report_id=${reportId} AND a.channel='instagram' AND a.approved AND er.status='ready' AND 'instagram'=ANY(mc.channels) AND m.state='stored' AND m.deleted_at IS NULL ORDER BY a.updated_at,a.id`;
   for(const post of posts){
    const milestone=post.milestone_id?await this.milestone(tx,reportId,post.milestone_id):null;
    const asset=assets.find(a=>a.media_id===post.media_id&&this.evidenceSources(reportId,post.media_id,post.kind,milestone).some(s=>s.subject_type===a.subject_type&&s.subject_id===a.subject_id));
    const invalid=!publicEligible||!asset||(post.kind==='resolution'&&!milestone)||(asset.rendition_id!==post.evidence_rendition_id&&!!post.published_at);
    if(invalid||!asset){await this.requestRetraction(tx,post,report.public_visibility==='public'?'unaffected':'hidden');continue;}
    if(post.source_revision===report.revision&&asset.rendition_id===post.evidence_rendition_id)continue;
    if(['draft','failed'].includes(post.status)){
     const [prior]=await tx`SELECT stage FROM instagram_operations WHERE post_id=${post.id} AND kind='publish' ORDER BY created_at DESC LIMIT 1`;
     if(prior&&['publish_requested','uncertain','published'].includes(prior.stage)){await this.requestRetraction(tx,post,'unaffected');continue;}
     const source={...post.source_snapshot,sourceRevision:report.revision,status:report.status,categoryName:report.category_name??'Belum dikategorikan',publicSummary:milestone?.summary??report.public_summary,occurredAt:new Date(milestone?.observed_at??report.occurred_at??report.created_at).toISOString()};
     const [changed]=await tx`UPDATE instagram_posts SET source_revision=${report.revision},source_snapshot=${tx.json(source)},evidence_rendition_id=${asset.rendition_id},content_revision=content_revision+1,rendition_id=gen_random_uuid(),rendition_revision=rendition_revision+1,rendition_status='queued',rendition_object_key=NULL,provider_container_id=NULL,approval=${tx.json(INVALID)},revision=revision+1,updated_at=now() WHERE id=${post.id} AND status IN ('draft','failed') RETURNING content_revision`;
     if(changed)await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key) VALUES('instagram.render.requested',${post.id},${tx.json({aggregateRevision:changed.content_revision})},${`instagram.render.requested:${post.id}:${changed.content_revision}`}) ON CONFLICT DO NOTHING`;
    }else await tx`UPDATE instagram_posts SET approval=${tx.json(INVALID)},revision=revision+1,updated_at=now() WHERE id=${post.id}`;
   }
   if(suppressDraft||!this.config.SAP_INSTAGRAM_RENDER_ENABLED||!publicEligible||!this.accountReady(account,['instagram_basic'])||settings?.payload?.draftGeneration!=='automatic'||!assets.length)return;
   const milestoneIds=await tx`SELECT id FROM activity_results WHERE report_id=${reportId} AND status='approved'
    UNION ALL SELECT d.id FROM moderation_decisions d WHERE d.report_id=${reportId} AND d.decision_payload->>'nextStatus'='resolved' AND ${report.status==='resolved'}`;
   const milestones=(await Promise.all(milestoneIds.map(m=>this.milestone(tx,reportId,m.id)))).filter((m):m is Row=>!!m);
   const candidates:Row[]=[{kind:'initial',id:null,outcome:null,summary:report.public_summary,observed_at:report.occurred_at??report.created_at},...milestones.map(m=>({...m,kind:'resolution'}))];
   for(const milestone of candidates){
    const sources=milestone.kind==='initial'?[{subject_type:'report',subject_id:reportId}]:milestone.allowedSources;
    const asset=assets.find(a=>sources.some((s:Row)=>s.media_id===undefined||s.media_id===a.media_id&&s.subject_type===a.subject_type&&s.subject_id===a.subject_id));if(!asset)continue;
    const summary=String(milestone.summary),url=new URL(`/incidents/${reportId}`,this.config.APP_ORIGIN).toString(),template=String(settings.payload.captionTemplate||'{summary}\nPantau perkembangan di SAP: {url}');
    let caption=template.replace(/\{summary\}/g,summary).replace(/\{url\}/g,url).replace(/\{reportId\}/g,reportId);
    if(milestone.outcome==='partial')caption='Penanganan sebagian. '+caption;
    caption+=(settings.payload.hashtags?'\n'+settings.payload.hashtags:'');if([...caption].length>2200||![...summary].length)continue;
    const source={reportId,sourceRevision:report.revision,scanId:report.scan_id,status:report.status,occurredAt:new Date(milestone.observed_at).toISOString(),area:{cellId:report.h3_cell,label:`Area ${report.h3_cell}`},title:`Laporan ${report.category_name??'lingkungan'}`,categoryName:report.category_name??'Belum dikategorikan',mediaId:asset.media_id,publicSummary:summary};
    await tx`INSERT INTO instagram_publication_series(report_id,account_id,kind,milestone_key) VALUES(${reportId},${account.id},${milestone.kind},${milestone.id??'initial'}) ON CONFLICT DO NOTHING`;
    const [series]=await tx`SELECT * FROM instagram_publication_series WHERE report_id=${reportId} AND account_id=${account.id} AND kind=${milestone.kind} AND milestone_key=${milestone.id??'initial'} FOR UPDATE`;
    if(!series||series.generation>0)continue; // Automatic creation never resurrects a terminal series.
    const [post]=await tx`INSERT INTO instagram_posts(series_id,report_id,account_id,kind,milestone_id,generation,source_revision,source_snapshot,media_id,evidence_rendition_id,caption,alt_text) VALUES(${series.id},${reportId},${account.id},${milestone.kind},${milestone.id},1,${report.revision},${tx.json(source)},${asset.media_id},${asset.rendition_id},${caption},${summary}) RETURNING id,content_revision`;
    if(!post)throw new Error('DRAFT_INSERT_FAILED');
    await tx`UPDATE instagram_publication_series SET generation=1 WHERE id=${series.id}`;
    await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key) VALUES('instagram.render.requested',${post.id},${tx.json({aggregateRevision:post.content_revision})},${`instagram.render.requested:${post.id}:${post.content_revision}`}) ON CONFLICT DO NOTHING`;
   }
  });
 }
 async reconcile():Promise<void>{
  const enabled=this.config.SAP_EXTENSION_ENABLED&&this.config.SAP_INSTAGRAM_ENABLED;
  const operations=await this.sql`SELECT id FROM instagram_operations WHERE status IN ('queued','running') AND (next_retry_at IS NULL OR next_retry_at<=now()) AND (lease_expires_at IS NULL OR lease_expires_at<now()) AND (${enabled} OR kind IN ('retract','disconnect')) ORDER BY CASE WHEN kind='retract' THEN 0 ELSE 1 END,created_at LIMIT 20`;
  for(const op of operations)await this.operation(op.id);
  if(!enabled)return;
  const renders=await this.sql`SELECT id FROM instagram_posts WHERE rendition_status='queued' AND status IN ('draft','failed') ORDER BY created_at LIMIT 10`;
  for(const p of renders)await this.render(p.id);
 }
}
