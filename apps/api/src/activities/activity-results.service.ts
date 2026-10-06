import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../infrastructure/idempotency.store.js';
import { ObjectStorageService } from '../media/object-storage.service.js';
import { ReviewService } from '../community/review.service.js';
import { ExtensionStore, type Actor, type Executor, type PublicationEvidence, fail, hash, iso, requireAdmin, requireFeature } from '../extensions/extension.store.js';
import { checkRevision, enumeration, ids, object, strings, text, uuid } from '../extensions/input.js';
import { ActivitiesService } from './activities.service.js';
import { measurementInput, resultInput, weight, type ActivityRow, type MeasurementInput, type MeasurementRow, type ResultInput, type ResultRow } from './activities.types.js';

@Injectable()
export class ActivityResultsService {
 constructor(private readonly store:ExtensionStore,private readonly activities:ActivitiesService,private readonly objects:ObjectStorageService,private readonly reviews:ReviewService) {}
 measurementDto(row:MeasurementRow) {return {id:row.id,revision:row.revision,activityId:row.activity_id,physicalBatchId:row.physical_batch_id,stage:row.stage,valueKg:Number(row.value_kg),unit:'kg' as const,method:row.method,sourceReference:row.source_reference,evidenceMediaIds:row.evidence_media_ids,status:row.status,measuredAt:iso(row.measured_at),verifiedAt:iso(row.verified_at),supersedesId:row.supersedes_id};}
 async result(db:Executor,id:string):Promise<ResultRow> {uuid(id);const [row]=await db<ResultRow[]>`SELECT * FROM activity_results WHERE id=${id}`;if(!row)fail(404,'NOT_FOUND');return row;}
 async dto(db:Executor,row:ResultRow) {
  const measurement=row.measurement_id?(await db<MeasurementRow[]>`WITH RECURSIVE chain AS (SELECT * FROM impact_measurements WHERE id=${row.measurement_id} UNION ALL SELECT m.* FROM impact_measurements m JOIN chain c ON m.supersedes_id=c.id) SELECT * FROM chain WHERE status='verified' OR id=${row.measurement_id} ORDER BY (status='verified') DESC,created_at DESC,id DESC LIMIT 1`)[0]:undefined;
  const claims=await db<{id:string;report_id:string;source_type:string;source_id:string;source_revision:number;media_id:string;approved_at:Date;observed_at:Date;status:string}[]>`SELECT * FROM approved_resolution_evidence WHERE source_type='activity_result' AND source_id=${row.id} ORDER BY approved_at,id`;
  return {id:row.id,activityId:row.activity_id,reportId:row.report_id,revision:row.revision,status:row.status,observedAt:iso(row.observed_at),description:row.data.description,claimedOutcome:row.claimed_outcome,verifiedOutcome:row.verified_outcome,beforeMediaIds:row.data.beforeMediaIds,beforePublicEvidenceIds:row.data.beforePublicEvidenceIds,afterMediaIds:row.data.afterMediaIds,measurement:measurement?this.measurementDto(measurement):null,requestedEvidence:row.requested_evidence,decisionReason:row.decision_reason,publicSummary:row.public_summary,approvedResolutionEvidence:claims.map(c=>({id:c.id,reportId:c.report_id,sourceType:c.source_type,sourceId:c.source_id,sourceRevision:c.source_revision,mediaId:c.media_id,approvedAt:iso(c.approved_at),observedAt:iso(c.observed_at),status:c.status})),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};
 }
 async get(actor:Actor,activityId:string,id:string) {requireFeature('activities');const row=await this.result(this.store.db,id);if(row.activity_id!==activityId)fail(404,'NOT_FOUND');this.activities.scoped(await this.activities.load(this.store.db,activityId),actor);return this.dto(this.store.db,row);}
 async adminGet(actor:Actor,id:string) {requireFeature('activities');requireAdmin(actor);return {...await this.dto(this.store.db,await this.result(this.store.db,id)),latestReview:await this.reviews.latest('activity_result',id)};}
 async attachResult(tx:Tx,actor:Actor,row:ActivityRow,resultId:string,data:ResultInput,old?:ResultRow):Promise<void> {
  if(!data.afterMediaIds.length||!row.data.startsAt||Date.parse(data.observedAt)<Date.parse(row.data.startsAt)||Date.parse(row.data.startsAt)>Date.now())fail(422,'EVIDENCE_INVALID','Waktu bukti sesudah harus sesuai kegiatan.');
  const selected=[...new Set([...data.beforeMediaIds,...data.afterMediaIds,...(data.measurement?.evidenceMediaIds??[])])].sort();
  await this.lockResultMedia(tx,row.report_id,data);
  const existing=old?await tx<{media_id:string}[]>`SELECT media_id FROM evidence_links WHERE subject_type='activity_result' AND subject_id=${resultId}`:[];
  const retained=new Set(existing.map(r=>r.media_id));const added=selected.filter(id=>!retained.has(id));
  // Retaining a relation never allows selecting an unrelated user's upload.
  await this.store.attachMedia(tx,actor.id,'activity_result',resultId,added,'activity_evidence');
  const valid=await tx<{id:string}[]>`SELECT id FROM media WHERE id=ANY(${selected}::uuid[]) AND purpose='activity_evidence' AND state='stored' AND deleted_at IS NULL ORDER BY id FOR UPDATE`;
  if(valid.length!==selected.length)fail(422,'EVIDENCE_INVALID');
  await this.validatePublicBefore(tx,row,data.beforePublicEvidenceIds);
  await tx`DELETE FROM evidence_links WHERE subject_type='activity_result' AND subject_id=${resultId} AND NOT(media_id=ANY(${selected}::uuid[]))`;
 }
 async lockResultMedia(tx:Tx,reportId:string,data:ResultInput):Promise<void> {
  const ids=[...new Set([...data.beforeMediaIds,...data.afterMediaIds,...(data.measurement?.evidenceMediaIds??[])])];
  await tx`SELECT m.id FROM media m WHERE m.id=ANY(${ids}::uuid[]) OR m.id IN
   (SELECT a.media_id FROM media_publication_approvals a WHERE a.id=ANY(${data.beforePublicEvidenceIds}::uuid[]) AND a.report_id=${reportId})
   ORDER BY m.id FOR UPDATE`;
 }
 async validatePublicBefore(tx:Tx,activity:ActivityRow,approvalIds:string[]):Promise<void> {
  if(!approvalIds.length)return;
  const reused=await tx`SELECT a.id FROM media_publication_approvals a JOIN media m ON m.id=a.media_id JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=a.media_id
   WHERE a.id=ANY(${approvalIds}::uuid[]) AND a.report_id=${activity.report_id} AND a.channel='web' AND a.approved
   AND er.media_id=a.media_id AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id AND er.status='ready' AND er.object_key IS NOT NULL
   AND m.state='stored' AND m.deleted_at IS NULL AND 'web'=ANY(mc.channels) FOR SHARE OF a,m,er,mc`;
  if(!this.activities.sourcePublic(activity)||reused.length!==approvalIds.length)fail(422,'EVIDENCE_INVALID');
 }
 async create(actor:Actor,id:string,key:string,raw:unknown) {
  requireFeature('activities');const data=resultInput(raw);return this.store.mutate(actor,`createActivityResult:${id}`,key,data,async tx=>{const activity=await this.activities.load(tx,id,true);this.activities.scoped(activity,actor);if(!this.activities.sourcePublic(activity))fail(409,'SOURCE_NOT_PUBLIC');if(!['in_progress','awaiting_result'].includes(activity.status))fail(409,'ACTIVITY_NOT_STARTED');const prior=await tx`SELECT id FROM activity_results WHERE activity_id=${id} AND status IN ('submitted','needs_evidence','approved')`;if(prior.length)fail(409,'ACTIVE_RESULT_EXISTS');const resultId=randomUUID();
   await this.attachResult(tx,actor,activity,resultId,data);const measure=data.measurement?await this.createMeasurementTx(tx,actor,activity,data.measurement,resultId):null;
   await tx`INSERT INTO activity_results(id,activity_id,report_id,author_id,observed_at,claimed_outcome,data,measurement_id) VALUES(${resultId},${id},${activity.report_id},${actor.id},${data.observedAt},${data.claimedOutcome},${tx.json(data as never)},${measure?.id??null})`;
   if(activity.status==='in_progress')await tx`UPDATE activities SET status='awaiting_result',revision=revision+1,updated_at=now() WHERE id=${id}`;
   await this.reviews.enqueue(tx,'activity_result',resultId,1);await this.store.audit(tx,actor.id,'activity_result_submitted','activity_result',resultId,{activityId:id});await this.store.event(tx,'activity.result.submitted',resultId,1,{reportId:activity.report_id,activityId:id});return this.dto(tx,await this.result(tx,resultId));
  },201);
 }
 async edit(actor:Actor,activityId:string,id:string,expected:number,raw:unknown) {
  requireFeature('activities');const data=resultInput(raw);return this.store.db.begin(async tx=>{const activity=await this.activities.load(tx,activityId,true);this.activities.scoped(activity,actor);if(!this.activities.sourcePublic(activity))fail(409,'SOURCE_NOT_PUBLIC');const [row]=await tx<ResultRow[]>`SELECT * FROM activity_results WHERE id=${id} AND activity_id=${activityId} FOR UPDATE`;if(!row)fail(404,'NOT_FOUND');checkRevision(row.revision,expected);if(!['submitted','needs_evidence'].includes(row.status)||!['in_progress','awaiting_result'].includes(activity.status))fail(409,'INVALID_TRANSITION');
   await this.attachResult(tx,actor,activity,id,data,row);let measurementId=row.measurement_id;
   if(hash(data.measurement)!==hash(row.data.measurement)){
    if(measurementId){const [old]=await tx<MeasurementRow[]>`SELECT * FROM impact_measurements WHERE id=${measurementId} FOR UPDATE`;if(old?.status==='verified')fail(409,'MEASUREMENT_ALREADY_VERIFIED');await tx`UPDATE impact_measurements SET status='superseded',revision=revision+1,updated_at=now() WHERE id=${measurementId} AND status IN ('pending_review','rejected')`;}
    measurementId=data.measurement?(await this.createMeasurementTx(tx,actor,activity,data.measurement,id)).id:null;
   }
   await tx`UPDATE activity_results SET data=${tx.json(data as never)},observed_at=${data.observedAt},claimed_outcome=${data.claimedOutcome},status='submitted',requested_evidence='{}',decision_reason=NULL,measurement_id=${measurementId},revision=revision+1,updated_at=now() WHERE id=${id}`;
   await this.reviews.supersede(tx,'activity_result',id);await this.reviews.enqueue(tx,'activity_result',id,expected+1);await this.store.audit(tx,actor.id,'activity_result_edited','activity_result',id,{revision:expected+1});await this.store.event(tx,'activity.result.submitted',id,expected+1,{reportId:activity.report_id,activityId});return this.dto(tx,await this.result(tx,id));
  });
 }
 approvals(raw:unknown,max:number):PublicationEvidence[] {if(!Array.isArray(raw)||raw.length>max)fail(400,'VALIDATION_ERROR');const result=raw.map(v=>{const b=object(v,['mediaId','renditionId','channels']);const channels=strings(b.channels,1,2,9).map(c=>enumeration(c,['web','instagram'] as const));if(new Set(channels).size!==channels.length)fail(400,'VALIDATION_ERROR');return {mediaId:uuid(b.mediaId),renditionId:uuid(b.renditionId),channels};});if(new Set(result.map(r=>r.mediaId)).size!==result.length)fail(400,'VALIDATION_ERROR');return result;}
 async decide(actor:Actor,id:string,expected:number,key:string,raw:unknown) {
  requireFeature('activities');requireAdmin(actor);const b=object(raw,['action','reason','verifiedOutcome','publicSummary','publicEvidenceApprovals','requestedEvidence']);const action=enumeration(b.action,['approve','request_evidence','reject']);const reason=text(b.reason,5,1000);const outcome=b.verifiedOutcome===null?null:enumeration(b.verifiedOutcome,['partial','complete']);const summary=b.publicSummary===null?null:text(b.publicSummary,1,500);const approvals=this.approvals(b.publicEvidenceApprovals,action==='approve'?6:0);const requested=strings(b.requestedEvidence,action==='request_evidence'?1:0,action==='request_evidence'?3:0,300);
  if((action==='approve'&&(!outcome||!summary))||(action!=='approve'&&(outcome!==null||summary!==null)))fail(400,'VALIDATION_ERROR');
  return this.store.mutate(actor,`activityResultDecision:${id}`,key,{expected,action,reason,outcome,summary,approvals,requested},async tx=>{const initial=await this.result(tx,id);await tx`SELECT id FROM reports WHERE id=${initial.report_id} FOR UPDATE`;const activity=await this.activities.load(tx,initial.activity_id,true);const [row]=await tx<ResultRow[]>`SELECT * FROM activity_results WHERE id=${id} FOR UPDATE`;if(!row)fail(404,'NOT_FOUND');checkRevision(row.revision,expected);if(row.status!=='submitted')fail(409,'INVALID_TRANSITION');const revision=expected+1;const next=action==='approve'?'approved':action==='request_evidence'?'needs_evidence':'rejected';
   if(action==='approve'){
    if(!this.activities.sourcePublic(activity)||!['in_progress','awaiting_result'].includes(activity.status))fail(409,'SOURCE_NOT_PUBLIC');
    if(!activity.data.startsAt||Date.parse(iso(row.observed_at)!)<Date.parse(activity.data.startsAt))fail(422,'EVIDENCE_OUTDATED');
    await this.lockResultMedia(tx,row.report_id,row.data);
    await this.validatePublicBefore(tx,activity,row.data.beforePublicEvidenceIds);
    const attached=new Set([...row.data.beforeMediaIds,...row.data.afterMediaIds]);if(approvals.some(a=>!attached.has(a.mediaId)))fail(422,'EVIDENCE_INVALID');
    const linked=await tx<{media_id:string}[]>`SELECT el.media_id FROM evidence_links el JOIN media m ON m.id=el.media_id WHERE el.subject_type='activity_result' AND el.subject_id=${id} AND m.state='stored' AND m.deleted_at IS NULL FOR SHARE OF m`;if([...attached].some(id=>!linked.some(l=>l.media_id===id)))fail(422,'EVIDENCE_INVALID');
    if(outcome==='complete'){
     if(Date.parse(iso(row.observed_at)!)<Date.parse(iso(activity.report_last_observed_at??activity.report_occurred_at)!))fail(422,'EVIDENCE_OUTDATED');
     const after=approvals.filter(a=>a.channels.includes('web')&&row.data.afterMediaIds.includes(a.mediaId));if(!after.length)fail(422,'RESOLUTION_EVIDENCE_REQUIRED');
    }
    await this.store.approveEvidence(tx,'activity_result',id,row.report_id,actor.id,approvals);
    if(outcome==='complete')for(const a of approvals.filter(a=>a.channels.includes('web')&&row.data.afterMediaIds.includes(a.mediaId)))await tx`INSERT INTO approved_resolution_evidence(report_id,source_type,source_id,source_revision,media_id,observed_at) VALUES(${row.report_id},'activity_result',${id},${revision},${a.mediaId},${row.observed_at}) ON CONFLICT DO NOTHING`;
    await tx`UPDATE activities SET status='completed',result_outcome=${outcome},prior_state=NULL,hold_reason=NULL,revision=revision+1,updated_at=now() WHERE id=${activity.id}`;
     await tx`INSERT INTO public_incident_events(report_id,kind,summary,observed_at,evidence_media_ids) VALUES(${row.report_id},'activity_result',${summary!},${row.observed_at},${approvals.filter(a=>a.channels.includes('web')).map(a=>a.mediaId)}::uuid[])`;
     const [source]=await tx<{revision:number}[]>`UPDATE reports SET last_observed_at=CASE WHEN last_observed_at IS NULL OR last_observed_at<${row.observed_at} THEN ${row.observed_at} ELSE last_observed_at END,revision=revision+1,updated_at=now() WHERE id=${row.report_id} RETURNING revision`;
     await tx`UPDATE approved_resolution_evidence SET status='revoked' WHERE report_id=${row.report_id} AND status='valid' AND observed_at<${row.observed_at}`;
     await this.reviews.supersedeReport(tx,row.report_id);await this.store.event(tx,'report.changed',row.report_id,source!.revision,{reason:'activity_result_approved',subjectId:id});
    await this.activities.notifyParticipants(tx,activity.id,`result:${id}:${revision}`,'result_approved');await this.activities.notifyFollowers(tx,row.report_id,`result:${id}:${revision}`,'incident_updated');
   }else await this.activities.notify(tx,[row.author_id],`result:${id}:${revision}`,action==='request_evidence'?'evidence_requested':'activity_changed',`/activities/${activity.id}/manage`);
   await tx`UPDATE activity_results SET status=${next},verified_outcome=${outcome},public_summary=${summary},requested_evidence=${requested},decision_reason=${reason},approved_at=CASE WHEN ${action==='approve'} THEN now() ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=${id}`;
   await this.reviews.supersede(tx,'activity_result',id);await this.store.audit(tx,actor.id,`activity_result_${action}`,'activity_result',id,{revision,outcome,reason});await this.store.event(tx,'activity.result.decided',id,revision,{reportId:row.report_id,activityId:activity.id,authorId:row.author_id,status:next});return this.dto(tx,await this.result(tx,id));
  });
 }
 async sourcePhoto(actor:Actor,activityId:string) {
  requireFeature('activities');uuid(activityId);
  return this.store.db.begin(async tx=>{
   const activity=await this.activities.load(tx,activityId,true);
   if(!activity.public_ever||!this.activities.sourcePublic(activity))fail(404,'NOT_FOUND');
   const [member]=await tx<{status:string}[]>`SELECT status FROM activity_memberships WHERE activity_id=${activityId} AND user_id=${actor.id} FOR SHARE`;
   if(member?.status!=='accepted')fail(404,'NOT_FOUND');
   const [media]=await tx<{object_key:string}[]>`SELECT m.object_key FROM report_media rm JOIN media m ON m.id=rm.media_id
    WHERE rm.report_id=${activity.report_id} AND rm.kind='evidence' AND m.purpose='report' AND m.state='stored' AND m.deleted_at IS NULL
    ORDER BY rm.sort_order,rm.media_id LIMIT 1 FOR SHARE OF m`;
   if(!media)fail(404,'NOT_FOUND');
   const signed=await this.objects.createSignedGetUrl(media.object_key,60);
   return {url:signed.url,expiresAt:signed.expiresAt.toISOString()};
  });
 }
 async privateMedia(actor:Actor,activityId:string,resultId:string,mediaId:string) {
  requireFeature('activities');uuid(mediaId);const row=await this.result(this.store.db,resultId);if(row.activity_id!==activityId)fail(404,'NOT_FOUND');this.activities.scoped(await this.activities.load(this.store.db,activityId),actor);
  const [media]=await this.store.db<{object_key:string}[]>`SELECT m.object_key FROM media m JOIN evidence_links el ON el.media_id=m.id WHERE el.subject_type='activity_result' AND el.subject_id=${resultId} AND m.id=${mediaId} AND m.state='stored' AND m.deleted_at IS NULL`;if(!media)fail(404,'NOT_FOUND');const signed=await this.objects.createSignedGetUrl(media.object_key);return {url:signed.url,expiresAt:signed.expiresAt.toISOString()};
 }
  async publicResults(activityId:string,query:Record<string,unknown>) {
   requireFeature('activities');object(query,['limit','cursor']);activityId=uuid(activityId);const page=this.store.cursor(query,{route:'publicResults',activityId});
   return this.store.db.begin(async tx=>{
    const [ref]=await tx<{report_id:string}[]>`SELECT report_id FROM activities WHERE id=${activityId}`;if(!ref)fail(404,'NOT_FOUND');
    // Serialize public reads with source withdrawal, activity edits and consent revocation.
    const [report]=await tx<{status:string;public_visibility:string;duplicate_of_id:string|null}[]>`SELECT status,public_visibility,duplicate_of_id FROM reports WHERE id=${ref.report_id} FOR SHARE`;
    const [activity]=await tx<{public_ever:boolean}[]>`SELECT public_ever FROM activities WHERE id=${activityId} FOR SHARE`;
    if(!activity?.public_ever||!report||report.public_visibility!=='public'||report.duplicate_of_id!==null||!['verified','in_progress','resolved'].includes(report.status))fail(404,'NOT_FOUND');
    const rows=await tx<ResultRow[]>`SELECT ar.* FROM activity_results ar WHERE ar.activity_id=${activityId} AND ar.report_id=${ref.report_id} AND ar.status='approved'
      AND (${page.boundary?.at??null}::timestamptz IS NULL OR (ar.created_at,ar.id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid))
      ORDER BY ar.created_at DESC,ar.id DESC LIMIT ${page.limit+1}`;const selected=rows.slice(0,page.limit);
    const items=await Promise.all(selected.map(async row=>{
     const evidence=await tx<{id:string;object_key:string;media_id:string}[]>`SELECT a.id,er.object_key,a.media_id FROM media_publication_approvals a
      JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media m ON m.id=a.media_id JOIN media_consents mc ON mc.media_id=a.media_id
      WHERE a.report_id=${row.report_id} AND a.approved AND a.channel='web'
        AND (a.id=ANY(${row.data.beforePublicEvidenceIds}::uuid[]) OR (a.subject_type='activity_result' AND a.subject_id=${row.id} AND a.media_id=ANY(${[...row.data.beforeMediaIds,...row.data.afterMediaIds]}::uuid[])))
        AND er.media_id=a.media_id AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id AND er.status='ready' AND er.object_key IS NOT NULL
        AND m.state='stored' AND m.deleted_at IS NULL AND 'web'=ANY(mc.channels) ORDER BY a.id FOR SHARE OF a,er,m,mc`;
     const measurement=row.measurement_id?(await tx<MeasurementRow[]>`WITH RECURSIVE chain AS (SELECT * FROM impact_measurements WHERE id=${row.measurement_id} UNION ALL SELECT m.* FROM impact_measurements m JOIN chain c ON m.supersedes_id=c.id) SELECT * FROM chain WHERE status='verified' LIMIT 1`)[0]:undefined;
     return {id:row.id,activityId,reportId:row.report_id,summary:row.public_summary!,outcome:row.verified_outcome!,observedAt:iso(row.observed_at),evidence:await Promise.all(evidence.map(async e=>{const signed=await this.objects.createSignedGetUrl(e.object_key);return {id:e.id,url:signed.url,expiresAt:signed.expiresAt.toISOString(),observedAt:row.data.afterMediaIds.includes(e.media_id)?iso(row.observed_at):null,caption:'Bukti yang disetujui SAP'};})),verifiedMeasurement:measurement?{valueKg:Number(measurement.value_kg),unit:'kg',stage:measurement.stage}:null};
    }));return {items,nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};
   });
  }
 async createMeasurementTx(tx:Tx,actor:Actor,activity:ActivityRow,data:MeasurementInput,resultId?:string):Promise<MeasurementRow> {
  if(!activity.data.startsAt||Date.parse(data.measuredAt)<Date.parse(activity.data.startsAt))fail(422,'EVIDENCE_INVALID');
  if(activity.status==='completed'&&data.physicalBatchId===null)fail(422,'PHYSICAL_BATCH_INVALID','Pengukuran tambahan harus merujuk batch kegiatan yang sudah ada.');
  let batchId=data.physicalBatchId;if(batchId){const rows=await tx`SELECT id FROM physical_batches WHERE id=${batchId} AND activity_id=${activity.id} FOR UPDATE`;if(!rows.length)fail(422,'PHYSICAL_BATCH_INVALID');}else{const [batch]=await tx<{id:string}[]>`INSERT INTO physical_batches(activity_id,created_by) VALUES(${activity.id},${actor.id}) RETURNING id`;batchId=batch!.id;}
  const existing=await tx`SELECT id FROM impact_measurements WHERE physical_batch_id=${batchId} AND stage=${data.stage} AND status IN ('pending_review','verified')`;if(existing.length)fail(409,'MEASUREMENT_EXISTS');const proof=await this.measurementProof(tx,actor,data.evidenceMediaIds,resultId);const [row]=await tx<MeasurementRow[]>`INSERT INTO impact_measurements(activity_id,physical_batch_id,stage,value_kg,source_reference,measured_at,evidence_media_ids,evidence_hash,created_by) VALUES(${activity.id},${batchId},${data.stage},${data.valueKg},${data.sourceReference},${data.measuredAt},${data.evidenceMediaIds},${proof},${actor.id}) RETURNING *`;if(!row)fail(500,'INTERNAL_ERROR');for(const id of data.evidenceMediaIds)await tx`INSERT INTO measurement_media(measurement_id,media_id) VALUES(${row.id},${id})`;return row;
 }
 async measurementProof(tx:Tx,actor:Actor,mediaIds:string[],resultId?:string,retained:string[]=[]):Promise<string> {
  const allowed=new Set(retained);if(resultId){const linked=await tx<{media_id:string}[]>`SELECT media_id FROM evidence_links WHERE subject_type='activity_result' AND subject_id=${resultId}`;for(const l of linked)allowed.add(l.media_id);}
  const rows=await tx<{id:string;owner_id:string;sha256:string}[]>`SELECT id,owner_id,sha256 FROM media WHERE id=ANY(${mediaIds}::uuid[]) AND purpose='activity_evidence' AND state='stored' AND deleted_at IS NULL ORDER BY id FOR UPDATE`;
  if(rows.length!==mediaIds.length||rows.some(r=>r.owner_id!==actor.id&&!allowed.has(r.id)))fail(422,'EVIDENCE_INVALID');await tx`UPDATE media SET expires_at=NULL WHERE id=ANY(${mediaIds}::uuid[])`;return hash([...new Set(rows.map(r=>r.sha256))].sort());
 }
 async createMeasurement(actor:Actor,activityId:string,key:string,raw:unknown) {requireFeature('activities');const data=measurementInput(raw);return this.store.mutate(actor,`createMeasurement:${activityId}`,key,data,async tx=>{const activity=await this.activities.load(tx,activityId,true);this.activities.scoped(activity,actor);if(!this.activities.sourcePublic(activity))fail(409,'SOURCE_NOT_PUBLIC');if(!['in_progress','awaiting_result','completed'].includes(activity.status))fail(409,'ACTIVITY_NOT_STARTED');const row=await this.createMeasurementTx(tx,actor,activity,data);await this.store.audit(tx,actor.id,'measurement_submitted','measurement',row.id,{activityId});await this.store.event(tx,'measurement.changed',row.id,row.revision,{activityId,reportId:activity.report_id});return this.measurementDto(row);},201);}
 async measurements(actor:Actor,activityId:string,query:Record<string,unknown>) {requireFeature('activities');this.activities.scoped(await this.activities.load(this.store.db,activityId),actor);object(query,['limit','cursor']);const page=this.store.cursor(query,{route:'measurements',activityId});const rows=await this.store.db<MeasurementRow[]>`SELECT * FROM impact_measurements WHERE activity_id=${activityId} AND (${page.boundary?.at??null}::timestamptz IS NULL OR (created_at,id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${page.limit+1}`;const selected=rows.slice(0,page.limit);return {items:selected.map(r=>this.measurementDto(r)),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};}
 async measurementMedia(actor:Actor,activityId:string,measurementId:string,mediaId:string) {
  requireFeature('activities');uuid(measurementId);uuid(mediaId);
  this.activities.scoped(await this.activities.load(this.store.db,activityId),actor);
  const [media]=await this.store.db<{object_key:string}[]>`SELECT m.object_key FROM impact_measurements im JOIN measurement_media mm ON mm.measurement_id=im.id JOIN media m ON m.id=mm.media_id
   WHERE im.id=${measurementId} AND im.activity_id=${activityId} AND m.id=${mediaId} AND m.state='stored' AND m.deleted_at IS NULL`;
  if(!media)fail(404,'NOT_FOUND');const signed=await this.objects.createSignedGetUrl(media.object_key);
  return {url:signed.url,expiresAt:signed.expiresAt.toISOString()};
 }
 async measurementDecision(actor:Actor,id:string,expected:number,key:string,raw:unknown) {
  requireFeature('activities');requireAdmin(actor);uuid(id);const b=object(raw,['action','reason']);const action=enumeration(b.action,['verify','reject']);const reason=text(b.reason,5,1000);return this.store.mutate(actor,`measurementDecision:${id}`,key,{expected,action,reason},async tx=>{const [reference]=await tx<MeasurementRow[]>`SELECT * FROM impact_measurements WHERE id=${id}`;if(!reference)fail(404,'NOT_FOUND');const activity=await this.activities.load(tx,reference.activity_id,true);await tx`SELECT id FROM physical_batches WHERE id=${reference.physical_batch_id} FOR UPDATE`;const [row]=await tx<MeasurementRow[]>`SELECT * FROM impact_measurements WHERE id=${id} FOR UPDATE`;if(!row)fail(404,'NOT_FOUND');checkRevision(row.revision,expected);if(row.status!=='pending_review')fail(409,'INVALID_TRANSITION');
   if(action==='verify'){
    if(!this.activities.sourcePublic(activity))fail(409,'SOURCE_NOT_PUBLIC');
    const media=await tx`SELECT id FROM media WHERE id=ANY(${row.evidence_media_ids}::uuid[]) AND state='stored' AND deleted_at IS NULL FOR SHARE`;if(media.length!==row.evidence_media_ids.length)fail(422,'EVIDENCE_INVALID');
    // Serialize provenance checks across activities, not only within one physical batch.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`measurement:${row.stage}:${row.evidence_hash}:`}||lower(${row.source_reference}),0))`;
    const duplicates=await tx`SELECT id FROM impact_measurements WHERE id<>${id} AND status='verified' AND stage=${row.stage} AND evidence_hash=${row.evidence_hash} AND lower(source_reference)=lower(${row.source_reference}) AND physical_batch_id<>${row.physical_batch_id}`;if(duplicates.length)fail(409,'MEASUREMENT_DUPLICATE');
    if(row.supersedes_id){const [prior]=await tx<MeasurementRow[]>`SELECT * FROM impact_measurements WHERE id=${row.supersedes_id} FOR UPDATE`;if(!prior||prior.status!=='verified'||prior.physical_batch_id!==row.physical_batch_id||prior.stage!==row.stage)fail(409,'REVISION_CONFLICT');await tx`UPDATE impact_measurements SET status='superseded',revision=revision+1,updated_at=now() WHERE id=${prior.id}`;}
    else{const existing=await tx`SELECT id FROM impact_measurements WHERE physical_batch_id=${row.physical_batch_id} AND stage=${row.stage} AND status='verified'`;if(existing.length)fail(409,'MEASUREMENT_EXISTS');}
   }
   const [updated]=await tx<MeasurementRow[]>`UPDATE impact_measurements SET status=${action==='verify'?'verified':'rejected'},verified_at=CASE WHEN ${action==='verify'} THEN now() ELSE NULL END,decision_reason=${reason},revision=revision+1,updated_at=now() WHERE id=${id} RETURNING *`;if(!updated)fail(500,'INTERNAL_ERROR');await this.store.audit(tx,actor.id,`measurement_${action}`,'measurement',id,{supersedesId:row.supersedes_id,valueKg:Number(row.value_kg),reason});await this.store.event(tx,'measurement.changed',id,expected+1,{activityId:row.activity_id,reportId:activity.report_id});return this.measurementDto(updated);
  });
 }
 async correctMeasurement(actor:Actor,id:string,expected:number,key:string,raw:unknown) {
  requireFeature('activities');requireAdmin(actor);uuid(id);const b=object(raw,['valueKg','reason','evidenceMediaIds']);const value=weight(b.valueKg),reason=text(b.reason,5,1000),mediaIds=ids(b.evidenceMediaIds,1,3);return this.store.mutate(actor,`correctMeasurement:${id}`,key,{expected,value,reason,mediaIds},async tx=>{const [reference]=await tx<MeasurementRow[]>`SELECT * FROM impact_measurements WHERE id=${id}`;if(!reference)fail(404,'NOT_FOUND');const activity=await this.activities.load(tx,reference.activity_id,true);await tx`SELECT id FROM physical_batches WHERE id=${reference.physical_batch_id} FOR UPDATE`;const [row]=await tx<MeasurementRow[]>`SELECT * FROM impact_measurements WHERE id=${id} FOR UPDATE`;if(!row)fail(404,'NOT_FOUND');checkRevision(row.revision,expected);if(row.status!=='verified')fail(409,'INVALID_TRANSITION');const pending=await tx`SELECT id FROM impact_measurements WHERE physical_batch_id=${row.physical_batch_id} AND stage=${row.stage} AND status='pending_review'`;if(pending.length)fail(409,'MEASUREMENT_CORRECTION_PENDING');const proof=await this.measurementProof(tx,actor,mediaIds,undefined,row.evidence_media_ids);
   const [replacement]=await tx<MeasurementRow[]>`INSERT INTO impact_measurements(activity_id,physical_batch_id,stage,value_kg,source_reference,measured_at,evidence_media_ids,evidence_hash,created_by,supersedes_id,decision_reason) VALUES(${row.activity_id},${row.physical_batch_id},${row.stage},${value},${row.source_reference},${row.measured_at},${mediaIds},${proof},${actor.id},${id},${reason}) RETURNING *`;if(!replacement)fail(500,'INTERNAL_ERROR');for(const mediaId of mediaIds)await tx`INSERT INTO measurement_media(measurement_id,media_id) VALUES(${replacement.id},${mediaId})`;await this.store.audit(tx,actor.id,'measurement_correction_submitted','measurement',replacement.id,{supersedesId:id,reason});await this.store.event(tx,'measurement.changed',replacement.id,1,{activityId:row.activity_id,reportId:activity.report_id});return this.measurementDto(replacement);
  },200);
 }
}
