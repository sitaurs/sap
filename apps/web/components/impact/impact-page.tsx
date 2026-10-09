"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Info, LoaderCircle, MapPin, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ApiError } from "../../lib/api/client";
import { getImpactSummary, impactMockEnabled, validateImpactQuery, type ImpactQuery, type ImpactSummary } from "../../lib/api/impact";
import ImpactSummaryCards from "./impact-summary";
import { dayAt, periodLabel, queryForDays, todayJakarta, updatedLabel } from "./impact-utils";
import s from "./impact.module.css";
import { useI18n } from "../../lib/i18n/provider";


type Period = { id: string; start: string; end: string; label: string };
function periods(): Period[] {
  const today = todayJakarta();
  const [year, month] = today.split("-").map(Number);
  const ranges = [
    { id: "previous", start: dayAt(year, month - 2, 1), end: dayAt(year, month - 1, 0) },
    { id: "current", start: dayAt(year, month - 1, 1), end: today },
    { id: "year", start: `${year}-01-01`, end: today },
  ];
  if (impactMockEnabled && ranges[0].start !== "2026-09-01")
    ranges.unshift({ id: "example", start: "2026-09-01", end: "2026-09-30" });
  return ranges.map(p => ({ ...p, label: periodLabel(p.start, p.end) }));
}
function messageForError(error: unknown): string {
  if (error instanceof ApiError && (error.code === "FEATURE_DISABLED" || error.code === "FEATURE_UNAVAILABLE"))
    return "Ringkasan dampak belum diaktifkan oleh pengelola SAP.";
  if (error instanceof ApiError && (error.status === 503 || error.code === "BACKEND_UNAVAILABLE"))
    return "Layanan dampak belum tersedia. Coba muat ulang beberapa saat lagi.";
  return error instanceof Error ? error.message : "Ringkasan dampak belum dapat dimuat.";
}

