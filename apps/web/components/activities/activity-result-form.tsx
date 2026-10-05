"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Save, Trash2, Upload } from "lucide-react";
import {
  getActivityResult as defaultGetActivityResult,
  submitActivityResult as defaultSubmitActivityResult,
  uploadActivityPhoto as defaultUploadActivityPhoto,
  type Activity,
  type ActivityResult,
  type Measurement,
  type ResultInput,
} from "../../lib/api/activities";
import {
  errorMessage,
  fromLocalDate,
  isConflict,
  localDate,
} from "./activity-utils";
import { Busy, Notice, PageHead, useIntentKey } from "./activity-ui";
import { MeasurementPhoto, ResultPhoto } from "./activity-photo";
import s from "./activities.module.css";
import { getConsents, setConsents } from "../../lib/api/community";
import { useI18n } from "../../lib/i18n/provider";


type Slot = { id?: string; file?: File; channels?: ("web" | "instagram")[] };
export default function ActivityResultForm({
  activity,
  resultId,
  onBack,
  onSaved,
  gateway,
  kicker,
}: {
  activity: Activity;
  resultId?: string;
  onBack: () => void;
  onChanged: (a: Activity) => void;
  onSaved: (r: ActivityResult) => void;
  gateway?: {
    getActivityResult: (
      id: string,
      signal?: AbortSignal,
    ) => Promise<ActivityResult>;
    submitActivityResult: typeof defaultSubmitActivityResult;
    uploadActivityPhoto: typeof defaultUploadActivityPhoto;
  };
  kicker?: string;
}) {
  const { t } = useI18n();
  const { getActivityResult, submitActivityResult, uploadActivityPhoto } =
    gateway ?? {
      getActivityResult: defaultGetActivityResult,
      submitActivityResult: defaultSubmitActivityResult,
      uploadActivityPhoto: defaultUploadActivityPhoto,
    };
  const [previous, setPrevious] = useState<ActivityResult | undefined>(),
    [observed, setObserved] = useState(""),
    [description, setDescription] = useState(""),
    [outcome, setOutcome] = useState<"partial" | "complete">("partial");
  const [before, setBefore] = useState<Slot[]>([]),
    [after, setAfter] = useState<Slot[]>([]),
    [publicBefore, setPublicBefore] = useState<string[]>([]),
    [evidence, setEvidence] = useState<Slot[]>([]);
  const [measure, setMeasure] = useState(false),
    [weight, setWeight] = useState(""),
    [stage, setStage] = useState<"collected" | "handed_over" | "recycled">(
      "collected",
    ),
    [measured, setMeasured] = useState(""),
    [reference, setReference] = useState(""),
    [batch, setBatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!resultId),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const uploaded = useRef(new Map<File, string>()),
    intentKey = useIntentKey();
  const [latestResult, setLatestResult] = useState<ActivityResult | null>(null);
  useEffect(() => {
    if (!resultId) {
      setObserved(localDate(new Date().toISOString()));
      return;
    }
    const c = new AbortController();
    setLoading(true);
    setPrevious(undefined);
    void getActivityResult(resultId, c.signal)
      .then((r) => {
        if (c.signal.aborted) return;
        if (r.activityId !== activity.id || r.reportId !== activity.reportId)
          throw new Error(
            "Hasil ini tidak terhubung dengan kegiatan yang dipilih.",
          );
        setPrevious(r);
        setObserved(localDate(r.observedAt));
        setDescription(r.description);
        setOutcome(r.claimedOutcome);
        setBefore(r.beforeMediaIds.map((id) => ({ id })));
        setAfter(r.afterMediaIds.map((id) => ({ id })));
        setPublicBefore(r.beforePublicEvidenceIds);
        if (r.measurement) {
          setMeasure(true);
          setWeight(String(r.measurement.valueKg));
          setStage(r.measurement.stage);
          setMeasured(localDate(r.measurement.measuredAt));
          setReference(r.measurement.sourceReference);
          setBatch(r.measurement.physicalBatchId);
          setEvidence(r.measurement.evidenceMediaIds.map((id) => ({ id })));
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [resultId, activity.id, activity.reportId, getActivityResult]);
  async function mediaIds(slots: Slot[]) {
    const ids: string[] = [];
    for (const slot of slots) {
      if (slot.id) {
        ids.push(slot.id);
        continue;
      }
      if (!slot.file) continue;
      let id = uploaded.current.get(slot.file);
      if (!id) {
        id = (await uploadActivityPhoto(slot.file)).id;
        uploaded.current.set(slot.file, id);
      }
      if (gateway && slot.channels) {
        const consent = await getConsents(id);
        if (
          JSON.stringify([...consent.channels].sort()) !==
          JSON.stringify([...slot.channels].sort())
        ) {
          await setConsents(id, consent.revision, slot.channels);
        }
      }
      ids.push(id);
    }
    return ids;
  }
  function add(
    files: FileList | null,
    slots: Slot[],
    set: (s: Slot[]) => void,
    max = 3,
  ) {
    if (!files) return;
    const next = Array.from(files);
    if (slots.length + next.length > max) {
      setError(t("Tambahkan maksimal {0} foto pada bagian ini.", { "0": max }));
      return;
    }
    if (
      next.some(
        (f) =>
          f.size > 10 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(f.type),
      )
    ) {
      setError("Gunakan JPEG, PNG, atau WebP hingga 10 MB per foto.");
      return;
    }
    setError("");
    set([
      ...slots,
      ...next.map((file) => ({
        file,
        ...(gateway ? { channels: [] as ("web" | "instagram")[] } : {}),
      })),
    ]);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || conflict || !editable || (resultId && !previous)) return;
    setError("");
    if (
      (!before.length && !publicBefore.length) ||
      !after.length ||
      before.length + publicBefore.length > 3
    ) {
      setError("Lampirkan 1–3 bukti sebelum dan 1–3 foto sesudah kegiatan.");
      return;
    }
    const observedAt = fromLocalDate(observed);
    if (
      !observedAt ||
      Date.parse(observedAt) > Date.now() ||
      (activity.startsAt &&
        Date.parse(observedAt) < Date.parse(activity.startsAt))
    ) {
      setError(
        "Waktu pengamatan harus sejak kegiatan dimulai dan tidak boleh di masa depan.",
      );
      return;
    }
    if (description.trim().length < 20) {
      setError("Catatan hasil minimal 20 karakter.");
      return;
    }
    const measuredAt = measure ? fromLocalDate(measured) : null;
    if (
      measure &&
      (!evidence.length ||
        !measuredAt ||
        Date.parse(measuredAt) > Date.now() ||
        (activity.startsAt &&
          Date.parse(measuredAt) < Date.parse(activity.startsAt)))
    ) {
      setError(
        "Pengukuran memerlukan bukti timbangan dan waktu sejak kegiatan dimulai hingga saat ini.",
      );
      return;
    }
    setBusy(true);
    try {
      const beforeIds = await mediaIds(before),
        afterIds = await mediaIds(after);
      if (beforeIds.some((id) => afterIds.includes(id)))
        throw new Error(
          "Bukti sebelum dan sesudah harus berupa foto yang berbeda.",
        );
      const body: ResultInput = {
        observedAt,
        description: description.trim(),
        claimedOutcome: outcome,
        beforeMediaIds: beforeIds,
        beforePublicEvidenceIds: publicBefore,
        afterMediaIds: afterIds,
        measurement: measure
          ? {
              physicalBatchId: batch,
              stage,
              valueKg: Number(weight),
              measuredAt: measuredAt!,
              method: "scale",
              sourceReference: reference.trim(),
              evidenceMediaIds: await mediaIds(evidence),
            }
          : null,
      };
      onSaved(
        await submitActivityResult(
          activity,
          body,
          intentKey({ id: activity.id, revision: previous?.revision, ...body }),
          previous,
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
      setConflict(isConflict(e));
    } finally {
      setBusy(false);
    }
  }
  async function latest() {
    if (!resultId) return;
    setBusy(true);
    try {
      const latestResult = await getActivityResult(resultId);
      if (
        latestResult.activityId !== activity.id ||
        latestResult.reportId !== activity.reportId
      )
        throw new Error(
          "Hasil ini tidak terhubung dengan kegiatan yang dipilih.",
        );
      setLatestResult(latestResult);
      setError(
        "Versi terbaru dimuat. Input dipertahankan; periksa bukti dan catatan sebelum mengirim ulang.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const editable =
    ["in_progress", "awaiting_result"].includes(activity.status) &&
    (!resultId ||
      (!!previous &&
        ["submitted", "needs_evidence"].includes(previous.status)));
  return (
    <>
      <PageHead
        kicker={kicker}
        title={resultId ? t("Lengkapi hasil kegiatan") : t("Kirim hasil kegiatan")}
        subtitle={activity.title}
        onBack={onBack}
      />
      {loading ? (
        <Busy />
      ) : (
        <form className={s.formLayout} onSubmit={(e) => void submit(e)}>
          <div className={s.formStack}>
            <section className={s.card}>
              <h2>{t("Bukti kegiatan")}</h2>
              <p className={s.hint}>
                {t("Foto diunggah saat Anda mengirim hasil. Foto asli digunakan untuk pemeriksaan dan tidak langsung dipublikasikan.")}</p>
              <div className={s.evidenceGrid}>
                <PhotoInput
                  real={!!gateway}
                  label={t("Sebelum kegiatan")}
                  slots={before}
                  onConsent={
                    gateway
                      ? (i, channels) =>
                          setBefore((old) =>
                            old.map((slot, j) =>
                              i === j ? { ...slot, channels } : slot,
                            ),
                          )
                      : undefined
                  }
                  previous={previous}
                  onRemove={(i) =>
                    setBefore((old) => old.filter((_, x) => x !== i))
                  }
                  onAdd={(files) =>
                    add(files, before, setBefore, 3 - publicBefore.length)
                  }
                  disabled={busy || !editable}
                />{" "}
                <PhotoInput
                  real={!!gateway}
                  label={t("Sesudah kegiatan")}
                  slots={after}
                  onConsent={
                    gateway
                      ? (i, channels) =>
                          setAfter((old) =>
                            old.map((slot, j) =>
                              i === j ? { ...slot, channels } : slot,
                            ),
                          )
                      : undefined
                  }
                  previous={previous}
                  onRemove={(i) =>
                    setAfter((old) => old.filter((_, x) => x !== i))
                  }
                  onAdd={(files) => add(files, after, setAfter)}
                  disabled={busy || !editable}
                />
              </div>
              {publicBefore.length > 0 && (
                <Notice>
                  {publicBefore.length} {" "}{t("bukti publik sebelumnya tetap disertakan sebagai bukti sebelum.")}</Notice>
              )}
            </section>
            <section className={s.card}>
              <h2>{t("Hasil yang diamati")}</h2>
              <label className={s.field}>
                {t("Waktu pengamatan")}<input
                  disabled={busy || !editable}
                  type="datetime-local"
                  required
                  min={
                    activity.startsAt ? localDate(activity.startsAt) : undefined
                  }
                  max={localDate(new Date().toISOString())}
                  value={observed}
                  onChange={(e) => setObserved(e.target.value)}
                />
                <small>{t("Menggunakan WIB, tidak boleh di masa depan.")}</small>
              </label>
              <label className={s.field}>
                {t("Kondisi sesudah kegiatan")}<select
                  disabled={busy || !editable}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                >
                  <option value="partial">{t("Area dibersihkan sebagian")}</option>
                  <option value="complete">{t("Pembersihan selesai")}</option>
                </select>
              </label>
              <label className={s.field}>
                {t("Catatan hasil")}<textarea
                  disabled={busy || !editable}
                  required
                  rows={6}
                  minLength={20}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("Jelaskan pekerjaan yang dilakukan, kondisi sesudah, dan area yang masih perlu ditangani.")}
                />
                <small>{description.length}{t("/2000 karakter")}</small>
              </label>
            </section>
            <section className={s.card}>
              <h2>{t("Pengukuran berat (opsional)")}</h2>
              <label className={s.checkbox}>
                <input
                  disabled={busy || !editable}
                  type="checkbox"
                  checked={measure}
                  onChange={(e) => setMeasure(e.target.checked)}
                />
                {t("Saya memiliki hasil penimbangan dan bukti timbangan.")}</label>
              {measure && (
                <>
                  <div className={s.fieldGrid}>
                    <label className={s.field}>
                      {t("Berat sampah (kg)")}<input
                        disabled={busy || !editable}
                        type="number"
                        min={0}
                        max={100000}
                        step={0.001}
                        required
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                      />
                    </label>
                    <label className={s.field}>
                      {t("Tahap pengukuran")}<select
                        disabled={busy || !editable}
                        value={stage}
                        onChange={(e) =>
                          setStage(e.target.value as typeof stage)
                        }
                      >
                        <option value="collected">{t("Dikumpulkan")}</option>
                        <option value="handed_over">{t("Diserahkan")}</option>
                        <option value="recycled">{t("Didaur ulang")}</option>
                      </select>
                    </label>
                    <label className={s.field}>
                      {t("Waktu penimbangan")}<input
                        disabled={busy || !editable}
                        type="datetime-local"
                        required
                        min={
                          activity.startsAt
                            ? localDate(activity.startsAt)
                            : undefined
                        }
                        max={localDate(new Date().toISOString())}
                        value={measured}
                        onChange={(e) => setMeasured(e.target.value)}
                      />
                    </label>
                    <label className={s.field}>
                      {t("Referensi penimbangan")}<input
                        disabled={busy || !editable}
                        required
                        minLength={1}
                        maxLength={150}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={t("Contoh: catatan timbangan posko")}
                      />
                    </label>
                  </div>
                  <PhotoInput
                    real={!!gateway}
                    label={t("Bukti timbangan")}
                    measurement={previous?.measurement ?? undefined}
                    slots={evidence}
                    onRemove={(i) =>
                      setEvidence((old) => old.filter((_, x) => x !== i))
                    }
                    onAdd={(files) => add(files, evidence, setEvidence)}
                    disabled={busy || !editable}
                  />
                </>
              )}
            </section>
          </div>
          <aside className={s.sideStack}>
            <section className={`${s.card} ${s.softCard}`}>
              <Camera size={29} />
              <h2>{t("Bukti yang jelas")}</h2>
              <ul className={s.checklist}>
                <li>
                  {t("Ambil foto sebelum dan sesudah dari sudut yang sebanding.")}</li>
                <li>{t("Gunakan cahaya yang cukup dan foto yang tidak buram.")}</li>
                <li>{t("Catat pekerjaan yang tersisa secara jujur.")}</li>
                <li>{t("Berat perlu ditinjau secara terpisah oleh admin.")}</li>
              </ul>
              <Notice>
                {t("Hasil kegiatan akan ditinjau sebelum dipublikasikan.")}</Notice>
            </section>
          </aside>
          <footer className={s.formFooter}>
            {error && <Notice error>{t(error)}</Notice>}
            {conflict && (
              <button
                className={s.secondary}
                type="button"
                onClick={() => void latest()}
                disabled={busy}
              >
                {t("Muat versi terbaru")}</button>
            )}
            {latestResult && (
              <Notice>
                <strong>{t("Versi terbaru · revisi")}{" "}{latestResult.revision}</strong>
                <p>{latestResult.description}</p>
                <p>
                  {t("Status:")}{" "}{latestResult.status} {" "}{t("· pengamatan:")}{" "}
                  {localDate(latestResult.observedAt)} WIB
                </p>
                <p>{latestResult.requestedEvidence.join("; ")}</p>
                <button
                  type="button"
                  className={s.secondary}
                  disabled={busy}
                  onClick={() => {
                    setPrevious(latestResult);
                    setLatestResult(null);
                    setConflict(false);
                    setError("");
                  }}
                >
                  {t("Saya sudah meninjau, pertahankan input saya")}</button>
              </Notice>
            )}
            {!editable && (
              <Notice>
                {t("Tidak dapat mengirim hasil pada status kegiatan atau hasil saat ini.")}</Notice>
            )}
            <div>
              <p>{t("JPEG, PNG, WebP · maksimal 10 MB per foto")}</p>
              <div className={s.actions}>
                <button
                  className={s.secondary}
                  type="button"
                  onClick={onBack}
                  disabled={busy}
                >
                  {t("Kembali")}</button>
                <button
                  className={s.primary}
                  type="submit"
                  disabled={
                    busy ||
                    conflict ||
                    !editable ||
                    (resultId != null && !previous)
                  }
                >
                  <Save size={18} />
                  {busy ? t("Mengunggah & mengirim…") : t("Kirim untuk ditinjau")}
                </button>
              </div>
            </div>
          </footer>
        </form>
      )}
    </>
  );
}
function PhotoInput({
  label,
  slots,
  previous,
  measurement,
  onAdd,
  onRemove,
  disabled,
  real = false,
  onConsent,
}: {
  label: string;
  slots: Slot[];
  previous?: ActivityResult;
  measurement?: Measurement;
  onAdd: (files: FileList | null) => void;
  onRemove: (i: number) => void;
  disabled: boolean;
  real?: boolean;
  onConsent?: (i: number, channels: ("web" | "instagram")[]) => void;
}) {
  const { t } = useI18n();
  return (
    <section className={s.photoInput}>
      <h3>{t(label)}</h3>
      <div className={s.photoStack}>
        {slots.map((slot, i) => (
          <div
            className={s.photoCard}
            key={slot.id || `${slot.file?.name}-${i}`}
          >
            {slot.file ? (
              <LocalPreview file={slot.file} />
            ) : measurement && slot.id ? (
              <MeasurementPhoto
                measurement={measurement}
                mediaId={slot.id}
                real={real}
              />
            ) : previous && slot.id ? (
              <ResultPhoto result={previous} mediaId={slot.id} real={real} />
            ) : (
              <div className={s.uploadedPlaceholder}>
                <Camera size={25} />
                <span>{t("Bukti tersimpan")}</span>
              </div>
            )}
            <div className={s.photoCaption}>
              <small>{slot.file?.name || t("Bukti {0}", { "0": i + 1 })}</small>
              <button
                type="button"
                className={s.iconButton}
                onClick={() => onRemove(i)}
                disabled={disabled}
                aria-label={t("Hapus {0} {1}", { "0": label.toLowerCase(), "1": i + 1 })}
              >
                <Trash2 size={17} />
              </button>
            </div>
            {slot.file && onConsent && (
              <div className={s.field}>
                {(["web", "instagram"] as const).map((channel) => (
                  <label key={channel} className={s.checkbox}>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={slot.channels?.includes(channel) ?? false}
                      onChange={(event) =>
                        onConsent(
                          i,
                          event.target.checked
                            ? [...(slot.channels ?? []), channel]
                            : (slot.channels ?? []).filter(
                                (c) => c !== channel,
                              ),
                        )
                      }
                    />
                    {t("Izinkan foto ini untuk")}{" "}
                    {channel === "web" ? t("halaman publik SAP") : "Instagram SAP"}{" "}
                    {t("setelah ditinjau.")}</label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <label className={`${s.uploadButton} ${disabled ? s.disabled : ""}`}>
        <Upload size={20} />
        <span>{t("Tambah foto")}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled}
          onChange={(e) => {
            onAdd(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <small>{t("1–3 foto · JPEG, PNG, WebP")}</small>
    </section>
  );
}
function LocalPreview({ file }: { file: File }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  useEffect(() => {
    const source = URL.createObjectURL(file);
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [file]);
  return url ? (
    <img className={s.localPreview} src={url} alt={t("Pratinjau {0}", { "0": file.name })} />
  ) : null;
}
