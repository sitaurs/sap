"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Download, Loader2, MapPin, Pencil, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { ApiError, apiGet, apiMutate, reauthenticate, type SapReportStatus } from "../../lib/api/client";
import { useI18n } from "../../lib/i18n/provider";
import { MALANG_CENTER, MALANG_DEFAULT_ZOOM } from "../../lib/malang";
import { STATUS_LABEL } from "../moderation/report-status";
import styles from "./operations.module.css";

type Notify = (message: string) => void;
type AdminUser = { id: string; displayName: string; email: string; role: "user" | "admin"; emailVerified: boolean; createdAt: string };
type Assignment = { assigneeId: string | null; assigneeName: string | null; dueAt: string | null; note: string; revision: number; progress?: "assigned" | "accepted" | "working" | "done"; progressNote?: string; overdue: boolean; completed: boolean };
type PendingReport = { id: string; status: SapReportStatus; description: string; lat: number | null; lon: number | null; createdAt: string; cellId?: string | null };
type OperationReport = PendingReport & { revision: number; categoryId: string | null; updatedAt: string; assignment: Assignment | null };
type Locality = { cellId: string; kelurahan: string; kecamatan: string; city: string };
type Page<T> = { items: T[]; nextCursor: string | null };
const statuses = Object.keys(STATUS_LABEL) as SapReportStatus[];
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : "Permintaan belum berhasil. Coba lagi.";
const conflict = (cause: unknown) => cause instanceof ApiError && (cause.status === 409 || cause.status === 412);

function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value.trim()), 300); return () => window.clearTimeout(timer); }, [value]);
  return debounced;
}

