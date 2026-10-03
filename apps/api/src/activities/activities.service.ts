import { Injectable } from '@nestjs/common';
import { isValidCell } from 'h3-js';
import type { Tx } from '../infrastructure/idempotency.store.js';
import { ExtensionStore, type Actor, type Executor, fail, hash, iso, permission, requireAdmin, requireVerified } from '../extensions/extension.store.js';
import { bool, checkRevision, date, enumeration, object, text, uuid } from '../extensions/input.js';
import { activityInput, activityStates, memberStates, queryBool, type ActivityRow, type MembershipRow, type NotificationType } from './activities.types.js';

@Injectable()
export class ActivitiesService {
 constructor(readonly store:ExtensionStore) {}

 async load(db:Executor,id:string,lock=false):Promise<ActivityRow> {
  uuid(id);
  if(lock){const refs=await db<{report_id:string}[]>`SELECT report_id FROM activities WHERE id=${id}`;if(!refs[0])fail(404,'NOT_FOUND');await db`SELECT id FROM reports WHERE id=${refs[0].report_id} FOR SHARE`;}
  const rows=lock?await db<ActivityRow[]>`SELECT a.*,r.status AS report_status,r.public_visibility,r.duplicate_of_id,r.h3_cell,r.occurred_at AS report_occurred_at,r.last_observed_at AS report_last_observed_at,u.display_name AS coordinator_name FROM activities a JOIN reports r ON r.id=a.report_id LEFT JOIN users u ON u.id=a.coordinator_id AND u.deleted_at IS NULL WHERE a.id=${id} FOR UPDATE OF a`
   :await db<ActivityRow[]>`SELECT a.*,r.status AS report_status,r.public_visibility,r.duplicate_of_id,r.h3_cell,r.occurred_at AS report_occurred_at,r.last_observed_at AS report_last_observed_at,u.display_name AS coordinator_name FROM activities a JOIN reports r ON r.id=a.report_id LEFT JOIN users u ON u.id=a.coordinator_id AND u.deleted_at IS NULL WHERE a.id=${id}`;
  if(!rows[0])fail(404,'NOT_FOUND');return rows[0];
 }
 sourcePublic(row:ActivityRow):boolean {return row.public_visibility==='public'&&row.duplicate_of_id===null&&['verified','in_progress','resolved'].includes(row.report_status);}
 sourceOpen(row:ActivityRow):boolean {return this.sourcePublic(row)&&row.report_status!=='resolved';}
 effectiveState(row:ActivityRow):ActivityRow['status'] {return row.status==='on_hold'?(row.prior_state??'draft'):row.status;}
 canCancelOwnMembership(row:ActivityRow):boolean {return ['registration_open','registration_closed','on_hold'].includes(row.status)&&!['in_progress','awaiting_result','completed','cancelled'].includes(this.effectiveState(row));}
 canStart(row:ActivityRow):boolean {return row.status==='registration_closed'&&this.sourceOpen(row)&&!!row.coordinator_accepted_at&&!!row.data.startsAt&&!!row.data.endsAt&&Date.parse(row.data.startsAt)<=Date.now()&&Date.parse(row.data.endsAt)>Date.now();}
 canResume(row:ActivityRow):boolean {
  if(row.status!=='on_hold'||!row.prior_state||!this.sourceOpen(row))return false;
  if(row.prior_state==='draft')return true;
  if(!row.coordinator_accepted_at||!row.data.startsAt||!row.data.endsAt||!row.data.registrationClosesAt||row.data.capacity===null||!row.data.meetingPoint||!row.data.wasteHandoverPlan)return false;
  if(row.prior_state==='registration_open')return Date.parse(row.data.registrationClosesAt)>Date.now()&&Date.parse(row.data.startsAt)>Date.now();
  if(row.prior_state==='registration_closed')return Date.parse(row.data.endsAt)>Date.now();
  return true;
 }
 scoped(row:ActivityRow,actor:Actor,allowCandidate=false):void {
  if(actor.role==='admin')return;
  if(row.coordinator_id!==actor.id||(!allowCandidate&&!row.coordinator_accepted_at))fail(403,'FORBIDDEN');
  requireVerified(actor);
 }
 async count(db:Executor,id:string):Promise<number> {const rows=await db<{count:string}[]>`SELECT count(*)::text AS count FROM activity_memberships WHERE activity_id=${id} AND status='accepted'`;return Number(rows[0]?.count??0);}
 async managed(db:Executor,row:ActivityRow,actor:Actor) {
  const acceptedCount=await this.count(db,row.id);const canManage=actor.role==='admin'||(actor.id===row.coordinator_id&&row.coordinator_accepted_at!==null&&actor.emailVerified);
  const active=!['completed','cancelled'].includes(row.status);const open=this.sourceOpen(row);
  return {...row.data,id:row.id,revision:row.revision,status:row.status,coordinatorAcceptedAt:iso(row.coordinator_accepted_at),acceptedCount,availableSeats:Math.max(0,(row.data.capacity??0)-acceptedCount),holdReason:row.hold_reason,priorState:row.prior_state,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),actions:{
   publish:permission(actor.role==='admin'&&row.status==='draft'&&open&&this.publishReady(row),'ACTIVITY_NOT_READY'),edit:permission(canManage&&active,'ACTIVITY_NOT_EDITABLE'),cancel:permission(canManage&&active,'ACTIVITY_CLOSED'),start:permission(canManage&&this.canStart(row),'ACTIVITY_NOT_READY'),closeRegistration:permission(canManage&&row.status==='registration_open','INVALID_TRANSITION'),hold:permission(canManage&&active&&row.status!=='on_hold','INVALID_TRANSITION'),resume:permission(canManage&&this.canResume(row),'ACTIVITY_NOT_READY'),requestResult:permission(canManage&&row.status==='in_progress'&&this.sourcePublic(row),'INVALID_TRANSITION')}};
 }
 publishReady(row:ActivityRow):boolean {const d=row.data;return !!row.coordinator_accepted_at&&!!d.startsAt&&!!d.endsAt&&!!d.registrationClosesAt&&d.capacity!==null&&d.meetingPoint!==null&&d.wasteHandoverPlan.length>0&&Date.parse(d.startsAt)>Date.now()&&Date.parse(d.registrationClosesAt)>Date.now();}
 async publicDto(db:Executor,row:ActivityRow) {
  if(!row.public_ever||row.status==='draft')fail(404,'NOT_FOUND');
  if(!this.sourcePublic(row))return {kind:'activity_notice' as const,id:row.id,status:row.status==='cancelled'?'cancelled' as const:'on_hold' as const,message:'Informasi kegiatan sedang ditinjau atau tidak tersedia.',canonicalPath:`/activities/${row.id}`};
  const d=row.data;if(!d.startsAt||!d.endsAt||!d.registrationClosesAt||d.capacity===null)fail(409,'ACTIVITY_NOT_READY');
  const acceptedCount=await this.count(db,row.id);return {kind:'activity' as const,id:row.id,reportId:row.report_id,revision:row.revision,title:d.title,description:d.description,status:row.status,area:{cellId:row.h3_cell,label:`Area ${row.h3_cell}`},coordinatorDisplayName:row.publish_display_name?(row.coordinator_name??'Koordinator SAP'):'Koordinator SAP',startsAt:d.startsAt,endsAt:d.endsAt,registrationClosesAt:d.registrationClosesAt,timezone:d.timezone,capacity:d.capacity,acceptedCount,availableSeats:Math.max(0,d.capacity-acceptedCount),registrationOpen:row.status==='registration_open'&&this.sourceOpen(row)&&Date.parse(d.registrationClosesAt)>Date.now(),equipment:d.equipment,accessibilityNotes:d.accessibilityNotes,wasteHandoverPlan:d.wasteHandoverPlan,resultOutcome:row.result_outcome,canonicalPath:`/activities/${row.id}`};
 }
 memberDto(row:MembershipRow) {return {id:row.id,activityId:row.activity_id,revision:row.revision,status:row.status,attendance:row.attendance,reason:row.reason,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};}
 async get(id:string) {return this.publicDto(this.store.db,await this.load(this.store.db,id));}
 async manage(actor:Actor,id:string) {const row=await this.load(this.store.db,id);this.scoped(row,actor,true);return this.managed(this.store.db,row,actor);}
 async list(query:Record<string,unknown>) {
  object(query,['limit','cursor','cellId','from','to','availableOnly']);const cell=query.cellId===undefined?null:this.cell(query.cellId);const from=query.from===undefined?null:date(query.from,true);const to=query.to===undefined?null:date(query.to,true);if(from&&to&&from>=to)fail(400,'VALIDATION_ERROR');const available=queryBool(query.availableOnly);const page=this.store.cursor(query,{route:'activities',cell,from,to,available});
  const rows=await this.store.db<{id:string;created_at:Date}[]>`SELECT a.id,a.created_at FROM activities a JOIN reports r ON r.id=a.report_id WHERE a.public_ever AND a.status<>'draft' AND r.public_visibility='public' AND r.duplicate_of_id IS NULL AND r.status IN ('verified','in_progress','resolved')
    AND (${cell}::text IS NULL OR r.h3_cell=${cell}) AND (${from}::timestamptz IS NULL OR (a.data->>'startsAt')::timestamptz>=${from}::timestamptz) AND (${to}::timestamptz IS NULL OR (a.data->>'startsAt')::timestamptz<${to}::timestamptz)
    AND (NOT ${available} OR (a.status='registration_open' AND r.status<>'resolved' AND (a.data->>'registrationClosesAt')::timestamptz>now() AND (SELECT count(*) FROM activity_memberships m WHERE m.activity_id=a.id AND m.status='accepted')<(a.data->>'capacity')::int))
    AND (${page.boundary?.at??null}::timestamptz IS NULL OR (a.created_at,a.id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid)) ORDER BY a.created_at DESC,a.id DESC LIMIT ${page.limit+1}`;
  const selected=rows.slice(0,page.limit);return {items:await Promise.all(selected.map(async r=>this.publicDto(this.store.db,await this.load(this.store.db,r.id)))),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};
 }
 cell(value:unknown):string {if(typeof value!=='string'||!isValidCell(value))fail(400,'VALIDATION_ERROR');return value;}
 async listManaged(actor:Actor,query:Record<string,unknown>,own=false) {
  if(!own)requireAdmin(actor);object(query,own?['limit','cursor']:['limit','cursor','status','reportId']);const state=query.status===undefined?null:enumeration(query.status,activityStates);const report=query.reportId===undefined?null:uuid(query.reportId);const page=this.store.cursor(query,{route:own?'assignments':'adminActivities',actor:own?actor.id:null,state,report});
  const rows=await this.store.db<{id:string;created_at:Date}[]>`SELECT id,created_at FROM activities WHERE (${own}=false OR coordinator_id=${actor.id}) AND (${state}::text IS NULL OR status=${state}) AND (${report}::uuid IS NULL OR report_id=${report}) AND (${page.boundary?.at??null}::timestamptz IS NULL OR (created_at,id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${page.limit+1}`;
  const selected=rows.slice(0,page.limit);return {items:await Promise.all(selected.map(async r=>this.managed(this.store.db,await this.load(this.store.db,r.id),actor))),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};
 }
 async candidates(actor:Actor,query:Record<string,unknown>) {
  requireAdmin(actor);object(query,['search','limit','cursor']);const search=text(query.search,3,100);const page=this.store.cursor(query,{route:'candidates',search});const pattern=`%${search.replace(/[\\%_]/g,'\\$&')}%`;
  const rows=await this.store.db<{id:string;display_name:string;created_at:Date}[]>`SELECT id,display_name,created_at FROM users WHERE deleted_at IS NULL AND email_verified_at IS NOT NULL AND display_name ILIKE ${pattern} ESCAPE '\\' AND (${page.boundary?.at??null}::timestamptz IS NULL OR (created_at,id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${page.limit+1}`;
  const selected=rows.slice(0,page.limit);return {items:selected.map(r=>({id:r.id,displayName:r.display_name})),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};
 }
 async validateCoordinator(tx:Tx,id:string|null):Promise<void> {if(id===null)return;const rows=await tx`SELECT id FROM users WHERE id=${id} AND deleted_at IS NULL AND email_verified_at IS NOT NULL FOR SHARE`;if(!rows.length)fail(422,'COORDINATOR_INVALID');}
 async create(actor:Actor,key:string,raw:unknown) {
  requireAdmin(actor);const data=activityInput(raw);return this.store.mutate(actor,'createActivity',key,data,async tx=>{
   const source=await tx`SELECT id FROM reports WHERE id=${data.reportId} AND duplicate_of_id IS NULL FOR UPDATE`;if(!source.length)fail(422,'SOURCE_NOT_PUBLIC');
   const existing=await tx`SELECT id FROM activities WHERE report_id=${data.reportId} AND status NOT IN ('completed','cancelled')`;if(existing.length)fail(409,'ACTIVE_ACTIVITY_EXISTS');await this.validateCoordinator(tx,data.coordinatorId);
   const [row]=await tx<{id:string}[]>`INSERT INTO activities(report_id,coordinator_id,data) VALUES(${data.reportId},${data.coordinatorId},${tx.json(data as never)}) RETURNING id`;if(!row)fail(500,'INTERNAL_ERROR');
   if(data.coordinatorId)await this.notify(tx,[data.coordinatorId],`activity:${row.id}:1`,'coordinator_assigned',`/activities/${row.id}/manage`);
   await this.store.audit(tx,actor.id,'activity_created','activity',row.id,{reportId:data.reportId});await this.store.event(tx,'activity.changed',row.id,1,{reportId:data.reportId});return this.managed(tx,await this.load(tx,row.id),actor);
  },201);
 }
 async edit(actor:Actor,id:string,expected:number,raw:unknown) {
  const data=activityInput(raw);return this.store.db.begin(async tx=>{const row=await this.load(tx,id,true);this.scoped(row,actor);checkRevision(row.revision,expected);if(['completed','cancelled'].includes(row.status))fail(409,'ACTIVITY_CLOSED');if(data.reportId!==row.report_id)fail(422,'IMMUTABLE_FIELD');if(data.coordinatorId!==row.coordinator_id&&actor.role!=='admin')fail(403,'FORBIDDEN');
   const accepted=await this.count(tx,id);if(data.capacity!==null&&data.capacity<accepted)fail(409,'ACTIVITY_FULL');await this.validateCoordinator(tx,data.coordinatorId);const changedCoordinator=data.coordinatorId!==row.coordinator_id;
   if(row.public_ever&&(!data.startsAt||!data.endsAt||!data.registrationClosesAt||data.capacity===null||!data.meetingPoint||!data.wasteHandoverPlan))fail(422,'ACTIVITY_NOT_READY');
   const changedSchedule=hash([data.startsAt,data.endsAt,data.meetingPoint])!==hash([row.data.startsAt,row.data.endsAt,row.data.meetingPoint]);
   if(changedSchedule&&['in_progress','awaiting_result'].includes(this.effectiveState(row)))fail(409,'ACTIVITY_ALREADY_STARTED');
   if(row.public_ever&&changedSchedule&&Date.parse(data.startsAt!)<=Date.now())fail(422,'ACTIVITY_NOT_READY');
   if(changedCoordinator&&row.status!=='draft'&&row.status!=='on_hold')fail(409,'COORDINATOR_REASSIGNMENT_REQUIRES_HOLD');
   await tx`UPDATE activities SET data=${tx.json(data as never)},coordinator_id=${data.coordinatorId},coordinator_accepted_at=CASE WHEN ${changedCoordinator} THEN NULL ELSE coordinator_accepted_at END,publish_display_name=CASE WHEN ${changedCoordinator} THEN false ELSE publish_display_name END,schedule_revision=schedule_revision+${row.public_ever&&changedSchedule?1:0},revision=revision+1,updated_at=now() WHERE id=${id}`;
   if(changedCoordinator&&data.coordinatorId)await this.notify(tx,[data.coordinatorId],`activity:${id}:${expected+1}`,'coordinator_assigned',`/activities/${id}/manage`);
   if(row.public_ever)await this.notifyParticipants(tx,id,`activity:${id}:${expected+1}`,'activity_changed');await this.store.audit(tx,actor.id,'activity_edited','activity',id,{scheduleChanged:changedSchedule,coordinatorChanged:changedCoordinator});await this.store.event(tx,'activity.changed',id,expected+1,{reportId:row.report_id});return this.managed(tx,await this.load(tx,id),actor);
  });
 }
 async coordinatorAcceptance(actor:Actor,id:string,expected:number,raw:unknown) {
  requireVerified(actor);const b=object(raw,['accepted','publishDisplayName']);const accepted=bool(b.accepted);const publishName=bool(b.publishDisplayName);
  return this.store.db.begin(async tx=>{const row=await this.load(tx,id,true);if(row.coordinator_id!==actor.id)fail(403,'FORBIDDEN');checkRevision(row.revision,expected);if(['completed','cancelled'].includes(row.status))fail(409,'ACTIVITY_CLOSED');
   await tx`UPDATE activities SET coordinator_accepted_at=CASE WHEN ${accepted} THEN now() ELSE NULL END,publish_display_name=${accepted&&publishName},status=CASE WHEN ${!accepted&&row.public_ever} THEN 'on_hold' ELSE status END,prior_state=CASE WHEN ${!accepted&&row.public_ever&&row.status!=='on_hold'} THEN status ELSE prior_state END,hold_reason=CASE WHEN ${!accepted&&row.public_ever} THEN 'Koordinator belum menyetujui penugasan.' ELSE hold_reason END,revision=revision+1,updated_at=now() WHERE id=${id}`;
   if(row.public_ever)await this.notifyParticipants(tx,id,`activity:${id}:${expected+1}`,'activity_changed');await this.store.audit(tx,actor.id,'coordinator_acceptance','activity',id,{accepted,publishDisplayName:accepted&&publishName});await this.store.event(tx,'activity.changed',id,expected+1,{reportId:row.report_id});return this.managed(tx,await this.load(tx,id),actor);
  });
 }
 async command(actor:Actor,id:string,expected:number,key:string,raw:unknown) {
  const b=object(raw,['action','reason']);const action=enumeration(b.action,['publish','close_registration','start','hold','resume','cancel','request_result']);const reason=['hold','resume','cancel'].includes(action)?text(b.reason,5,1000):b.reason===null?null:text(b.reason,5,1000);
  return this.store.mutate(actor,`activityCommand:${id}`,key,{expected,action,reason},async tx=>{const row=await this.load(tx,id,true);this.scoped(row,actor);checkRevision(row.revision,expected);let next:ActivityRow['status']=row.status;let prior=row.prior_state;let hold=row.hold_reason;
   if(action==='publish'){requireAdmin(actor);if(row.status!=='draft'||!this.sourceOpen(row)||!this.publishReady(row))fail(409,'ACTIVITY_NOT_READY');await this.validateCoordinator(tx,row.coordinator_id);next='registration_open';}
   if(action==='close_registration'){if(row.status!=='registration_open')fail(409,'INVALID_TRANSITION');next='registration_closed';}
   if(action==='start'){if(!this.canStart(row))fail(409,'ACTIVITY_NOT_READY');next='in_progress';}
   if(action==='request_result'){if(row.status!=='in_progress'||!this.sourcePublic(row))fail(409,'INVALID_TRANSITION');next='awaiting_result';}
   if(action==='hold'){if(['completed','cancelled','on_hold'].includes(row.status))fail(409,'INVALID_TRANSITION');next='on_hold';prior=row.status;hold=reason;}
   if(action==='resume'){if(!this.canResume(row)||!prior)fail(409,'ACTIVITY_NOT_READY');await this.validateCoordinator(tx,row.coordinator_id);next=prior;prior=null;hold=null;}
   if(action==='cancel'){if(['completed','cancelled'].includes(row.status))fail(409,'INVALID_TRANSITION');next='cancelled';prior=null;hold=reason;}
   await tx`UPDATE activities SET status=${next},prior_state=${prior},hold_reason=${hold},public_ever=public_ever OR ${action==='publish'},revision=revision+1,updated_at=now() WHERE id=${id}`;
   if(action==='cancel')await tx`UPDATE activity_memberships SET status='cancelled',reason=${reason},revision=revision+1,updated_at=now() WHERE activity_id=${id} AND status IN ('requested','accepted','waitlisted')`;
   if(row.public_ever||action==='publish'){await this.notifyParticipants(tx,id,`activity:${id}:${expected+1}`,action==='cancel'?'activity_cancelled':'activity_changed');await this.notifyFollowers(tx,row.report_id,`activity:${id}:${expected+1}`,action==='cancel'?'activity_cancelled':'activity_changed',`/activities/${id}`);}
   await this.store.audit(tx,actor.id,`activity_${action}`,'activity',id,{from:row.status,to:next,reason});await this.store.event(tx,'activity.changed',id,expected+1,{reportId:row.report_id});return this.managed(tx,await this.load(tx,id),actor);
  });
 }
 async viewer(actor:Actor,id:string) {
  const row=await this.load(this.store.db,id);if(!row.public_ever&&row.coordinator_id!==actor.id&&actor.role!=='admin')fail(404,'NOT_FOUND');const [member]=await this.store.db<MembershipRow[]>`SELECT * FROM activity_memberships WHERE activity_id=${id} AND user_id=${actor.id}`;const manage=actor.role==='admin'||(row.coordinator_id===actor.id&&!!row.coordinator_accepted_at&&actor.emailVerified);const join=this.sourceOpen(row)&&row.status==='registration_open'&&!!row.data.registrationClosesAt&&Date.parse(row.data.registrationClosesAt)>Date.now();
  return {activityId:id,membership:member?this.memberDto(member):null,meetingPoint:this.sourcePublic(row)&&(manage||member?.status==='accepted')?row.data.meetingPoint:null,scheduleRevision:row.schedule_revision,scheduleAcknowledgementRequired:member?.status==='accepted'&&member.schedule_ack_revision<row.schedule_revision,actions:{join:permission(join&&actor.emailVerified,actor.emailVerified?'REGISTRATION_CLOSED':'EMAIL_NOT_VERIFIED'),cancelMembership:permission(!!member&&['requested','accepted','waitlisted'].includes(member.status)&&this.canCancelOwnMembership(row),'MEMBERSHIP_CLOSED'),manage:permission(manage,'FORBIDDEN')}};
 }
 async membership(actor:Actor,id:string,raw:unknown) {
  requireVerified(actor);const b=object(raw,['participating']);const participating=bool(b.participating);return this.store.db.begin(async tx=>{const row=await this.load(tx,id,true);const [old]=await tx<MembershipRow[]>`SELECT * FROM activity_memberships WHERE activity_id=${id} AND user_id=${actor.id} FOR UPDATE`;
   if(participating){if(old&&['requested','accepted','waitlisted'].includes(old.status))return this.memberDto(old);if(!this.sourceOpen(row))fail(409,'SOURCE_NOT_PUBLIC');if(row.status!=='registration_open'||!row.data.registrationClosesAt||Date.parse(row.data.registrationClosesAt)<=Date.now())fail(409,'REGISTRATION_CLOSED');}
   else{if(!old)fail(404,'NOT_FOUND');if(old.status==='cancelled')return this.memberDto(old);if(!['requested','accepted','waitlisted'].includes(old.status)||!this.canCancelOwnMembership(row))fail(409,'MEMBERSHIP_CLOSED');}
   const [member]=await tx<MembershipRow[]>`INSERT INTO activity_memberships(activity_id,user_id,status,schedule_ack_revision) VALUES(${id},${actor.id},${participating?'requested':'cancelled'},${row.schedule_revision}) ON CONFLICT(activity_id,user_id) DO UPDATE SET status=EXCLUDED.status,attendance='unknown',reason=NULL,schedule_ack_revision=EXCLUDED.schedule_ack_revision,revision=activity_memberships.revision+1,updated_at=now() RETURNING *`;if(!member)fail(500,'INTERNAL_ERROR');await this.store.audit(tx,actor.id,'membership_changed','membership',member.id,{status:member.status});await this.store.event(tx,'membership.changed',member.id,member.revision,{activityId:id,reportId:row.report_id,userId:actor.id});return this.memberDto(member);
  });
 }
 async members(actor:Actor,id:string,query:Record<string,unknown>) {
  const row=await this.load(this.store.db,id);this.scoped(row,actor);object(query,['limit','cursor','status']);const status=query.status===undefined?null:enumeration(query.status,memberStates);const page=this.store.cursor(query,{route:'memberships',activity:id,status});const rows=await this.store.db<MembershipRow[]>`SELECT m.*,CASE WHEN u.deleted_at IS NULL THEN coalesce(u.display_name,'Pengguna SAP') ELSE 'Pengguna SAP' END AS display_name FROM activity_memberships m LEFT JOIN users u ON u.id=m.user_id WHERE m.activity_id=${id} AND (${status}::text IS NULL OR m.status=${status}) AND (${page.boundary?.at??null}::timestamptz IS NULL OR (m.created_at,m.id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid)) ORDER BY m.created_at DESC,m.id DESC LIMIT ${page.limit+1}`;const selected=rows.slice(0,page.limit);return {items:selected.map(r=>({...this.memberDto(r),displayName:r.display_name??'Pengguna SAP'})),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};
 }
 async decideMembership(actor:Actor,id:string,memberId:string,expected:number,raw:unknown) {
  uuid(memberId);const b=object(raw,['status','reason']);const next=enumeration(b.status,['accepted','waitlisted','rejected','cancelled']);const reason=text(b.reason,5,1000);return this.store.db.begin(async tx=>{const row=await this.load(tx,id,true);this.scoped(row,actor);const [member]=await tx<MembershipRow[]>`SELECT * FROM activity_memberships WHERE id=${memberId} AND activity_id=${id} FOR UPDATE`;if(!member)fail(404,'NOT_FOUND');checkRevision(member.revision,expected);
   if(['completed','cancelled'].includes(row.status))fail(409,'MEMBERSHIP_CLOSED');if(!this.sourceOpen(row)&&next!=='cancelled')fail(409,'SOURCE_NOT_PUBLIC');
   if(member.status===next)return {...this.memberDto(member),displayName:await this.name(tx,member.user_id)};
   const allowed=(['requested','waitlisted'].includes(member.status)&&['accepted','waitlisted','rejected','cancelled'].includes(next))||(member.status==='accepted'&&next==='cancelled');if(!allowed)fail(409,'INVALID_TRANSITION');
   if(next==='accepted'){if(!['registration_open','registration_closed'].includes(row.status)||!row.data.startsAt||Date.parse(row.data.startsAt)<=Date.now())fail(409,'MEMBERSHIP_CLOSED');const activeUser=await tx`SELECT id FROM users WHERE id=${member.user_id} AND deleted_at IS NULL AND email_verified_at IS NOT NULL FOR SHARE`;if(!activeUser.length)fail(422,'PARTICIPANT_INVALID');if(row.data.capacity===null||await this.count(tx,id)>=row.data.capacity)fail(409,'ACTIVITY_FULL');}
   const [updated]=await tx<MembershipRow[]>`UPDATE activity_memberships SET status=${next},reason=${reason},attendance=CASE WHEN ${next==='cancelled'} THEN 'unknown' ELSE attendance END,revision=revision+1,updated_at=now() WHERE id=${memberId} RETURNING *`;if(!updated)fail(500,'INTERNAL_ERROR');await this.notify(tx,[member.user_id],`membership:${memberId}:${expected+1}`,'membership_decided',`/activities/${id}`);await this.store.audit(tx,actor.id,'membership_decided','membership',memberId,{from:member.status,to:next,reason});await this.store.event(tx,'membership.changed',memberId,expected+1,{activityId:id,reportId:row.report_id,userId:member.user_id});return {...this.memberDto(updated),displayName:await this.name(tx,member.user_id)};
  });
 }
 async attendance(actor:Actor,id:string,memberId:string,expected:number,raw:unknown) {
  uuid(memberId);const b=object(raw,['attendance']);const attendance=enumeration(b.attendance,['unknown','present','absent']);return this.store.db.begin(async tx=>{const row=await this.load(tx,id,true);this.scoped(row,actor);if(!['in_progress','awaiting_result','completed'].includes(row.status))fail(409,'ACTIVITY_NOT_STARTED');const [member]=await tx<MembershipRow[]>`SELECT * FROM activity_memberships WHERE id=${memberId} AND activity_id=${id} FOR UPDATE`;if(!member)fail(404,'NOT_FOUND');checkRevision(member.revision,expected);if(member.status!=='accepted')fail(409,'MEMBERSHIP_NOT_ACCEPTED');if(member.attendance===attendance)return {...this.memberDto(member),displayName:await this.name(tx,member.user_id)};const [updated]=await tx<MembershipRow[]>`UPDATE activity_memberships SET attendance=${attendance},revision=revision+1,updated_at=now() WHERE id=${memberId} RETURNING *`;if(!updated)fail(500,'INTERNAL_ERROR');await this.store.audit(tx,actor.id,'attendance_changed','membership',memberId,{from:member.attendance,to:attendance});await this.store.event(tx,'membership.changed',memberId,expected+1,{activityId:id,reportId:row.report_id,userId:member.user_id});return {...this.memberDto(updated),displayName:await this.name(tx,member.user_id)};});
 }
 async acknowledge(actor:Actor,id:string,raw:unknown) {
  const b=object(raw,['scheduleRevision','confirmed']);if(typeof b.scheduleRevision!=='number'||!Number.isSafeInteger(b.scheduleRevision)||b.scheduleRevision<1)fail(400,'VALIDATION_ERROR');const expected=b.scheduleRevision;const confirmed=bool(b.confirmed);
  return this.store.db.begin(async tx=>{
   const row=await this.load(tx,id,true);checkRevision(row.schedule_revision,expected);
   const [member]=await tx<MembershipRow[]>`SELECT * FROM activity_memberships WHERE activity_id=${id} AND user_id=${actor.id} FOR UPDATE`;
   if(!member)fail(403,'FORBIDDEN');
   if(!confirmed&&member.status==='cancelled'&&member.schedule_ack_revision===expected)return this.memberDto(member);
   if(member.status!=='accepted')fail(403,'FORBIDDEN');
   if(!this.canCancelOwnMembership(row))fail(409,'MEMBERSHIP_CLOSED');
   if(confirmed&&member.schedule_ack_revision===expected)return this.memberDto(member);
   const [updated]=await tx<MembershipRow[]>`UPDATE activity_memberships SET schedule_ack_revision=${expected},status=CASE WHEN ${confirmed} THEN status ELSE 'cancelled' END,attendance=CASE WHEN ${confirmed} THEN attendance ELSE 'unknown' END,reason=CASE WHEN ${confirmed} THEN reason ELSE 'Perubahan jadwal tidak disetujui peserta.' END,revision=revision+1,updated_at=now() WHERE id=${member.id} RETURNING *`;
   if(!updated)fail(500,'INTERNAL_ERROR');
   await this.store.audit(tx,actor.id,'schedule_acknowledged','membership',member.id,{scheduleRevision:expected,confirmed});
   await this.store.event(tx,'membership.changed',member.id,updated.revision,{activityId:id,reportId:row.report_id,userId:actor.id});
   return this.memberDto(updated);
  });
 }
 async mine(actor:Actor,query:Record<string,unknown>) {
  object(query,['limit','cursor']);const page=this.store.cursor(query,{route:'myActivities',user:actor.id});const rows=await this.store.db<{id:string;created_at:Date}[]>`SELECT a.id,a.created_at FROM activities a WHERE a.public_ever AND (a.coordinator_id=${actor.id} OR EXISTS(SELECT 1 FROM activity_memberships m WHERE m.activity_id=a.id AND m.user_id=${actor.id})) AND (${page.boundary?.at??null}::timestamptz IS NULL OR (a.created_at,a.id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid)) ORDER BY a.created_at DESC,a.id DESC LIMIT ${page.limit+1}`;const selected=rows.slice(0,page.limit);return {items:await Promise.all(selected.map(async r=>{const row=await this.load(this.store.db,r.id);const [member]=await this.store.db<MembershipRow[]>`SELECT * FROM activity_memberships WHERE activity_id=${r.id} AND user_id=${actor.id}`;return {activity:await this.publicDto(this.store.db,row),membership:member?this.memberDto(member):null,isCoordinator:row.coordinator_id===actor.id};})),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};
 }
 async name(tx:Executor,userId:string|null):Promise<string> {const [row]=await tx<{display_name:string}[]>`SELECT CASE WHEN deleted_at IS NULL THEN display_name ELSE 'Pengguna SAP' END AS display_name FROM users WHERE id=${userId}`;return row?.display_name??'Pengguna SAP';}
 async notify(tx:Tx,userIds:(string|null)[],eventKey:string,type:NotificationType,targetPath:string):Promise<void> {
  if(!/^\/(activities\/[0-9a-f-]{36}(\/manage)?|incidents\/[0-9a-f-]{36}|dashboard(\/[a-z-]+)?)$/i.test(targetPath))fail(500,'INVALID_NOTIFICATION_TARGET');
  const labels:Record<NotificationType,string>={incident_updated:'Perkembangan kejadian',incident_resolved:'Kejadian telah ditangani',incident_withdrawn:'Informasi kejadian ditarik',evidence_requested:'Bukti tambahan diperlukan',membership_decided:'Permintaan ikut diperbarui',coordinator_assigned:'Penugasan koordinator',activity_changed:'Informasi kegiatan diperbarui',activity_cancelled:'Kegiatan dibatalkan',result_approved:'Hasil kegiatan disetujui'};
  for(const userId of new Set(userIds.filter((id):id is string=>id!==null)))await tx`INSERT INTO notifications(user_id,event_key,type,title,message,target_path) SELECT id,${eventKey},${type},${labels[type]},'Buka SAP untuk melihat informasi yang tersedia bagi akun Anda.',${targetPath} FROM users WHERE id=${userId} AND deleted_at IS NULL ON CONFLICT(user_id,event_key,type) DO NOTHING`;
 }
 async notifyFollowers(tx:Tx,reportId:string,eventKey:string,type:NotificationType,path=`/incidents/${reportId}`):Promise<void> {const users=await tx<{user_id:string}[]>`SELECT user_id FROM incident_follows WHERE report_id=${reportId} AND following`;await this.notify(tx,users.map(u=>u.user_id),eventKey,type,path);}
 async notifyParticipants(tx:Tx,id:string,eventKey:string,type:NotificationType):Promise<void> {const users=await tx<{user_id:string|null}[]>`SELECT user_id FROM activity_memberships WHERE activity_id=${id} AND status IN ('requested','accepted','waitlisted','cancelled') UNION SELECT coordinator_id FROM activities WHERE id=${id} AND coordinator_id IS NOT NULL`;await this.notify(tx,users.map(u=>u.user_id),eventKey,type,`/activities/${id}`);}
 async redactForReport(tx:Tx,reportId:string):Promise<void> {
  const rows=await tx<{id:string;revision:number}[]>`UPDATE activities SET prior_state=CASE WHEN status<>'on_hold' THEN status ELSE prior_state END,status='on_hold',hold_reason='Sumber kejadian sedang ditinjau.',revision=revision+1,updated_at=now() WHERE report_id=${reportId} AND public_ever AND status NOT IN ('completed','cancelled') AND (status<>'on_hold' OR hold_reason IS DISTINCT FROM 'Sumber kejadian sedang ditinjau.') RETURNING id,revision`;
  const all=await tx<{id:string}[]>`SELECT id FROM activities WHERE report_id=${reportId}`;for(const a of all)await tx`UPDATE notifications SET title='Informasi kegiatan diperbarui',message='Informasi sumber kejadian sedang ditinjau.',target_path=${`/activities/${a.id}`} WHERE target_path IN (${`/activities/${a.id}`},${`/activities/${a.id}/manage`})`;
  for(const row of rows){await this.notifyParticipants(tx,row.id,`activity:${row.id}:${row.revision}`,'activity_changed');await this.store.event(tx,'activity.changed',row.id,row.revision,{reportId});}
 }
}