export default function ImpactPage() {
  const { t, intlLocale } = useI18n();
  const [options] = useState(periods);
  const [period, setPeriod] = useState(options[0].id);
  const [start, setStart] = useState(options[0].start);
  const [end, setEnd] = useState(options[0].end);
  const [scope, setScope] = useState("");
  const [cellId, setCellId] = useState("");
  const [request, setRequest] = useState<{ query: ImpactQuery; revision: number }>(() => ({ query: queryForDays(options[0].start, options[0].end), revision: 0 }));
  const [summary, setSummary] = useState<ImpactSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [methodOpen, setMethodOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setSummary(null);
    void getImpactSummary(request.query, controller.signal).then(data => {
      if (!controller.signal.aborted) setSummary(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(messageForError(cause));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [request]);

  function changePeriod(id: string) {
    setPeriod(id); setValidation("");
    const selected = options.find(p => p.id === id);
    if (selected) { setStart(selected.start); setEnd(selected.end); }
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedCell = scope === "custom" ? cellId.trim() : scope;
    if (scope === "custom" && !selectedCell) { setValidation("Isi ID sel H3 untuk memilih area tertentu."); return; }
    const query = queryForDays(start, end, selectedCell);
    const invalid = validateImpactQuery(query);
    if (invalid) { setValidation(invalid); return; }
    setValidation("");
    setRequest(current => ({ query, revision: current.revision + 1 }));
  }

  return <div className={s.page}>
    <header data-motion="heading" className={s.pageHeading}><div><p className={s.eyebrow}>{t("ADMIN SAP · DAMPAK")}</p><h1>{t("Dampak")}</h1><p className={s.subtitle}>{t("Pantau hasil aksi lingkungan dari bukti yang telah disetujui.")}</p></div><span className={`${s.modeBadge} ${impactMockEnabled ? "" : s.liveBadge}`}>{impactMockEnabled ? t("Mockup · data contoh") : t("Ringkasan terverifikasi")}</span></header>

    <form className={`${s.card} ${s.filters}`} onSubmit={apply} aria-label={t("Filter dampak")}>
      <div className={s.filterRow}>
        <label className={s.filterField} htmlFor="impact-period"><CalendarDays size={24} aria-hidden="true" /><span>{t("Periode")}</span><div className={s.selectWrap}><select id="impact-period" value={period} onChange={e => changePeriod(e.target.value)}>{options.map(p => <option key={p.id} value={p.id}>{t(periodLabel(p.start, p.end, intlLocale))}</option>)}<option value="custom">{t("Pilih tanggal sendiri")}</option></select><ChevronDown size={18} aria-hidden="true" /></div></label>
        <span className={s.filterDivider} aria-hidden="true" />
        <label className={s.filterField} htmlFor="impact-scope"><MapPin size={24} aria-hidden="true" /><span>{t("Cakupan")}</span><div className={s.selectWrap}><select id="impact-scope" value={scope} onChange={e => { setScope(e.target.value); setValidation(""); }}><option value="">{t("Semua area")}</option>{impactMockEnabled && <><option value="8928308280fffff">{t("Area contoh 1")}</option><option value="8928308280bffff">{t("Area contoh 2")}</option></>}<option value="custom">{t("Area tertentu (ID H3)")}</option></select><ChevronDown size={18} aria-hidden="true" /></div></label>
        <button type="submit" className={s.primary} disabled={loading}>{loading ? <><LoaderCircle size={17} className={s.spin} />{t("Memuat…")}</> : t("Terapkan")}</button>
      </div>
      {(period === "custom" || scope === "custom") && <div className={s.customFilters}>
        {period === "custom" && <><label>{t("Dari tanggal")}<input type="date" value={start} onChange={e => setStart(e.target.value)} required /></label><label>{t("Sampai tanggal")}<input type="date" value={end} onChange={e => setEnd(e.target.value)} required /></label></>}
        {scope === "custom" && <label className={s.cellField}>{t("ID sel area H3")}<input value={cellId} onChange={e => setCellId(e.target.value)} placeholder={t("Contoh: 8928308280fffff")} maxLength={15} required aria-describedby="impact-area-help" /><small id="impact-area-help">{t("Gunakan ID sel dari peta area SAP.")}</small></label>}
      </div>}
      {validation && <p className={s.validation} role="alert">{t(validation)}</p>}
    </form>

    <div aria-busy={loading}>
      {loading && <div className={s.loadingState} role="status"><LoaderCircle size={26} className={s.spin} />{t("Memuat ringkasan dampak…")}</div>}
      {error && <section className={`${s.card} ${s.errorState}`} role="alert"><Info size={30} /><h2>{t("Ringkasan belum tersedia")}</h2><p>{t(error)}</p><button type="button" className={s.secondary} onClick={() => setRequest(current => ({ ...current, revision: current.revision + 1 }))}><RefreshCw size={18} />{t("Muat ulang")}</button></section>}
      {summary && <>
        <p className={s.srOnly} role="status">{t("Ringkasan diperbarui untuk periode")}{" "}{new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).formatRange(new Date(summary.from), new Date(Date.parse(summary.to) - 1))}.</p>
        {summary.resolvedIncidents === 0 && summary.approvedActivities === 0 && Object.values(summary.verifiedKg).every(v => v === null) && <p className={s.emptyNotice}><Info size={19} />{t("Belum ada sumber publik yang disetujui dalam periode dan area ini. Pilih filter lain untuk melihat data.")}</p>}
        <ImpactSummaryCards data={summary} onMethod={() => setMethodOpen(true)} />
        <p className={s.footerNote}>{impactMockEnabled ? t("Angka contoh untuk pratinjau desain · tidak berasal dari data produksi.") : t("Ringkasan hanya mencakup sumber publik yang disetujui.")}</p>
      </>}
    </div>
    {methodOpen && summary && <MethodDialog data={summary} onClose={() => setMethodOpen(false)} />}
  </div>;
}

function MethodDialog({ data, onClose }: { data: ImpactSummary; onClose: () => void }) {
  const { t, intlLocale } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    if (dialog && !dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    // Removing the dialog removes its top-layer entry. Calling close() in this
    // cleanup would dispatch onClose during Strict Mode's effect rehearsal.
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog data-motion="dialog" ref={ref} className={s.methodDialog} aria-labelledby="impact-method-dialog-title" onClose={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={s.dialogBody}>
      <header>
        <span className={s.dialogIcon}><ShieldCheck size={26} aria-hidden="true" /></span>
        <div><p className={s.eyebrow}>{t("METODE DAMPAK SAP")}</p><h2 id="impact-method-dialog-title">{t("Angka yang dapat ditelusuri")}</h2></div>
        <button type="button" className={s.close} onClick={onClose} aria-label={t("Tutup metode perhitungan")}><X size={22} /></button>
      </header>
      <p className={s.dialogIntro}>{t("Ringkasan mengikuti periode dan area yang dipilih. Hanya sumber publik yang memenuhi ketentuan SAP yang dihitung.")}</p>
      <dl className={s.methodDefinitions}>
        <div><dt>{t("Laporan terselesaikan")}</dt><dd>{t("Laporan publik yang bukan duplikat dan berstatus selesai dalam periode terpilih.")}</dd></div>
        <div>
          <dt>{t("Kegiatan, relawan, dan kehadiran")}</dt>
          <dd>
            <p>{t("Kegiatan dihitung jika hasilnya disetujui dalam periode terpilih.")}</p>
            <ul>
              <li><strong>{t("Relawan unik:")}</strong> {" "}{t("setiap orang dihitung satu kali.")}</li>
              <li><strong>{t("Total kehadiran:")}</strong> {" "}{t("dihitung pada setiap kegiatan yang diikuti.")}</li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>{t("Berat sampah")}</dt>
          <dd>
            <p>{t("Hanya pengukuran terverifikasi yang dilakukan dalam periode terpilih yang dihitung.")}</p>
            <p>{t("Berat terkumpul, diserahkan, dan didaur ulang dicatat")}{" "}<strong>{t("terpisah dan tidak dijumlahkan")}</strong>{t(". Panjang batang membandingkan setiap tahap terhadap berat terbesar.")}</p>
          </dd>
        </div>
        <div>
          <dt>{t("Cakupan bukti")}</dt>
          <dd>
            <p>{t("Persentase hasil kegiatan yang disetujui dan memiliki setidaknya satu pengukuran berat terkumpul terverifikasi, dibandingkan seluruh hasil kegiatan yang disetujui.")}</p>
            <p>{t("Jika belum ada hasil kegiatan yang disetujui, persentase belum tersedia.")}</p>
          </dd>
        </div>
        <div><dt>{t("Respons penanganan")}</dt><dd>{t("Nilai tengah (median) waktu sejak laporan dibuat hingga selesai, untuk laporan yang masuk dalam ringkasan.")}</dd></div>
      </dl>
      <div className={s.methodNote}>
        <CheckCircle2 size={20} aria-hidden="true" />
        <p><strong>{t("Berat yang belum diketahui berbeda dari 0 kg.")}</strong><br />{t("Berat dan emisi tidak diperkirakan dari foto.")}</p>
      </div>
      <footer>
        <div className={s.methodMetadata}>
          <span>{t("Versi metode")}{" "}<code>{data.methodologyVersion}</code></span>
          <span>{t("Waktu ringkasan:")}{" "}<time dateTime={data.asOf}>{t(updatedLabel(data.asOf, intlLocale))}</time>{impactMockEnabled ? t(" · Data contoh") : ""}</span>
        </div>
        <button type="button" className={s.primary} onClick={onClose}>{t("Mengerti")}</button>
      </footer>
    </div>
  </dialog>;
}
