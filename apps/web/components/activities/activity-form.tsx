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
        title={activity ? "Edit kegiatan" : "Buat kegiatan relawan"}
        subtitle="Susun aksi yang jelas: sumber laporan, jadwal, koordinator, dan kebutuhan relawan."
        onBack={() => setExit(true)}
      />
      <form onSubmit={(e) => void submit(e)} className={s.formLayout}>
        <div className={s.formStack}>
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <div>
                <h2>
                  <FileText size={23} /> Laporan sumber
                </h2>
                <p>Kegiatan selalu terhubung dengan satu laporan utama.</p>
              </div>
              <span className={s.step}>1</span>
            </div>
            {activity ? (
              <div className={s.selectedSource}>
                {admin ? <AdminSourcePhoto reportId={activity.reportId} /> : <span className={s.thumbnail}><FileText size={26} /></span>}
                <div>
                  <strong>Laporan #{shortId(activity.reportId)}</strong>
                  <small>
                    Sumber kegiatan tidak dapat diganti setelah kegiatan dibuat.
                  </small>
                </div>
              </div>
            ) : (
              <>
                {sourceError && <Notice error>{sourceError}</Notice>}
                <label className={s.search}>
                  <Search size={19} />
                  <input
                    aria-label="Cari laporan sumber yang dimuat"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Cari laporan yang dimuat…"
                  />
                </label>
                <div
                  className={s.reportPicker}
                  role="radiogroup"
                  aria-label="Pilih laporan sumber"
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
                            ?.name || "Laporan sampah"}{" "}
                          · #{shortId(r.id)}
                        </strong>
                        <small>{r.description}</small>
                        <small>
                          {dateLabel(r.occurredAt, true)} · {r.status}
                        </small>
                      </span>
                      {reportId === r.id && <Check size={18} />}
                    </label>
                  ))}
                </div>
                {sourceBusy && <Busy />}
                {!sourceBusy && !reportOptions.length && (
                  <Empty title="Laporan tidak ditemukan">
                    Muat laporan berikutnya atau ubah kata kunci pencarian.
                  </Empty>
                )}
                {reportsCursor && (
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={sourceBusy}
                    onClick={() => void moreReports()}
                  >
                    Muat laporan berikutnya
                  </button>
                )}
              </>
            )}
            <p className={s.hint}>
              Draf dapat disusun terlebih dahulu. Publikasi memerlukan laporan
              utama yang terbuka untuk publik serta memenuhi persyaratan SAP.
            </p>
          </section>
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <h2>Informasi kegiatan</h2>
              <span className={s.step}>2</span>
            </div>
            <label className={s.field}>
              Nama kegiatan <span>*</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={5}
                maxLength={150}
                placeholder="Contoh: Aksi bersih bantaran sungai"
              />
              <small>{title.length}/150 karakter</small>
            </label>
            <label className={s.field}>
              Deskripsi kegiatan <span>*</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={20}
                maxLength={2000}
                rows={5}
                placeholder="Jelaskan tujuan, area kegiatan, dan apa yang akan dilakukan relawan."
              />
              <small>{description.length}/2000 karakter</small>
            </label>
          </section>
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <h2>
                <CalendarDays size={23} /> Jadwal & kuota
              </h2>
              <span className={s.step}>3</span>
            </div>
            <p className={s.hint}>
              Semua waktu menggunakan WIB. Jadwal dan kuota boleh dilengkapi
              kemudian saat masih draf.
            </p>
            <div className={s.fieldGrid}>
              <label className={s.field}>
                Mulai kegiatan
                <input
                  type="datetime-local"
                  value={starts}
                  onChange={(e) => setStarts(e.target.value)}
                />
              </label>
              <label className={s.field}>
                Selesai kegiatan
                <input
                  type="datetime-local"
                  value={ends}
                  min={starts || undefined}
                  onChange={(e) => setEnds(e.target.value)}
                />
              </label>
              <label className={s.field}>
                Batas pendaftaran
                <input
                  type="datetime-local"
                  value={closes}
                  max={starts || undefined}
                  onChange={(e) => setCloses(e.target.value)}
                />
              </label>
              <label className={s.field}>
                Kuota peserta
                <input
                  type="number"
                  min={Math.max(1, current?.acceptedCount || 1)}
                  max={200}
                  step={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="1–200 peserta"
                />
                <small>
                  Kuota tidak boleh di bawah jumlah peserta yang diterima.
                </small>
              </label>
            </div>
          </section>
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <h2>
                <MapPin size={23} /> Titik kumpul & kebutuhan
              </h2>
              <span className={s.step}>4</span>
            </div>
            <label className={s.field}>
              Petunjuk titik kumpul
              <textarea
                rows={3}
                maxLength={1000}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Patokan lokasi dan petunjuk akses bagi peserta."
              />
            </label>
            <div className={s.fieldGrid}>
              <label className={s.field}>
                Latitude (opsional)
                <input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </label>
              <label className={s.field}>
                Longitude (opsional)
                <input
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
              Perlengkapan
              <textarea
                rows={3}
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder={"Sarung tangan\nBotol minum pribadi"}
              />
              <small>Satu perlengkapan per baris, maksimal 15.</small>
            </label>
            <label className={s.field}>
              Catatan aksesibilitas
              <textarea
                rows={3}
                maxLength={1000}
                value={accessibility}
                onChange={(e) => setAccessibility(e.target.value)}
                placeholder="Kondisi jalur, fasilitas, dan kebutuhan akses khusus."
              />
            </label>
            <label className={s.field}>
              Rencana penyerahan sampah
              <textarea
                rows={3}
                maxLength={1000}
                value={handover}
                onChange={(e) => setHandover(e.target.value)}
                placeholder="Jelaskan tujuan penyerahan dan cara pengangkutan sampah."
              />
              <small>Wajib dilengkapi sebelum publikasi.</small>
            </label>
          </section>
        </div>
        <aside className={s.sideStack}>
          <section className={s.card}>
            <h2>
              <UsersRound size={23} /> Koordinator kegiatan
            </h2>
            <p className={s.muted}>
              Cari pengguna aktif yang telah memverifikasi email.
            </p>
            <label className={s.field}>
              Cari koordinator
              <input
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                maxLength={100}
                placeholder="Ketik minimal 3 karakter nama…"
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
                      ? "Penugasan telah diterima"
                      : "Menunggu penerimaan penugasan"}
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
                  Hapus
                </button>
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
                  Tidak ada kandidat pada hasil yang dimuat.
                </p>
              )}
            {candidateCursor && (
              <button
                type="button"
                className={s.secondary}
                disabled={candidateBusy}
                onClick={() => void moreCandidates()}
              >
                Muat kandidat berikutnya
              </button>
            )}
            <Notice>
              Koordinator harus menerima penugasan melalui akunnya sebelum
              kegiatan dapat dipublikasikan.
            </Notice>
          </section>
          <section className={`${s.card} ${s.softCard}`}>
            <h2>Sebelum publikasi</h2>
            <ul className={s.checklist}>
              <li>Laporan sumber memenuhi syarat publikasi.</li>
              <li>Jadwal, kuota, dan rencana penyerahan lengkap.</li>
              <li>Koordinator menerima penugasan.</li>
              <li>Waktu mulai dan batas pendaftaran masih mendatang.</li>
            </ul>
            <p className={s.hint}>
              Simpan kegiatan terlebih dahulu. Tombol publikasi tersedia pada
              detail saat semua syarat terpenuhi.
            </p>
          </section>
          {source && (
            <section className={s.card}>
              <AdminSourcePhoto reportId={source.id} large />
              <small>Laporan #{shortId(source.id)}</small>
              <p className={s.clamp}>{source.description}</p>
            </section>
          )}
        </aside>
        <footer className={s.formFooter}>
          {error && <Notice error>{error}</Notice>}
          {conflict && (
            <button
              type="button"
              className={s.secondary}
              disabled={busy}
              onClick={() => void loadLatest()}
            >
              Muat versi terbaru
            </button>
          )}
          <div>
            <p>
              {current?.status === "draft" || !current
                ? "Draf belum ditampilkan kepada publik."
                : "Perubahan mengikuti izin pada status kegiatan saat ini."}
            </p>
            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                onClick={() => setExit(true)}
                disabled={busy}
              >
                Kembali
              </button>
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
                  ? "Menyimpan…"
                  : current?.status === "draft" || !current
                    ? "Simpan draf kegiatan"
                    : "Simpan perubahan"}
              </button>
            </div>
          </div>
        </footer>
      </form>
      {exit && (
        <DialogShell
          title="Kembali dari form?"
          subtitle="Perubahan yang belum disimpan akan hilang."
          onClose={() => setExit(false)}
          footer={
            <div className={s.actions}>
              <button className={s.secondary} onClick={() => setExit(false)}>
                Tetap di form
              </button>
              <button className={s.secondary} onClick={onBack}>
                Kembali tanpa menyimpan
              </button>
            </div>
          }
        >
          <p>Pastikan perubahan yang diperlukan sudah tersimpan.</p>
        </DialogShell>
      )}
    </>
  );
}
function PlusMark() {
  return <span aria-hidden="true">＋</span>;
}
