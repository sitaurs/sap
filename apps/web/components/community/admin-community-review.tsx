"use client";

import { useEffect, useState } from "react";
import {
  decideCommunityUpdate,
  getAdminCommunityUpdate,
  getCommunityUpdatePhotoUrl,
  getHermesReview,
  listCommunityReviewQueue,
  listEvidenceRenditions,
  requestEvidenceRendition,
  requestHermesReview,
  type AdminCommunityUpdate,
  type CommunityUpdateDecisionInput,
  type EvidenceRendition,
  type ReviewQueueItem,
} from "../../lib/api/community";
import styles from "./community-admin.module.css";

const kindLabels = {
  still_present: "Masih terlihat",
  reduced: "Sudah berkurang",
  looks_clean: "Terlihat bersih",
  information_wrong: "Informasi kurang tepat",
} as const;

const recommendationLabels = {
  recommend_accept: "Saran: pertimbangkan untuk menerima",
  human_review: "Saran: perlu tinjauan manusia",
  recommend_reject: "Saran: pertimbangkan untuk menolak",
  recommend_duplicate: "Saran: periksa kemungkinan duplikasi",
} as const;

type MediaReview = { mediaId: string; url: string; renditions: EvidenceRendition[] };

export default function AdminCommunityReview() {
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [update, setUpdate] = useState<AdminCommunityUpdate | null>(null);
  const [media, setMedia] = useState<MediaReview[]>([]);
  const [renditionChoice, setRenditionChoice] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<Record<string, { web: boolean; instagram: boolean }>>({});
  const [action, setAction] = useState<"approve" | "request_evidence" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [summary, setSummary] = useState("");
  const [requestedEvidence, setRequestedEvidence] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState("");
  const [error, setError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setQueueError("");
    void listCommunityReviewQueue(undefined, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setQueue(page.items);
        setCursor(page.nextCursor);
        if (!selectedId && page.items[0]) setSelectedId(page.items[0].subjectId);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setQueueError(cause instanceof Error ? cause.message : "Antrean komunitas belum dapat dimuat.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) { setUpdate(null); setMedia([]); return; }
    const controller = new AbortController();
    setLoadingDetail(true);
    setError("");
    void getAdminCommunityUpdate(selectedId, controller.signal)
      .then(async (detail) => {
        if (controller.signal.aborted) return;
        setUpdate(detail);
        setSummary(detail.publicSummary ?? "");
        const evidence = await Promise.all(detail.mediaIds.map(async (mediaId) => {
          const [photo, page] = await Promise.all([
            getCommunityUpdatePhotoUrl(detail.id, mediaId, controller.signal),
            listEvidenceRenditions(mediaId, detail.id, undefined, controller.signal),
          ]);
          return { mediaId, url: photo.url, renditions: page.items };
        }));
        if (!controller.signal.aborted) {
          setMedia(evidence);
          setRenditionChoice((old) => {
            const next = { ...old };
            for (const item of evidence) {
              if (!item.renditions.some((rendition) => rendition.id === next[item.mediaId]))
                next[item.mediaId] = item.renditions.find((rendition) => rendition.status === "ready")?.id ?? "";
            }
            return next;
          });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Detail pembaruan belum dapat dimuat.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingDetail(false); });
    return () => controller.abort();
  }, [selectedId, refresh]);

  const latestReview = update?.latestReview ?? null;
  const run = latestReview;
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (controller.signal.aborted) return;
      try {
        const latest = await getHermesReview(run!.id, controller.signal);
        if (controller.signal.aborted) return;
        setUpdate((old) => old ? { ...old, latestReview: latest } : old);
        if (!["queued", "running"].includes(latest.status)) return;
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Status Hermes belum dapat diperbarui.");
        return;
      }
      timer = setTimeout(() => void poll(), 3000);
    }
    timer = setTimeout(() => void poll(), 2500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [run?.id, run?.status]);

  useEffect(() => {
    if (!media.some((item) => item.renditions.some((rendition) => rendition.status === "queued"))) return;
    const timer = setTimeout(() => setRefresh((value) => value + 1), 3500);
    return () => clearTimeout(timer);
  }, [media]);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const page = await listCommunityReviewQueue(cursor);
      setQueue((old) => [...old, ...page.items.filter((item) => !old.some((previous) => previous.subjectId === item.subjectId))]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setQueueError(cause instanceof Error ? cause.message : "Antrean berikutnya belum dapat dimuat.");
    } finally { setBusy(false); }
  }

  async function renderEvidence(mediaId: string) {
    if (!update || renderBusy) return;
    setRenderBusy(mediaId);
    setError("");
    try {
      await requestEvidenceRendition(update, mediaId, crypto.randomUUID());
      setMessage("Versi bukti privat sedang disiapkan untuk ditinjau.");
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Versi bukti belum dapat dibuat.");
    } finally { setRenderBusy(""); }
  }

  async function requestReview() {
    if (!update || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const review = await requestHermesReview(update.id, update.revision, crypto.randomUUID());
      setUpdate((old) => old ? { ...old, latestReview: review } : old);
      setMessage("Hermes menyiapkan rekomendasi. Keputusan tetap dilakukan moderator.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permintaan Hermes belum dapat dibuat.");
    } finally { setBusy(false); }
  }

  async function decide(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!update || busy || update.status !== "submitted" || reason.trim().length < 5) return;
    const requested = requestedEvidence.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
    if (action === "request_evidence" && requested.length === 0) { setError("Sebutkan bukti tambahan yang diminta."); return; }
    if (action === "approve" && !summary.trim()) { setError("Tulis ringkasan publik yang ditinjau moderator."); return; }
    const approvals: CommunityUpdateDecisionInput["publicEvidenceApprovals"] = action === "approve"
      ? media.flatMap((item) => {
          const rendition = item.renditions.find((candidate) => candidate.id === renditionChoice[item.mediaId] && candidate.status === "ready");
          const selectedChannels = [
            ...(channels[item.mediaId]?.web ? ["web" as const] : []),
            ...(channels[item.mediaId]?.instagram ? ["instagram" as const] : []),
          ];
          return rendition && selectedChannels.length ? [{ mediaId: item.mediaId, renditionId: rendition.id, channels: selectedChannels }] : [];
        })
      : [];
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await decideCommunityUpdate(update, {
        action,
        reason: reason.trim(),
        publicSummary: action === "approve" ? summary.trim() : null,
        publicEvidenceApprovals: approvals,
        requestedEvidence: action === "request_evidence" ? requested : [],
      }, crypto.randomUUID());
      setMessage(action === "approve" ? "Pembaruan disetujui moderator dan kronologi diperbarui." : action === "request_evidence" ? "Permintaan bukti tambahan dikirim ke pelapor." : "Pembaruan ditolak moderator.");
      setReason("");
      setRequestedEvidence("");
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Keputusan belum tersimpan.");
    } finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>ADMIN · KOMUNITAS &amp; HERMES</p><h1>Tinjau pembaruan warga</h1><p>Hermes menyajikan rekomendasi dan bukti untuk membantu pemeriksaan; moderator manusia menentukan hasilnya.</p></div><button type="button" className={styles.refresh} onClick={() => setRefresh((value) => value + 1)} disabled={loading}>Muat ulang</button></header>
    <div className={styles.layout}>
      <aside className={styles.queue} aria-label="Antrean pembaruan">
        <h2>Antrean moderator <span>{queue.length}</span></h2>
        {loading && <p className={styles.helper}>Memuat antrean…</p>}
        {queueError && <p className={styles.error} role="alert">{queueError}</p>}
        {!loading && !queue.length && !queueError && <p className={styles.helper}>Tidak ada pembaruan warga yang menunggu.</p>}
        {queue.map((item) => <button key={item.subjectId} type="button" className={`${styles.queueItem} ${selectedId === item.subjectId ? styles.selected : ""}`} onClick={() => { setSelectedId(item.subjectId); setMessage(""); setReason(""); }}>
          <strong>{item.title}</strong><span>{item.reviewState === "needs_evidence" ? "Bukti tambahan diminta" : "Menunggu moderator"}</span><small>Laporan #{item.reportId.slice(0, 8)}</small>
          {item.latestReview && <small>Hermes: {item.latestReview.status}</small>}
        </button>)}
        {cursor && <button type="button" className={styles.loadMore} onClick={() => void loadMore()} disabled={busy}>Muat berikutnya</button>}
      </aside>
      <section className={styles.detail} aria-label="Detail tinjauan" aria-busy={loadingDetail}>
        {loadingDetail && <p className={styles.helper}>Memuat bukti dan detail…</p>}
        {!selectedId && !loadingDetail && <p className={styles.helper}>Pilih pembaruan dari antrean.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.success} role="status">{message}</p>}
        {update && <>
          <div className={styles.detailHead}><div><p className={styles.eyebrow}>LAPORAN #{update.reportId.slice(0, 8)} · REVISI {update.revision}</p><h2>{kindLabels[update.kind]}</h2></div><span className={styles.status}>{update.status === "needs_evidence" ? "Bukti diminta" : update.status === "submitted" ? "Menunggu tinjauan" : update.status}</span></div>
          <p className={styles.description}>{update.description}</p>
          <div className={styles.meta}><span>Diamati: {new Date(update.observedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</span>{update.correctionField && <span>Koreksi: {update.correctionField}</span>}</div>
          {update.decisionReason && <p className={styles.helper}>Catatan moderator sebelumnya: {update.decisionReason}</p>}
          {update.requestedEvidence.length > 0 && <div className={styles.notice}><strong>Bukti yang diminta pelapor:</strong> {update.requestedEvidence.join(" · ")}</div>}
          <div className={styles.evidenceGrid}>{media.map((item) => {
            const chosen = item.renditions.find((rendition) => rendition.id === renditionChoice[item.mediaId]);
            return <article key={item.mediaId} className={styles.evidenceCard}>
              <img src={chosen?.url ?? item.url} alt="Bukti pembaruan komunitas" />
              <p>{chosen ? "Pratinjau versi bukti" : "Bukti privat untuk moderator"}</p>
              <label className={styles.renditionLabel}><span>Versi bukti</span><select value={renditionChoice[item.mediaId] ?? ""} onChange={(event) => setRenditionChoice((old) => ({ ...old, [item.mediaId]: event.target.value }))}><option value="">Pilih versi siap</option>{item.renditions.map((rendition) => <option key={rendition.id} value={rendition.id} disabled={rendition.status !== "ready"}>{rendition.status} · r{rendition.revision}</option>)}</select></label>
              {!item.renditions.some((rendition) => rendition.status === "ready") && <button type="button" className={styles.smallButton} onClick={() => void renderEvidence(item.mediaId)} disabled={!!renderBusy}>{renderBusy === item.mediaId ? "Menyiapkan…" : "Siapkan pratinjau bukti"}</button>}
              <div className={styles.channelChecks}><label><input type="checkbox" checked={channels[item.mediaId]?.web ?? false} onChange={(event) => setChannels((old) => ({ ...old, [item.mediaId]: { web: event.target.checked, instagram: old[item.mediaId]?.instagram ?? false } }))} /> Izin web</label><label><input type="checkbox" checked={channels[item.mediaId]?.instagram ?? false} onChange={(event) => setChannels((old) => ({ ...old, [item.mediaId]: { web: old[item.mediaId]?.web ?? false, instagram: event.target.checked } }))} /> Izin Instagram</label></div>
            </article>;
          })}</div>
          {latestReview && <section className={styles.hermes} aria-labelledby="hermes-title">
            <div className={styles.hermesHead}><div><p className={styles.eyebrow}>BANTUAN KEPUTUSAN</p><h3 id="hermes-title">Hermes · {latestReview.status}</h3></div><button type="button" className={styles.smallButton} onClick={() => void requestReview()} disabled={busy || ["queued", "running"].includes(latestReview.status)}>Minta rekomendasi ulang</button></div>
            <p className={styles.disclaimer}>Rekomendasi ini bukan keputusan. Periksa bukti sumber dan tentukan tindakan sebagai moderator.</p>
            {latestReview.status === "completed" && latestReview.result && <div className={styles.recommendation}>
              <strong>{recommendationLabels[latestReview.result.recommendation]}</strong>
              {latestReview.result.reasonCodes.length > 0 && <p>Kode alasan: {latestReview.result.reasonCodes.join(", ")}</p>}
              {latestReview.result.evidence.length > 0 && <ul>{latestReview.result.evidence.map((evidence) => <li key={evidence.mediaId}>{evidence.observation}</li>)}</ul>}
              {latestReview.result.missingEvidence.length > 0 && <p>Bukti yang perlu diperiksa: {latestReview.result.missingEvidence.join(" · ")}</p>}
              {latestReview.result.publicationWarnings.length > 0 && <p>Peringatan publikasi: {latestReview.result.publicationWarnings.join(" · ")}</p>}
              {latestReview.result.publicSummaryProposal && <div className={styles.proposal}><span>Usulan ringkasan (belum diterapkan):</span><p>{latestReview.result.publicSummaryProposal}</p><button type="button" className={styles.smallButton} onClick={() => setSummary(latestReview.result!.publicSummaryProposal!)}>Salin ke kolom moderator</button></div>}
            </div>}
            {latestReview.status === "failed" && <p className={styles.helper}>Rekomendasi gagal diproses ({latestReview.errorCode ?? "tanpa kode"}). Keputusan manual tetap tersedia.</p>}
          </section>}
          {!latestReview && <div className={styles.notice}><span>Hermes tidak mengambil tindakan sendiri. Minta rekomendasi bila fitur aktif; moderator tetap memutuskan.</span><button type="button" className={styles.smallButton} onClick={() => void requestReview()} disabled={busy}>Minta rekomendasi Hermes</button></div>}
          <form className={styles.decision} onSubmit={(event) => void decide(event)}>
            <h3>Keputusan moderator</h3>
            {update.status === "submitted" ? <>
              <label><span>Tindakan</span><select value={action} onChange={(event) => setAction(event.target.value as typeof action)} disabled={busy}><option value="approve">Setujui sebagai pembaruan publik</option><option value="request_evidence">Minta bukti tambahan</option><option value="reject">Tolak pembaruan</option></select></label>
              {action === "approve" && <label><span>Ringkasan untuk kronologi publik</span><textarea rows={3} maxLength={500} value={summary} onChange={(event) => setSummary(event.target.value)} disabled={busy} required /><small>Gunakan informasi yang sudah diperiksa; jangan masukkan identitas atau data pribadi.</small></label>}
              {action === "request_evidence" && <label><span>Bukti tambahan yang diminta (satu per baris)</span><textarea rows={3} maxLength={500} value={requestedEvidence} onChange={(event) => setRequestedEvidence(event.target.value)} disabled={busy} required /></label>}
              <label><span>Alasan/catatan moderator (minimal 5 karakter)</span><textarea rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} required minLength={5} /></label>
              <p className={styles.disclaimer}>Kanal bukti hanya diajukan dari versi siap yang dipilih. Pastikan izin pengguna dan perlindungan privasi memang sesuai; backend tetap memvalidasi consent.</p>
              <button className={styles.submit} type="submit" disabled={busy || reason.trim().length < 5 || (action === "approve" && !summary.trim())}>{busy ? "Menyimpan…" : action === "approve" ? "Setujui sebagai moderator" : action === "request_evidence" ? "Minta bukti sebagai moderator" : "Tolak sebagai moderator"}</button>
            </> : <p className={styles.helper}>Status ini tidak dapat diputuskan ulang. Pelapor perlu mengirim revisi bila bukti tambahan diminta.</p>}
          </form>
        </>}
      </section>
    </div>
  </main>;
}
