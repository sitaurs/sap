import { bool, date, enumeration, ids, integer, object, strings, text, uuid } from '../extensions/input.js';
import { fail } from '../extensions/extension.store.js';

export const activityStates = ['draft','registration_open','registration_closed','in_progress','awaiting_result','completed','on_hold','cancelled'] as const;
export type ActivityState = typeof activityStates[number];
export type ActivityInput = {
 reportId:string;title:string;description:string;coordinatorId:string|null;startsAt:string|null;endsAt:string|null;registrationClosesAt:string|null;
 timezone:'Asia/Jakarta';capacity:number|null;meetingPoint:{instructions:string;latitude:number|null;longitude:number|null}|null;
 equipment:string[];accessibilityNotes:string;wasteHandoverPlan:string;
};
export type ActivityRow = {
 id:string;report_id:string;coordinator_id:string|null;coordinator_accepted_at:Date|null;publish_display_name:boolean;revision:number;schedule_revision:number;
 status:ActivityState;prior_state:ActivityState|null;hold_reason:string|null;public_cancel_reason:string|null;public_ever:boolean;data:ActivityInput;result_outcome:'partial'|'complete'|null;
 created_at:Date;updated_at:Date;report_status:string;public_visibility:string;duplicate_of_id:string|null;h3_cell:string;
 report_occurred_at:Date;report_last_observed_at:Date|null;coordinator_name:string|null;
};
export const memberStates = ['requested','accepted','waitlisted','rejected','cancelled'] as const;
export type MemberState = typeof memberStates[number];
export type MembershipRow = {
 id:string;activity_id:string;user_id:string|null;revision:number;status:MemberState;attendance:'unknown'|'present'|'absent';
 reason:string|null;schedule_ack_revision:number;created_at:Date;updated_at:Date;display_name?:string;
};
export type MeasurementInput = { physicalBatchId:string|null;stage:'collected'|'handed_over'|'recycled';valueKg:number;measuredAt:string;method:'scale';sourceReference:string;evidenceMediaIds:string[] };
export type ResultInput = { observedAt:string;description:string;claimedOutcome:'partial'|'complete';beforeMediaIds:string[];beforePublicEvidenceIds:string[];afterMediaIds:string[];measurement:MeasurementInput|null };
export type MeasurementRow = {
 id:string;activity_id:string;physical_batch_id:string;revision:number;stage:MeasurementInput['stage'];value_kg:string|number;method:'scale';source_reference:string;
 evidence_media_ids:string[];evidence_hash:string;status:'pending_review'|'verified'|'rejected'|'superseded';measured_at:Date;verified_at:Date|null;
 supersedes_id:string|null;created_by:string;created_at:Date;updated_at:Date;
};
export type ResultRow = {
 id:string;activity_id:string;report_id:string;author_id:string;revision:number;status:'submitted'|'needs_evidence'|'approved'|'rejected';observed_at:Date;
 claimed_outcome:'partial'|'complete';verified_outcome:'partial'|'complete'|null;public_summary:string|null;data:ResultInput;requested_evidence:string[];
 decision_reason:string|null;measurement_id:string|null;approved_at:Date|null;created_at:Date;updated_at:Date;
};
export type NotificationType = 'incident_updated'|'incident_resolved'|'incident_withdrawn'|'evidence_requested'|'membership_decided'|'coordinator_assigned'|'activity_changed'|'activity_cancelled'|'result_approved';

export function activityInput(raw:unknown):ActivityInput {
 const b=object(raw,['reportId','title','description','coordinatorId','startsAt','endsAt','registrationClosesAt','timezone','capacity','meetingPoint','equipment','accessibilityNotes','wasteHandoverPlan']);
 const coordinate=(v:unknown,min:number,max:number):number|null=>{if(v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(400,'VALIDATION_ERROR');return v;};
 let meetingPoint:ActivityInput['meetingPoint']=null;
 if(b.meetingPoint!==null){const m=object(b.meetingPoint,['instructions','latitude','longitude']);meetingPoint={instructions:text(m.instructions,1,1000),latitude:coordinate(m.latitude,-90,90),longitude:coordinate(m.longitude,-180,180)};if((meetingPoint.latitude===null)!==(meetingPoint.longitude===null))fail(400,'VALIDATION_ERROR');}
 const result:ActivityInput={reportId:uuid(b.reportId),title:text(b.title,5,150),description:text(b.description,20,2000),coordinatorId:b.coordinatorId===null?null:uuid(b.coordinatorId),startsAt:b.startsAt===null?null:date(b.startsAt,true),endsAt:b.endsAt===null?null:date(b.endsAt,true),registrationClosesAt:b.registrationClosesAt===null?null:date(b.registrationClosesAt,true),timezone:enumeration(b.timezone,['Asia/Jakarta']),capacity:b.capacity===null?null:integer(b.capacity,1,200),meetingPoint,equipment:strings(b.equipment,0,15,200),accessibilityNotes:text(b.accessibilityNotes,0,1000),wasteHandoverPlan:text(b.wasteHandoverPlan,0,1000)};
 if(result.startsAt&&result.endsAt&&Date.parse(result.startsAt)>=Date.parse(result.endsAt))fail(400,'VALIDATION_ERROR');
 if(result.registrationClosesAt&&result.startsAt&&Date.parse(result.registrationClosesAt)>Date.parse(result.startsAt))fail(400,'VALIDATION_ERROR');
 return result;
}
export function weight(raw:unknown):number {if(typeof raw!=='number'||!Number.isFinite(raw)||raw<0||raw>100000||Math.abs(raw*1000-Math.round(raw*1000))>0.000001)fail(400,'VALIDATION_ERROR');return raw;}
export function measurementInput(raw:unknown):MeasurementInput {
 const b=object(raw,['physicalBatchId','stage','valueKg','measuredAt','method','sourceReference','evidenceMediaIds']);
 return {physicalBatchId:b.physicalBatchId===null?null:uuid(b.physicalBatchId),stage:enumeration(b.stage,['collected','handed_over','recycled']),valueKg:weight(b.valueKg),measuredAt:date(b.measuredAt),method:enumeration(b.method,['scale']),sourceReference:text(b.sourceReference,1,150),evidenceMediaIds:ids(b.evidenceMediaIds,1,3)};
}
export function resultInput(raw:unknown):ResultInput {
 const b=object(raw,['observedAt','description','claimedOutcome','beforeMediaIds','beforePublicEvidenceIds','afterMediaIds','measurement']);
 const result:ResultInput={observedAt:date(b.observedAt),description:text(b.description,20,2000),claimedOutcome:enumeration(b.claimedOutcome,['partial','complete']),beforeMediaIds:ids(b.beforeMediaIds,0,3),beforePublicEvidenceIds:ids(b.beforePublicEvidenceIds,0,3),afterMediaIds:ids(b.afterMediaIds,1,3),measurement:b.measurement===null?null:measurementInput(b.measurement)};
 if(result.beforeMediaIds.length+result.beforePublicEvidenceIds.length<1||result.beforeMediaIds.length+result.beforePublicEvidenceIds.length>3||new Set([...result.beforeMediaIds,...result.afterMediaIds]).size!==result.beforeMediaIds.length+result.afterMediaIds.length)fail(400,'VALIDATION_ERROR');
 return result;
}
export function queryBool(raw:unknown):boolean {if(raw===undefined)return false;if(raw==='true'||raw===true)return true;if(raw==='false'||raw===false)return false;return bool(raw);}
