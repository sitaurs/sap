"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, uploadMedia } from "../../lib/api/client";
import {
  getIncidentTimeline,
  getIncidentViewer,
  getPublicIncident,
  getMediaConsents,
  listMyCommunityUpdates,
  patchMyCommunityUpdate,
  setIncidentFollowing,
  setIncidentSupport,
  setMediaConsents,
  submitCommunityUpdate,
  type CommunityUpdate,
  type IncidentViewer,
  type PublicIncident,
  type PublicIncidentTimelinePage,
} from "../../lib/api/community";
import styles from "./community.module.css";

const kindLabels: Record<CommunityUpdate["kind"], string> = {
  still_present: "Masih terlihat",
  reduced: "Sudah berkurang",
  looks_clean: "Terlihat bersih",
  information_wrong: "Informasi kurang tepat",
};

const statusLabels: Record<PublicIncident["status"], string> = {
  verified: "Terverifikasi",
  in_progress: "Dalam penanganan",
  resolved: "Selesai ditangani",
};

function dateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date) + " WIB";
}

export default function IncidentPage({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<PublicIncident | null>(null);
  const [timeline, setTimeline] = useState<PublicIncidentTimelinePage["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [viewer, setViewer] = useState<IncidentViewer | null>(null);
  const [myUpdates, setMyUpdates] = useState<CommunityUpdate[]>([]);
  const [editing, setEditing] = useState<CommunityUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<CommunityUpdate["kind"]>("still_present");
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState("");
  const [correctionField, setCorrectionField] = useState<NonNullable<CommunityUpdate["correctionField"]>>("other");
  const [files, setFiles] = useState<File[]>([]);
  const [baseMediaIds, setBaseMediaIds] = useState<string[]>([]);
  const [uploadedMediaIds, setUploadedMediaIds] = useState<string[]>([]);
  const [allowWeb, setAllowWeb] = useState(false);
  const [allowInstagram, setAllowInstagram] = useState(false);
  const [reset, setReset] = useState(0);
  const submitIntent = useRef<{ body: string; key: string } | null>(null);
  const canonicalPath = `/incidents/${encodeURIComponent(incidentId)}`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setMyUpdates([]);
    void getPublicIncident(incidentId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.kind === "redirect") {
          window.location.replace(result.canonicalPath);
          return;
        }
        setIncident(result);
        return Promise.all([
          getIncidentTimeline(result.id, undefined, controller.signal),
          getIncidentViewer(result.id, controller.signal).catch((cause: unknown) => {
            if (cause instanceof ApiError && cause.status === 401) {
              return null;
            }
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
          }),
        ]).then(([events, currentViewer]) => {
          if (controller.signal.aborted) return;
          setTimeline(events.items);
          setCursor(events.nextCursor);
          setViewer(currentViewer);
          if (currentViewer) {
            void listMyCommunityUpdates({}, controller.signal)
              .then((page) => { if (!controller.signal.aborted) setMyUpdates(page.items.filter((item) => item.reportId === result.id)); })
              .catch((cause: unknown) => { if (!controller.signal.aborted && !(cause instanceof ApiError && cause.status === 401)) setError(cause instanceof Error ? cause.message : "Pembaruan saya belum dapat dimuat."); });
          }
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Kejadian publik belum dapat dimuat.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [incidentId, reset]);

  const loginHref = `/login?next=${encodeURIComponent(canonicalPath)}`;
  const canUpdate = viewer?.actions.update.allowed === true;
  const mediaConsentChannels = useMemo(() => [
    ...(allowWeb ? ["web" as const] : []),
    ...(allowInstagram ? ["instagram" as const] : []),
  ], [allowWeb, allowInstagram]);

  const toggleSupport = useCallback(async () => {
    if (!incident || !viewer || busy) return;
    setBusy(true);
    setError("");
    try {
      const state = await setIncidentSupport(incident.id, !viewer.supported);
      setViewer((old) => old ? { ...old, supported: state.supported } : old);
      setIncident((old) => old ? { ...old, supportCount: state.supportCount, supportClosed: state.supportClosed } : old);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dukungan belum tersimpan.");
    } finally {
      setBusy(false);
    }
  }, [incident, viewer, busy]);

  const toggleFollow = useCallback(async () => {
    if (!incident || !viewer || busy) return;
    setBusy(true);
    setError("");
    try {
      const state = await setIncidentFollowing(incident.id, !viewer.following);
      setViewer((old) => old ? { ...old, following: state.following } : old);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pengaturan ikuti belum tersimpan.");
    } finally {
      setBusy(false);
    }
  }, [incident, viewer, busy]);

  async function loadMore() {
    if (!incident || !cursor || moreBusy) return;
    setMoreBusy(true);
    setError("");
    try {
      const page = await getIncidentTimeline(incident.id, cursor);
      setTimeline((old) => [...old, ...page.items.filter((item) => !old.some((event) => event.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Riwayat kejadian belum dapat dimuat.");
    } finally {
      setMoreBusy(false);
    }
  }

  async function submitUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!incident || !canUpdate || busy || description.trim().length < 10) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let newMediaIds = [...uploadedMediaIds];
      for (const file of files.slice(newMediaIds.length)) {
        const media = await uploadMedia(file, "community");
        const consent = await getMediaConsents(media.id);
        await setMediaConsents(consent, mediaConsentChannels);
        newMediaIds.push(media.id);
        setUploadedMediaIds(newMediaIds);
      }
      const body = {
        kind,
        observedAt: new Date(observedAt).toISOString(),
        description: description.trim(),
        mediaIds: [...baseMediaIds, ...newMediaIds],
        correctionField: kind === "information_wrong" ? correctionField : null,
      };
      const encoded = JSON.stringify({ reportId: incident.id, ...body });
      if (submitIntent.current?.body !== encoded) submitIntent.current = { body: encoded, key: crypto.randomUUID() };
      const updated = editing
        ? await patchMyCommunityUpdate(editing, body)
        : await submitCommunityUpdate(incident.id, body, submitIntent.current.key);
      submitIntent.current = null;
      setMessage(editing ? "Pembaruan diperbarui dan dikirim kembali untuk ditinjau." : `Pembaruan dikirim untuk pemeriksaan moderator (${updated.status}).`);
      setMyUpdates((old) => [updated, ...old.filter((item) => item.id !== updated.id)]);
      setEditing(null);
      setDescription("");
      setFiles([]);
      setBaseMediaIds([]);
      setUploadedMediaIds([]);
      setAllowWeb(false);
      setAllowInstagram(false);
      const input = document.getElementById("community-photo-input") as HTMLInputElement | null;
      if (input) input.value = "";
      setReset((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pembaruan belum dapat dikirim.");
    } finally {
      setBusy(false);
    }
  }

  function editUpdate(update: CommunityUpdate) {
    const local = new Date(new Date(update.observedAt).getTime() - new Date().getTimezoneOffset() * 60_000);
    setEditing(update);
    setKind(update.kind);
    setObservedAt(local.toISOString().slice(0, 16));
    setDescription(update.description);
    setCorrectionField(update.correctionField ?? "other");
    setBaseMediaIds(update.mediaIds);
    setUploadedMediaIds([]);
    setFiles([]);
    setError("");
    setMessage("");
  }

  function cancelEditing() {
    setEditing(null);
    setBaseMediaIds([]);
    setUploadedMediaIds([]);
    setFiles([]);
    setDescription("");
    setError("");
    setMessage("");
  }

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/dashboard?view=reports">← Kembali ke SAP</Link>
      {loading && <p className={styles.status} role="status">Memuat kejadian…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {incident && <>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>INFORMASI KOMUNITAS · #{incident.area.label}</p>
          <h1>{incident.title}</h1>
          <p className={styles.summary}>{incident.summary}</p>
          <div className={styles.meta}><span>{statusLabels[incident.status]}</span><span>{incident.area.label}</span><span>Dilaporkan {dateLabel(incident.occurredAt)}</span></div>
          {incident.evidence.length > 0 && <div className={styles.evidence} aria-label="Bukti publik">
            {incident.evidence.map((item) => <figure key={item.id}><img src={item.url} alt={item.caption || "Bukti kejadian"} /><figcaption>{item.caption || "Bukti yang disetujui moderator"}</figcaption></figure>)}
          </div>}
          <div className={styles.actions}>
            {viewer ? <>
              <button type="button" onClick={() => void toggleSupport()} disabled={busy || incident.supportClosed} aria-pressed={viewer.supported}>{viewer.supported ? "✓ Anda mendukung" : "Dukung penanganan"} · {incident.supportCount}</button>
              <button type="button" onClick={() => void toggleFollow()} disabled={busy} aria-pressed={viewer.following}>{viewer.following ? "✓ Mengikuti pembaruan" : "Ikuti pembaruan"}</button>
            </> : <Link className={styles.actionLink} href={loginHref}>Masuk untuk mendukung, mengikuti, atau memberi pembaruan</Link>}
          </div>
          {incident.supportClosed && <small className={styles.helper}>Dukungan untuk kejadian ini sudah ditutup.</small>}
        </header>

        <section className={styles.panel} aria-labelledby="timeline-title">
          <div className={styles.panelHead}><div><p className={styles.eyebrow}>KRONOLOGI PUBLIK</p><h2 id="timeline-title">Perkembangan kejadian</h2></div><span>{timeline.length} peristiwa dimuat</span></div>
          {timeline.length ? <ol className={styles.timeline}>{timeline.map((event) => <li key={event.id}>
            <span className={styles.timelineDot} aria-hidden="true" />
            <div><strong>{event.summary}</strong><p>{event.kind.replaceAll("_", " ")}</p><time dateTime={event.observedAt ?? event.occurredAt}>{dateLabel(event.observedAt ?? event.occurredAt)}</time>
              {event.evidence.length > 0 && <div className={styles.timelinePhotos}>{event.evidence.map((item) => <img key={item.id} src={item.url} alt={item.caption || "Bukti perkembangan"} />)}</div>}
            </div>
          </li>)}</ol> : <p className={styles.helper}>Belum ada perkembangan tambahan yang disetujui untuk ditampilkan.</p>}
          {cursor && <button type="button" className={styles.secondary} onClick={() => void loadMore()} disabled={moreBusy}>{moreBusy ? "Memuat…" : "Muat riwayat sebelumnya"}</button>}
        </section>

        <section className={styles.panel} aria-labelledby="community-update-title">
          <div className={styles.panelHead}><div><p className={styles.eyebrow}>KONTRIBUSI WARGA</p><h2 id="community-update-title">Laporkan perkembangan</h2></div></div>
          {!viewer && <p className={styles.helper}>Masuk ke akun SAP yang sudah diverifikasi email untuk mengirim pembaruan.</p>}
          {viewer && !canUpdate && <p className={styles.helper}>Pembaruan belum dapat dikirim saat ini. Alasan: {viewer.actions.update.reasonCode ?? "aksi tidak tersedia"}.</p>}
          {canUpdate && <form className={styles.form} onSubmit={(event) => void submitUpdate(event)}>
            {editing && <p className={styles.editingNotice}>Mengedit pembaruan yang dikembalikan moderator. Setelah disimpan, versi baru kembali ke antrean tinjauan.</p>}
            <label><span>Jenis perkembangan</span><select value={kind} onChange={(event) => setKind(event.target.value as CommunityUpdate["kind"])} disabled={busy}>
              {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            {kind === "information_wrong" && <label><span>Bagian informasi yang perlu dikoreksi</span><select value={correctionField} onChange={(event) => setCorrectionField(event.target.value as NonNullable<CommunityUpdate["correctionField"]>)} disabled={busy}>
              <option value="location">Lokasi</option><option value="category">Kategori</option><option value="time">Waktu</option><option value="photo">Foto</option><option value="other">Lainnya</option>
            </select></label>}
            <label><span>Waktu pengamatan</span><input type="datetime-local" required value={observedAt} onChange={(event) => setObservedAt(event.target.value)} disabled={busy} /></label>
            <label><span>Jelaskan yang Anda amati</span><textarea required minLength={10} maxLength={1000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} placeholder="Hindari nama, wajah, nomor telepon, atau rincian pribadi." /><small>{description.length}/1.000 karakter</small></label>
            <label><span>Foto bukti (opsional, maksimal 3)</span><input id="community-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || baseMediaIds.length >= 3} onChange={(event) => { const next = Array.from(event.target.files ?? []).slice(0, Math.max(0, 3 - baseMediaIds.length)); setFiles(next); setUploadedMediaIds([]); }} /><small>{baseMediaIds.length ? `${baseMediaIds.length} foto lama dipertahankan; ` : ""}Foto baru diunggah privat untuk moderator. Centang izin publik secara terpisah bila Anda setuju.</small></label>
            {files.length > 0 && <fieldset className={styles.consent} disabled={busy}>
              <legend>Izin penggunaan foto yang Anda pilih</legend>
              <label><input type="checkbox" checked={allowWeb} onChange={(event) => setAllowWeb(event.target.checked)} /> Saya mengizinkan foto pilihan ini ditampilkan pada laman publik SAP setelah disetujui moderator.</label>
              <label><input type="checkbox" checked={allowInstagram} onChange={(event) => setAllowInstagram(event.target.checked)} /> Saya mengizinkan foto pilihan ini dipertimbangkan untuk Instagram SAP setelah persetujuan terpisah.</label>
              <small>Moderator tetap meninjau foto dan memilih tujuan publikasi. Izin ini tidak menerbitkan foto otomatis.</small>
            </fieldset>}
            {message && <p className={styles.success} role="status">{message}</p>}
            <div className={styles.formActions}><button className={styles.primary} type="submit" disabled={busy || description.trim().length < 10}>{busy ? "Menyimpan…" : editing ? "Simpan revisi untuk ditinjau" : "Kirim untuk ditinjau"}</button>{editing && <button className={styles.secondary} type="button" onClick={cancelEditing} disabled={busy}>Batalkan edit</button>}</div>
          </form>}
          {myUpdates.length > 0 && <div className={styles.myUpdates}><h3>Pembaruan saya</h3>{myUpdates.map((update) => <article key={update.id}><div><strong>{kindLabels[update.kind]}</strong><span>{update.status.replaceAll("_", " ")}</span></div><p>{update.description}</p>{update.requestedEvidence.length > 0 && <small>Bukti diminta: {update.requestedEvidence.join(" · ")}</small>}{["submitted", "needs_evidence"].includes(update.status) && <button type="button" className={styles.textAction} onClick={() => editUpdate(update)} disabled={busy || editing?.id === update.id}>{editing?.id === update.id ? "Sedang diedit" : "Edit / lengkapi bukti"}</button>}</article>)}</div>}
          <p className={styles.helper}>Pembaruan warga dan ringkasan publik ditinjau moderator manusia. Sistem rekomendasi Hermes, bila aktif, hanya membantu menandai bukti yang perlu diperiksa.</p>
        </section>
        <footer className={styles.footer}>SAP membagikan ringkasan dan bukti yang disetujui. Lokasi presisi dan informasi privat tidak ditampilkan.</footer>
      </>}
    </main>
  );
}
