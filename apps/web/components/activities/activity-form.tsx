"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  FileText,
  MapPin,
  Save,
  Search,
  UsersRound,
} from "lucide-react";
import { type SapCategory, type SapReport } from "../../lib/api/client";
import {
  listActivitySourceReports,
  createActivity,
  getActivity,
  listCandidates,
  updateActivity,
  type Activity,
  type ActivityInput,
  type Candidate,
} from "../../lib/api/activities";
import {
  dateLabel,
  errorMessage,
  fromLocalDate,
  isConflict,
  localDate,
  shortId,
  uniqueItems,
} from "./activity-utils";
import { Busy, Empty, Notice, PageHead, useIntentKey } from "./activity-ui";
import { AdminSourcePhoto } from "./activity-photo";
import DialogShell from "../instagram/dialog-shell";
import s from "./activities.module.css";
import { useI18n } from "../../lib/i18n/provider";


export default function ActivityForm({
  activity,
  categories,
  onBack,
  onSaved,
  admin = true,
}: {
  activity?: Activity;
  categories: SapCategory[];
  onBack: () => void;
  onSaved: (a: Activity) => void;
  admin?: boolean;
}) {
  const { t, intlLocale } = useI18n();
  const [current, setCurrent] = useState(activity),
    [reportId, setReportId] = useState(activity?.reportId || "");
  const [title, setTitle] = useState(activity?.title || ""),
    [description, setDescription] = useState(activity?.description || "");
  const [starts, setStarts] = useState(localDate(activity?.startsAt ?? null)),
    [ends, setEnds] = useState(localDate(activity?.endsAt ?? null)),
    [closes, setCloses] = useState(
      localDate(activity?.registrationClosesAt ?? null),
    );
  const [capacity, setCapacity] = useState(
      activity?.capacity?.toString() || "",
    ),
    [coordinatorId, setCoordinatorId] = useState(
      activity?.coordinatorId ?? null,
    ),
    [coordinatorName, setCoordinatorName] = useState(
      activity?.coordinatorId ? "Koordinator yang ditugaskan" : "",
    );
  const [instructions, setInstructions] = useState(
      activity?.meetingPoint?.instructions || "",
    ),
    [latitude, setLatitude] = useState(
      activity?.meetingPoint?.latitude?.toString() || "",
    ),
    [longitude, setLongitude] = useState(
      activity?.meetingPoint?.longitude?.toString() || "",
    );
  const [equipment, setEquipment] = useState(
      activity?.equipment.join("\n") || "",
    ),
    [accessibility, setAccessibility] = useState(
      activity?.accessibilityNotes || "",
    ),
    [handover, setHandover] = useState(activity?.wasteHandoverPlan || "");
  const [reports, setReports] = useState<SapReport[]>([]),
    [reportsCursor, setReportsCursor] = useState<string | null>(null),
    [reportSearch, setReportSearch] = useState(""),
    [sourceBusy, setSourceBusy] = useState(false),
    [sourceError, setSourceError] = useState("");
  const [candidateSearch, setCandidateSearch] = useState(""),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [candidateCursor, setCandidateCursor] = useState<string | null>(null),
    [candidateBusy, setCandidateBusy] = useState(false),
    [candidateError, setCandidateError] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [exit, setExit] = useState(false);
  const intentKey = useIntentKey();
  const candidateGeneration = useRef(0);
  useEffect(() => {
    if (activity) return;
    const c = new AbortController();
    setSourceBusy(true);
    void listActivitySourceReports(undefined, undefined, c.signal)
      .then((p) => {
        if (!c.signal.aborted) {
          setReports(p.items);
          setReportsCursor(p.nextCursor);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setSourceError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setSourceBusy(false);
      });
    return () => c.abort();
  }, [activity]);
  useEffect(() => {
    const query = candidateSearch.trim();
    candidateGeneration.current += 1;
    setCandidateBusy(false);
    setCandidates([]);
    setCandidateCursor(null);
    setCandidateError("");
    if (query.length < 3) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      setCandidateBusy(true);
      void listCandidates(query, undefined, c.signal)
        .then((p) => {
          if (!c.signal.aborted) {
            setCandidates(p.items);
            setCandidateCursor(p.nextCursor);
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) setCandidateError(errorMessage(e));
        })
        .finally(() => {
          if (!c.signal.aborted) setCandidateBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [candidateSearch]);
  const source = reports.find((r) => r.id === reportId);
  const reportOptions = reports.filter(
    (r) =>
      !r.duplicateOfId &&
      r.status !== "duplicate" &&
      `${r.description} ${r.id}`
        .toLowerCase()
        .includes(reportSearch.toLowerCase()),
  );
  async function moreReports() {
    if (!reportsCursor) return;
    setSourceBusy(true);
    try {
      const p = await listActivitySourceReports(undefined, reportsCursor);
      setReports((old) => uniqueItems(old, p.items));
      setReportsCursor(p.nextCursor);
    } catch (e) {
      setSourceError(errorMessage(e));
    } finally {
      setSourceBusy(false);
    }
  }
  async function moreCandidates() {
    if (!candidateCursor || candidateBusy) return;
    const generation = candidateGeneration.current;
    setCandidateBusy(true);
    try {
      const p = await listCandidates(candidateSearch.trim(), candidateCursor);
      if (generation !== candidateGeneration.current) return;
      setCandidates((old) => uniqueItems(old, p.items));
      setCandidateCursor(p.nextCursor);
    } catch (e) {
      if (generation === candidateGeneration.current)
        setCandidateError(errorMessage(e));
    } finally {
      if (generation === candidateGeneration.current) setCandidateBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (conflict) return;
    const tools = equipment
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!reportId) {
      setError("Pilih laporan sumber terlebih dahulu.");
      return;
    }
    if (title.trim().length < 5 || description.trim().length < 20) {
      setError("Judul minimal 5 karakter dan deskripsi minimal 20 karakter.");
      return;
    }
    if (tools.length > 15 || tools.some((x) => x.length > 200)) {
      setError(
        "Tambahkan hingga 15 perlengkapan, masing-masing maksimal 200 karakter.",
      );
      return;
    }
    if (starts && ends && starts >= ends) {
      setError("Waktu selesai harus sesudah waktu mulai.");
      return;
    }
    if (closes && starts && closes > starts) {
      setError("Batas pendaftaran harus sebelum atau sama dengan waktu mulai.");
      return;
    }
    if (
      (latitude === "") !== (longitude === "") ||
      ((latitude || longitude) && !instructions.trim())
    ) {
      setError(
        "Isi kedua koordinat dan petunjuk titik kumpul, atau kosongkan keduanya.",
      );
      return;
    }
    const body: ActivityInput = {
      reportId,
      title: title.trim(),
      description: description.trim(),
      coordinatorId,
      startsAt: fromLocalDate(starts),
      endsAt: fromLocalDate(ends),
      registrationClosesAt: fromLocalDate(closes),
      timezone: "Asia/Jakarta",
      capacity: capacity ? Number(capacity) : null,
      meetingPoint: instructions.trim()
        ? {
            instructions: instructions.trim(),
            latitude: latitude === "" ? null : Number(latitude),
            longitude: longitude === "" ? null : Number(longitude),
          }
        : null,
      equipment: tools,
      accessibilityNotes: accessibility.trim(),
      wasteHandoverPlan: handover.trim(),
    };
    setBusy(true);
    try {
      const saved = current
        ? await updateActivity(current, body)
        : await createActivity(body, intentKey(body));
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
      setConflict(isConflict(e));
    } finally {
      setBusy(false);
    }
  }
  async function loadLatest() {
    if (!current) return;
    setBusy(true);
    try {
      const latest = await getActivity(current.id);
      setCurrent(latest);
      setConflict(false);
      setError(
        "Versi terbaru dimuat. Input Anda dipertahankan; periksa jadwal, kuota, dan penugasan sebelum menyimpan ulang.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title={activity ? t("Edit kegiatan") : t("Buat kegiatan relawan")}
        subtitle={t("Susun aksi yang jelas: sumber laporan, jadwal, koordinator, dan kebutuhan relawan.")}
        onBack={() => setExit(true)}
      />
      <form onSubmit={(e) => void submit(e)} className={s.formLayout}>
        <div className={s.formStack}>
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <div>
                <h2>
                  <FileText size={23} /> {" "}{t("Laporan sumber")}</h2>
                <p>{t("Kegiatan selalu terhubung dengan satu laporan utama.")}</p>
              </div>
              <span className={s.step}>1</span>
            </div>
            {activity ? (
              <div className={s.selectedSource}>
                {admin ? <AdminSourcePhoto reportId={activity.reportId} /> : <span className={s.thumbnail}><FileText size={26} /></span>}
                <div>
                  <strong>{t("Laporan #")}{shortId(activity.reportId)}</strong>
                  <small>
                    {t("Sumber kegiatan tidak dapat diganti setelah kegiatan dibuat.")}</small>
                </div>
              </div>
            ) : (
              <>
                {sourceError && <Notice error>{sourceError}</Notice>}
                <label className={s.search}>
                  <Search size={19} />
                  <input
                    aria-label={t("Cari laporan sumber yang dimuat")}
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder={t("Cari laporan yang dimuat…")}
                  />
                </label>
                <div
                  className={s.reportPicker}
                  role="radiogroup"
                  aria-label={t("Pilih laporan sumber")}
                >
                  {reportOptions.map((r) => (
                    <label
                      key={r.id}
                      className={`${s.reportChoice} ${reportId === r.id ? s.selectedRow : ""}`}
                    >
                      <input
                        type="radio"
                        name="report-source"
                        value={r.id}
                        checked={reportId === r.id}
                        onChange={() => setReportId(r.id)}
                        required
                      />
                      <AdminSourcePhoto reportId={r.id} />
                      <span>
                        <strong>
                          {categories.find((c) => c.id === r.categoryId)
                            ?.name || t("Laporan sampah")}{" "}
                          · #{shortId(r.id)}
                        </strong>
                        <small>{r.description}</small>
                        <small>
                          {t(dateLabel(r.occurredAt, true, intlLocale))} · {r.status}
                        </small>
                      </span>
                      {reportId === r.id && <Check size={18} />}
                    </label>
                  ))}
                </div>
                {sourceBusy && <Busy />}
                {!sourceBusy && !reportOptions.length && (
                  <Empty title={t("Laporan tidak ditemukan")}>
                    {t("Muat laporan berikutnya atau ubah kata kunci pencarian.")}</Empty>
                )}
                {reportsCursor && (
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={sourceBusy}
                    onClick={() => void moreReports()}
                  >
                    {t("Muat laporan berikutnya")}</button>
                )}
              </>
            )}
            <p className={s.hint}>
              {t("Draf dapat disusun terlebih dahulu. Publikasi memerlukan laporan utama yang terbuka untuk publik serta memenuhi persyaratan SAP.")}</p>
          </section>
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <h2>{t("Informasi kegiatan")}</h2>
              <span className={s.step}>2</span>
            </div>
            <label className={s.field}>
              {t("Nama kegiatan")}{" "}<span>*</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={5}
                maxLength={150}
                placeholder={t("Contoh: Aksi bersih bantaran sungai")}
              />
              <small>{title.length}{t("/150 karakter")}</small>
            </label>
            <label className={s.field}>
              {t("Deskripsi kegiatan")}{" "}<span>*</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={20}
                maxLength={2000}
                rows={5}
                placeholder={t("Jelaskan tujuan, area kegiatan, dan apa yang akan dilakukan relawan.")}
              />
              <small>{description.length}{t("/2000 karakter")}</small>
            </label>
          </section>
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <h2>
                <CalendarDays size={23} /> {" "}{t("Jadwal & kuota")}</h2>
              <span className={s.step}>3</span>
            </div>
            <p className={s.hint}>
              {t("Semua waktu menggunakan WIB. Jadwal dan kuota boleh dilengkapi kemudian saat masih draf.")}</p>
            <div className={s.fieldGrid}>
              <label className={s.field}>
                {t("Mulai kegiatan")}<input
                  type="datetime-local"
                  value={starts}
                  onChange={(e) => setStarts(e.target.value)}
                />
              </label>
              <label className={s.field}>
                {t("Selesai kegiatan")}<input
                  type="datetime-local"
                  value={ends}
                  min={starts || undefined}
                  onChange={(e) => setEnds(e.target.value)}
                />
              </label>
              <label className={s.field}>
                {t("Batas pendaftaran")}<input
                  type="datetime-local"
                  value={closes}
                  max={starts || undefined}
                  onChange={(e) => setCloses(e.target.value)}
                />
              </label>
              <label className={s.field}>
                {t("Kuota peserta")}<input
                  type="number"
                  min={Math.max(1, current?.acceptedCount || 1)}
                  max={200}
                  step={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder={t("1–200 peserta")}
                />
                <small>
                  {t("Kuota tidak boleh di bawah jumlah peserta yang diterima.")}</small>
              </label>
            </div>
          </section>
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <h2>
                <MapPin size={23} /> {" "}{t("Titik kumpul & kebutuhan")}</h2>
              <span className={s.step}>4</span>
            </div>
            <label className={s.field}>
              {t("Petunjuk titik kumpul")}<textarea
                rows={3}
                maxLength={1000}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t("Patokan lokasi dan petunjuk akses bagi peserta.")}
              />
            </label>
            <div className={s.fieldGrid}>
              <label className={s.field}>
                {t("Latitude (opsional)")}<input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </label>
              <label className={s.field}>
                {t("Longitude (opsional)")}<input
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </label>
            </div>
            <label className={s.field}>
              {t("Perlengkapan")}<textarea
                rows={3}
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder={"Sarung tangan\nBotol minum pribadi"}
              />
              <small>{t("Satu perlengkapan per baris, maksimal 15.")}</small>
            </label>
            <label className={s.field}>
              {t("Catatan aksesibilitas")}<textarea
                rows={3}
                maxLength={1000}
                value={accessibility}
                onChange={(e) => setAccessibility(e.target.value)}
                placeholder={t("Kondisi jalur, fasilitas, dan kebutuhan akses khusus.")}
              />
            </label>
            <label className={s.field}>
              {t("Rencana penyerahan sampah")}<textarea
                rows={3}
                maxLength={1000}
                value={handover}
                onChange={(e) => setHandover(e.target.value)}
                placeholder={t("Jelaskan tujuan penyerahan dan cara pengangkutan sampah.")}
              />
              <small>{t("Wajib dilengkapi sebelum publikasi.")}</small>
            </label>
          </section>
        </div>
        <aside className={s.sideStack}>
          <section className={s.card}>
            <h2>
              <UsersRound size={23} /> {" "}{t("Koordinator kegiatan")}</h2>
            <p className={s.muted}>
              {t("Cari pengguna aktif yang telah memverifikasi email.")}</p>
            <label className={s.field}>
              {t("Cari koordinator")}<input
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                maxLength={100}
                placeholder={t("Ketik minimal 3 karakter nama atau email…")}
              />
            </label>
            {coordinatorId && (
              <div className={s.coordinatorChoice}>
                <span className={s.iconCircle}>
                  <UsersRound size={21} />
                </span>
                <span>
                  <strong>{coordinatorName}</strong>
                  <small>
                    {current?.coordinatorId === coordinatorId &&
                    current.coordinatorAcceptedAt
                      ? t("Penugasan telah diterima")
                      : t("Menunggu penerimaan penugasan")}
                  </small>
                </span>
                <button
                  type="button"
                  className={s.textButton}
                  onClick={() => {
                    setCoordinatorId(null);
                    setCoordinatorName("");
                  }}
                >
                  {t("Hapus")}</button>
              </div>
            )}
            {candidateError && <Notice error>{candidateError}</Notice>}
            {candidateBusy && <Busy />}
            <div className={s.candidateList}>
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setCoordinatorId(c.id);
                    setCoordinatorName(c.displayName);
                    setCandidateSearch("");
                  }}
                >
                  <span>{c.displayName}</span>
                  <PlusMark />
                </button>
              ))}
            </div>
            {candidateSearch.trim().length >= 3 &&
              !candidateBusy &&
              !candidateError &&
              !candidates.length && (
                <p className={s.hint}>
                  {t("Tidak ada kandidat pada hasil yang dimuat.")}</p>
              )}
            {candidateCursor && (
              <button
                type="button"
                className={s.secondary}
                disabled={candidateBusy}
                onClick={() => void moreCandidates()}
              >
                {t("Muat kandidat berikutnya")}</button>
            )}
            <Notice>
              {t("Koordinator harus menerima penugasan melalui akunnya sebelum kegiatan dapat dipublikasikan.")}</Notice>
          </section>
          <section className={`${s.card} ${s.softCard}`}>
            <h2>{t("Sebelum publikasi")}</h2>
            <ul className={s.checklist}>
              <li>{t("Laporan sumber memenuhi syarat publikasi.")}</li>
              <li>{t("Jadwal, kuota, dan rencana penyerahan lengkap.")}</li>
              <li>{t("Koordinator menerima penugasan.")}</li>
              <li>{t("Waktu mulai dan batas pendaftaran masih mendatang.")}</li>
            </ul>
            <p className={s.hint}>
              {t("Simpan kegiatan terlebih dahulu. Tombol publikasi tersedia pada detail saat semua syarat terpenuhi.")}</p>
          </section>
          {source && (
            <section className={s.card}>
              <AdminSourcePhoto reportId={source.id} large />
              <small>{t("Laporan #")}{shortId(source.id)}</small>
              <p className={s.clamp}>{source.description}</p>
            </section>
          )}
        </aside>
        <footer className={s.formFooter}>
          {error && <Notice error>{t(error)}</Notice>}
          {conflict && (
            <button
              type="button"
              className={s.secondary}
              disabled={busy}
              onClick={() => void loadLatest()}
            >
              {t("Muat versi terbaru")}</button>
          )}
          <div>
            <p>
              {current?.status === "draft" || !current
                ? t("Draf belum ditampilkan kepada publik.")
                : t("Perubahan mengikuti izin pada status kegiatan saat ini.")}
            </p>
            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                onClick={() => setExit(true)}
                disabled={busy}
              >
                {t("Kembali")}</button>
              <button
                type="submit"
                className={s.primary}
                disabled={
                  busy ||
                  conflict ||
                  !reportId ||
                  (current && !current.actions.edit.allowed)
                }
              >
                <Save size={19} />
                {busy
                  ? t("Menyimpan…")
                  : current?.status === "draft" || !current
                    ? t("Simpan draf kegiatan")
                    : t("Simpan perubahan")}
              </button>
            </div>
          </div>
        </footer>
      </form>
      {exit && (
        <DialogShell
          title={t("Kembali dari form?")}
          subtitle={t("Perubahan yang belum disimpan akan hilang.")}
          onClose={() => setExit(false)}
          footer={
            <div className={s.actions}>
              <button className={s.secondary} onClick={() => setExit(false)}>
                {t("Tetap di form")}</button>
              <button className={s.secondary} onClick={onBack}>
                {t("Kembali tanpa menyimpan")}</button>
            </div>
          }
        >
          <p>{t("Pastikan perubahan yang diperlukan sudah tersimpan.")}</p>
        </DialogShell>
      )}
    </>
  );
}
function PlusMark() {
  return <span aria-hidden="true">＋</span>;
}
