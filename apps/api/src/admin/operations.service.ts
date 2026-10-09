import { Injectable } from '@nestjs/common';
import type { AuthenticatedSession } from '../platform/http/request-context.js';
import { ExtensionStore, fail, iso, requireAdmin, requireVerified, type Actor } from '../extensions/extension.store.js';
import { bool, checkRevision, date, enumeration, object, text, uuid } from '../extensions/input.js';
import { isReportCell } from '../reports/geo.js';
import { localityFor } from '../areas/locality.js';

const statuses = ['submitted','verified','in_progress','resolved','rejected','duplicate'] as const;
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  // Spreadsheet programs interpret formula prefixes even in quoted CSV cells.
  if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"','""')}"`;
}
type UserRow = {id:string;display_name:string;email_normalized:string;role:'user'|'admin';email_verified_at:Date|null;created_at:Date};
type ReportRow = {id:string;revision:number;status:string;description:string|null;category_id:string|null;lat:number;lon:number;h3_cell:string;created_at:Date;updated_at:Date;assignee_id:string|null;assignee_name:string|null;due_at:Date|null;note:string|null;assignment_revision:number|null;progress:string|null;progress_note:string|null;overdue:boolean};

@Injectable()
export class OperationsService {
  constructor(private readonly store: ExtensionStore) {}
  async users(actor:Actor, query:Record<string,unknown>) {
    requireAdmin(actor); object(query,['limit','cursor','search']);
    const search = query.search === undefined ? '' : text(query.search,0,100);
    const page=this.store.cursor(query,{route:'admin-users',search});
    const rows=await this.store.db<UserRow[]>`SELECT id,display_name,email_normalized,role,email_verified_at,created_at FROM users
      WHERE deleted_at IS NULL AND (${search}='' OR strpos(lower(display_name),lower(${search}))>0 OR strpos(lower(email_normalized),lower(${search}))>0)
      AND (${page.boundary?.at??null}::timestamptz IS NULL OR (created_at,id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT ${page.limit+1}`;
    const selected=rows.slice(0,page.limit);
    return {items:selected.map(r=>({id:r.id,displayName:r.display_name,email:r.email_normalized,role:r.role,emailVerified:!!r.email_verified_at,createdAt:iso(r.created_at)})),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};
  }
  async role(actor:Actor,session:AuthenticatedSession,id:string,key:string,raw:unknown) {
    requireAdmin(actor);requireVerified(actor);uuid(id);
    if (!session.reauthenticatedAt || Date.now()-session.reauthenticatedAt.getTime()>300_000) fail(403,'REAUTHENTICATION_REQUIRED','Konfirmasi kata sandi sebelum mengubah peran.');
    const b=object(raw,['role','expectedRole','reason']);const role=enumeration(b.role,['user','admin']);const expected=enumeration(b.expectedRole,['user','admin']);const reason=text(b.reason,5,1000);
    if (id===actor.id) fail(409,'SELF_ROLE_CHANGE','Perubahan peran akun sendiri tidak diizinkan.');
    return this.store.mutate(actor,`admin/users/${id}/role`,key,{role,expected,reason},async tx=>{
      // Serialize all role changes, including simultaneous demotions of different admins.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('sap:admin-role-changes',0))`;
      const [current]=await tx<{role:string;email_verified_at:Date|null}[]>`SELECT role,email_verified_at FROM users WHERE id=${id} AND deleted_at IS NULL FOR UPDATE`;
      const [acting]=await tx<{id:string}[]>`SELECT id FROM users WHERE id=${actor.id} AND role='admin' AND deleted_at IS NULL FOR SHARE`;
      if(!acting)fail(403,'FORBIDDEN');if(!current)fail(404,'NOT_FOUND');if(current.role!==expected)fail(409,'REVISION_CONFLICT','Peran berubah. Muat ulang daftar pengguna.');
      if(role==='admin'&&!current.email_verified_at)fail(422,'EMAIL_NOT_VERIFIED','Pengguna harus memverifikasi email sebelum menjadi admin.');
      if(current.role==='admin'&&role==='user') {
        const [count]=await tx<{count:number}[]>`SELECT count(*)::int AS count FROM users WHERE role='admin' AND deleted_at IS NULL`;
        if((count?.count??0)<=1)fail(409,'LAST_ADMIN','Admin terakhir tidak boleh diubah menjadi pengguna.');
      }
      if(current.role!==role){await tx`UPDATE users SET role=${role},updated_at=now() WHERE id=${id}`;await tx`DELETE FROM sessions WHERE user_id=${id}`;}
      await this.store.audit(tx,actor.id,'user.role.changed','user',id,{before:current.role,after:role,reason});
      return {id,role};
    });
  }
  async reports(actor:Actor,query:Record<string,unknown>,mine=false) {
    if(!mine)requireAdmin(actor); object(query,['limit','cursor','status','assigneeId','overdue']);
    const status=query.status===undefined?null:enumeration(query.status,statuses);
    const assignee=mine?actor.id:query.assigneeId===undefined?null:uuid(query.assigneeId);
    if(mine&&query.assigneeId!==undefined&&query.assigneeId!==actor.id)fail(403,'FORBIDDEN');
    const overdue=query.overdue===undefined?false:enumeration(query.overdue,['true','false'])==='true';
    const page=this.store.cursor(query,{route:mine?'my-report-assignments':'report-operations',status,assignee,overdue});
    const rows=await this.store.db<ReportRow[]>`SELECT r.id,r.revision,r.status,r.description,r.category_id,r.h3_cell,r.created_at,r.updated_at,
      ST_Y(r.location::geometry) AS lat,ST_X(r.location::geometry) AS lon,a.assignee_id,u.display_name AS assignee_name,a.due_at,a.note,a.revision AS assignment_revision,a.progress,a.progress_note,
      COALESCE(a.due_at<now() AND a.progress<>'done' AND r.status NOT IN ('resolved','rejected','duplicate'),false) AS overdue
      FROM reports r LEFT JOIN report_assignments a ON a.report_id=r.id LEFT JOIN users u ON u.id=a.assignee_id AND u.deleted_at IS NULL
      WHERE (${status}::text IS NULL OR r.status=${status}) AND (${assignee}::uuid IS NULL OR a.assignee_id=${assignee})
      AND (NOT ${overdue} OR (a.due_at<now() AND a.progress<>'done' AND r.status NOT IN ('resolved','rejected','duplicate')))
      AND (${page.boundary?.at??null}::timestamptz IS NULL OR (r.created_at,r.id)<(${page.boundary?.at??null}::timestamptz,${page.boundary?.id??null}::uuid))
      ORDER BY r.created_at DESC,r.id DESC LIMIT ${page.limit+1}`;
    const selected=rows.slice(0,page.limit);
    return {items:selected.map(r=>({id:r.id,revision:r.revision,status:r.status,description:r.description,categoryId:r.category_id,lat:r.lat,lon:r.lon,cellId:r.h3_cell,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at),assignment:r.assignee_id?{assigneeId:r.assignee_id,assigneeName:r.assignee_name,dueAt:iso(r.due_at),note:r.note,revision:r.assignment_revision,progress:r.progress,progressNote:r.progress_note,overdue:r.overdue,completed:r.progress==='done'||['resolved','rejected','duplicate'].includes(r.status)}:null})),nextCursor:rows.length>page.limit?page.encode(selected[selected.length-1]!):null};
  }
  async assign(actor:Actor,id:string,expected:number,key:string,raw:unknown) {
    requireAdmin(actor);uuid(id);const b=object(raw,['assigneeId','dueAt','note']);const assignee=b.assigneeId===null?null:uuid(b.assigneeId);const due=b.dueAt===null?null:date(b.dueAt,true);const note=text(b.note,0,1000);
    if(assignee&&(!due||Date.parse(due)<=Date.now()))fail(422,'INVALID_DEADLINE','Tenggat penugasan harus di masa depan.');
    return this.store.mutate(actor,`admin/reports/${id}/assignment`,key,{expected,assignee,due,note},async tx=>{
      const [r]=await tx<{revision:number;status:string}[]>`SELECT revision,status FROM reports WHERE id=${id} FOR UPDATE`;
      if(!r)fail(404,'NOT_FOUND');checkRevision(r.revision,expected);
      if(assignee&&['resolved','rejected','duplicate'].includes(r.status))fail(409,'REPORT_CLOSED','Laporan sudah ditutup.');
      if(assignee){const [u]=await tx<{id:string}[]>`SELECT id FROM users WHERE id=${assignee} AND role='admin' AND deleted_at IS NULL AND email_verified_at IS NOT NULL FOR SHARE`;if(!u)fail(422,'ASSIGNEE_INVALID','Petugas harus admin aktif dengan email terverifikasi.');}
      const [before]=await tx<{assignee_id:string}[]>`SELECT assignee_id FROM report_assignments WHERE report_id=${id}`;
      if(assignee)await tx`INSERT INTO report_assignments(report_id,assignee_id,assigned_by,due_at,note) VALUES(${id},${assignee},${actor.id},${due},${note})
        ON CONFLICT(report_id) DO UPDATE SET assignee_id=EXCLUDED.assignee_id,assigned_by=EXCLUDED.assigned_by,due_at=EXCLUDED.due_at,note=EXCLUDED.note,
        progress=CASE WHEN report_assignments.assignee_id=EXCLUDED.assignee_id THEN report_assignments.progress ELSE 'assigned' END,
        progress_note=CASE WHEN report_assignments.assignee_id=EXCLUDED.assignee_id THEN report_assignments.progress_note ELSE '' END,revision=report_assignments.revision+1,updated_at=now()`;
      else await tx`DELETE FROM report_assignments WHERE report_id=${id}`;
      await tx`UPDATE reports SET revision=revision+1,updated_at=now() WHERE id=${id}`;
      await this.store.audit(tx,actor.id,'report.assignment.changed','report',id,{before:before?.assignee_id??null,assigneeId:assignee,dueAt:due,note});
      for(const recipient of new Set([assignee,before?.assignee_id].filter((v):v is string=>!!v)))await tx`INSERT INTO notifications(user_id,event_key,type,title,message,target_path)
        VALUES(${recipient},${`report-assignment:${id}:${expected+1}`},'incident_updated','Penugasan laporan diperbarui','Buka daftar tugas laporan untuk melihat penugasan dan tenggat terbaru.','/dashboard?view=assignments') ON CONFLICT DO NOTHING`;
      return {reportId:id,revision:expected+1,assigneeId:assignee,dueAt:due};
    });
  }
  async requestEvidence(actor:Actor,id:string,key:string,raw:unknown) {
    requireAdmin(actor);uuid(id);const b=object(raw,['message']);const message=text(b.message,5,1000);
    return this.store.mutate(actor,`admin/reports/${id}/evidence-requests`,key,{message},async tx=>{
      const [report]=await tx<{reporter_id:string|null;status:string;revision:number}[]>`SELECT reporter_id,status,revision FROM reports WHERE id=${id} FOR UPDATE`;
      if(!report)fail(404,'NOT_FOUND');if(report.status!=='submitted')fail(409,'REPORT_NOT_PENDING','Permintaan klarifikasi hanya tersedia saat laporan menunggu pemeriksaan.');
      if(!report.reporter_id)fail(409,'REPORTER_UNAVAILABLE','Pelapor tidak dapat dihubungi.');
      const [recipient]=await tx<{id:string}[]>`SELECT id FROM users WHERE id=${report.reporter_id} AND deleted_at IS NULL`;
      if(!recipient)fail(409,'REPORTER_UNAVAILABLE','Pelapor tidak dapat dihubungi.');
      const eventKey=`evidence-request:${actor.id}:${key}`;
      await tx`INSERT INTO notifications(user_id,event_key,type,title,message,target_path)
        VALUES(${recipient.id},${eventKey},'evidence_requested','Admin meminta klarifikasi',${message},'/dashboard?view=reports') ON CONFLICT(user_id,event_key,type) DO NOTHING`;
      await this.store.audit(tx,actor.id,'report.evidence_requested','report',id,{reportRevision:report.revision,messageLength:[...message].length});
      return {reportId:id,notified:true};
    });
  }
  async progress(actor:Actor,id:string,expected:number,key:string,raw:unknown) {
    requireVerified(actor);uuid(id);const b=object(raw,['progress','note']);const progress=enumeration(b.progress,['accepted','working','done']);const note=text(b.note,5,1000);
    return this.store.mutate(actor,`users/me/report-assignments/${id}/progress`,key,{expected,progress,note},async tx=>{
      const [r]=await tx<{status:string}[]>`SELECT status FROM reports WHERE id=${id} FOR UPDATE`;if(!r)fail(404,'NOT_FOUND');
      const [a]=await tx<{revision:number;progress:string}[]>`SELECT revision,progress FROM report_assignments WHERE report_id=${id} AND assignee_id=${actor.id} FOR UPDATE`;if(!a)fail(404,'NOT_FOUND');checkRevision(a.revision,expected);
      if(['resolved','rejected','duplicate'].includes(r.status))fail(409,'REPORT_CLOSED','Laporan sudah ditutup.');
      const order=['assigned','accepted','working','done'];if(order.indexOf(progress)<order.indexOf(a.progress))fail(409,'INVALID_TRANSITION','Progres tugas tidak boleh mundur.');
      await tx`UPDATE report_assignments SET progress=${progress},progress_note=${note},revision=revision+1,updated_at=now() WHERE report_id=${id}`;
      await this.store.audit(tx,actor.id,'report.assignment.progress','report',id,{progress,note});
      return {reportId:id,revision:expected+1,progress};
    });
  }
  async pendingMap(actor:Actor) {
    requireAdmin(actor);const rows=await this.store.db<{id:string;status:string;description:string|null;lat:number;lon:number;h3_cell:string;created_at:Date}[]>`SELECT id,status,left(description,250) AS description,ST_Y(location::geometry) AS lat,ST_X(location::geometry) AS lon,h3_cell,created_at FROM reports WHERE status='submitted' ORDER BY created_at DESC,id DESC LIMIT 2001`;
    return {items:rows.slice(0,2000).map(r=>({id:r.id,status:r.status,description:r.description,lat:r.lat,lon:r.lon,cellId:r.h3_cell,createdAt:iso(r.created_at)})),truncated:rows.length>2000};
  }
  async exportCsv(actor:Actor,query:Record<string,unknown>) {
    requireAdmin(actor);object(query,['status']);const status=query.status===undefined?null:enumeration(query.status,statuses);
    const rows=await this.store.db<Record<string,unknown>[]>`SELECT r.id,r.status,r.category_id,r.description,r.public_summary,r.created_at,r.updated_at,a.due_at,u.display_name AS assignee,a.progress FROM reports r LEFT JOIN report_assignments a ON a.report_id=r.id LEFT JOIN users u ON u.id=a.assignee_id AND u.deleted_at IS NULL WHERE (${status}::text IS NULL OR r.status=${status}) ORDER BY r.created_at DESC,r.id DESC LIMIT 10001`;
    if(rows.length>10000)fail(422,'EXPORT_TOO_LARGE','Ekspor maksimal 10.000 laporan. Pilih filter status yang lebih sempit.');
    const fields=['id','status','category_id','description','public_summary','created_at','updated_at','assignee','due_at','progress'];
    return '\uFEFF'+[fields.map(csvCell).join(','),...rows.map(r=>fields.map(f=>csvCell(r[f] instanceof Date?iso(r[f] as Date):r[f])).join(','))].join('\r\n');
  }
  async emailPreference(actor:Actor,value?:unknown) {
    if(value===undefined){const [r]=await this.store.db<{report_email_enabled:boolean}[]>`SELECT report_email_enabled FROM users WHERE id=${actor.id} AND deleted_at IS NULL`;if(!r)fail(404,'NOT_FOUND');return {emailEnabled:r.report_email_enabled};}
    requireVerified(actor);const b=object(value,['emailEnabled']);const enabled=bool(b.emailEnabled);
    const [r]=await this.store.db<{report_email_enabled:boolean}[]>`UPDATE users SET report_email_enabled=${enabled},updated_at=now() WHERE id=${actor.id} AND deleted_at IS NULL RETURNING report_email_enabled`;if(!r)fail(404,'NOT_FOUND');return {emailEnabled:r.report_email_enabled};
  }
  async localities(actor:Actor,query:Record<string,unknown>) {
    requireAdmin(actor);object(query,['search']);const search=query.search===undefined?'':text(query.search,0,100);
    const rows=await this.store.db<{h3_cell:string;kelurahan:string;kecamatan:string;city:string;updated_at:Date}[]>`SELECT h3_cell,kelurahan,kecamatan,city,updated_at FROM area_localities
      WHERE ${search}='' OR kelurahan ILIKE ${`%${search}%`} OR kecamatan ILIKE ${`%${search}%`} OR city ILIKE ${`%${search}%`}
      ORDER BY updated_at DESC LIMIT 100`;
    return {items:rows.map(r=>({cellId:r.h3_cell,kelurahan:r.kelurahan,kecamatan:r.kecamatan,city:r.city,label:`${r.kelurahan}, ${r.kecamatan}`,updatedAt:iso(r.updated_at)}))};
  }
  async locality(cellId:string) {
    if(!isReportCell(cellId))fail(400,'VALIDATION_ERROR','Sel area tidak valid.');
    return localityFor(this.store.db,cellId);
  }
  async publicLocalities(query:Record<string,unknown>) {
    object(query,['cells']);
    if(typeof query.cells!=='string')fail(400,'VALIDATION_ERROR');
    const cells=[...new Set(query.cells.split(','))];
    if(cells.length<1||cells.length>100||cells.some(cell=>!isReportCell(cell)))fail(400,'VALIDATION_ERROR','Pilih 1 sampai 100 sel area yang valid.');
    const rows=await this.store.db<{h3_cell:string;kelurahan:string;kecamatan:string;city:string}[]>`SELECT h3_cell,kelurahan,kecamatan,city FROM area_localities WHERE h3_cell=ANY(${cells}::text[])`;
    return {items:rows.map(r=>({cellId:r.h3_cell,kelurahan:r.kelurahan,kecamatan:r.kecamatan,city:r.city,label:`${r.kelurahan}, ${r.kecamatan}`}))};
  }
  async saveLocality(actor:Actor,cellId:string,key:string,raw:unknown) {
    requireAdmin(actor);if(!isReportCell(cellId))fail(400,'VALIDATION_ERROR','Sel area tidak valid.');
    const b=object(raw,['kelurahan','kecamatan','city']);const kelurahan=text(b.kelurahan,2,100);const kecamatan=text(b.kecamatan,2,100);const city=text(b.city,0,100);
    return this.store.mutate(actor,`admin/areas/${cellId}/locality`,key,{kelurahan,kecamatan,city},async tx=>{
      await tx`INSERT INTO area_localities(h3_cell,kelurahan,kecamatan,city,updated_by) VALUES(${cellId},${kelurahan},${kecamatan},${city},${actor.id})
        ON CONFLICT(h3_cell) DO UPDATE SET kelurahan=EXCLUDED.kelurahan,kecamatan=EXCLUDED.kecamatan,city=EXCLUDED.city,updated_by=EXCLUDED.updated_by,updated_at=now()`;
      await this.store.audit(tx,actor.id,'area.locality.changed','area',cellId,{kelurahan,kecamatan,city});
      return localityFor(tx,cellId);
    });
  }
}
