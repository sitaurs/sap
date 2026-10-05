"use client";

import { useEffect, useState, type PointerEvent } from "react";
import {
  Check,
  ClipboardCheck,
  Eye,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  createResultRendition,
  decideActivityResult,
  decideMeasurement,
  getActivity,
  getActivityResult,
  listResultRenditions,
  resultPhotoUrl,
  type Activity,
  type AdminActivityResult,
  type PublicationApproval,
  type Rendition,
  type ResultDecision,
} from "../../lib/api/activities";
import {
  dateLabel,
  errorMessage,
  isConflict,
  shortId,
  uniqueItems,
} from "./activity-utils";
import { Busy, Empty, Notice, PageHead, useIntentKey } from "./activity-ui";
import { MeasurementPhoto, ResultPhoto } from "./activity-photo";
import DialogShell from "../instagram/dialog-shell";
import s from "./activities.module.css";
import { useI18n } from "../../lib/i18n/provider";


export default function ActivityResultReview({
  activity,
  resultId,
  onBack,
  onChanged,
  onEdit,
}: {
  activity: Activity;
  resultId: string;
  onBack: () => void;
  onChanged: (a: Activity) => void;
  onEdit: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const [result, setResult] = useState<AdminActivityResult | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false),
    [epoch, setEpoch] = useState(0);
  const [action, setAction] = useState<ResultDecision["action"]>("approve"),
    [reason, setReason] = useState(""),
    [outcome, setOutcome] = useState<"partial" | "complete">("partial"),
    [summary, setSummary] = useState(""),
    [requested, setRequested] = useState("");
  const [approvals, setApprovals] = useState<PublicationApproval[]>([]),
    [photo, setPhoto] = useState<string | null>(null),
    [measurementOpen, setMeasurementOpen] = useState(false),
    [measureReason, setMeasureReason] = useState("");
  const intentKey = useIntentKey();
  const [latestResult, setLatestResult] = useState<AdminActivityResult | null>(
    null,
  );
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    setResult(null);
    void getActivityResult(resultId, c.signal)
      .then((r) => {
        if (r.activityId !== activity.id || r.reportId !== activity.reportId)
          throw new Error(
            "Hasil ini terhubung dengan kegiatan lain. Buka melalui antrean hasil yang sesuai.",
          );
        if (!c.signal.aborted) {
          setResult(r);
          setOutcome(r.verifiedOutcome ?? r.claimedOutcome);
          setSummary(r.publicSummary || "");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [resultId, activity.id, activity.reportId]);
  async function reload() {
    setBusy(true);
    try {
      const latest = await getActivityResult(resultId);
      setLatestResult(latest);
      setMessage(
        "Versi terbaru dimuat. Periksa keputusan dan pilih kembali versi foto publik sebelum menyimpan.",
      );
      setError("");
      onChanged(await getActivity(activity.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function decide() {
    if (!result) return;
    setError("");
    const evidence = requested
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      action === "request_evidence" &&
      (evidence.length < 1 ||
        evidence.length > 3 ||
        evidence.some((x) => x.length > 300))
    ) {
      setError(
        "Tuliskan 1–3 permintaan bukti, maksimal 300 karakter per baris.",
      );
      return;
    }
    if (
      action === "approve" &&
      outcome === "complete" &&
      !approvals.some(
        (x) =>
          result.afterMediaIds.includes(x.mediaId) &&
          x.channels.includes("web"),
      )
    ) {
      setError(
        "Hasil selesai memerlukan foto sesudah dengan versi publik siap untuk web. Izin pemilik akan diperiksa oleh SAP.",
      );
      return;
    }
    const body: ResultDecision = {
      action,
      reason: reason.trim(),
      verifiedOutcome: action === "approve" ? outcome : null,
      publicSummary: action === "approve" ? summary.trim() : null,
      publicEvidenceApprovals: action === "approve" ? approvals : [],
      requestedEvidence: action === "request_evidence" ? evidence : [],
    };
    setBusy(true);
    try {
      const saved = await decideActivityResult(
        result,
        body,
        intentKey({ id: result.id, revision: result.revision, ...body }),
      );
      setResult({ ...result, ...saved });
      setMessage("Keputusan hasil kegiatan tersimpan.");
      onChanged(await getActivity(activity.id));
    } catch (e) {
      setError(errorMessage(e));
      setConflict(isConflict(e));
    } finally {
      setBusy(false);
    }
  }
  async function measurementDecision(action: "verify" | "reject") {
    if (!result?.measurement) return;
    setBusy(true);
    setError("");
    try {
      const m = result.measurement;
      const updated = await decideMeasurement(
        m,
        action,
        measureReason.trim(),
        intentKey({
          measurement: m.id,
          revision: m.revision,
          action,
          reason: measureReason.trim(),
        }),
      );
      setResult({ ...result, measurement: updated });
      setMeasurementOpen(false);
      setMeasureReason("");
      setMessage(
        "Keputusan berat sampah tersimpan secara terpisah dari hasil kegiatan.",
      );
    } catch (e) {
      setError(errorMessage(e));
      setConflict(isConflict(e));
    } finally {
      setBusy(false);
    }
  }
  function choosePhoto(value: PublicationApproval) {
    setApprovals((old) => [
      ...old.filter((x) => x.mediaId !== value.mediaId),
      ...(value.channels.length ? [value] : []),
    ]);
    setPhoto(null);
  }
  return (
    <>
      <PageHead
        title={t("Tinjau hasil kegiatan")}
        subtitle={activity.title}
        onBack={onBack}
        action={
          <button
            className={s.secondary}
            onClick={() => void reload()}
            disabled={busy || loading}
          >
            <RefreshCw size={18} /> {" "}{t("Muat ulang")}</button>
        }
      />
      {loading ? (
        <Busy />
      ) : !result ? (
        <Notice error>{error || t("Hasil tidak tersedia.")}</Notice>
      ) : (
        <>
          {message && <Notice>{t(message)}</Notice>}
          {error && <Notice error>{t(error)}</Notice>}
          {conflict && (
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => void reload()}
            >
              {t("Muat versi terbaru sebelum mengulangi")}</button>
          )}
          {latestResult && (
            <Notice>
              <strong>{t("Versi terbaru · revisi")}{" "}{latestResult.revision}</strong>
              <p>{latestResult.description}</p>
              <p>
                {t("Status:")}{" "}{latestResult.status} · {latestResult.decisionReason}
              </p>
              <p>{latestResult.requestedEvidence.join("; ")}</p>
              <button
                className={s.secondary}
                disabled={busy}
                onClick={() => {
                  setResult(latestResult);
                  setLatestResult(null);
                  setConflict(false);
                  setApprovals([]);
                  setEpoch((x) => x + 1);
                }}
              >
                {t("Saya sudah meninjau, pilih ulang versi foto publik")}</button>
            </Notice>
          )}
          <div className={s.reviewHeader}>
            <span className={s.iconCircle}>
              <ClipboardCheck size={26} />
            </span>
            <div>
              <strong>{t("Hasil #")}{shortId(result.id)}</strong>
              <p>
                {t("Diamati")}{" "}{t(dateLabel(result.observedAt, true, intlLocale))} {" "}{t("· dikirim")}{" "}
                {t(dateLabel(result.createdAt, true, intlLocale))}
              </p>
            </div>
            <span
              className={`${s.badge} ${result.status === "approved" ? s.green : result.status === "rejected" ? s.red : s.amber}`}
            >
              {t(resultLabels[result.status])}
            </span>
          </div>
          <div className={s.detailLayout}>
            <div className={s.formStack}>
              <section className={s.card}>
                <div className={s.sectionHeading}>
                  <h2>{t("Bukti sebelum & sesudah")}</h2>
                  <span className={s.badge}>
                    {result.claimedOutcome === "complete"
                      ? t("Klaim: selesai")
                      : t("Klaim: sebagian")}
                  </span>
                </div>
                <div className={s.evidenceGrid}>
                  {[
                    { label: t("Sebelum kegiatan"), ids: result.beforeMediaIds },
                    { label: t("Sesudah kegiatan"), ids: result.afterMediaIds },
                  ].map((group) => (
                    <section key={group.label}>
                      <h3>{group.label}</h3>
                      <div className={s.photoStack}>
                        {group.ids.map((id) => (
                          <article className={s.photoCard} key={id}>
                            <ResultPhoto result={result} mediaId={id} />
                            {result.status === "submitted" && (
                              <button
                                className={s.secondary}
                                onClick={() => setPhoto(id)}
                              >
                                <Eye size={17} /> {" "}{t("Versi publik & izin")}</button>
                            )}
                            {approvals.some((x) => x.mediaId === id) && (
                              <small className={s.approvalLabel}>
                                <Check size={15} /> {" "}{t("Versi dipilih ·")}{" "}
                                {approvals
                                  .find((x) => x.mediaId === id)
                                  ?.channels.join(", ")}
                              </small>
                            )}
                          </article>
                        ))}
                      </div>
                      {group.label === "Sebelum kegiatan" &&
                        result.beforePublicEvidenceIds.length > 0 && (
                          <Notice>
                            {result.beforePublicEvidenceIds.length} {" "}{t("bukti publik laporan sebelumnya juga digunakan sebagai bukti sebelum kegiatan.")}</Notice>
                        )}
                    </section>
                  ))}
                </div>
                <Notice>
                  {t("Foto asli hanya untuk peninjauan. Untuk publikasi, pilih versi publik yang siap. SAP memeriksa izin pemilik pada setiap kanal saat keputusan disimpan.")}</Notice>
              </section>
              <section className={s.card}>
                <h2>{t("Catatan hasil kegiatan")}</h2>
                <p className={s.preserve}>{result.description}</p>
                {result.requestedEvidence.length > 0 && (
                  <>
                    <h3>{t("Bukti tambahan yang diminta")}</h3>
                    <ul>
                      {result.requestedEvidence.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
                {result.decisionReason && (
                  <>
                    <h3>{t("Alasan keputusan terakhir")}</h3>
                    <p>{result.decisionReason}</p>
                  </>
                )}
                {["submitted", "needs_evidence"].includes(result.status) &&
                  ["in_progress", "awaiting_result"].includes(
                    activity.status,
                  ) && (
                    <button className={s.secondary} onClick={onEdit}>
                      {t("Lengkapi / perbaiki hasil")}</button>
                  )}
              </section>
              <section className={s.card}>
                <h2>{t("Berat sampah")}</h2>
                {result.measurement ? (
                  <>
                    <div className={s.measurement}>
                      <strong>
                        {result.measurement.valueKg}
                        <span> kg</span>
                      </strong>
                      <span
                        className={`${s.badge} ${result.measurement.status === "verified" ? s.green : s.amber}`}
                      >
                        {t(measurementLabels[result.measurement.status])}
                      </span>
                    </div>
                    <dl className={s.facts}>
                      <div>
                        <dt>{t("Tahap")}</dt>
                        <dd>{t(stageLabels[result.measurement.stage])}</dd>
                      </div>
                      <div>
                        <dt>{t("Metode")}</dt>
                        <dd>{t("Timbangan")}</dd>
                      </div>
                      <div>
                        <dt>{t("Waktu penimbangan")}</dt>
                        <dd>
                          {t(dateLabel(result.measurement.measuredAt, true, intlLocale))}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Referensi")}</dt>
                        <dd>{result.measurement.sourceReference}</dd>
                      </div>
                    </dl>
                    {result.measurement.status === "pending_review" && (
                      <button
                        className={s.secondary}
                        onClick={() => setMeasurementOpen(true)}
                      >
                        <ShieldCheck size={18} /> {" "}{t("Tinjau pengukuran berat")}</button>
                    )}
                    <p className={s.hint}>
                      {t("Persetujuan hasil kegiatan tidak otomatis memverifikasi berat sampah.")}</p>
                  </>
                ) : (
                  <p>
                    {t("Koordinator tidak mengirim pengukuran berat. Nilai berat tidak diasumsikan nol.")}</p>
                )}
              </section>
            </div>
            <aside className={s.sideStack}>
              <section className={`${s.card} ${s.softCard}`}>
                <h2>{t("Tinjauan pendamping")}</h2>
                {result.latestReview?.status === "completed" &&
                result.latestReview.result ? (
                  <>
                    <span className={s.badge}>
                      {t(reviewLabels[result.latestReview.result.recommendation])}
                    </span>
                    <p className={s.hint}>
                      {t("Rekomendasi membantu pemeriksaan. Keputusan tetap dibuat oleh admin.")}</p>
                    {result.latestReview.result.missingEvidence.length > 0 && (
                      <ul>
                        {result.latestReview.result.missingEvidence.map(
                          (x, i) => (
                            <li key={i}>{x}</li>
                          ),
                        )}
                      </ul>
                    )}
                    {result.latestReview.result.publicationWarnings.length >
                      0 && (
                      <Notice>
                        {result.latestReview.result.publicationWarnings.join(
                          " ",
                        )}
                      </Notice>
                    )}
                    {result.latestReview.result.publicSummaryProposal && (
                      <button
                        className={s.secondary}
                        disabled={result.status !== "submitted"}
                        onClick={() =>
                          setSummary(
                            result.latestReview!.result!.publicSummaryProposal!,
                          )
                        }
                      >
                        {t("Gunakan usulan ringkasan")}</button>
                    )}
                  </>
                ) : (
                  <p>
                    {result.latestReview?.status === "queued" ||
                    result.latestReview?.status === "running"
                      ? t("Analisis pendamping sedang diproses. Tinjauan manual tetap tersedia.")
                      : t("Tinjauan manual tersedia. Belum ada rekomendasi pendamping yang dapat digunakan.")}
                  </p>
                )}
              </section>
              <section className={s.card}>
                <h2>{t("Keputusan admin")}</h2>
                {result.status !== "submitted" ? (
                  <>
                    <Notice>
                      {result.status === "needs_evidence"
                        ? t("Menunggu hasil diperbaiki dan dikirim kembali sebelum keputusan berikutnya.")
                        : t("Hasil ini telah diputuskan.")}
                    </Notice>
                    {result.publicSummary && <p>{result.publicSummary}</p>}
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void decide();
                    }}
                  >
                    <label className={s.field}>
                      {t("Tindakan")}<select
                        value={action}
                        onChange={(e) =>
                          setAction(e.target.value as ResultDecision["action"])
                        }
                      >
                        <option value="approve">{t("Setujui hasil")}</option>
                        <option value="request_evidence">
                          {t("Minta bukti tambahan")}</option>
                        <option value="reject">{t("Tolak hasil")}</option>
                      </select>
                    </label>
                    {action === "approve" ? (
                      <>
                        <label className={s.field}>
                          {t("Hasil terverifikasi")}<select
                            value={outcome}
                            onChange={(e) =>
                              setOutcome(e.target.value as typeof outcome)
                            }
                          >
                            <option value="partial">
                              {t("Pembersihan sebagian")}</option>
                            <option value="complete">
                              {t("Pembersihan selesai")}</option>
                          </select>
                        </label>
                        <label className={s.field}>
                          {t("Ringkasan publik")}<textarea
                            rows={4}
                            required
                            minLength={1}
                            maxLength={500}
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            placeholder={t("Ringkasan yang aman dan jelas untuk publik.")}
                          />
                          <small>{summary.length}{t("/500 karakter")}</small>
                        </label>
                        <Notice>
                          {outcome === "complete"
                            ? t("Pilih bukti sesudah untuk web. Penutupan laporan sumber tetap memerlukan keputusan laporan yang terpisah.")
                            : t("Hasil sebagian dapat menutup kegiatan, sementara laporan sumber tetap terbuka.")}
                        </Notice>
                      </>
                    ) : (
                      action === "request_evidence" && (
                        <label className={s.field}>
                          {t("Bukti yang diminta")}<textarea
                            required
                            rows={4}
                            value={requested}
                            onChange={(e) => setRequested(e.target.value)}
                            placeholder={
                              "Foto sesudah dari sudut yang sama\nCatatan kondisi area yang tersisa"
                            }
                          />
                          <small>
                            {t("1–3 permintaan, satu per baris, maksimal 300 karakter per permintaan.")}</small>
                        </label>
                      )
                    )}
                    <label className={s.field}>
                      {t("Alasan keputusan")}<textarea
                        required
                        rows={4}
                        minLength={5}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t("Jelaskan pertimbangan keputusan Anda.")}
                      />
                      <small>{reason.length}{t("/1000 karakter")}</small>
                    </label>
                    <button
                      type="submit"
                      className={action === "reject" ? s.danger : s.primary}
                      disabled={
                        busy ||
                        conflict ||
                        reason.trim().length < 5 ||
                        (action === "approve" && !summary.trim())
                      }
                    >
                      <Check size={18} />
                      {busy ? t("Menyimpan…") : t("Simpan keputusan")}
                    </button>
                  </form>
                )}
              </section>
            </aside>
          </div>
          {photo && (
            <PublicVersion
              key={`${photo}-${epoch}`}
              result={result}
              mediaId={photo}
              selected={approvals.find((x) => x.mediaId === photo)}
              onClose={() => setPhoto(null)}
              onChoose={choosePhoto}
            />
          )}
          {measurementOpen && result.measurement && (
            <DialogShell
              title={t("Tinjau berat sampah")}
              subtitle={`${result.measurement.valueKg} kg · ${stageLabels[result.measurement.stage]}`}
              busy={busy}
              onClose={() => setMeasurementOpen(false)}
              footer={
                <div className={s.actions}>
                  <button
                    className={s.danger}
                    disabled={
                      busy || conflict || measureReason.trim().length < 5
                    }
                    onClick={() => void measurementDecision("reject")}
                  >
                    {t("Tolak pengukuran")}</button>
                  <button
                    className={s.primary}
                    disabled={
                      busy || conflict || measureReason.trim().length < 5
                    }
                    onClick={() => void measurementDecision("verify")}
                  >
                    {t("Verifikasi pengukuran")}</button>
                </div>
              }
            >
              <MeasurementEvidence result={result} />
              <label className={s.field}>
                {t("Alasan keputusan")}<textarea
                  rows={4}
                  minLength={5}
                  maxLength={1000}
                  value={measureReason}
                  onChange={(e) => setMeasureReason(e.target.value)}
                />
              </label>
              {error && <Notice error>{t(error)}</Notice>}
            </DialogShell>
          )}
        </>
      )}
    </>
  );
}
const resultLabels = {
  submitted: "Menunggu tinjauan",
  needs_evidence: "Perlu bukti tambahan",
  approved: "Disetujui",
  rejected: "Ditolak",
};
const measurementLabels = {
  pending_review: "Belum diverifikasi",
  verified: "Terverifikasi",
  rejected: "Ditolak",
  superseded: "Digantikan pengukuran baru",
};
const stageLabels = {
  collected: "Dikumpulkan",
  handed_over: "Diserahkan",
  recycled: "Didaur ulang",
};
const reviewLabels = {
  recommend_accept: "Disarankan untuk disetujui",
  human_review: "Perlu pemeriksaan admin",
  recommend_reject: "Disarankan untuk ditolak",
  recommend_duplicate: "Kemungkinan duplikat",
};

function MeasurementEvidence({ result }: { result: AdminActivityResult }) {
  const { t } = useI18n();
  return (
    <>
      <p>
        {t("Periksa bukti timbangan, waktu, dan referensi sebelum memverifikasi berat.")}</p>
      <div className={s.measurePhotos}>
        {result.measurement?.evidenceMediaIds.map((id) => (
          <MeasurementPhoto
            key={id}
            measurement={result.measurement!}
            mediaId={id}
          />
        ))}
      </div>
    </>
  );
}

export function PublicVersion({
  result,
  mediaId,
  selected,
  onClose,
  onChoose,
  gateway,
}: {
  result: { id: string; revision: number; activityId?: string };
  mediaId: string;
  selected?: PublicationApproval;
  onClose: () => void;
  onChoose: (a: PublicationApproval) => void;
  gateway?: {
    photoUrl: (
      signal?: AbortSignal,
    ) => Promise<{ url: string; expiresAt: string }>;
    list: (
      cursor?: string,
      signal?: AbortSignal,
    ) => Promise<{ items: Rendition[]; nextCursor: string | null }>;
    create: (rects: Rendition["redactions"], key: string) => Promise<Rendition>;
  };
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<Rendition[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [renditionId, setRenditionId] = useState(selected?.renditionId || ""),
    [channels, setChannels] = useState<("web" | "instagram")[]>(
      selected?.channels || [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [url, setUrl] = useState(""),
    [checked, setChecked] = useState(false);
  const [urlExpiresAt, setUrlExpiresAt] = useState(""),
    [failedUrls, setFailedUrls] = useState<string[]>([]),
    [expiryEpoch, setExpiryEpoch] = useState(0);
  const [message, setMessage] = useState("");
  const [rects, setRects] = useState<Rendition["redactions"]>([]),
    [drag, setDrag] = useState<{
      x: number;
      y: number;
      endX: number;
      endY: number;
    } | null>(null);
  const [manualBox, setManualBox] = useState({
    x: "0",
    y: "0",
    width: "10",
    height: "10",
  });
  const key = useIntentKey();
  useEffect(() => {
    const c = new AbortController();
    void (
      gateway
        ? gateway.photoUrl(c.signal)
        : resultPhotoUrl(result.activityId!, result.id, mediaId, c.signal)
    )
      .then((p) => {
        if (!c.signal.aborted) {
          if (!(Date.parse(p.expiresAt) > Date.now())) {
            setUrl("");
            setError("Foto privat kedaluwarsa. Tutup panel lalu buka kembali.");
            return;
          }
          setUrl(p.url);
          setUrlExpiresAt(p.expiresAt);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    setBusy(true);
    void (
      gateway
        ? gateway.list(undefined, c.signal)
        : listResultRenditions(
            result as AdminActivityResult,
            mediaId,
            undefined,
            c.signal,
          )
    )
      .then((p) => {
        if (!c.signal.aborted) {
          setItems(p.items);
          setCursor(p.nextCursor);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [result, mediaId, gateway]);
  useEffect(() => {
    const remaining = [...items.map((r) => r.expiresAt), urlExpiresAt]
      .map((value) => Date.parse(value || "") - Date.now())
      .filter((wait) => wait > 0);
    if (!remaining.length) return;
    const timer = setTimeout(
      () => setExpiryEpoch((v) => v + 1),
      Math.min(...remaining, 2_147_000_000) + 1,
    );
    return () => clearTimeout(timer);
  }, [items, urlExpiresAt, expiryEpoch]);
  async function reload(more = false) {
    setBusy(true);
    setError("");
    try {
      const p = gateway
        ? await gateway.list(more ? cursor || undefined : undefined)
        : await listResultRenditions(
            result as AdminActivityResult,
            mediaId,
            more ? cursor || undefined : undefined,
          );
      setItems((old) => (more ? uniqueItems(old, p.items) : p.items));
      setCursor(p.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function point(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    };
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (busy || rects.length >= 20) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    setDrag({ ...p, endX: p.x, endY: p.y });
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const p = point(e);
    const rect = {
      x: Math.min(drag.x, p.x),
      y: Math.min(drag.y, p.y),
      width: Math.abs(p.x - drag.x),
      height: Math.abs(p.y - drag.y),
    };
    if (rect.width > 0.01 && rect.height > 0.01)
      setRects((old) => [...old, rect]);
    setDrag(null);
  }
  function addManualBox() {
    const r = Object.fromEntries(
      Object.entries(manualBox).map(([k, v]) => [k, Number(v) / 100]),
    ) as Rendition["redactions"][number];
    if (
      rects.length >= 20 ||
      Object.values(r).some((n) => !Number.isFinite(n)) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width <= 0 ||
      r.height <= 0 ||
      r.x + r.width > 1 ||
      r.y + r.height > 1
    ) {
      setError(
        "Area harus berada di dalam foto, dengan lebar dan tinggi lebih dari nol. Maksimal 20 area.",
      );
      return;
    }
    setRects((old) => [...old, r]);
    setError("");
  }
  async function prepare() {
    if (busy || !checked || !url || !(Date.parse(urlExpiresAt) > Date.now()))
      return;
    setBusy(true);
    setError("");
    try {
      const r = gateway
        ? await gateway.create(
            rects,
            key({
              result: result.id,
              revision: result.revision,
              mediaId,
              rects,
            }),
          )
        : await createResultRendition(
            result as AdminActivityResult,
            mediaId,
            rects,
            key({
              result: result.id,
              revision: result.revision,
              mediaId,
              rects,
            }),
          );
      setItems((old) => uniqueItems(old, [r]));
      setMessage(
        "Versi publik sedang diproses. Muat ulang versi untuk melihat hasilnya.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const usable = (r: Rendition) =>
    r.status === "ready" &&
    !!r.url &&
    Date.parse(r.expiresAt || "") > Date.now() &&
    !failedUrls.includes(r.url);
  const ready = items.find((x) => x.id === renditionId && usable(x));
  return (
    <DialogShell
      title={t("Versi foto untuk publik")}
      subtitle={t("Periksa privasi foto dan pilih kanal publikasi.")}
      busy={busy}
      wide
      onClose={onClose}
      footer={
        <div className={s.actions}>
          <button className={s.secondary} onClick={onClose} disabled={busy}>
            {t("Kembali")}</button>
          <button
            className={s.primary}
            disabled={busy || (!!channels.length && !ready)}
            onClick={() => {
              if (
                channels.length &&
                !items.some((r) => r.id === renditionId && usable(r))
              ) {
                setError(
                  "Versi publik belum siap atau kedaluwarsa. Muat ulang versi dan tinjau kembali.",
                );
                return;
              }
              onChoose({ mediaId, renditionId, channels });
            }}
          >
            {t("Simpan pilihan foto")}</button>
        </div>
      }
    >
      <Notice>
        {t("Izin pemilik diperlukan untuk setiap kanal. Panel ini menyiapkan versi publik; izin pemilik tetap diperiksa oleh SAP saat keputusan hasil disimpan.")}</Notice>
      {error && <Notice error>{t(error)}</Notice>}
      {message && <Notice>{t(message)}</Notice>}
      <h3>{t("1. Siapkan versi publik")}</h3>
      <p>
        {t("Seret pada foto untuk menutupi wajah, pelat nomor, atau informasi pribadi. Hingga 20 area dapat ditutup.")}</p>
      {url && Date.parse(urlExpiresAt) > Date.now() && (
        <div
          className={s.redactionCanvas}
          onPointerDown={down}
          onPointerMove={(e) => {
            if (drag) {
              const p = point(e);
              setDrag({ ...drag, endX: p.x, endY: p.y });
            }
          }}
          onPointerUp={up}
          onPointerCancel={() => setDrag(null)}
        >
          <img
            src={url}
            alt={t("Foto asli: seret untuk memilih area yang akan ditutupi")}
            draggable={false}
            onError={() => {
              setUrl("");
              setChecked(false);
              setError(
                "Foto privat belum dapat dimuat. Tutup panel lalu buka kembali.",
              );
            }}
          />
          {rects.map((r, i) => (
            <span
              className={s.redaction}
              key={i}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.width * 100}%`,
                height: `${r.height * 100}%`,
              }}
            />
          ))}
          {drag && (
            <span
              className={s.redaction}
              style={{
                left: `${Math.min(drag.x, drag.endX) * 100}%`,
                top: `${Math.min(drag.y, drag.endY) * 100}%`,
                width: `${Math.abs(drag.endX - drag.x) * 100}%`,
                height: `${Math.abs(drag.endY - drag.y) * 100}%`,
              }}
            />
          )}
        </div>
      )}
      <div className={s.actions}>
        <small>{rects.length} {" "}{t("area dipilih")}</small>
        <button
          className={s.secondary}
          disabled={!rects.length || busy}
          onClick={() => setRects((old) => old.slice(0, -1))}
        >
          <Trash2 size={16} /> {" "}{t("Hapus area terakhir")}</button>
      </div>
      <details className={s.manualRedaction}>
        <summary>{t("Pilih area dengan angka (opsional)")}</summary>
        <p className={s.hint}>
          {t("Posisi dan ukuran dihitung dalam persen terhadap foto.")}</p>
        <div className={s.fieldGrid}>
          {(
            [
              { key: "x", label: t("Posisi dari kiri (%)") },
              { key: "y", label: t("Posisi dari atas (%)") },
              { key: "width", label: t("Lebar area (%)") },
              { key: "height", label: t("Tinggi area (%)") },
            ] as const
          ).map((f) => (
            <label className={s.field} key={f.key}>
              {f.label}
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={manualBox[f.key]}
                onChange={(e) =>
                  setManualBox((old) => ({ ...old, [f.key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <button
          className={s.secondary}
          disabled={busy || rects.length >= 20}
          onClick={addManualBox}
        >
          {t("Tambah area penutup")}</button>
      </details>
      <label className={s.checkbox}>
        <input
          type="checkbox"
          checked={checked}
          disabled={busy || !url || !(Date.parse(urlExpiresAt) > Date.now())}
          onChange={(e) => setChecked(e.target.checked)}
        />
        {t("Saya sudah memeriksa foto dan area privasi yang perlu ditutupi.")}</label>
      <button
        className={s.secondary}
        disabled={
          busy || !checked || !url || !(Date.parse(urlExpiresAt) > Date.now())
        }
        onClick={() => void prepare()}
      >
        <Plus size={17} /> {" "}{t("Buat versi publik")}</button>
      <h3>{t("2. Pilih versi siap")}</h3>
      <button
        className={s.secondary}
        disabled={busy}
        onClick={() => void reload()}
      >
        <RefreshCw size={17} /> {" "}{t("Muat ulang versi")}</button>
      <div className={s.renditions}>
        {items.map((r) => (
          <label
            className={`${s.rendition} ${renditionId === r.id ? s.selectedRow : ""}`}
            key={r.id}
          >
            <input
              type="radio"
              name="rendition"
              value={r.id}
              checked={renditionId === r.id}
              disabled={!usable(r)}
              onChange={() => setRenditionId(r.id)}
            />
            {usable(r) && r.url ? (
              <img
                src={r.url}
                alt={t("Pratinjau versi publik")}
                onError={() => setFailedUrls((v) => [...v, r.url!])}
              />
            ) : (
              <span className={s.iconCircle}>
                <ShieldCheck size={25} />
              </span>
            )}
            <span>
              <strong>
                {r.status === "ready"
                  ? usable(r)
                    ? t("Siap dipilih")
                    : t("Foto kedaluwarsa atau belum dapat dimuat")
                  : r.status === "queued"
                    ? t("Sedang diproses")
                    : t("Gagal diproses")}
              </strong>
              <small>
                {r.redactions.length} {" "}{t("area ditutupi · #")}{shortId(r.id)}
              </small>
            </span>
          </label>
        ))}
      </div>
      {!items.length && !busy && (
        <p>{t("Belum ada versi publik. Siapkan versi terlebih dahulu.")}</p>
      )}
      {cursor && (
        <button
          className={s.secondary}
          onClick={() => void reload(true)}
          disabled={busy}
        >
          {t("Muat versi berikutnya")}</button>
      )}
      <h3>{t("3. Kanal publikasi")}</h3>
      {(["web", "instagram"] as const).map((c) => (
        <label className={s.checkbox} key={c}>
          <input
            type="checkbox"
            checked={channels.includes(c)}
            onChange={(e) =>
              setChannels((old) =>
                e.target.checked ? [...old, c] : old.filter((x) => x !== c),
              )
            }
          />
          {c === "web" ? t("Web SAP") : "Instagram SAP"}
        </label>
      ))}
      <p className={s.hint}>
        {t("Kosongkan kanal untuk tidak menggunakan foto ini dalam publikasi.")}</p>
    </DialogShell>
  );
}
