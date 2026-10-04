"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Save, Trash2, Upload } from "lucide-react";
import {
  getActivityResult,
  submitActivityResult,
  uploadActivityPhoto,
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

type Slot = { id?: string; file?: File };
export default function ActivityResultForm({
  activity,
  resultId,
  onBack,
  onSaved,
}: {
  activity: Activity;
  resultId?: string;
  onBack: () => void;
  onChanged: (a: Activity) => void;
  onSaved: (r: ActivityResult) => void;
}) {
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
  }, [resultId, activity.id, activity.reportId]);
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
      setError(`Tambahkan maksimal ${max} foto pada bagian ini.`);
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
    set([...slots, ...next.map((file) => ({ file }))]);
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
      setPrevious(latestResult);
      setConflict(false);
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
        title={resultId ? "Lengkapi hasil kegiatan" : "Kirim hasil kegiatan"}
        subtitle={activity.title}
        onBack={onBack}
      />
      {loading ? (
        <Busy />
      ) : (
        <form className={s.formLayout} onSubmit={(e) => void submit(e)}>
          <div className={s.formStack}>
            <section className={s.card}>
              <h2>Bukti kegiatan</h2>
              <p className={s.hint}>
                Foto diunggah saat Anda mengirim hasil. Foto asli digunakan
                untuk pemeriksaan dan tidak langsung dipublikasikan.
              </p>
              <div className={s.evidenceGrid}>
                <PhotoInput
                  label="Sebelum kegiatan"
                  slots={before}
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
                  label="Sesudah kegiatan"
                  slots={after}
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
                  {publicBefore.length} bukti publik sebelumnya tetap disertakan
                  sebagai bukti sebelum.
                </Notice>
              )}
            </section>
            <section className={s.card}>
              <h2>Hasil yang diamati</h2>
              <label className={s.field}>
                Waktu pengamatan
                <input
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
                <small>Menggunakan WIB, tidak boleh di masa depan.</small>
              </label>
              <label className={s.field}>
                Kondisi sesudah kegiatan
                <select
                  disabled={busy || !editable}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                >
                  <option value="partial">Area dibersihkan sebagian</option>
                  <option value="complete">Pembersihan selesai</option>
                </select>
              </label>
              <label className={s.field}>
                Catatan hasil
                <textarea
                  disabled={busy || !editable}
                  required
                  rows={6}
                  minLength={20}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan pekerjaan yang dilakukan, kondisi sesudah, dan area yang masih perlu ditangani."
                />
                <small>{description.length}/2000 karakter</small>
              </label>
            </section>
            <section className={s.card}>
              <h2>Pengukuran berat (opsional)</h2>
              <label className={s.checkbox}>
                <input
                  disabled={busy || !editable}
                  type="checkbox"
                  checked={measure}
                  onChange={(e) => setMeasure(e.target.checked)}
                />
                Saya memiliki hasil penimbangan dan bukti timbangan.
              </label>
              {measure && (
                <>
                  <div className={s.fieldGrid}>
                    <label className={s.field}>
                      Berat sampah (kg)
                      <input
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
                      Tahap pengukuran
                      <select
                        disabled={busy || !editable}
                        value={stage}
                        onChange={(e) =>
                          setStage(e.target.value as typeof stage)
                        }
                      >
                        <option value="collected">Dikumpulkan</option>
                        <option value="handed_over">Diserahkan</option>
                        <option value="recycled">Didaur ulang</option>
                      </select>
                    </label>
                    <label className={s.field}>
                      Waktu penimbangan
                      <input
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
                      Referensi penimbangan
                      <input
                        disabled={busy || !editable}
                        required
                        minLength={1}
                        maxLength={150}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Contoh: catatan timbangan posko"
                      />
                    </label>
                  </div>
                  <PhotoInput
                    label="Bukti timbangan"
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
              <h2>Bukti yang jelas</h2>
              <ul className={s.checklist}>
                <li>
                  Ambil foto sebelum dan sesudah dari sudut yang sebanding.
                </li>
                <li>Gunakan cahaya yang cukup dan foto yang tidak buram.</li>
                <li>Catat pekerjaan yang tersisa secara jujur.</li>
                <li>Berat perlu ditinjau secara terpisah oleh admin.</li>
              </ul>
              <Notice>
                Hasil kegiatan akan ditinjau sebelum dipublikasikan.
              </Notice>
            </section>
          </aside>
          <footer className={s.formFooter}>
            {error && <Notice error>{error}</Notice>}
            {conflict && (
              <button
                className={s.secondary}
                type="button"
                onClick={() => void latest()}
                disabled={busy}
              >
                Muat versi terbaru
              </button>
            )}
            {!editable && (
              <Notice>
                Tidak dapat mengirim hasil pada status kegiatan atau hasil saat
                ini.
              </Notice>
            )}
            <div>
              <p>JPEG, PNG, WebP · maksimal 10 MB per foto</p>
              <div className={s.actions}>
                <button
                  className={s.secondary}
                  type="button"
                  onClick={onBack}
                  disabled={busy}
                >
                  Kembali
                </button>
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
                  {busy ? "Mengunggah & mengirim…" : "Kirim untuk ditinjau"}
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
}: {
  label: string;
  slots: Slot[];
  previous?: ActivityResult;
  measurement?: Measurement;
  onAdd: (files: FileList | null) => void;
  onRemove: (i: number) => void;
  disabled: boolean;
}) {
  return (
    <section className={s.photoInput}>
      <h3>{label}</h3>
      <div className={s.photoStack}>
        {slots.map((slot, i) => (
          <div
            className={s.photoCard}
            key={slot.id || `${slot.file?.name}-${i}`}
          >
            {slot.file ? (
              <LocalPreview file={slot.file} />
            ) : measurement && slot.id ? (
              <MeasurementPhoto measurement={measurement} mediaId={slot.id} />
            ) : previous && slot.id ? (
              <ResultPhoto result={previous} mediaId={slot.id} />
            ) : (
              <div className={s.uploadedPlaceholder}>
                <Camera size={25} />
                <span>Bukti tersimpan</span>
              </div>
            )}
            <div className={s.photoCaption}>
              <small>{slot.file?.name || `Bukti ${i + 1}`}</small>
              <button
                type="button"
                className={s.iconButton}
                onClick={() => onRemove(i)}
                disabled={disabled}
                aria-label={`Hapus ${label.toLowerCase()} ${i + 1}`}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <label className={`${s.uploadButton} ${disabled ? s.disabled : ""}`}>
        <Upload size={20} />
        <span>Tambah foto</span>
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
      <small>1–3 foto · JPEG, PNG, WebP</small>
    </section>
  );
}
function LocalPreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const source = URL.createObjectURL(file);
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [file]);
  return url ? (
    <img className={s.localPreview} src={url} alt={`Pratinjau ${file.name}`} />
  ) : null;
}
