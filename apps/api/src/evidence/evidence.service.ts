import { Injectable } from '@nestjs/common';
import { ExtensionStore, fail, requireAdmin, requireVerified, requireFeature, iso, type Actor, type Executor, type SubjectType } from '../extensions/extension.store.js';
import * as input from '../extensions/input.js';
import { ObjectStorageService } from '../media/object-storage.service.js';
import { CommunityService } from '../community/community.service.js';

@Injectable()
export class EvidenceService {
 constructor(private readonly store: ExtensionStore, private readonly objects: ObjectStorageService, private readonly community: CommunityService) {}
 async consents(actor:Actor,mediaId:string) {
  requireFeature('evidence');input.uuid(mediaId); const media=await this.owner(this.store.db,actor,mediaId);
  const [r]=await this.store.db`SELECT * FROM media_consents WHERE media_id=${mediaId}`;
  return {mediaId,revision:r?.revision??1,channels:r?.channels??[],updatedAt:iso(r?.updated_at??media.created_at)};
 }
 async setConsents(actor:Actor,mediaId:string,revision:number,raw:unknown) {
  requireFeature('evidence');requireVerified(actor); input.uuid(mediaId); const body=input.object(raw,['channels']);
  if(!Array.isArray(body.channels)||body.channels.length>2)fail(400,'VALIDATION_ERROR');
  const channels=body.channels.map(c=>input.enumeration(c,['web','instagram'] as const));
  if(new Set(channels).size!==channels.length)fail(400,'VALIDATION_ERROR');
  return this.store.db.begin(async tx=>{
   // Review and publishing lock the report before its evidence. Keep the same order.
   await tx`SELECT id FROM reports WHERE id IN (SELECT report_id FROM media_publication_approvals WHERE media_id=${mediaId} UNION SELECT report_id FROM instagram_posts WHERE media_id=${mediaId}) ORDER BY id FOR UPDATE`;
   await this.owner(tx,actor,mediaId);
   await tx`INSERT INTO media_consents(media_id) VALUES(${mediaId}) ON CONFLICT DO NOTHING`;
   const [r]=await tx`SELECT * FROM media_consents WHERE media_id=${mediaId} FOR UPDATE`;if(!r)fail(500,'RESOURCE_STATE_INVALID');
   input.checkRevision(r.revision,revision);
   const removed=(r.channels as string[]).filter(c=>!channels.includes(c as 'web'|'instagram'));
   await tx`UPDATE media_consents SET channels=${channels}::text[],revision=revision+1,updated_at=now() WHERE media_id=${mediaId}`;
   if(removed.includes('web'))await tx`UPDATE media SET public_derivative_key=NULL WHERE id=${mediaId}`;
   if(removed.length){
    await tx`UPDATE media_publication_approvals SET approved=false,updated_at=now() WHERE media_id=${mediaId} AND channel=ANY(${removed}::text[])`;
    const reports=await tx`SELECT DISTINCT report_id FROM media_publication_approvals WHERE media_id=${mediaId} AND channel=ANY(${removed}::text[])`;
    for(const report of reports){
     const [source]=await tx`UPDATE reports SET revision=revision+1,updated_at=now() WHERE id=${report.report_id} RETURNING revision`;if(!source)fail(500,'RESOURCE_STATE_INVALID');
     await this.store.event(tx,'publication.source.changed',report.report_id,source.revision,{reason:'consent_revoked',mediaId});
    }
    if(removed.includes('instagram'))await this.retractMediaUses(tx,mediaId);
    await tx`DELETE FROM area_snapshots`;
   }
   await this.store.event(tx,'media.consent.changed',mediaId,r.revision+1,{removedChannels:removed});
   await this.store.audit(tx,actor.id,'media.consent.changed','media',mediaId,{channels,removed});
   return {mediaId,revision:r.revision+1,channels,updatedAt:new Date().toISOString()};
  });
 }
 async createRendition(actor:Actor,mediaId:string,revision:number,key:string,raw:unknown){
  requireFeature('evidence');requireAdmin(actor); input.uuid(mediaId); const body=input.object(raw,['subjectType','subjectId','redactions']);
  const subjectType=input.enumeration(body.subjectType,['report','community_update','activity_result'] as const),subjectId=input.uuid(body.subjectId);
  if(!Array.isArray(body.redactions)||body.redactions.length>20)fail(400,'VALIDATION_ERROR');
  const redactions=body.redactions.map(rawRect=>{
   const r=input.object(rawRect,['x','y','width','height']);
   for(const k of ['x','y','width','height'])if(typeof r[k]!=='number'||!Number.isFinite(r[k])||Number(r[k])<0||Number(r[k])>1)fail(400,'VALIDATION_ERROR');
   const rect={x:Number(r.x),y:Number(r.y),width:Number(r.width),height:Number(r.height)};
   if(rect.width<=0||rect.height<=0||rect.x+rect.width>1||rect.y+rect.height>1)fail(400,'VALIDATION_ERROR');return rect;
  });
  return this.store.mutate(actor,`rendition:${mediaId}`,key,{subjectType,subjectId,redactions,revision},async tx=>{
   if(subjectType!=='report'){
    const related=await this.subject(tx,subjectType,subjectId);
    await this.subject(tx,'report',related.report_id,true);
   }
   const subject=await this.subject(tx,subjectType,subjectId,true); input.checkRevision(subject.revision,revision);
   const media=await this.linkedMedia(tx,subjectType,subjectId,mediaId);
   const [r]=await tx`INSERT INTO evidence_renditions(media_id,subject_type,subject_id,redactions)
    VALUES(${media.id},${subjectType},${subjectId},${tx.json(redactions)}) RETURNING *`;if(!r)fail(500,'RESOURCE_STATE_INVALID');
   await this.store.event(tx,'evidence.rendition.requested',r.id,r.revision);
   await this.store.audit(tx,actor.id,'evidence.rendition.requested',subjectType,subjectId,{mediaId,renditionId:r.id});
   return this.rendition(r);
  },202);
 }
 async renditions(actor:Actor,mediaId:string,query:Record<string,unknown>){
  requireFeature('evidence');requireAdmin(actor);input.uuid(mediaId);const subjectType=input.enumeration(query.subjectType,['report','community_update','activity_result'] as const),subjectId=input.uuid(query.subjectId);
  await this.subject(this.store.db,subjectType,subjectId);await this.linkedMedia(this.store.db,subjectType,subjectId,mediaId);
  const page=this.store.cursor(query,{mediaId,subjectType,subjectId}),b=page.boundary;
  const rows=await this.store.db`SELECT * FROM evidence_renditions WHERE media_id=${mediaId} AND subject_type=${subjectType} AND subject_id=${subjectId}
   AND (${b===null} OR (created_at,id)<(${b?.at??new Date().toISOString()}::timestamptz,${b?.id??mediaId}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${page.limit+1}`;
  const more=rows.length>page.limit,selected=rows.slice(0,page.limit);
  return {items:await Promise.all(selected.map(r=>this.rendition(r))),nextCursor:more?page.encode(selected[selected.length-1] as {id:string;created_at:Date}):null};
 }
 async privateUrl(actor:Actor,type:SubjectType,subjectId:string,mediaId:string,activityId?:string){
  requireFeature('evidence');input.uuid(subjectId);input.uuid(mediaId);const subject=await this.subject(this.store.db,type,subjectId);
  if(type==='activity_result'){
   if(!activityId||subject.activity_id!==input.uuid(activityId))fail(404,'NOT_FOUND');
   const [a]=await this.store.db`SELECT coordinator_id FROM activities WHERE id=${activityId}`;
   if(actor.role!=='admin'&&a?.coordinator_id!==actor.id)fail(404,'NOT_FOUND');
  }else requireAdmin(actor);
  const media=await this.linkedMedia(this.store.db,type,subjectId,mediaId);
  const signed=await this.objects.createSignedGetUrl(media.object_key);return {url:signed.url,expiresAt:signed.expiresAt.toISOString()};
 }
 async approve(actor:Actor,reportId:string,mediaId:string,revision:number,key:string,raw:unknown){
  requireFeature('evidence');requireAdmin(actor);input.uuid(reportId);input.uuid(mediaId);const b=input.object(raw,['channel','approved','renditionId','reason']);
  const channel=input.enumeration(b.channel,['web','instagram'] as const),approved=input.bool(b.approved),reason=input.text(b.reason,5,1000);
  const renditionId=b.renditionId===null?null:input.uuid(b.renditionId);if(approved&&!renditionId)fail(400,'VALIDATION_ERROR');
  return this.store.mutate(actor,`evidence.approve:${reportId}:${mediaId}`,key,{channel,approved,renditionId,reason,revision},async tx=>{
   const report=await this.subject(tx,'report',reportId,true);input.checkRevision(report.revision,revision);
   if(approved){
    const [rendition]=await tx`SELECT * FROM evidence_renditions WHERE id=${renditionId} AND media_id=${mediaId}`;
    if(!rendition)fail(422,'EVIDENCE_INVALID');const subject=await this.subject(tx,rendition.subject_type,rendition.subject_id);
    if((rendition.subject_type==='report'?subject.id:subject.report_id)!==reportId)fail(422,'EVIDENCE_INVALID');
    if(rendition.subject_type!=='report'&&subject.status!=='approved')fail(422,'EVIDENCE_INVALID');
    await this.linkedMedia(tx,rendition.subject_type,rendition.subject_id,mediaId);
    await this.store.approveEvidence(tx,rendition.subject_type,rendition.subject_id,reportId,actor.id,[{mediaId,renditionId:rendition.id,channels:[channel]}]);
   }else{
    const [approval]=await tx`UPDATE media_publication_approvals SET approved=false,updated_at=now() WHERE report_id=${reportId} AND media_id=${mediaId} AND channel=${channel} RETURNING id`;
    if(!approval)fail(404,'NOT_FOUND');if(channel==='web')await tx`UPDATE media SET public_derivative_key=NULL WHERE id=${mediaId}`;
   }
   const [updated]=await tx`UPDATE reports SET revision=revision+1,updated_at=now() WHERE id=${reportId} RETURNING revision`;if(!updated)fail(500,'RESOURCE_STATE_INVALID');
   if(!approved&&channel==='instagram')await this.retractMediaUses(tx,mediaId,reportId);
   await tx`DELETE FROM area_snapshots`;
   await this.store.event(tx,'publication.source.changed',reportId,updated.revision,{mediaId});
   await this.store.audit(tx,actor.id,'media.approval.changed','report',reportId,{mediaId,channel,approved,reason});
   return this.lifecycle(reportId,actor,tx);
  });
 }
 async lifecycle(reportId:string,actor:Actor,db:Executor=this.store.db){
  return this.community.lifecycle(reportId,actor,db);
 }
 async subject(db:Executor,type:SubjectType,id:string,lock=false):Promise<Record<string,any>>{
  const table=type==='report'?'reports':type==='community_update'?'community_updates':'activity_results';
  const rows=lock?await db`SELECT * FROM ${db(table)} WHERE id=${id} FOR UPDATE`:await db`SELECT * FROM ${db(table)} WHERE id=${id}`;
  if(!rows[0])fail(404,'NOT_FOUND');return rows[0];
 }
 async linkedMedia(db:Executor,type:SubjectType,subjectId:string,mediaId:string):Promise<Record<string,any>>{
  const rows=type==='report'?await db`SELECT m.* FROM media m JOIN report_media rm ON rm.media_id=m.id WHERE rm.report_id=${subjectId} AND m.id=${mediaId} AND m.state='stored' AND m.deleted_at IS NULL`:await db`SELECT m.* FROM media m JOIN evidence_links el ON el.media_id=m.id WHERE el.subject_type=${type} AND el.subject_id=${subjectId} AND m.id=${mediaId} AND m.state='stored' AND m.deleted_at IS NULL`;
  if(!rows[0])fail(404,'NOT_FOUND');return rows[0];
 }
 private async owner(db:Executor,actor:Actor,id:string){const [m]=await db`SELECT id,created_at FROM media WHERE id=${id} AND owner_id=${actor.id} AND state='stored' AND deleted_at IS NULL FOR SHARE`;if(!m)fail(404,'NOT_FOUND');return m;}
 /** Consent removal commits its cleanup intents with the permission change. */
 private async retractMediaUses(tx:Executor,mediaId:string,reportId?:string){
  const posts=await tx`SELECT p.* FROM instagram_posts p WHERE p.media_id=${mediaId} AND (${!reportId} OR p.report_id=${reportId??'00000000-0000-4000-8000-000000000000'}::uuid) AND p.status NOT IN ('cancelled','retracted') ORDER BY p.id FOR UPDATE`;
  for(const post of posts){
   const [existing]=await tx`SELECT * FROM instagram_operations WHERE post_id=${post.id} AND kind='retract' AND status NOT IN ('succeeded','cancelled') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
   const [publish]=await tx`SELECT * FROM instagram_operations WHERE post_id=${post.id} AND kind='publish' AND (status='running' OR stage IN ('publish_requested','uncertain','published')) LIMIT 1 FOR UPDATE`;
   const harmless=!post.published_at&&!post.provider_media_id&&!publish&&['draft','failed'].includes(post.status);
   const [created]=existing?[]:await tx`INSERT INTO instagram_operations(post_id,account_id,kind,status,stage,channels,message) VALUES(${post.id},${post.account_id},'retract',${harmless?'succeeded':'queued'},${harmless?'not_created':'queued'},${tx.json({sap:'unaffected',instagram:harmless?'not_created':'pending'})},${harmless?'Izin dicabut sebelum publikasi.':'Menunggu penarikan setelah izin dicabut.'}) RETURNING *`;
   let operation=existing??created!;
   // Existing operations are never silently retried here. In particular, a
   // needs_action retract can mean Meta accepted a delete/publish request but
   // the provider media ID is still uncertain; only explicit reconciliation,
   // retry, or manual confirmation may resolve that state.
   if(existing?.status==='failed'&&this.retractionIsUncertain(operation,publish)){
    const channels={...(operation.channels??{}),instagram:'needs_action'};
    await tx`UPDATE instagram_operations SET status='needs_action',channels=${tx.json(channels)},error_code='PUBLICATION_UNCERTAIN',message='Identitas publikasi belum dipastikan; penarikan memerlukan rekonsiliasi atau tindakan admin.',next_retry_at=NULL,updated_at=now() WHERE id=${operation.id} AND status='failed'`;
    operation={...operation,status:'needs_action',channels,error_code:'PUBLICATION_UNCERTAIN'};
   }
   const postStatus=existing?this.retractionPostStatus(operation.status):harmless?'cancelled':'retracting';
   await tx`UPDATE instagram_posts SET status=${postStatus},approval=${tx.json({status:'invalidated',contentRevision:null,sourceRevision:null,renditionId:null,approvedAt:null})},last_operation_id=${operation.id},revision=revision+1,updated_at=now() WHERE id=${post.id}`;
   await tx`UPDATE instagram_operations SET status='cancelled',message='Dibatalkan karena izin dicabut.',updated_at=now() WHERE post_id=${post.id} AND kind='publish' AND status='queued' AND stage NOT IN ('publish_requested','uncertain')`;
   if(!existing&&!harmless)await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key) VALUES('instagram.retract.requested',${operation.id},${tx.json({aggregateRevision:1})},${`instagram.retract.requested:${operation.id}:1`}) ON CONFLICT DO NOTHING`;
  }
 }
 private retractionIsUncertain(operation:Record<string,any>,publish:Record<string,any>|undefined):boolean{
  return ['publish_requested','uncertain','published','delete_requested'].includes(operation.stage)||
   !!publish&&['publish_requested','uncertain','published'].includes(publish.stage);
 }
 private retractionPostStatus(operationStatus:string):'retracting'|'failed'|'needs_action'{
  if(operationStatus==='queued'||operationStatus==='running')return 'retracting';
  if(operationStatus==='failed')return 'failed';
  if(operationStatus==='needs_action')return 'needs_action';
  return 'needs_action';
 }
 private async rendition(r:Record<string,any>){const signed=r.status==='ready'&&r.object_key?await this.objects.createSignedGetUrl(r.object_key):null;return {id:r.id,mediaId:r.media_id,revision:r.revision,status:r.status,url:signed?.url??null,expiresAt:signed?.expiresAt.toISOString()??null,redactions:r.redactions};}
}
