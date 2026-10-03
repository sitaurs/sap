import {Injectable} from '@nestjs/common';
import {getConfig} from '@sap/config';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {ExtensionStore,fail,requireAdmin,requireFeature,iso,permission,type Actor,type Executor} from '../extensions/extension.store.js';
import * as input from '../extensions/input.js';
import {ObjectStorageService} from '../media/object-storage.service.js';
import {EvidenceService} from '../evidence/evidence.service.js';
import {EMPTY_APPROVAL,INVALID_APPROVAL,POST_STATUSES,REQUIRED_SCOPES,DELETE_SCOPES,type PostStatus} from './publication.types.js';
import {encryptCredentials,MetaClient,MetaApiError} from './meta-client.js';
type Row=Record<string,any>;
@Injectable()
export class PublicationsService{
 private readonly config=getConfig();
 constructor(private readonly store:ExtensionStore,private readonly objects:ObjectStorageService,private readonly evidence:EvidenceService){}
 private gate(actor:Actor){requireAdmin(actor);requireFeature('instagram');}
 async overview(actor:Actor){
  this.gate(actor);const [account]=await this.store.db`SELECT * FROM instagram_accounts WHERE singleton=true`;if(!account)fail(500,'RESOURCE_STATE_INVALID');
  const [settings]=await this.store.db`SELECT * FROM instagram_settings WHERE singleton=true`;if(!settings)fail(500,'RESOURCE_STATE_INVALID');
  const counts=await this.store.db`SELECT status,count(*)::int AS n FROM instagram_posts GROUP BY status`;
  const byStatus=Object.fromEntries(POST_STATUSES.map(s=>[s,0])) as Record<PostStatus,number>;for(const row of counts)byStatus[row.status as PostStatus]=row.n;
  const health=this.health(account),connected=health==='connected',canConnect=this.connectConfigured();
  const render=this.config.SAP_INSTAGRAM_RENDER_ENABLED&&!!this.config.POSTER_OVERPASS_URL;
  const publish=connected&&render&&this.config.SAP_INSTAGRAM_PUBLISH_ENABLED&&REQUIRED_SCOPES.every(s=>account.scopes.includes(s));
  const retract=connected&&this.config.META_DELETE_ENABLED&&DELETE_SCOPES.every(s=>account.scopes.includes(s));
  return {account:{username:account.username,status:health},capabilities:{canCreateDraft:connected&&render,canPublish:publish,canRetract:retract,canConnect,canAutomate:false},
   capabilityReasons:{canCreateDraft:connected&&render?null:!connected?'INSTAGRAM_ACCOUNT_REQUIRED':'RENDER_DISABLED',canPublish:publish?null:!connected?'INSTAGRAM_ACCOUNT_REQUIRED':!render?'RENDER_DISABLED':!this.config.SAP_INSTAGRAM_PUBLISH_ENABLED?'PUBLISH_DISABLED':'META_PERMISSION_REQUIRED',canRetract:retract?null:!connected?'INSTAGRAM_ACCOUNT_REQUIRED':!this.config.META_DELETE_ENABLED?'DELETE_READINESS_REQUIRED':'META_PERMISSION_REQUIRED',canConnect:canConnect?null:'META_CONFIGURATION_REQUIRED',canAutomate:'APPROVAL_REQUIRED'},
   settings:{revision:settings.revision,...settings.payload},stats:{total:Object.values(byStatus).reduce((a,b)=>a+b,0),byStatus}};
 }
 async list(actor:Actor,query:Record<string,unknown>,reportId?:string){
  this.gate(actor);if(reportId)input.uuid(reportId);
  const status=query.status===undefined||query.status==='all'?null:input.enumeration(query.status,POST_STATUSES),period=query.period===undefined?'all':input.enumeration(query.period,['all','7d','30d'] as const);
  const search=query.search===undefined?'':input.text(query.search,0,150),page=this.store.cursor(query,{reportId:reportId??null,status,period,search}),b=page.boundary;
  const cutoff=period==='all'?new Date(0):new Date(Date.now()-(period==='7d'?7:30)*86400000),like='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
  const rows=await this.store.db`SELECT * FROM instagram_posts WHERE (${!reportId} OR report_id=${reportId??'00000000-0000-4000-8000-000000000000'}::uuid) AND (${status===null} OR status=${status??''}) AND created_at>=${cutoff} AND (caption ILIKE ${like} OR source_snapshot->>'title' ILIKE ${like}) AND (${b===null} OR (created_at,id)<(${b?.at??new Date().toISOString()}::timestamptz,${b?.id??'00000000-0000-4000-8000-000000000000'}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${page.limit+1}`;
  const [total]=await this.store.db`SELECT count(*)::int AS n FROM instagram_posts WHERE (${!reportId} OR report_id=${reportId??'00000000-0000-4000-8000-000000000000'}::uuid) AND (${status===null} OR status=${status??''}) AND created_at>=${cutoff} AND (caption ILIKE ${like} OR source_snapshot->>'title' ILIKE ${like})`;if(!total)fail(500,'RESOURCE_STATE_INVALID');
  const selected=rows.slice(0,page.limit);return {items:await Promise.all(selected.map(r=>this.dto(r))),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1] as {id:string;created_at:Date}):null,total:total.n};
 }
 async get(actor:Actor,id:string){this.gate(actor);return this.dto(await this.post(this.store.db,input.uuid(id)));}
 async preview(actor:Actor,id:string){const post=await this.get(actor,id);return {postId:post.id,revision:post.revision,contentRevision:post.contentRevision,sourceRevision:post.source.sourceRevision,caption:post.caption,altText:post.altText,rendition:post.rendition,approval:post.approval};}
 async create(actor:Actor,key:string,raw:unknown){
  this.gate(actor);if(!this.config.SAP_INSTAGRAM_RENDER_ENABLED)fail(503,'RENDER_DISABLED');if(!this.config.POSTER_OVERPASS_URL)fail(503,'MAP_PROVIDER_UNCONFIGURED');const b=input.object(raw,['reportId','mediaId','caption','altText','kind','milestoneId','replacesPostId']);
  const reportId=input.uuid(b.reportId),mediaId=input.uuid(b.mediaId),caption=input.text(b.caption,1,2200),altText=input.text(b.altText,1,1000),kind=input.enumeration(b.kind,['initial','resolution'] as const),milestoneId=b.milestoneId===null?null:input.uuid(b.milestoneId),replacesPostId=b.replacesPostId===null?null:input.uuid(b.replacesPostId);
  if((kind==='initial')!==(milestoneId===null))fail(400,'VALIDATION_ERROR');
  return this.store.mutate(actor,'instagram.create',key,{reportId,mediaId,caption,altText,kind,milestoneId,replacesPostId},async tx=>{
   const report=await this.evidence.subject(tx,'report',reportId,true),milestone=milestoneId?await this.milestone(tx,reportId,milestoneId):null;const asset=await this.sourceAsset(tx,report,mediaId,kind,milestone);
   const [account]=await tx`SELECT * FROM instagram_accounts WHERE singleton=true FOR SHARE`;if(!account)fail(500,'RESOURCE_STATE_INVALID');if(this.health(account)!=='connected')fail(409,'INSTAGRAM_ACCOUNT_REQUIRED');
   if(milestone?.outcome==='partial'&&!/sebagian/i.test(caption))fail(400,'VALIDATION_ERROR','Caption hasil sebagian harus menyebut sebagian.');
   const milestoneKey=milestoneId??'initial';await tx`INSERT INTO instagram_publication_series(report_id,account_id,kind,milestone_key) VALUES(${reportId},${account.id},${kind},${milestoneKey}) ON CONFLICT DO NOTHING`;
   const [series]=await tx`SELECT * FROM instagram_publication_series WHERE report_id=${reportId} AND account_id=${account.id} AND kind=${kind} AND milestone_key=${milestoneKey} FOR UPDATE`;if(!series)fail(500,'RESOURCE_STATE_INVALID');
   const [previous]=await tx`SELECT * FROM instagram_posts WHERE series_id=${series.id} ORDER BY generation DESC LIMIT 1 FOR UPDATE`;
   if(previous){if(!['cancelled','retracted'].includes(previous.status)||previous.id!==replacesPostId)fail(409,'INVALID_TRANSITION','Gunakan generation terakhir yang cancelled/retracted sebagai replacement.');}else if(replacesPostId)fail(422,'EVIDENCE_INVALID');
   const source=await this.sourceSnapshot(tx,report,mediaId,milestone),generation=series.generation+1;
   const [post]=await tx`INSERT INTO instagram_posts(series_id,report_id,account_id,kind,milestone_id,generation,replaces_post_id,source_revision,source_snapshot,media_id,evidence_rendition_id,caption,alt_text) VALUES(${series.id},${reportId},${account.id},${kind},${milestoneId},${generation},${replacesPostId},${report.revision},${tx.json(source)},${mediaId},${asset.rendition_id},${caption},${altText}) RETURNING *`;if(!post)fail(500,'RESOURCE_STATE_INVALID');
   await tx`UPDATE instagram_publication_series SET generation=${generation} WHERE id=${series.id}`;
   await this.store.event(tx,'instagram.render.requested',post.id,post.content_revision);
   await this.store.audit(tx,actor.id,'instagram.draft.created','instagram_post',post.id,{reportId,kind,generation});return this.dto(post);
  },201);
 }
 async edit(actor:Actor,id:string,rev:number,raw:unknown){
  this.gate(actor);input.uuid(id);const b=input.object(raw,['caption','altText']),caption=input.text(b.caption,1,2200),altText=input.text(b.altText,1,1000);
  return this.store.db.begin(async tx=>{const post=await this.lockPost(tx,id);input.checkRevision(post.revision,rev);if(!['draft','failed'].includes(post.status)||post.published_at)fail(409,'INVALID_TRANSITION');
   const report=await this.evidence.subject(tx,'report',post.report_id),milestone=post.milestone_id?await this.milestone(tx,post.report_id,post.milestone_id):null,asset=await this.sourceAsset(tx,report,post.media_id,post.kind,milestone),source=await this.sourceSnapshot(tx,report,post.media_id,milestone);
   if(milestone?.outcome==='partial'&&!/sebagian/i.test(caption))fail(400,'VALIDATION_ERROR','Caption hasil sebagian harus menyebut sebagian.');
   const [prior]=await tx`SELECT stage FROM instagram_operations WHERE post_id=${id} AND kind='publish' ORDER BY created_at DESC LIMIT 1`;
   if(prior&&['publish_requested','uncertain','published'].includes(prior.stage))fail(409,'PUBLICATION_UNCERTAIN');
   const [changed]=await tx`UPDATE instagram_posts SET caption=${caption},alt_text=${altText},source_revision=${report.revision},source_snapshot=${tx.json(source)},evidence_rendition_id=${asset.rendition_id},content_revision=content_revision+1,rendition_revision=rendition_revision+1,rendition_id=gen_random_uuid(),rendition_status='queued',rendition_object_key=NULL,provider_container_id=NULL,approval=${tx.json(INVALID_APPROVAL)},revision=revision+1,publish_error=NULL,updated_at=now() WHERE id=${id} RETURNING *`;if(!changed)fail(500,'RESOURCE_STATE_INVALID');
   await this.store.event(tx,'instagram.render.requested',id,changed.content_revision);await this.store.audit(tx,actor.id,'instagram.draft.edited','instagram_post',id,{contentRevision:changed.content_revision});return this.dto(changed);
  });
 }
 async approve(actor:Actor,id:string,rev:number,key:string,raw:unknown){
  this.gate(actor);input.uuid(id);const b=input.object(raw,['contentRevision','sourceRevision','renditionId']),contentRevision=input.integer(b.contentRevision),sourceRevision=input.integer(b.sourceRevision),renditionId=input.uuid(b.renditionId);
  return this.store.mutate(actor,`instagram.approve:${id}`,key,{rev,contentRevision,sourceRevision,renditionId},async tx=>{
   const post=await this.lockPost(tx,id);input.checkRevision(post.revision,rev);if(!['draft','failed'].includes(post.status)||post.published_at)fail(409,'INVALID_TRANSITION');
   const report=await this.evidence.subject(tx,'report',post.report_id),milestone=post.milestone_id?await this.milestone(tx,post.report_id,post.milestone_id):null;const asset=await this.sourceAsset(tx,report,post.media_id,post.kind,milestone);
   if(report.revision!==sourceRevision||post.source_revision!==sourceRevision||asset.rendition_id!==post.evidence_rendition_id)fail(409,'SOURCE_REVISION_CHANGED');
   if(post.content_revision!==contentRevision||post.rendition_id!==renditionId||post.rendition_status!=='ready')fail(409,'PUBLICATION_NOT_APPROVED');
   const approval={status:'approved',contentRevision,sourceRevision,renditionId,approvedAt:new Date().toISOString()};
   const [updated]=await tx`UPDATE instagram_posts SET approval=${tx.json(approval)},revision=revision+1,updated_at=now() WHERE id=${id} RETURNING *`;if(!updated)fail(500,'RESOURCE_STATE_INVALID');
   await this.store.audit(tx,actor.id,'instagram.post.approved','instagram_post',id,{contentRevision,sourceRevision,renditionId});return this.dto(updated);
  });
 }
 async publish(actor:Actor,id:string,rev:number,key:string,raw:unknown){
  this.gate(actor);input.uuid(id);input.object(raw??{},[]);if(!this.config.SAP_INSTAGRAM_PUBLISH_ENABLED)fail(503,'PUBLISH_DISABLED');
  return this.store.mutate(actor,`instagram.publish:${id}`,key,{rev},async tx=>{
   const post=await this.lockPost(tx,id);input.checkRevision(post.revision,rev);if(post.published_at||post.status==='published')fail(409,'ALREADY_PUBLISHED');
   if(!['draft','failed'].includes(post.status))fail(409,'INVALID_TRANSITION');
   const report=await this.evidence.subject(tx,'report',post.report_id),milestone=post.milestone_id?await this.milestone(tx,post.report_id,post.milestone_id):null,asset=await this.sourceAsset(tx,report,post.media_id,post.kind,milestone);
   if(report.revision!==post.source_revision||asset.rendition_id!==post.evidence_rendition_id)fail(409,'SOURCE_REVISION_CHANGED');
   const approval=post.approval;if(approval.status!=='approved'||approval.contentRevision!==post.content_revision||approval.sourceRevision!==post.source_revision||approval.renditionId!==post.rendition_id||post.rendition_status!=='ready')fail(409,'PUBLICATION_NOT_APPROVED');
   const [account]=await tx`SELECT * FROM instagram_accounts WHERE id=${post.account_id} FOR SHARE`;if(!account)fail(500,'RESOURCE_STATE_INVALID');if(this.health(account)!=='connected'||!REQUIRED_SCOPES.every(s=>account.scopes.includes(s)))fail(409,'META_PERMISSION_REQUIRED');
   const [prior]=await tx`SELECT * FROM instagram_operations WHERE post_id=${id} AND kind='publish' ORDER BY created_at DESC LIMIT 1`;
   if(prior&&['publish_requested','uncertain'].includes(prior.stage))fail(409,'PUBLICATION_UNCERTAIN','Rekonsiliasi operasi yang ada sebelum mencoba lagi.');
   const operation=await this.queueOperation(tx,post,'publish','unaffected');
   await tx`UPDATE instagram_posts SET status='publishing',revision=revision+1,last_operation_id=${operation.id},updated_at=now() WHERE id=${id}`;
   await this.store.audit(tx,actor.id,'instagram.publish.requested','instagram_post',id,{operationId:operation.id});return this.operationDTO(operation);
  },202);
 }
 async cancel(actor:Actor,id:string,rev:number,key:string,raw:unknown){
  this.gate(actor);input.uuid(id);const b=input.object(raw,['reason']),reason=input.text(b.reason,5,1000);
  return this.store.mutate(actor,`instagram.cancel:${id}`,key,{rev,reason},async tx=>{
   const post=await this.lockPost(tx,id);input.checkRevision(post.revision,rev);if(!['draft','failed'].includes(post.status)||post.published_at)fail(409,'INVALID_TRANSITION');
   const [active]=await tx`SELECT id FROM instagram_operations WHERE post_id=${id} AND status IN ('queued','running')`;if(active)fail(409,'INVALID_TRANSITION');
   const [updated]=await tx`UPDATE instagram_posts SET status='cancelled',approval=${tx.json(INVALID_APPROVAL)},revision=revision+1,updated_at=now() WHERE id=${id} RETURNING *`;if(!updated)fail(500,'RESOURCE_STATE_INVALID');
   await this.store.audit(tx,actor.id,'instagram.post.cancelled','instagram_post',id,{reason});return this.dto(updated);
  });
 }
 async retract(actor:Actor,id:string,rev:number,key:string,raw:unknown){
  this.gate(actor);input.uuid(id);const b=input.object(raw,['reason']),reason=input.text(b.reason,5,1000);
  return this.store.mutate(actor,`instagram.retract:${id}`,key,{rev,reason},async tx=>{
   const post=await this.lockPost(tx,id);input.checkRevision(post.revision,rev);const operation=await this.requestRetract(tx,post,'unaffected');
   await this.store.audit(tx,actor.id,'instagram.retract.requested','instagram_post',id,{operationId:operation.id,reason});return this.operationDTO(operation);
  },202);
 }
 async operation(actor:Actor,id:string){this.gate(actor);const [op]=await this.store.db`SELECT * FROM instagram_operations WHERE id=${input.uuid(id)}`;if(!op)fail(404,'NOT_FOUND');return this.operationDTO(op);}
 async retry(actor:Actor,id:string,key:string,raw:unknown){
  this.gate(actor);input.uuid(id);input.object(raw??{},[]);
  return this.store.mutate(actor,`instagram.operation.retry:${id}`,key,{},async tx=>{
   const op=await this.lockOperation(tx,id);if(!['failed','needs_action'].includes(op.status))fail(409,'INVALID_TRANSITION');
   if(op.kind==='publish'&&['publish_requested','uncertain'].includes(op.stage))fail(409,'PUBLICATION_UNCERTAIN','Gunakan rekonsiliasi; publish ulang tidak aman.');
   if(op.kind!=='disconnect'){
    const post=await this.post(tx,op.post_id);const [account]=await tx`SELECT * FROM instagram_accounts WHERE id=${op.account_id}`;if(!account)fail(500,'RESOURCE_STATE_INVALID');
    if(this.health(account)!=='connected')fail(409,'INSTAGRAM_ACCOUNT_REQUIRED');
    if(op.kind==='publish'){if(!this.config.SAP_INSTAGRAM_PUBLISH_ENABLED)fail(503,'PUBLISH_DISABLED');const report=await this.evidence.subject(tx,'report',post.report_id),milestone=post.milestone_id?await this.milestone(tx,post.report_id,post.milestone_id):null;const asset=await this.sourceAsset(tx,report,post.media_id,post.kind,milestone);if(report.revision!==post.source_revision||asset.rendition_id!==post.evidence_rendition_id||post.approval.status!=='approved'||post.approval.contentRevision!==post.content_revision||post.approval.renditionId!==post.rendition_id||post.rendition_status!=='ready')fail(409,'SOURCE_REVISION_CHANGED');}
   }
   const [updated]=await tx`UPDATE instagram_operations SET status='queued',error_code=NULL,message='Menunggu percobaan ulang.',next_retry_at=NULL,updated_at=now() WHERE id=${id} RETURNING *`;if(!updated)fail(500,'RESOURCE_STATE_INVALID');
   if(op.post_id)await tx`UPDATE instagram_posts SET status=${op.kind==='publish'?'publishing':'retracting'},revision=revision+1,updated_at=now() WHERE id=${op.post_id}`;
   await this.store.event(tx,`instagram.${op.kind}.requested`,id,op.attempt_count+2);await this.store.audit(tx,actor.id,'instagram.operation.retry','instagram_operation',id,{});return this.operationDTO(updated);
  },202);
 }
 async manualConfirmation(actor:Actor,id:string,key:string,raw:unknown){
  this.gate(actor);input.uuid(id);const b=input.object(raw,['evidenceMediaIds','explanation']),mediaIds=input.ids(b.evidenceMediaIds,1,3),explanation=input.text(b.explanation,20,1000);
  return this.store.mutate(actor,`instagram.operation.manual:${id}`,key,{mediaIds,explanation},async tx=>{
   const op=await this.lockOperation(tx,id);if(op.kind!=='retract'||op.status!=='needs_action'||!op.post_id)fail(409,'INVALID_TRANSITION');
   const [activePublish]=await tx`SELECT id FROM instagram_operations WHERE post_id=${op.post_id} AND kind='publish' AND status='running' AND lease_expires_at>now() LIMIT 1`;
   if(activePublish)fail(409,'PUBLICATION_UNCERTAIN','Tunggu hasil publish yang masih berjalan sebelum mengonfirmasi penghapusan manual.');
   const rows=await tx`SELECT id FROM media WHERE id=ANY(${mediaIds}::uuid[]) AND owner_id=${actor.id} AND purpose='resolution' AND state='stored' AND deleted_at IS NULL FOR SHARE`;
   if(rows.length!==mediaIds.length)fail(422,'EVIDENCE_INVALID');await tx`UPDATE media SET expires_at=NULL WHERE id=ANY(${mediaIds}::uuid[])`;
   await tx`INSERT INTO instagram_manual_confirmations(operation_id,actor_id,evidence_media_ids,explanation) VALUES(${id},${actor.id},${mediaIds}::uuid[],${explanation})`;
   const channels={...op.channels,instagram:'deleted'},[updated]=await tx`UPDATE instagram_operations SET status='succeeded',stage='manual_confirmed',channels=${tx.json(channels)},message='Penghapusan manual dikonfirmasi admin.',error_code=NULL,updated_at=now() WHERE id=${id} RETURNING *`;
   if(!updated)fail(500,'RESOURCE_STATE_INVALID');
   await tx`UPDATE instagram_posts SET status='retracted',retracted_at=now(),revision=revision+1,approval=${tx.json(INVALID_APPROVAL)},updated_at=now() WHERE id=${op.post_id}`;
   await this.store.audit(tx,actor.id,'instagram.retraction.manual_confirmed','instagram_operation',id,{evidenceMediaIds:mediaIds,explanation});return this.operationDTO(updated);
  });
 }
 async settings(actor:Actor,rev:number,raw:unknown){
  this.gate(actor);const b=input.object(raw,['source','onlyVerified','format','timezone','draftGeneration','publishMode','captionTemplate','hashtags']);
  const payload={source:input.enumeration(b.source,['reports'] as const),onlyVerified:input.bool(b.onlyVerified),format:input.enumeration(b.format,['feed'] as const),timezone:input.enumeration(b.timezone,['Asia/Jakarta'] as const),draftGeneration:input.enumeration(b.draftGeneration,['automatic','manual'] as const),publishMode:input.enumeration(b.publishMode,['approval_required'] as const),captionTemplate:input.text(b.captionTemplate,0,1800),hashtags:input.text(b.hashtags,0,400)};
  if(!payload.onlyVerified)fail(400,'VALIDATION_ERROR');
  return this.store.db.begin(async tx=>{const [r]=await tx`SELECT * FROM instagram_settings WHERE singleton=true FOR UPDATE`;if(!r)fail(500,'RESOURCE_STATE_INVALID');input.checkRevision(r.revision,rev);await tx`UPDATE instagram_settings SET revision=revision+1,payload=${tx.json(payload)},updated_at=now() WHERE singleton=true`;await this.store.audit(tx,actor.id,'instagram.settings.changed','instagram_settings','singleton',{revision:r.revision+1});return {revision:r.revision+1,...payload};});
 }
 async mediaUrl(actor:Actor,reportId:string,mediaId:string){
  this.gate(actor);const report=await this.evidence.subject(this.store.db,'report',input.uuid(reportId));mediaId=input.uuid(mediaId);
  if(report.public_visibility!=='public'||!report.instagram_allowed||!['verified','in_progress','resolved'].includes(report.status)||report.duplicate_of_id||!report.public_summary)fail(409,'SOURCE_NOT_APPROVED');
  const [asset]=await this.store.db`SELECT er.object_key FROM media_publication_approvals a JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=a.media_id JOIN media m ON m.id=a.media_id WHERE a.report_id=${report.id} AND a.media_id=${mediaId} AND a.channel='instagram' AND a.approved AND er.status='ready' AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id AND er.media_id=a.media_id AND 'instagram'=ANY(mc.channels) AND m.state='stored' AND m.deleted_at IS NULL`;
  if(!asset)fail(422,'EVIDENCE_INVALID');const signed=await this.objects.createSignedGetUrl(asset.object_key);return {url:signed.url,expiresAt:signed.expiresAt.toISOString()};
 }
 async withdraw(actor:Actor,id:string,rev:number,key:string,raw:unknown){
  requireAdmin(actor);requireFeature('evidence');input.uuid(id);const b=input.object(raw,['scope','reason']),scope=input.enumeration(b.scope,['all','instagram'] as const),reason=input.text(b.reason,5,1000);
  return this.store.mutate(actor,`report.withdraw:${id}`,key,{rev,scope,reason},async tx=>{
   const report=await this.evidence.subject(tx,'report',id,true);input.checkRevision(report.revision,rev);
   const [changed]=await tx`UPDATE reports SET public_visibility=${scope==='all'?'withdrawn':report.public_visibility},instagram_allowed=false,revision=revision+1,updated_at=now() WHERE id=${id} RETURNING *`;if(!changed)fail(500,'RESOURCE_STATE_INVALID');
   if(scope==='all'){
    await tx`UPDATE activities SET prior_state=CASE WHEN status='on_hold' THEN prior_state ELSE status END,status='on_hold',hold_reason='Sumber kejadian ditarik; menunggu peninjauan admin.',revision=revision+1,updated_at=now() WHERE report_id=${id} AND status NOT IN ('completed','cancelled')`;
    await tx`UPDATE media SET public_derivative_key=NULL WHERE id IN (SELECT media_id FROM media_publication_approvals WHERE report_id=${id} AND channel='web')`;
    await this.store.event(tx,'incident.withdrawn',id,changed.revision,{scope});
   }
   await tx`DELETE FROM area_snapshots`;
   const posts=await tx`SELECT * FROM instagram_posts WHERE report_id=${id} AND status NOT IN ('cancelled','retracted') ORDER BY id FOR UPDATE`,operations=[];
   for(const post of posts)operations.push(this.operationDTO(await this.requestRetract(tx,post,scope==='all'?'hidden':'unaffected')));
   await this.store.event(tx,'publication.source.changed',id,changed.revision,{scope,withdrawn:true});await this.store.audit(tx,actor.id,'report.publication.withdrawn','report',id,{scope,reason});
   return {reportId:id,sourceRevision:changed.revision,publicVisibility:changed.public_visibility,scope,operations};
  },202);
 }
 async restore(actor:Actor,id:string,rev:number,key:string,raw:unknown){
  requireAdmin(actor);requireFeature('evidence');input.uuid(id);const b=input.object(raw,['scope','reason']),scope=input.enumeration(b.scope,['all','instagram'] as const),reason=input.text(b.reason,5,1000);
  return this.store.mutate(actor,`report.restore:${id}`,key,{rev,scope,reason},async tx=>{
   const report=await this.evidence.subject(tx,'report',id,true);input.checkRevision(report.revision,rev);
   if(!['verified','in_progress','resolved'].includes(report.status)||report.duplicate_of_id||!report.public_summary||(scope==='instagram'&&report.public_visibility!=='public'))fail(409,'SOURCE_NOT_APPROVED');
   if(scope==='all'&&report.public_visibility!=='withdrawn')fail(409,'INVALID_TRANSITION');if(scope==='instagram'&&report.instagram_allowed)fail(409,'INVALID_TRANSITION');
   const [changed]=await tx`UPDATE reports SET public_visibility=${scope==='all'?'public':report.public_visibility},public_ever=true,instagram_allowed=true,revision=revision+1,updated_at=now() WHERE id=${id} RETURNING revision`;if(!changed)fail(500,'RESOURCE_STATE_INVALID');
   await tx`DELETE FROM area_snapshots`;
   await this.store.event(tx,'publication.source.changed',id,changed.revision,{restored:true,suppressAutomaticDraft:true});
   await this.store.audit(tx,actor.id,'report.publication.restored','report',id,{scope,reason});return this.evidence.lifecycle(id,actor,tx);
  });
 }
 async authorization(actor:Actor,sessionId:string){
  this.gate(actor);if(!this.connectConfigured())fail(503,'META_CONFIGURATION_REQUIRED');
  const state=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+10*60*1000);
  await this.store.db`INSERT INTO instagram_oauth_states(state_hash,user_id,session_id,expires_at) VALUES(${createHash('sha256').update(state).digest('hex')},${actor.id},${sessionId},${expiresAt})`;
  const url=new URL(`https://www.facebook.com/${this.config.META_GRAPH_VERSION}/dialog/oauth`);url.search=new URLSearchParams({client_id:this.config.META_APP_ID!,redirect_uri:this.config.META_REDIRECT_URI!,config_id:this.config.META_LOGIN_CONFIG_ID!,state,response_type:'code',override_default_response_type:'true'}).toString();return {authorizationUrl:url.toString(),expiresAt:expiresAt.toISOString()};
 }
 async callback(actor:Actor,sessionId:string,query:Record<string,unknown>):Promise<string>{
  this.gate(actor);
  const redirect=(connection:'connected'|'failed'|'state-invalid')=>`/dashboard?view=admin-instagram&connection=${connection}`;
  const stateValue=query.state;
  if(typeof stateValue!=='string'||stateValue.length<20||stateValue.length>200)return redirect('state-invalid');
  const state=stateValue,stateHash=createHash('sha256').update(state).digest('hex');
  const [consumed]=await this.store.db`UPDATE instagram_oauth_states SET consumed_at=now() WHERE state_hash=${stateHash} AND session_id=${sessionId} AND user_id=${actor.id} AND consumed_at IS NULL AND expires_at>now() RETURNING state_hash`;
  if(!consumed)return redirect('state-invalid');if(query.error)return redirect('failed');
  if(typeof query.code!=='string'||query.code.length<1||query.code.length>4096)return redirect('failed');
  const code=query.code;
  try{
   const connection=await new MetaClient(this.config).connect(code);
   if(!REQUIRED_SCOPES.every(s=>connection.scopes.includes(s)))throw new MetaApiError('META_PERMISSION_REQUIRED');
   const encrypted=encryptCredentials(connection.credentials,this.config.META_CREDENTIAL_KEY!);
   await this.store.db.begin(async tx=>{const [account]=await tx`SELECT * FROM instagram_accounts WHERE singleton=true FOR UPDATE`;if(!account)fail(500,'RESOURCE_STATE_INVALID');
    if(account.ig_user_id&&account.ig_user_id!==connection.igUserId){const [post]=await tx`SELECT id FROM instagram_posts WHERE account_id=${account.id} AND status NOT IN ('cancelled','retracted')`;if(post)fail(409,'PENDING_RETRACTIONS','Selesaikan publikasi akun lama sebelum mengganti identitas akun.');}
    await tx`UPDATE instagram_accounts SET status='connected',username=${connection.username},ig_user_id=${connection.igUserId},page_id=${connection.pageId},encrypted_credentials=${encrypted},scopes=${connection.scopes}::text[],token_expires_at=${connection.expiresAt},permissions_checked_at=now(),updated_at=now() WHERE id=${account.id}`;
    await this.store.audit(tx,actor.id,'instagram.account.connected','instagram_account',account.id,{permissionsReady:true});
   });return redirect('connected');
  }catch(error){if(error instanceof MetaApiError)return redirect('failed');throw error;}
 }
 async disconnect(actor:Actor,key:string,raw:unknown){
  this.gate(actor);const b=input.object(raw,['acknowledgePendingRetractions']),ack=input.bool(b.acknowledgePendingRetractions);
  return this.store.mutate(actor,'instagram.disconnect',key,{ack},async tx=>{
   const [account]=await tx`SELECT * FROM instagram_accounts WHERE singleton=true FOR UPDATE`;if(!account)fail(500,'RESOURCE_STATE_INVALID');
   const [pending]=await tx`SELECT id FROM instagram_operations WHERE account_id=${account.id} AND kind='retract' AND status NOT IN ('succeeded','cancelled') LIMIT 1`;
   if(pending&&!ack)fail(409,'PENDING_RETRACTIONS');
   const [active]=await tx`SELECT * FROM instagram_operations WHERE account_id=${account.id} AND kind='disconnect' AND status IN ('queued','running') LIMIT 1`;if(active)return this.operationDTO(active);
   await tx`UPDATE instagram_accounts SET status='disconnected',updated_at=now() WHERE id=${account.id}`;
   const [op]=await tx`INSERT INTO instagram_operations(account_id,kind,channels) VALUES(${account.id},'disconnect',${tx.json({sap:'unaffected',instagram:pending?'needs_action':'not_created'})}) RETURNING *`;if(!op)fail(500,'RESOURCE_STATE_INVALID');
   await this.store.event(tx,'instagram.disconnect.requested',op.id,1);await this.store.audit(tx,actor.id,'instagram.account.disconnect.requested','instagram_account',account.id,{operationId:op.id,acknowledgePendingRetractions:ack});return this.operationDTO(op);
  },202);
 }
 async delivery(id:string,token:string):Promise<string>{
  input.uuid(id);if(!this.config.SAP_EXTENSION_ENABLED||!this.config.SAP_INSTAGRAM_ENABLED)fail(404,'NOT_FOUND');
  const parts=(token??'').split('.'),expires=Number(parts[0]),revision=Number(parts[1]),signature=parts[2];
  if(!Number.isInteger(expires)||expires<Date.now()||expires>Date.now()+3600000||!Number.isInteger(revision)||!signature)fail(404,'NOT_FOUND');
  const expected=createHmac('sha256',this.config.SESSION_SECRET).update(`${id}:${expires}:${revision}`).digest('base64url');
  const actual=Buffer.from(signature),want=Buffer.from(expected);if(actual.length!==want.length||!timingSafeEqual(actual,want))fail(404,'NOT_FOUND');
  const post=await this.post(this.store.db,id),report=await this.evidence.subject(this.store.db,'report',post.report_id);
  if(post.content_revision!==revision||report.revision!==post.source_revision||post.rendition_status!=='ready'||!post.rendition_object_key||post.approval.status!=='approved'||post.approval.contentRevision!==revision||post.approval.sourceRevision!==post.source_revision||post.approval.renditionId!==post.rendition_id||!['publishing','published'].includes(post.status))fail(404,'NOT_FOUND');
  const milestone=post.milestone_id?await this.milestone(this.store.db,post.report_id,post.milestone_id):null,asset=await this.sourceAsset(this.store.db,report,post.media_id,post.kind,milestone);if(asset.rendition_id!==post.evidence_rendition_id)fail(404,'NOT_FOUND');const signed=await this.objects.createSignedGetUrl(post.rendition_object_key,60);return signed.url;
 }
 private async dto(post:Row){
  const report=await this.evidence.subject(this.store.db,'report',post.report_id);
  const [asset]=await this.store.db`SELECT a.media_id FROM media_publication_approvals a JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=a.media_id JOIN media m ON m.id=a.media_id WHERE a.report_id=${post.report_id} AND a.media_id=${post.media_id} AND a.rendition_id=${post.evidence_rendition_id} AND a.channel='instagram' AND a.approved AND er.status='ready' AND 'instagram'=ANY(mc.channels) AND m.state='stored' AND m.deleted_at IS NULL`;
  const milestone=post.milestone_id?await this.milestone(this.store.db,post.report_id,post.milestone_id):null;
  const exactAsset=!!asset&&await this.matchingEvidenceSource(this.store.db,post.report_id,post.media_id,post.kind,milestone);
  const sourceEligible=report.public_visibility==='public'&&report.instagram_allowed&&report.revision===post.source_revision&&['verified','in_progress','resolved'].includes(report.status)&&!report.duplicate_of_id&&!!report.public_summary&&!!asset&&exactAsset;
  const signed=sourceEligible&&post.rendition_status==='ready'&&post.rendition_object_key?await this.objects.createSignedGetUrl(post.rendition_object_key):null;
  const editable=['draft','failed'].includes(post.status)&&!post.published_at,approved=post.approval.status==='approved'&&post.approval.contentRevision===post.content_revision&&post.approval.sourceRevision===post.source_revision&&post.approval.renditionId===post.rendition_id&&post.rendition_status==='ready';
  return {id:post.id,revision:post.revision,contentRevision:post.content_revision,publicationSeriesId:post.series_id,generation:post.generation,replacesPostId:post.replaces_post_id,kind:post.kind,milestoneId:post.milestone_id,source:post.source_snapshot,status:post.status,caption:post.caption,altText:post.alt_text,rendition:{id:post.rendition_id,revision:post.rendition_revision,templateVersion:post.template_version,status:post.rendition_status,url:signed?.url??null,expiresAt:signed?.expiresAt.toISOString()??null},approval:post.approval,createdAt:iso(post.created_at),updatedAt:iso(post.updated_at),publishedAt:iso(post.published_at),retractedAt:iso(post.retracted_at),permalink:post.permalink,publishError:post.publish_error,lastOperationId:post.last_operation_id,actions:{edit:permission(editable,'INVALID_TRANSITION'),approve:permission(editable&&sourceEligible&&post.rendition_status==='ready','PUBLICATION_NOT_APPROVED'),publish:permission(editable&&sourceEligible&&approved&&this.config.SAP_INSTAGRAM_PUBLISH_ENABLED,'PUBLICATION_NOT_APPROVED'),cancel:permission(editable,'INVALID_TRANSITION'),retract:permission(!['cancelled','retracted'].includes(post.status),'INVALID_TRANSITION')}};
 }
 private operationDTO(r:Row){return {id:r.id,postId:r.post_id,kind:r.kind,status:r.status,channels:r.channels,errorCode:r.error_code,message:r.message,attemptCount:r.attempt_count,nextRetryAt:iso(r.next_retry_at),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)};}
 private async post(db:Executor,id:string){const [p]=await db`SELECT * FROM instagram_posts WHERE id=${id}`;if(!p)fail(404,'NOT_FOUND');return p;}
 private async lockPost(db:Executor,id:string){const p=await this.post(db,id);await this.evidence.subject(db,'report',p.report_id,true);const [locked]=await db`SELECT * FROM instagram_posts WHERE id=${id} FOR UPDATE`;if(!locked)fail(500,'RESOURCE_STATE_INVALID');return locked;}
 private async lockOperation(db:Executor,id:string){
  const [unlocked]=await db`SELECT * FROM instagram_operations WHERE id=${id}`;if(!unlocked)fail(404,'NOT_FOUND');
  if(unlocked.post_id)await this.lockPost(db,unlocked.post_id);
  else await db`SELECT id FROM instagram_accounts WHERE id=${unlocked.account_id} FOR UPDATE`;
  const [locked]=await db`SELECT * FROM instagram_operations WHERE id=${id} FOR UPDATE`;if(!locked)fail(404,'NOT_FOUND');return locked;
 }
 private async queueOperation(db:Executor,post:Row,kind:'publish'|'retract',sap:string){
  const [active]=await db`SELECT * FROM instagram_operations WHERE post_id=${post.id} AND kind=${kind} AND status NOT IN ('succeeded','cancelled') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
  if(active){
   if(kind==='publish'&&active.status==='failed'){
    const [updated]=await db`UPDATE instagram_operations SET status='queued',error_code=NULL,next_retry_at=NULL,updated_at=now() WHERE id=${active.id} RETURNING *`;if(!updated)fail(500,'RESOURCE_STATE_INVALID');
    await this.store.event(db as any,'instagram.publish.requested',active.id,active.attempt_count+2);return updated;
   }
   return active;
  }
  const [op]=await db`INSERT INTO instagram_operations(post_id,account_id,kind,channels) VALUES(${post.id},${post.account_id},${kind},${db.json({sap,instagram:post.published_at?'published':'pending'})}) RETURNING *`;if(!op)fail(500,'RESOURCE_STATE_INVALID');
  await this.store.event(db as any,`instagram.${kind}.requested`,op.id,1);return op;
 }
 private async requestRetract(db:Executor,post:Row,sap:string){
  if(['cancelled','retracted'].includes(post.status)){
   const [last]=await db`SELECT * FROM instagram_operations WHERE post_id=${post.id} AND kind='retract' ORDER BY created_at DESC LIMIT 1`;if(last)return last;fail(409,'INVALID_TRANSITION');
  }
  const op=await this.queueOperation(db,post,'retract',sap);
  const [publish]=await db`SELECT id FROM instagram_operations WHERE post_id=${post.id} AND kind='publish' AND (status='running' OR stage IN ('publish_requested','uncertain','published')) LIMIT 1`;
  const harmless=!post.published_at&&!post.provider_media_id&&!publish&&['draft','failed'].includes(post.status);
  await db`UPDATE instagram_posts SET status=${harmless?'cancelled':op.status==='needs_action'?'needs_action':'retracting'},approval=${db.json(INVALID_APPROVAL)},revision=revision+1,last_operation_id=${op.id},updated_at=now() WHERE id=${post.id}`;
  await db`UPDATE instagram_operations SET status='cancelled',message='Dibatalkan sebelum publish karena penarikan.',updated_at=now() WHERE post_id=${post.id} AND kind='publish' AND status='queued' AND stage NOT IN ('publish_requested','uncertain')`;
  if(harmless){await db`UPDATE instagram_operations SET status='succeeded',stage='not_created',channels=${db.json({sap,instagram:'not_created'})},message='Draf dibatalkan sebelum publikasi.',updated_at=now() WHERE id=${op.id}`;return {...op,status:'succeeded',stage:'not_created',channels:{sap,instagram:'not_created'},message:'Draf dibatalkan sebelum publikasi.'};}
  return op;
 }
 async sourceAsset(db:Executor,report:Row,mediaId:string,kind:'initial'|'resolution'='initial',milestone:Row|null=null){
  if(report.public_visibility!=='public'||!report.instagram_allowed||!['verified','in_progress','resolved'].includes(report.status)||report.duplicate_of_id||!report.public_summary)fail(409,'SOURCE_NOT_APPROVED');
  if(kind==='resolution'&&!milestone)fail(422,'EVIDENCE_INVALID');
  const sources=kind==='initial'?[{subject_type:'report',subject_id:report.id,media_id:mediaId}]:((milestone?.allowedSources??[]) as Row[]).filter(s=>s.media_id===mediaId);
  for(const source of sources){
   const [a]=await db`SELECT a.*,er.object_key FROM media_publication_approvals a JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=a.media_id JOIN media m ON m.id=a.media_id WHERE a.report_id=${report.id} AND a.media_id=${mediaId} AND a.subject_type=${source.subject_type} AND a.subject_id=${source.subject_id} AND a.channel='instagram' AND a.approved AND er.status='ready' AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id AND er.media_id=a.media_id AND 'instagram'=ANY(mc.channels) AND m.state='stored' AND m.deleted_at IS NULL FOR SHARE OF a,er,mc,m`;
   if(a)return a;
  }
  fail(422,'EVIDENCE_INVALID');
 }
 private async matchingEvidenceSource(db:Executor,reportId:string,mediaId:string,kind:'initial'|'resolution',milestone:Row|null){
  const sources=kind==='initial'?[{subject_type:'report',subject_id:reportId,media_id:mediaId}]:((milestone?.allowedSources??[]) as Row[]).filter(s=>s.media_id===mediaId);
  for(const source of sources){const [a]=await db`SELECT a.id FROM media_publication_approvals a JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=a.media_id JOIN media m ON m.id=a.media_id WHERE a.report_id=${reportId} AND a.media_id=${mediaId} AND a.subject_type=${source.subject_type} AND a.subject_id=${source.subject_id} AND a.channel='instagram' AND a.approved AND er.status='ready' AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id AND er.media_id=a.media_id AND 'instagram'=ANY(mc.channels) AND m.state='stored' AND m.deleted_at IS NULL`;
   if(a)return true;
  }
  return false;
 }
 private async sourceSnapshot(db:Executor,report:Row,mediaId:string,milestone:Row|null=null){const [category]=await db`SELECT name_id FROM categories WHERE id=${report.category_id}`;return {reportId:report.id,sourceRevision:report.revision,scanId:report.scan_id,status:report.status,occurredAt:iso(milestone?.observed_at??report.occurred_at??report.created_at),area:{cellId:report.h3_cell,label:`Area ${report.h3_cell}`},title:`Laporan ${category?.name_id??'lingkungan'}`,categoryName:category?.name_id??'Belum dikategorikan',mediaId,publicSummary:milestone?.summary??report.public_summary};}
 private async milestone(db:Executor,reportId:string,id:string):Promise<Row>{
  const [m]=await db`SELECT id,verified_outcome AS outcome,public_summary AS summary,observed_at,data AS payload,'activity_result'::text AS source_type FROM activity_results WHERE id=${id} AND report_id=${reportId} AND status='approved'
   UNION ALL SELECT d.id,'complete' AS outcome,COALESCE(d.decision_payload->>'publicSummary',r.public_summary) AS summary,COALESCE((d.decision_payload->>'observedAt')::timestamptz,d.created_at) AS observed_at,d.decision_payload AS payload,'moderation_decision'::text AS source_type FROM moderation_decisions d JOIN reports r ON r.id=d.report_id WHERE d.id=${id} AND d.report_id=${reportId} AND d.decision_payload->>'nextStatus'='resolved' AND r.status='resolved'`;
  if(!m)fail(422,'EVIDENCE_INVALID');
  let allowedSources:Row[]=[];
  if(m.source_type==='activity_result'){
   const ids=Array.isArray(m.payload?.afterMediaIds)?m.payload.afterMediaIds:[];allowedSources=ids.map((media_id:string)=>({media_id,subject_type:'activity_result',subject_id:m.id}));
  }else{
   const direct=Array.isArray(m.payload?.resolutionMediaIds)?m.payload.resolutionMediaIds:[];allowedSources.push(...direct.map((media_id:string)=>({media_id,subject_type:'report',subject_id:reportId})));
   const claimIds=Array.isArray(m.payload?.resolutionEvidenceIds)?m.payload.resolutionEvidenceIds:[];
   if(claimIds.length){const claims=await db`SELECT media_id,source_type AS subject_type,source_id AS subject_id FROM approved_resolution_evidence WHERE id=ANY(${claimIds}::uuid[]) AND report_id=${reportId} AND status='valid'`;allowedSources.push(...claims);}
  }
  return {...m,allowedSources};
 }
 private health(a:Row):string{return a.status==='connected'&&a.token_expires_at&&new Date(a.token_expires_at).getTime()<=Date.now()?'expired':a.status;}
 private connectConfigured(){return !!(this.config.META_APP_ID&&this.config.META_APP_SECRET&&this.config.META_GRAPH_VERSION&&this.config.META_LOGIN_CONFIG_ID&&this.config.META_REDIRECT_URI&&this.config.META_CREDENTIAL_KEY&&/^[a-f0-9]{64}$/i.test(this.config.META_CREDENTIAL_KEY));}
}
