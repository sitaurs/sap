"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  getConsents,
  getUpdate,
  saveUpdate,
  setConsents,
  uploadEvidence,
} from "../../lib/api/community";
import { revisionConflict, type R1 } from "../../lib/api/r1";
import { useIntentKey } from "../activities/activity-ui";
import { Failure } from "./community-ui";
import s from "./community.module.css";
import { useI18n } from "../../lib/i18n/provider";

type Photo = {
  id?: string;
  file?: File;
  channels: R1["MediaConsents"]["channels"];
  consentLoaded?: boolean;
  draftChannels?: R1["MediaConsents"]["channels"];
};
function deviceDate(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
export default function ConditionForm({
  incidentId,
  previous,
  onSaved,
  onClose,
}: {
  incidentId: string;
  previous?: R1["CommunityUpdate"];
  onSaved: (update: R1["CommunityUpdate"]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<R1["CommunityUpdateInput"]["kind"]>(
      previous?.kind ?? "still_present",
    ),
    [description, setDescription] = useState(previous?.description ?? ""),
    [observed, setObserved] = useState(deviceDate(previous?.observedAt)),
    [correction, setCorrection] = useState<
      NonNullable<R1["CommunityUpdateInput"]["correctionField"]>
    >(previous?.correctionField ?? "other");
  const [photos, setPhotos] = useState<Photo[]>(
      (previous?.mediaIds ?? []).map((id) => ({ id, channels: [] })),
    ),
    [version, setVersion] = useState(previous),
    [latest, setLatest] = useState<R1["CommunityUpdate"] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState("");
  const uploaded = useRef(new Map<File, string>()),
    intent = useIntentKey();
  const [consentEpoch, setConsentEpoch] = useState(0);
  const pendingConsents = photos
    .filter((p) => p.id && !p.consentLoaded)
    .map((p) => p.id)
    .join(",");
  const storageKey = `sap-condition-draft:${previous?.id ?? incidentId}`;
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      const value = sessionStorage.getItem(storageKey);
      if (value) {
        const d = JSON.parse(value) as R1["CommunityUpdateInput"] & {
          schemaVersion?: number;
          revision?: number;
          photos?: { id: string; channels?: Photo["channels"] }[];
        };
        if (
          d.schemaVersion !== 2 ||
          typeof d.description !== "string" ||
          !Array.isArray(d.photos)
        )
          return;
        setKind(d.kind);
        setDescription(d.description);
        setObserved(d.observedAt);
        setCorrection(d.correctionField ?? "other");
        setPhotos(
          d.photos.map(({ id, channels }) => ({
            id,
            channels: channels ?? [],
            draftChannels: channels,
          })),
        );
        if (previous && d.revision !== previous.revision) {
          setVersion({
            ...previous,
            revision: d.revision ?? previous.revision,
          });
          setLatest(previous);
        }
      }
    } catch {
      /* A blocked browser store does not prevent form use. */
    } finally {
      setRestoredKey(storageKey);
    }
  }, [previous, storageKey]);
  useEffect(() => {
    // React Strict Mode replays effects. Wait until saved input has been read
    // before writing defaults, so replay cannot replace the user's draft.
    if (restoredKey !== storageKey) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          schemaVersion: 2,
          revision: version?.revision,
          kind,
          description,
          observedAt: observed,
          photos: photos.flatMap((p) =>
            p.id
              ? [
                  {
                    id: p.id,
                    channels: p.consentLoaded ? p.channels : p.draftChannels,
                  },
                ]
              : [],
          ),
          correctionField: correction,
        }),
      );
    } catch {
      /* No signed URL or file data is persisted. */
    }
  }, [
    storageKey,
    restoredKey,
    kind,
    description,
    observed,
    correction,
    photos,
    version?.revision,
  ]);
  useEffect(() => {
    const c = new AbortController();
    for (const id of pendingConsents.split(",").filter(Boolean))
      void getConsents(id, c.signal)
        .then((value) => {
          if (!c.signal.aborted) {
            setError(null);
            setPhotos((v) =>
              v.map((p) =>
                p.id === id && !p.consentLoaded
                  ? {
                      ...p,
                      channels: p.draftChannels ?? value.channels,
                      consentLoaded: true,
                    }
                  : p,
              ),
            );
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e);
        });
    return () => c.abort();
  }, [pendingConsents, consentEpoch]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || latest || pendingConsents) return;
    setBusy(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (const photo of photos) {
        let id = photo.id ?? (photo.file && uploaded.current.get(photo.file));
        if (!id && photo.file) {
          const media = await uploadEvidence(photo.file, "community");
          id = media.id;
          uploaded.current.set(photo.file, id);
          setPhotos((v) =>
            v.map((p) =>
              p.file === photo.file ? { ...p, id, consentLoaded: true } : p,
            ),
          );
        }
        if (!id) throw new Error("Pilih kembali foto bukti.");
        ids.push(id);
        const consent = await getConsents(id);
        if (
          JSON.stringify([...consent.channels].sort()) !==
          JSON.stringify([...photo.channels].sort())
        )
          await setConsents(id, consent.revision, photo.channels);
      }
      const body: R1["CommunityUpdateInput"] = {
        kind,
        description: description.trim(),
        observedAt: new Date(observed).toISOString(),
        mediaIds: ids,
        correctionField: kind === "information_wrong" ? correction : null,
      };
      const saved = await saveUpdate(
        incidentId,
        body,
        intent({ incidentId, body }),
        version,
      );
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      setMessage(
        "Pembaruan terkirim untuk ditinjau. Status kejadian menunggu keputusan moderator.",
      );
      onSaved(saved);
    } catch (e) {
      setError(e);
      if (revisionConflict(e) && version) {
        try {
          setLatest(await getUpdate(version.id));
        } catch (loadError) {
          setError(loadError);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files);
    if (photos.length + next.length > 3) {
      setError(new Error("Gunakan maksimal 3 foto."));
      return;
    }
    if (
      next.some(
        (f) =>
          !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
          f.size > 10 * 1024 * 1024,
      )
    ) {
      setError(new Error("Foto harus JPEG, PNG, atau WebP, maksimal 10 MB."));
      return;
    }
    setPhotos((v) => [
      ...v,
      ...next.map((file) => ({ file, channels: [] as Photo["channels"] })),
    ]);
  }
  return (
    <section className={s.card}>
      <h2>
        {previous ? t("Lengkapi pembaruan kondisi") : t("Bagikan kondisi terbaru")}
      </h2>
      {version?.requestedEvidence.length ? (
        <div className={s.notice}>
          <strong>{t("Bukti yang diminta moderator")}</strong>
          <ul>
            {version.requestedEvidence.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <form className={s.form} onSubmit={submit}>
        <label className={s.field}>
          {t("Kondisi yang diamati")}<select
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="still_present">{t("Sampah masih ada")}</option>
            <option value="reduced">{t("Sampah berkurang")}</option>
            <option value="looks_clean">{t("Terlihat bersih")}</option>
            <option value="information_wrong">
              {t("Informasi perlu diperbaiki")}</option>
          </select>
        </label>
        {kind === "information_wrong" && (
          <label className={s.field}>
            {t("Informasi yang perlu diperbaiki")}<select
              value={correction}
              onChange={(e) =>
                setCorrection(e.target.value as typeof correction)
              }
              disabled={busy}
            >
              {Object.entries({
                location: t("Lokasi"),
                category: t("Kategori"),
                time: t("Waktu"),
                photo: t("Foto"),
                other: t("Lainnya"),
              }).map(([id, text]) => (
                <option value={id} key={id}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={s.field}>
          {t("Waktu pengamatan (waktu perangkat)")}<input
            type="datetime-local"
            required
            value={observed}
            disabled={busy}
            onChange={(e) => setObserved(e.target.value)}
          />
        </label>
        <label className={s.field}>
          {t("Ceritakan kondisi yang Anda lihat")}<textarea
            minLength={10}
            maxLength={1000}
            rows={5}
            required
            value={description}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
          />
          <small className={s.muted}>{description.length}{t("/1.000 karakter")}</small>
        </label>
        <label className={`${s.field} ${s.file}`}>
          {t("Tambahkan bukti (0–3 foto)")}<input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {photos.map((photo, i) => (
          <div className={s.row} key={photo.id ?? i}>
            <strong>
              {t("Foto")}{" "}{i + 1}: {photo.file?.name ?? t("Bukti yang pernah diunggah")}
            </strong>
            {(["web", "instagram"] as const).map((channel) => (
              <label className={s.check} key={channel}>
                <input
                  type="checkbox"
                  checked={photo.channels.includes(channel)}
                  disabled={busy || (!!photo.id && !photo.consentLoaded)}
                  onChange={(e) =>
                    setPhotos((v) =>
                      v.map((p, j) =>
                        j === i
                          ? {
                              ...p,
                              channels: e.target.checked
                                ? [...p.channels, channel]
                                : p.channels.filter((c) => c !== channel),
                            }
                          : p,
                      ),
                    )
                  }
                />
                {t("Saya mengizinkan penggunaan foto ini di")}{" "}
                {channel === "web" ? t("halaman publik SAP") : "Instagram SAP"}{" "}
                {t("setelah ditinjau.")}</label>
            ))}
            <button
              className={s.secondary}
              type="button"
              disabled={busy}
              onClick={() => setPhotos((v) => v.filter((_, j) => j !== i))}
            >
              {t("Hapus dari pembaruan")}</button>
          </div>
        ))}
        <p className={s.notice}>
          {t("Foto tanpa persetujuan hanya menjadi bukti privat. Pernyataan “terlihat bersih” tidak langsung menyelesaikan kejadian.")}</p>
        <p className={s.muted}>
          {t("Teks, foto yang sudah diunggah, dan pilihan izin disimpan selama sesi browser. Foto yang belum diunggah perlu dipilih kembali setelah form ditutup atau halaman dimuat ulang.")}</p>
        {latest && (
          <div className={s.conflict} role="alert">
            <strong>{t("Versi terbaru · revisi")}{" "}{latest.revision}</strong>
            <p className={s.pre}>{latest.description}</p>
            <p>{t("Status:")}{" "}{latest.status}</p>
            {latest.requestedEvidence.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
            <p>
              {t("Input Anda tetap ada. Tinjau perubahan sebelum mengirim ulang.")}</p>
            <button
              type="button"
              className={s.secondary}
              disabled={
                !["submitted", "needs_evidence"].includes(latest.status)
              }
              onClick={() => {
                setVersion(latest);
                setLatest(null);
                setError(null);
              }}
            >
              {t("Gunakan revisi terbaru, lanjut meninjau")}</button>
          </div>
        )}
        {error !== null && (
          <>
            <Failure
              error={error}
              retry={
                pendingConsents
                  ? () => setConsentEpoch((v) => v + 1)
                  : undefined
              }
            />
            <Link
              href={`/incidents/${incidentId}`}
              className={s.link}
            >
              {t("Lihat kejadian")}</Link>
          </>
        )}
        {message && (
          <p role="status" className={s.notice}>
            {t(message)}
          </p>
        )}
        <div className={s.actions}>
          <button
            className={s.secondary}
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {t("Tutup · simpan draf")}</button>
          <button
            className={s.button}
            disabled={
              busy ||
              !!pendingConsents ||
              !!latest ||
              (!!version &&
                !["submitted", "needs_evidence"].includes(version.status))
            }
          >
            {busy ? t("Mengirim…") : t("Kirim untuk ditinjau")}
          </button>
        </div>
      </form>
    </section>
  );
}