function usePage<T extends { id: string }>(path: string) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (next?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    if (!next) { setItems([]); setCursor(null); }
    try {
      const page = await apiGet<Page<T>>(`${path}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]));
      if (controller.signal.aborted) return;
      setItems(previous => next ? [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()] : page.items);
      setCursor(page.nextCursor);
    } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [path]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  return { items, cursor, loading, error, reload: () => load(), more: () => cursor ? load(cursor) : Promise.resolve() };
}

function DateLabel({ value }: { value: string | null }) {
  const { t, intlLocale } = useI18n();
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? <time dateTime={value!}>{new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(date)}</time> : <>{t("Belum ditentukan")}</>;
}

function Pager({ count, cursor, loading, more }: { count: number; cursor: string | null; loading: boolean; more: () => void }) {
  const { t } = useI18n();
  return <div className={styles.pager}><span className={styles.muted}>{t("{0} ditampilkan", { "0": count })}</span>{cursor && <button type="button" className={styles.button} onClick={more} disabled={loading}>{loading && <Loader2 size={16} className={styles.spin} />}{t("Muat lagi")}</button>}</div>;
}

function Dialog({ title, busy, onClose, children, footer }: { title: string; busy: boolean; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const { t } = useI18n();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className={styles.dialogLayout}><header className={styles.dialogHeader}><h2 id={titleId}>{title}</h2><button type="button" className={styles.icon} aria-label={t("Tutup")} title={t("Tutup")} disabled={busy} onClick={onClose}><X size={20} /></button></header><div className={styles.dialogBody}>{children}</div><footer className={styles.dialogFooter}>{footer}</footer></div>
  </dialog>;
}

function UserPicker({ value, name, label, onChange, disabled = false, filter = false }: { value: string; name?: string | null; label: string; onChange: (id: string, name: string) => void; disabled?: boolean; filter?: boolean }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const query = useDebounced(search);
  const page = usePage<AdminUser>(`/admin/users?${new URLSearchParams({ limit: "50", ...(query ? { search: query } : {}) })}`);
  const eligible = page.items.filter(user => user.role === "admin" && user.emailVerified);
  return <div className={styles.picker}>
    <label className={styles.field}><span>{t("Cari pengguna")}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} disabled={disabled} placeholder={t("Nama atau email")} /></label>
    <label className={styles.field}><span>{label}</span><select value={value} disabled={disabled} onChange={event => { const user = eligible.find(item => item.id === event.target.value); onChange(event.target.value, event.target.value ? user?.displayName || name || "" : ""); }}>
      <option value="">{t(filter ? "Semua penanggung jawab" : "Belum ditugaskan")}</option>
      {value && !eligible.some(item => item.id === value) && <option value={value}>{name || value}</option>}
      {eligible.map(user => <option key={user.id} value={user.id}>{t("{0} ({1})", { "0": user.displayName, "1": user.email })}</option>)}
    </select></label>
    <span className={styles.muted}>{t("Petugas adalah admin SAP dengan email terverifikasi.")}</span>
    {page.loading && <span className={styles.muted} role="status">{t("Memuat pengguna...")}</span>}
    {page.error && <div className={styles.error} role="alert">{t(page.error)} <button type="button" className={styles.button} onClick={() => void page.reload()} disabled={disabled || page.loading}>{t("Coba lagi")}</button></div>}
    {!page.loading && !page.error && !eligible.length && <span className={styles.muted}>{t("Tidak ada admin terverifikasi pada halaman yang dimuat.")}</span>}
    <Pager count={eligible.length} cursor={page.cursor} loading={page.loading || disabled} more={() => void page.more()} />
  </div>;
}

export default function AdminOperations({ view, notify }: { view: "users" | "reports" | "map"; notify?: Notify }) {
  if (view === "users") return <Users key={view} notify={notify} />;
  if (view === "map") return <PendingMap key={view} notify={notify} />;
  return <Reports key={view} notify={notify} />;
}

export function MyReportAssignments() {
  const { t } = useI18n();
  const page = usePage<OperationReport>("/users/me/report-assignments?limit=50");
  const [active, setActive] = useState<OperationReport | null>(null);
  const [message, setMessage] = useState("");
  return <section className={styles.page} aria-label={t("Tugas laporan saya")}>
    <header className={styles.header}><h2>{t("Tugas laporan saya")}</h2><button type="button" className={styles.icon} title={t("Muat ulang")} aria-label={t("Muat ulang")} disabled={page.loading} onClick={() => void page.reload()}><RefreshCw size={18} /></button></header>
    {message && <p className={styles.success} role="status">{t(message)}</p>}
    {page.error && <p className={styles.error} role="alert">{t(page.error)}</p>}
    <div className={styles.tableScroll} aria-busy={page.loading}><table className={styles.table}><thead><tr><th scope="col">{t("Laporan")}</th><th scope="col">{t("Status laporan")}</th><th scope="col">{t("Tenggat")}</th><th scope="col">{t("Progres tugas")}</th><th scope="col">{t("Tindakan")}</th></tr></thead><tbody>{page.items.map(report => <tr key={report.id}><td><strong>{report.description || t("Laporan")}</strong><small><DateLabel value={report.createdAt} /></small></td><td>{t(STATUS_LABEL[report.status])}</td><td><DateLabel value={report.assignment?.dueAt || null} />{report.assignment?.overdue && <small><span className={`${styles.badge} ${styles.overdue}`}>{t("Lewat tenggat")}</span></small>}</td><td><span className={`${styles.badge} ${report.assignment?.completed ? styles.complete : ""}`}>{t(report.assignment?.progress || "Belum tersedia")}</span>{report.assignment?.progressNote && <small>{report.assignment.progressNote}</small>}</td><td>{report.assignment && !report.assignment.completed && <button type="button" className={styles.button} onClick={() => setActive(report)}><Pencil size={16} />{t("Perbarui progres")}</button>}</td></tr>)}</tbody></table></div>
    {page.loading && <div className={styles.empty} role="status"><Loader2 size={20} className={styles.spin} />{t("Memuat laporan...")}</div>}
    {!page.loading && !page.error && !page.items.length && <div className={styles.empty}>{t("Belum ada tugas laporan.")}</div>}
    <Pager count={page.items.length} cursor={page.cursor} loading={page.loading} more={() => void page.more()} />
    {active?.assignment && <ProgressDialog report={active} assignment={active.assignment} onClose={() => setActive(null)} onSaved={() => { setActive(null); setMessage("Progres tugas diperbarui."); void page.reload(); }} onRefresh={() => { setActive(null); void page.reload(); }} />}
  </section>;
}

function ProgressDialog({ report, assignment, onClose, onSaved, onRefresh }: { report: OperationReport; assignment: Assignment; onClose: () => void; onSaved: () => void; onRefresh: () => void }) {
  const { t } = useI18n();
  const progressValues = ["accepted", "working", "done"] as const;
  const rank: Record<string, number> = { assigned: 0, accepted: 1, working: 2, done: 3 };
  const current = assignment.progress || "assigned";
  const [progress, setProgress] = useState<typeof progressValues[number]>(current === "assigned" ? "accepted" : current as typeof progressValues[number]);
  const [note, setNote] = useState(assignment.progressNote || "");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const lock = useRef(false);
  const dirty = (progress !== current || note.trim() !== (assignment.progressNote || "")) && note.trim().length >= 5;
  async function save() {
    if (lock.current || !review || !dirty || stale) return;
    lock.current = true; setBusy(true); setError("");
    const body = { progress, note: note.trim() };
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await apiMutate("PUT", `/users/me/report-assignments/${encodeURIComponent(report.id)}/progress`, { body, headers: { "if-match": String(assignment.revision), "idempotency-key": attempt.current.key }, signal: AbortSignal.timeout(30_000) });
      onSaved();
    } catch (cause) { setStale(conflict(cause)); setError(conflict(cause) ? "Progres tugas telah berubah. Muat ulang sebelum mencoba lagi." : errorMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog title={t(review ? "Konfirmasi progres tugas" : "Perbarui progres tugas")} busy={busy} onClose={onClose} footer={<><button type="button" className={styles.button} disabled={busy} onClick={onClose}>{t("Batal")}</button>{stale ? <button type="button" className={styles.primary} onClick={onRefresh}>{t("Muat ulang laporan")}</button> : review ? <><button type="button" className={styles.button} disabled={busy} onClick={() => setReview(false)}>{t("Kembali")}</button><button type="button" className={styles.primary} disabled={busy} onClick={() => void save()}>{busy ? <Loader2 size={17} className={styles.spin} /> : <Check size={17} />}{t("Konfirmasi progres")}</button></> : <button type="button" className={styles.primary} disabled={!dirty} onClick={() => { setError(""); setReview(true); }}>{t("Tinjau progres")}</button>}</>}>
    <p className={styles.description}>{report.description || t("Laporan")}</p>
    {review ? <dl className={styles.summary}><dt>{t("Progres tugas")}</dt><dd>{t(progress)}</dd><dt>{t("Catatan progres")}</dt><dd>{note.trim()}</dd></dl> : <>
      <label className={styles.field}><span>{t("Progres tugas")}</span><select value={progress} disabled={busy || stale} onChange={event => setProgress(event.target.value as typeof progressValues[number])}>{progressValues.filter(value => rank[value] >= rank[current]).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label className={styles.field}><span>{t("Catatan progres")}</span><textarea minLength={5} maxLength={1000} value={note} disabled={busy || stale} onChange={event => setNote(event.target.value)} /></label>
    </>}
    {note.trim().length < 5 && !review && <p className={styles.muted}>{t("Catatan progres harus berisi sedikitnya 5 karakter.")}</p>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
  </Dialog>;
}

function Users({ notify }: { notify?: Notify }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const query = useDebounced(search);
  const page = usePage<AdminUser>(`/admin/users?${new URLSearchParams({ limit: "50", ...(query ? { search: query } : {}) })}`);
  const [active, setActive] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState("");
  return <section className={styles.page} aria-label={t("Pengguna dan peran")}>
    <header className={styles.header}><h2>{t("Pengguna dan peran")}</h2><button type="button" className={styles.icon} title={t("Muat ulang")} aria-label={t("Muat ulang")} disabled={page.loading} onClick={() => void page.reload()}><RefreshCw size={18} /></button></header>
    <div className={styles.toolbar}><label className={`${styles.field} ${styles.search}`}><span>{t("Cari pengguna")}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Nama atau email")} /></label></div>
    {message && <p className={styles.success} role="status">{t(message)}</p>}
    {page.error && <p className={styles.error} role="alert">{t(page.error)}</p>}
    <div className={styles.tableScroll} aria-busy={page.loading}><table className={styles.table}><thead><tr><th scope="col">{t("Pengguna")}</th><th scope="col">{t("Peran")}</th><th scope="col">{t("Email")}</th><th scope="col">{t("Terdaftar")}</th><th scope="col">{t("Tindakan")}</th></tr></thead><tbody>{page.items.map(user => <tr key={user.id}><td><strong>{user.displayName}</strong><small>{user.email}</small></td><td><span className={styles.badge}>{t(user.role === "admin" ? "Admin" : "Pengguna")}</span></td><td>{t(user.emailVerified ? "Terverifikasi" : "Belum terverifikasi")}</td><td><DateLabel value={user.createdAt} /></td><td><button type="button" className={styles.button} onClick={() => setActive(user)}><ShieldCheck size={16} />{t("Ubah peran")}</button></td></tr>)}</tbody></table></div>
    {page.loading && <div className={styles.empty} role="status"><Loader2 size={20} className={styles.spin} />{t("Memuat pengguna...")}</div>}
    {!page.loading && !page.error && !page.items.length && <div className={styles.empty}>{t("Tidak ada pengguna ditemukan.")}</div>}
    <Pager count={page.items.length} cursor={page.cursor} loading={page.loading} more={() => void page.more()} />
    {active && <RoleDialog user={active} onClose={() => setActive(null)} onSaved={() => { setActive(null); setMessage("Peran pengguna diperbarui."); notify?.(t("Peran pengguna diperbarui.")); void page.reload(); }} onRefresh={() => { setActive(null); void page.reload(); }} />}
  </section>;
}

function RoleDialog({ user, onClose, onSaved, onRefresh }: { user: AdminUser; onClose: () => void; onSaved: () => void; onRefresh: () => void }) {
  const { t } = useI18n();
  const [role, setRole] = useState<AdminUser["role"]>(user.role === "admin" ? "user" : "admin");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const lock = useRef(false);
  async function save() {
    if (lock.current || !confirmed || role === user.role || reason.trim().length < 5 || !password || stale) return;
    lock.current = true; setBusy(true); setError("");
    const body = { role, reason: reason.trim(), expectedRole: user.role };
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await reauthenticate(password); setPassword("");
      await apiMutate("PUT", `/admin/users/${encodeURIComponent(user.id)}/role`, { body, headers: { "idempotency-key": attempt.current.key }, signal: AbortSignal.timeout(30_000) });
      onSaved();
    } catch (cause) { setPassword(""); setStale(conflict(cause)); setError(conflict(cause) ? "Peran telah berubah. Muat ulang pengguna sebelum mencoba lagi." : errorMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog title={t("Konfirmasi perubahan peran")} busy={busy} onClose={onClose} footer={<><button type="button" className={styles.button} onClick={onClose} disabled={busy}>{t("Batal")}</button>{stale ? <button type="button" className={styles.primary} onClick={onRefresh}>{t("Muat ulang pengguna")}</button> : <button type="button" className={styles.primary} onClick={() => void save()} disabled={busy || !confirmed || !password || reason.trim().length < 5 || role === user.role}>{busy ? <Loader2 size={17} className={styles.spin} /> : <ShieldCheck size={17} />}{t("Konfirmasi perubahan peran")}</button>}</>}>
    <div><strong>{user.displayName}</strong><p className={styles.muted}>{user.email}</p></div>
    <dl className={styles.summary}><dt>{t("Peran saat ini")}</dt><dd>{t(user.role === "admin" ? "Admin" : "Pengguna")}</dd></dl>
    <label className={styles.field}><span>{t("Peran baru")}</span><select value={role} disabled={busy || stale} onChange={event => { setRole(event.target.value as AdminUser["role"]); setConfirmed(false); }}><option value="user">{t("Pengguna")}</option><option value="admin" disabled={!user.emailVerified && role !== "admin"}>{t("Admin")}</option></select></label>
    {!user.emailVerified && role !== "admin" && <p className={styles.notice}>{t("Email harus terverifikasi sebelum pengguna dapat menjadi admin.")}</p>}
    <label className={styles.field}><span>{t("Alasan perubahan peran")}</span><textarea value={reason} minLength={5} maxLength={1000} disabled={busy || stale} onChange={event => { setReason(event.target.value); setConfirmed(false); }} /></label>
    <label className={styles.field}><span>{t("Kata sandi Anda")}</span><input type="password" autoComplete="current-password" value={password} disabled={busy || stale} onChange={event => setPassword(event.target.value)} /></label>
    <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={busy || stale} onChange={event => setConfirmed(event.target.checked)} />{t("Saya mengonfirmasi perubahan peran pengguna ini.")}</label>
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
  </Dialog>;
}

function Reports({ notify }: { notify?: Notify }) {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [overdue, setOverdue] = useState(false);
  const params = new URLSearchParams({ limit: "50", ...(status ? { status } : {}), ...(assigneeId ? { assigneeId } : {}), ...(overdue ? { overdue: "true" } : {}) });
  const page = usePage<OperationReport>(`/admin/report-operations?${params}`);
  const [active, setActive] = useState<OperationReport | null>(null);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportLock = useRef(false);
  async function exportCsv() {
    if (exportLock.current) return;
    exportLock.current = true; setExporting(true); setExportError("");
    try {
      const query = status ? `?${new URLSearchParams({ status })}` : "";
      const response = await fetch(`/api/v1/admin/reports/export.csv${query}`, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error("Ekspor laporan belum berhasil. Coba lagi.");
      if (!/\b(?:text\/csv|application\/(?:csv|octet-stream))\b/i.test(response.headers.get("content-type") || "")) throw new Error("Respons ekspor bukan berkas CSV.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Ekspor CSV siap diunduh."); notify?.(t("Ekspor CSV siap diunduh."));
    } catch (cause) { setExportError(errorMessage(cause)); }
    finally { exportLock.current = false; setExporting(false); }
  }
  return <section className={styles.page} aria-label={t("Penugasan dan SLA")}>
    <header className={styles.header}><h2>{t("Penugasan dan SLA")}</h2><div className={styles.actions}><button type="button" className={styles.button} disabled={exporting} onClick={() => void exportCsv()}>{exporting ? <Loader2 size={17} className={styles.spin} /> : <Download size={17} />}{t("Ekspor CSV")}</button><button type="button" className={styles.icon} title={t("Muat ulang")} aria-label={t("Muat ulang")} disabled={page.loading} onClick={() => void page.reload()}><RefreshCw size={18} /></button></div></header>
    <div className={styles.toolbar}>
      <label className={`${styles.field} ${styles.filter}`}><span>{t("Status laporan")}</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">{t("Semua status")}</option>{statuses.map(item => <option key={item} value={item}>{t(STATUS_LABEL[item])}</option>)}</select></label>
      <div className={styles.filter}><UserPicker value={assigneeId} name={assigneeName} label={t("Filter penanggung jawab")} filter onChange={(id, name) => { setAssigneeId(id); setAssigneeName(name); }} /></div>
      <label className={styles.check}><input type="checkbox" checked={overdue} onChange={event => setOverdue(event.target.checked)} />{t("Lewat tenggat saja")}</label>
    </div>
    <p className={styles.muted}>{t("Ekspor CSV mengikuti filter status laporan.")}</p>
    {message && <p className={styles.success} role="status">{t(message)}</p>}
    {(page.error || exportError) && <p className={styles.error} role="alert">{t(page.error || exportError)}</p>}
    <div className={styles.tableScroll} aria-busy={page.loading}><table className={styles.table}><thead><tr><th scope="col">{t("Laporan")}</th><th scope="col">{t("Status")}</th><th scope="col">{t("Penanggung jawab")}</th><th scope="col">{t("Tenggat")}</th><th scope="col">{t("Tindakan")}</th></tr></thead><tbody>{page.items.map(report => <tr key={report.id}><td><strong>{report.description || t("Laporan")}</strong><small><DateLabel value={report.createdAt} /></small>{report.assignment?.note && <small>{report.assignment.note}</small>}</td><td><span className={styles.badge}>{t(STATUS_LABEL[report.status])}</span></td><td>{report.assignment?.assigneeName || report.assignment?.assigneeId || t("Belum ditugaskan")}</td><td><DateLabel value={report.assignment?.dueAt || null} /><small>{report.assignment?.completed ? <span className={`${styles.badge} ${styles.complete}`}>{t("Selesai")}</span> : report.assignment?.overdue ? <span className={`${styles.badge} ${styles.overdue}`}>{t("Lewat tenggat")}</span> : null}</small></td><td><button type="button" className={styles.button} onClick={() => setActive(report)}><Pencil size={16} />{t("Ubah penugasan")}</button></td></tr>)}</tbody></table></div>
    {page.loading && <div className={styles.empty} role="status"><Loader2 size={20} className={styles.spin} />{t("Memuat laporan...")}</div>}
    {!page.loading && !page.error && !page.items.length && <div className={styles.empty}>{t("Tidak ada laporan sesuai filter.")}</div>}
    <Pager count={page.items.length} cursor={page.cursor} loading={page.loading} more={() => void page.more()} />
    {active && <AssignmentDialog report={active} onClose={() => setActive(null)} onRefresh={() => { setActive(null); void page.reload(); }} onSaved={() => { setActive(null); setMessage("Penugasan laporan diperbarui."); notify?.(t("Penugasan laporan diperbarui.")); void page.reload(); }} />}
  </section>;
}

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function AssignmentDialog({ report, onClose, onSaved, onRefresh }: { report: OperationReport; onClose: () => void; onSaved: () => void; onRefresh: () => void }) {
  const { t } = useI18n();
  const [assigneeId, setAssigneeId] = useState(report.assignment?.assigneeId || "");
  const [name, setName] = useState(report.assignment?.assigneeName || "");
  const initialDue = localDate(report.assignment?.dueAt || null);
  const [due, setDue] = useState(initialDue);
  const [note, setNote] = useState(report.assignment?.note || "");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const lock = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const invalidDate = !!due && !Number.isFinite(new Date(due).getTime());
  const dueAt = !assigneeId ? null : due === initialDue ? report.assignment?.dueAt || null : due && !invalidDate ? new Date(due).toISOString() : null;
  const invalidDeadline = !!assigneeId && (!dueAt || !Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now());
  const dirty = assigneeId !== (report.assignment?.assigneeId || "") || due !== initialDue || note.trim() !== (report.assignment?.note || "");
  async function save() {
    if (lock.current || !review || !dirty || invalidDate || invalidDeadline || stale) return;
    lock.current = true; setBusy(true); setError("");
    const body = { assigneeId: assigneeId || null, dueAt, note: note.trim() };
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await apiMutate<Assignment>("PUT", `/admin/reports/${encodeURIComponent(report.id)}/assignment`, { body, headers: { "if-match": String(report.revision), "idempotency-key": attempt.current.key }, signal: AbortSignal.timeout(30_000) });
      onSaved();
    } catch (cause) { setStale(conflict(cause)); setError(conflict(cause) ? "Laporan telah berubah. Muat ulang laporan sebelum mencoba lagi." : errorMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog title={t(review ? "Konfirmasi penugasan" : "Ubah penugasan")} busy={busy} onClose={onClose} footer={<><button type="button" className={styles.button} onClick={onClose} disabled={busy}>{t("Batal")}</button>{stale ? <button type="button" className={styles.primary} onClick={onRefresh}>{t("Muat ulang laporan")}</button> : review ? <><button type="button" className={styles.button} disabled={busy} onClick={() => setReview(false)}>{t("Kembali")}</button><button type="button" className={styles.primary} disabled={busy || invalidDate || invalidDeadline} onClick={() => void save()}>{busy ? <Loader2 size={17} className={styles.spin} /> : <Check size={17} />}{t("Konfirmasi penugasan")}</button></> : <button type="button" className={styles.primary} disabled={!dirty || invalidDate || invalidDeadline || note.length > 1000} onClick={() => { setError(""); setReview(true); }}>{t("Tinjau penugasan")}</button>}</>}>
    <p className={styles.description}>{report.description || t("Laporan")}</p>
    {review ? <dl className={styles.summary}><dt>{t("Penanggung jawab")}</dt><dd>{name || assigneeId || t("Belum ditugaskan")}</dd><dt>{t("Tenggat")}</dt><dd><DateLabel value={dueAt} /></dd><dt>{t("Catatan")}</dt><dd>{note.trim() || t("Tidak ada catatan")}</dd></dl> : <>
      <UserPicker value={assigneeId} name={name} label={t("Penanggung jawab")} onChange={(id, label) => { setAssigneeId(id); setName(label); }} disabled={busy || stale} />
      <label className={styles.field}><span>{t("Tenggat")}</span><input type="datetime-local" value={due} disabled={busy || stale} onChange={event => setDue(event.target.value)} /></label>
      <label className={styles.field}><span>{t("Catatan penugasan")}</span><textarea value={note} maxLength={1000} disabled={busy || stale} onChange={event => setNote(event.target.value)} /></label>
    </>}
    {invalidDate && <p className={styles.error} role="alert">{t("Tenggat tidak valid.")}</p>}
    {invalidDeadline && !invalidDate && <p className={styles.error} role="alert">{t("Tenggat untuk penugasan harus berada di masa depan.")}</p>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
  </Dialog>;
}

function PendingMap({ notify }: { notify?: Notify }) {
  const { t } = useI18n();
  const [data, setData] = useState<{ items: PendingReport[]; truncated: boolean } | null>(null);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [localityError, setLocalityError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(50);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
    setLoading(true); setError(""); setLocalityError("");
    void apiGet<{ items: PendingReport[]; truncated: boolean }>("/admin/reports/pending-map", signal).then(value => { if (!controller.signal.aborted) { setData(value); setVisible(50); } }).catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void apiGet<Locality[] | { items: Locality[] }>("/admin/area-localities", signal).then(value => { if (!controller.signal.aborted) setLocalities(Array.isArray(value) ? value : value.items); }).catch(cause => { if (!controller.signal.aborted) setLocalityError(errorMessage(cause)); });
    return () => controller.abort();
  }, [reload]);
  const localityByCell = useMemo(() => new Map(localities.map(item => [item.cellId, item])), [localities]);
  const areaLabel = useCallback((report: PendingReport) => {
    const locality = report.cellId ? localityByCell.get(report.cellId) : null;
    return locality ? [locality.kelurahan, locality.kecamatan, locality.city].filter(Boolean).join(", ") || t("Area laporan") : t("Area laporan");
  }, [localityByCell, t]);
  const selected = data?.items.find(report => report.id === selectedId) || null;
  return <section className={styles.page} aria-label={t("Peta laporan tertunda")}>
    <header className={styles.header}><div><h2>{t("Peta laporan tertunda")}</h2><p>{t("{0} laporan", { "0": data?.items.length || 0 })}</p></div><button type="button" className={styles.icon} aria-label={t("Muat ulang")} title={t("Muat ulang")} disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={18} /></button></header>
    {message && <p className={styles.success} role="status">{t(message)}</p>}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    {localityError && <p className={styles.notice} role="alert">{t("Nama wilayah belum dapat dimuat.")} {t(localityError)}</p>}
    {data?.truncated && <p className={styles.notice} role="status">{t("Peta menampilkan maksimal 2.000 laporan. Masih ada laporan tertunda lainnya.")}</p>}
    <div className={styles.mapLayout}>
      <ReportMap reports={data?.items || []} selected={selected} onSelect={setSelectedId} areaLabel={areaLabel} loading={loading} />
      <aside className={styles.inspector} aria-label={t("Detail area laporan")}>
        {selected ? <><h3>{areaLabel(selected)}</h3><span className={styles.badge}>{t(STATUS_LABEL[selected.status])}</span><p className={styles.description}>{selected.description || t("Laporan")}</p><span className={styles.muted}><DateLabel value={selected.createdAt} /></span><a className={styles.button} href={`/dashboard?view=admin-moderation&reviewReport=${encodeURIComponent(selected.id)}`}><Pencil size={16} />{t("Tinjau laporan")}</a>
          {selected.cellId ? <LocalityEditor key={`${selected.cellId}-${reload}`} cellId={selected.cellId} onLoaded={value => setLocalities(previous => [...previous.filter(item => item.cellId !== value.cellId), value])} onSaved={value => { setLocalities(previous => [...previous.filter(item => item.cellId !== value.cellId), value]); setMessage("Nama wilayah diperbarui."); notify?.(t("Nama wilayah diperbarui.")); }} /> : <p className={styles.muted}>{t("Identitas area belum tersedia untuk laporan ini.")}</p>}
        </> : <h3>{t("Laporan tertunda")}</h3>}
        <ul className={styles.reportList}>{data?.items.slice(0, visible).map(report => <li key={report.id}><button type="button" className={styles.reportChoice} aria-pressed={selectedId === report.id} onClick={() => setSelectedId(report.id)}><strong>{areaLabel(report)}</strong><span>{report.description || t("Laporan")}</span><small className={styles.muted}>{t(STATUS_LABEL[report.status])}</small></button></li>)}</ul>
        {data && visible < data.items.length && <button type="button" className={styles.button} onClick={() => setVisible(value => value + 50)}>{t("Muat lagi")}</button>}
        {!loading && !error && !data?.items.length && <p className={styles.muted}>{t("Tidak ada laporan tertunda.")}</p>}
      </aside>
    </div>
  </section>;
}

function LocalityEditor({ cellId, onLoaded, onSaved }: { cellId: string; onLoaded: (value: Locality) => void; onSaved: (value: Locality) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ kelurahan: "", kecamatan: "", city: "" });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const original = useRef<{ kelurahan: string; kecamatan: string; city: string } | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setLoadError("");
    void apiGet<Locality>(`/areas/${encodeURIComponent(cellId)}/locality`, AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]))
      .then(value => {
        if (controller.signal.aborted) return;
        if (value.cellId !== cellId) throw new Error("Nama wilayah yang diterima tidak sesuai dengan area yang dipilih.");
        const stored = { kelurahan: value.kelurahan, kecamatan: value.kecamatan, city: value.city };
        original.current = stored; setDraft(stored);
        setLoaded(true); onLoadedRef.current(value);
      })
      .catch(cause => { if (!controller.signal.aborted) setLoadError(errorMessage(cause)); });
    return () => controller.abort();
  }, [cellId, loadAttempt]);
  const body = { kelurahan: draft.kelurahan.trim(), kecamatan: draft.kecamatan.trim(), city: draft.city.trim() };
  const dirty = loaded && !!original.current && (body.kelurahan !== original.current.kelurahan || body.kecamatan !== original.current.kecamatan || body.city !== original.current.city);
  async function save() {
    if (lock.current || !loaded || !dirty || !body.kelurahan || !body.kecamatan || body.kelurahan.length < 2 || body.kecamatan.length < 2 || Object.values(body).some(value => value.length > 100)) return;
    lock.current = true; setBusy(true); setError("");
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await apiMutate<Locality>("PUT", `/admin/areas/${encodeURIComponent(cellId)}/locality`, { body, headers: { "idempotency-key": attempt.current.key }, signal: AbortSignal.timeout(30_000) });
      const saved = { ...result, ...body, cellId };
      original.current = body; setDraft(body); onSaved(saved);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form className={styles.locality} onSubmit={event => { event.preventDefault(); void save(); }}>
    <h3>{t("Nama wilayah")}</h3>
    {!loaded && !loadError && <span className={styles.muted} role="status">{t("Memuat nama area...")}</span>}
    {loadError && <div className={styles.error} role="alert">{t(loadError)} <button type="button" className={styles.button} disabled={busy} onClick={() => setLoadAttempt(value => value + 1)}>{t("Coba lagi")}</button></div>}
    {loaded && ([ ["kelurahan", "Kelurahan"], ["kecamatan", "Kecamatan"], ["city", "Kota"] ] as const).map(([key, label]) => <label key={key} className={styles.field}><span>{t(label)}</span><input value={draft[key]} minLength={key === "city" ? 0 : 2} maxLength={100} required={key !== "city"} disabled={busy} onChange={event => { setDraft(previous => ({ ...previous, [key]: event.target.value })); setError(""); }} /></label>)}
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    <button type="submit" className={styles.primary} disabled={busy || !loaded || !dirty || !body.kelurahan || !body.kecamatan || body.kelurahan.length < 2 || body.kecamatan.length < 2 || Object.values(body).some(value => value.length > 100)}>{busy ? <Loader2 size={17} className={styles.spin} /> : <Check size={17} />}{t("Simpan nama wilayah")}</button>
  </form>;
}

function ReportMap({ reports, selected, onSelect, areaLabel, loading }: { reports: PendingReport[]; selected: PendingReport | null; onSelect: (id: string) => void; areaLabel: (report: PendingReport) => string; loading: boolean }) {
  const { t } = useI18n();
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const group = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);
  const [ready, setReady] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let current: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;
    void import("leaflet").then(L => {
      if (disposed || !node.current) return;
      current = L.map(node.current, { scrollWheelZoom: false, zoomControl: false }).setView([MALANG_CENTER.latitude, MALANG_CENTER.longitude], MALANG_DEFAULT_ZOOM);
      map.current = current; group.current = L.layerGroup().addTo(current);
      L.control.zoom({ zoomInTitle: t("Perbesar"), zoomOutTitle: t("Perkecil") }).addTo(current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(current);
      observer = new ResizeObserver(() => current?.invalidateSize()); observer.observe(node.current);
      setReady(value => value + 1);
    }).catch(() => { if (!disposed) setError("Peta belum dapat dimuat."); });
    return () => { disposed = true; observer?.disconnect(); current?.remove(); map.current = null; group.current = null; fitted.current = false; };
  }, [t]);
  useEffect(() => {
    let disposed = false;
    const current = map.current; const overlay = group.current;
    if (!current || !overlay) return;
    void import("leaflet").then(L => {
      if (disposed || map.current !== current) return;
      overlay.clearLayers();
      const points: [number, number][] = [];
      for (const report of reports) {
        if (!validCoordinates(report)) continue;
        const point: [number, number] = [report.lat!, report.lon!]; points.push(point);
        const marker = L.circleMarker(point, { radius: selected?.id === report.id ? 10 : 7, color: "#9b4f0a", fillColor: "#edab32", fillOpacity: .85, weight: 2 }).addTo(overlay);
        const popup = document.createElement("div");
        const heading = document.createElement("strong"); heading.textContent = areaLabel(report);
        const description = document.createElement("p"); description.textContent = report.description || t("Laporan");
        const button = document.createElement("button"); button.type = "button"; button.className = styles.button; button.textContent = t("Detail area laporan"); button.addEventListener("click", () => onSelect(report.id));
        popup.append(heading, description, button); marker.bindPopup(popup); marker.on("click", () => onSelect(report.id));
      }
      if (points.length && !fitted.current) { current.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 }); fitted.current = true; }
    });
    return () => { disposed = true; };
  }, [reports, selected?.id, ready, areaLabel, onSelect, t]);
  useEffect(() => { if (selected && validCoordinates(selected)) map.current?.setView([selected.lat!, selected.lon!], Math.max(map.current.getZoom(), 14)); }, [selected, ready]);
  const unlocated = reports.filter(report => !validCoordinates(report)).length;
  return <div><div className={styles.map}><div ref={node} className={styles.mapNode} role="application" aria-label={t("Peta laporan tertunda interaktif")} />{(loading || !ready || error) && <div className={styles.mapMessage} role={error ? "alert" : "status"}><span>{t(error || "Memuat peta...")}</span></div>}</div>{unlocated > 0 && <p className={styles.muted}>{t("{0} laporan tidak memiliki koordinat valid.", { "0": unlocated })}</p>}</div>;
}

function validCoordinates(report: PendingReport) {
  return typeof report.lat === "number" && Number.isFinite(report.lat) && Math.abs(report.lat) <= 90 && typeof report.lon === "number" && Number.isFinite(report.lon) && Math.abs(report.lon) <= 180;
}
