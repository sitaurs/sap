"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ExternalLink,
  FileText,
  Instagram,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import PublicationPhoto from "./publication-photo";
import { uploadMedia } from "../../lib/api/client";
import {
  approveInstagramPost,
  cancelInstagramPost,
  createInstagramDraft,
  getInstagramOperation,
  getInstagramPost,
  getInstagramPreview,
  manuallyConfirmInstagramRetraction,
  publishInstagramPost,
  retryInstagramOperation,
  retractInstagramPost,
  updateInstagramDraft,
  type PublicationOperation,
  type PublicationPreview,
} from "../../lib/api/instagram";
import DialogShell from "./dialog-shell";
import { DateStamp, Notice, PostStatus } from "./publication-ui";
import { instagramPermalink, shortId } from "./publication-utils";
import type { InstagramOverview, InstagramPost, PostPreview } from "./types";
import styles from "./instagram.module.css";

type ConfirmAction = "publish" | "cancel" | "retract" | "discard" | "retry-operation" | "manual-confirm";

export default function PublicationDetail({
  post,
  preview,
  overview,
  available,
  onClose,
  onChanged,
  onSettings,
  onReport,
}: {
  post: InstagramPost | null;
  preview: PostPreview | null;
  overview: InstagramOverview | null;
  available: boolean;
  onClose: () => void;
  onChanged: () => void;
  onSettings: () => void;
  onReport: () => void;
}) {
  const [record, setRecord] = useState<InstagramPost | null>(post);
  const [renderPreview, setRenderPreview] = useState<PublicationPreview | null>(null);
  const [caption, setCaption] = useState(post?.caption ?? preview?.caption ?? "");
  const [altText, setAltText] = useState(post?.altText ?? preview?.altText ?? "");
  const [loading, setLoading] = useState(!!post);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [reason, setReason] = useState("");
  const [operation, setOperation] = useState<PublicationOperation | null>(null);
  const [manualFiles, setManualFiles] = useState<File[]>([]);
  const [manualMediaIds, setManualMediaIds] = useState<string[]>([]);
  const [manualExplanation, setManualExplanation] = useState("");
  const [refresh, setRefresh] = useState(0);
  const createIntent = useRef<{ body: string; key: string } | null>(null);
  const operationIntent = useRef<{ fingerprint: string; key: string } | null>(null);
  const recordId = post?.id ?? record?.id;

  useEffect(() => {
    if (!recordId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void getInstagramPost(recordId, controller.signal)
      .then(async (value) => {
        if (controller.signal.aborted) return;
        setRecord(value);
        setCaption(value.caption);
        setAltText(value.altText);
        if (value.lastOperationId) {
          void getInstagramOperation(value.lastOperationId, controller.signal)
            .then((latest) => { if (!controller.signal.aborted) setOperation(latest); })
            .catch((cause: unknown) => {
              if (!controller.signal.aborted)
                setError(cause instanceof Error ? cause.message : "Status operasi belum dapat dimuat.");
            });
        } else {
          setOperation(null);
        }
        try {
          const rendition = await getInstagramPreview(recordId, controller.signal);
          if (!controller.signal.aborted) setRenderPreview(rendition);
        } catch (cause) {
          if (!controller.signal.aborted) {
            setRenderPreview(null);
            setError(cause instanceof Error ? cause.message : "Pratinjau poster belum dapat dimuat.");
          }
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Detail belum dapat dimuat.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [recordId, refresh]);

  useEffect(() => {
    if (record?.rendition.status !== "queued" || busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 120_000;
    async function poll() {
      if (Date.now() > deadline || controller.signal.aborted) return;
      try {
        const latest = await getInstagramPost(record!.id, controller.signal);
        if (controller.signal.aborted) return;
        setRecord(latest);
        if (latest.rendition.status === "ready") {
          setRenderPreview(await getInstagramPreview(latest.id, controller.signal));
          return;
        }
        if (latest.rendition.status === "failed") return;
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Status render belum dapat diperbarui.");
        return;
      }
      timer = setTimeout(() => void poll(), 3500);
    }
    timer = setTimeout(() => void poll(), 2500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [record?.id, record?.rendition.status, busy]);

  useEffect(() => {
    if (!operation || !["queued", "running"].includes(operation.status)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 120_000;
    async function poll() {
      if (Date.now() > deadline || controller.signal.aborted) return;
      try {
        const latest = await getInstagramOperation(operation!.id, controller.signal);
        if (controller.signal.aborted) return;
        setOperation(latest);
        if (!["queued", "running"].includes(latest.status)) {
          setMessage(latest.message);
          if (recordId) setRefresh((value) => value + 1);
          onChanged();
          return;
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Status operasi belum dapat diperbarui.");
        return;
      }
      timer = setTimeout(() => void poll(), 4000);
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [operation?.id, operation?.status, recordId, onChanged]);

  const source = record?.source ?? preview!.source;
  const baselineCaption = record?.caption ?? preview?.caption ?? "";
  const baselineAltText = record?.altText ?? preview?.altText ?? "";
  const dirty = caption !== baselineCaption || altText !== baselineAltText;
  const editable = !record || record.actions.edit.allowed;
  const captionValid = !!caption.trim() && caption.length <= 2200;
  const altTextValid = !!altText.trim() && altText.length <= 1000;
  const valid = captionValid && altTextValid;
  const permalink = instagramPermalink(record?.permalink ?? null);
  const renderMatches = !!record && !!renderPreview && renderPreview.contentRevision === record.contentRevision;
  const renderUrl = renderMatches ? renderPreview?.rendition.url : null;
  const canCreate = !!overview?.capabilities.canCreateDraft;
  const canApprove = !!record?.actions.approve.allowed && record.rendition.status === "ready" && renderMatches && !dirty;
  const canPublish =
    !!record?.actions.publish.allowed &&
    !!overview?.capabilities.canPublish &&
    overview.account.status === "connected" &&
    record.approval.status === "approved" &&
    !dirty;
  const canRetract =
    !!record?.actions.retract.allowed &&
    !!overview?.capabilities.canRetract &&
    record.status !== "cancelled" &&
    record.status !== "retracted";

  function idempotencyKey(intent: unknown) {
    const fingerprint = JSON.stringify(intent);
    if (operationIntent.current?.fingerprint !== fingerprint)
      operationIntent.current = { fingerprint, key: crypto.randomUUID() };
    return operationIntent.current.key;
  }

  function close() {
    if (dirty) setConfirmAction("discard");
    else onClose();
  }

  async function save() {
    if (busy || loading || !valid || !editable || (!record && !canCreate)) return;
    setBusy(true);
    setError("");
    setMessage("");
    setConfirmAction(null);
    setOperation(null);
    try {
      let updated: InstagramPost;
      if (record) {
        updated = await updateInstagramDraft(record, { caption, altText });
      } else {
        const body = {
          reportId: source.reportId,
          mediaId: source.mediaId,
          caption,
          altText,
          kind: "initial" as const,
          milestoneId: null,
          replacesPostId: null,
        };
        const encoded = JSON.stringify(body);
        if (createIntent.current?.body !== encoded)
          createIntent.current = { body: encoded, key: crypto.randomUUID() };
        updated = await createInstagramDraft(body, createIntent.current.key);
      }
      setRecord(updated);
      setCaption(updated.caption);
      setAltText(updated.altText);
      setRenderPreview(null);
      setMessage("Draf tersimpan. Poster sedang disiapkan; tinjau hasilnya sebelum memberi persetujuan.");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draf belum tersimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!record || busy || loading || !canApprove) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const key = idempotencyKey({ action: "approve", id: record.id, revision: record.revision, contentRevision: record.contentRevision, sourceRevision: record.source.sourceRevision, renditionId: record.rendition.id });
      const updated = await approveInstagramPost(record, key);
      operationIntent.current = null;
      setRecord(updated);
      setMessage("Persetujuan admin tercatat untuk versi poster, sumber, dan caption ini.");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Persetujuan belum tersimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!confirmAction || busy) return;
    if (confirmAction === "discard") {
      setConfirmAction(null);
      onClose();
      return;
    }
    if (confirmAction === "retry-operation") {
      if (!operation || !(operation.status === "failed" || (operation.status === "needs_action" && operation.kind === "retract"))) return;
    } else if (confirmAction === "manual-confirm") {
      if (!operation || operation.kind !== "retract" || operation.status !== "needs_action" || manualFiles.length + manualMediaIds.length < 1 || manualExplanation.trim().length < 20) return;
    } else {
      if (!record) return;
      if (confirmAction !== "publish" && reason.trim().length < 5) return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (confirmAction === "retry-operation") {
        const key = idempotencyKey({ action: "retry", operationId: operation!.id });
        const queued = await retryInstagramOperation(operation!.id, key);
        operationIntent.current = null;
        setOperation(queued);
        setMessage(`Percobaan ulang masuk antrean: ${queued.message}`);
        onChanged();
      } else if (confirmAction === "manual-confirm") {
        let evidenceMediaIds = [...manualMediaIds];
        for (const file of manualFiles.slice(evidenceMediaIds.length)) {
          const uploaded = await uploadMedia(file, "resolution");
          evidenceMediaIds.push(uploaded.id);
          setManualMediaIds(evidenceMediaIds);
        }
        const body = { evidenceMediaIds, explanation: manualExplanation.trim() };
        const key = idempotencyKey({ action: "manual-confirmation", operationId: operation!.id, body });
        const confirmed = await manuallyConfirmInstagramRetraction(operation!.id, body, key);
        operationIntent.current = null;
        setOperation(confirmed);
        setManualFiles([]);
        setManualMediaIds([]);
        setManualExplanation("");
        setMessage("Penarikan manual dicatat dengan bukti dan alasan audit.");
        onChanged();
        setRefresh((value) => value + 1);
      } else if (confirmAction === "publish") {
        const key = idempotencyKey({ action: "publish", id: record!.id, revision: record!.revision });
        const queued = await publishInstagramPost(record!, key);
        operationIntent.current = null;
        setOperation(queued);
        setMessage(`Permintaan publikasi diterima: ${queued.message}`);
      } else if (confirmAction === "cancel") {
        const key = idempotencyKey({ action: "cancel", id: record!.id, revision: record!.revision, reason: reason.trim() });
        const updated = await cancelInstagramPost(record!, reason.trim(), key);
        operationIntent.current = null;
        setRecord(updated);
        setMessage("Draf dibatalkan.");
        onChanged();
      } else if (confirmAction === "retract") {
        const key = idempotencyKey({ action: "retract", id: record!.id, revision: record!.revision, reason: reason.trim() });
        const queued = await retractInstagramPost(record!, reason.trim(), key);
        operationIntent.current = null;
        setOperation(queued);
        setMessage(`Permintaan penarikan diterima: ${queued.message}`);
      }
      setConfirmAction(null);
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operasi belum berhasil.");
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      {confirmAction ? (
        <div className={styles.confirmation}>
          <strong>
            {confirmAction === "publish"
              ? `Terbitkan ke ${overview?.account.username ? `@${overview.account.username}` : "Instagram"}?`
              : confirmAction === "retry-operation"
                ? `Ulangi operasi ${operation?.kind === "publish" ? "publikasi" : "penarikan"}?`
                : confirmAction === "manual-confirm"
                  ? "Konfirmasi bahwa postingan sudah dihapus manual?"
              : confirmAction === "discard"
                ? "Tutup tanpa menyimpan perubahan?"
              : confirmAction === "retract"
                ? "Minta penarikan postingan ini dari Instagram?"
                : "Batalkan draf ini?"}
          </strong>
          <p>
            {confirmAction === "publish"
              ? "Konten akan dikirim ke Meta dan dapat terlihat publik. Pastikan ini akun uji serta foto memiliki persetujuan yang tercatat."
              : confirmAction === "retry-operation"
                ? operation?.kind === "retract"
                  ? "Worker akan mengirim ulang permintaan penghapusan ke Meta. Lanjutkan hanya setelah memastikan postingan masih ada dan tidak sedang dalam proses di Meta."
                  : "Operasi ini akan dijalankan ulang oleh worker dan dapat mengirim konten ke Meta. Pastikan akun uji, persetujuan, dan status operasi sebelumnya sudah diperiksa."
                : confirmAction === "manual-confirm"
                  ? "Gunakan hanya setelah admin benar-benar menghapus postingan di Meta. Bukti dan alasan disimpan untuk audit SAP; ini tidak menghubungi Meta."
              : confirmAction === "discard"
                ? "Caption dan teks alternatif yang belum disimpan akan hilang."
              : confirmAction === "retract"
                ? "Penarikan dikirim sebagai operasi backend dan statusnya akan diperbarui; ini tidak menjamin Meta sudah menyelesaikannya."
                : "Draf yang dibatalkan tidak dapat diedit atau diterbitkan kembali."}
          </p>
          {confirmAction !== "publish" && confirmAction !== "discard" && confirmAction !== "retry-operation" && confirmAction !== "manual-confirm" && (
            <label className={styles.field}>
              <span>Alasan (minimal 5 karakter)</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy}
              />
            </label>
          )}
          {confirmAction === "manual-confirm" && <>
            <label className={styles.field}>
              <span>Bukti penghapusan manual (1–3 foto)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => { setManualFiles(Array.from(event.target.files ?? []).slice(0, 3)); setManualMediaIds([]); }} />
              <small>{manualMediaIds.length ? `${manualMediaIds.length} foto sudah diunggah privat; ` : ""}Hanya untuk audit internal. Jangan unggah data pribadi atau gunakan sebagai bukti sebelum penghapusan benar-benar dilakukan.</small>
            </label>
            <label className={styles.field}>
              <span>Penjelasan admin (minimal 20 karakter)</span>
              <textarea rows={3} maxLength={1000} value={manualExplanation} onChange={(event) => setManualExplanation(event.target.value)} disabled={busy} />
            </label>
          </>}
          <div>
            <button className={styles.secondary} type="button" onClick={() => setConfirmAction(null)} disabled={busy}>
              Kembali meninjau
            </button>
            <button className={styles.primary} type="button" onClick={() => void confirm()} disabled={busy || ((confirmAction === "cancel" || confirmAction === "retract") && reason.trim().length < 5) || (confirmAction === "manual-confirm" && (manualFiles.length + manualMediaIds.length < 1 || manualExplanation.trim().length < 20))}>
              {busy ? <LoaderCircle className={styles.spin} size={18} /> : confirmAction === "publish" ? <Send size={18} /> : confirmAction === "retract" ? <RotateCcw size={18} /> : confirmAction === "retry-operation" ? <RefreshCw size={18} /> : <Ban size={18} />}
              {confirmAction === "publish" ? "Ya, minta publikasi" : confirmAction === "retract" ? "Ya, minta penarikan" : confirmAction === "discard" ? "Tutup tanpa menyimpan" : confirmAction === "retry-operation" ? "Ya, ulangi operasi" : confirmAction === "manual-confirm" ? "Catat penghapusan manual" : "Batalkan draf"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.footerActions}>
          {editable ? (
            <>
              <button className={styles.secondary} type="button" onClick={() => void save()} disabled={busy || loading || !valid || (record ? !dirty : !canCreate)}>
                {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Save size={18} />}
                Simpan draf
              </button>
              {record?.actions.cancel.allowed && (
                <button className={styles.secondary} type="button" onClick={() => { setReason(""); setConfirmAction("cancel"); }} disabled={busy || dirty}>
                  <Ban size={18} /> Batalkan draf
                </button>
              )}
              {record && record.approval.status !== "approved" && (
                <button className={styles.primary} type="button" onClick={() => void approve()} disabled={busy || loading || !canApprove}>
                  {busy ? <LoaderCircle className={styles.spin} size={18} /> : <ShieldCheck size={18} />}
                  Setujui versi ini
                </button>
              )}
              {record && record.approval.status === "approved" && (
                <button className={styles.primary} type="button" onClick={() => setConfirmAction("publish")} disabled={busy || loading || !canPublish}>
                  <Send size={18} /> Posting sekarang
                </button>
              )}
            </>
          ) : (
            <>
              {canRetract && (
                <button className={styles.secondary} type="button" onClick={() => { setReason(""); setConfirmAction("retract"); }} disabled={busy || loading}>
                  <RotateCcw size={18} /> Tarik postingan
                </button>
              )}
              {permalink ? (
                <a href={permalink} className={styles.primary} target="_blank" rel="noopener noreferrer">
                  Lihat di Instagram <ExternalLink size={18} />
                </a>
              ) : (
                <button className={styles.secondary} type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading || busy}>
                  <RefreshCw size={18} /> Perbarui status
                </button>
              )}
            </>
          )}
        </div>
      )}
      {!available && <small className={styles.footerHint}>Layanan publikasi belum aktif. Pratinjau ini tidak dikirim atau disimpan.</small>}
      {operation && operation.kind !== "disconnect" && (operation.status === "failed" || (operation.status === "needs_action" && operation.kind === "retract")) && operation.errorCode !== "PUBLICATION_UNCERTAIN" && !confirmAction && <button className={styles.secondary} type="button" onClick={() => setConfirmAction("retry-operation")} disabled={busy || !available}><RefreshCw size={17} /> Coba ulang {operation.kind === "publish" ? "publikasi" : "penarikan"}</button>}
      {operation?.status === "needs_action" && operation.kind === "retract" && !confirmAction && <button className={styles.secondary} type="button" onClick={() => { setManualFiles([]); setManualMediaIds([]); setManualExplanation(""); setConfirmAction("manual-confirm"); }} disabled={busy}><ShieldCheck size={17} /> Catat penghapusan manual</button>}
      {operation?.status === "needs_action" && operation.kind === "publish" && <small className={styles.footerHint}>Publikasi memerlukan rekonsiliasi manual. Jangan ulangi publish sebelum status di Meta diperiksa.</small>}
      {available && !canCreate && !record && <small className={styles.footerHint}>Pembuatan draf menunggu koneksi akun dan renderer poster.</small>}
      {record && record.rendition.status === "queued" && <small className={styles.footerHint}>Poster sedang dirender. Tombol persetujuan aktif setelah pratinjau siap.</small>}
      {record?.approval.status === "approved" && !overview?.capabilities.canPublish && <small className={styles.footerHint}>Persetujuan tercatat, tetapi kemampuan publikasi belum diaktifkan oleh pengelola.</small>}
    </>
  );

  return (
    <DialogShell title="Detail postingan" subtitle="Periksa poster hasil render, persetujuan, dan status operasi." onClose={close} busy={busy} footer={footer}>
      {dirty && (
        <div className={styles.discardPrompt} role="status">
          <strong>Perubahan caption atau teks alternatif belum tersimpan.</strong>
          <span>Simpan perubahan untuk membuat versi poster baru; persetujuan sebelumnya tidak berlaku lagi.</span>
        </div>
      )}
      <div className={styles.detailTitle}><h3>{source.title}</h3><PostStatus status={record?.status ?? "preview"} /></div>
      <PublicationPhoto mediaId={source.mediaId} reportId={source.reportId} alt={source.title} className={styles.detailPhoto} />
      <div className={styles.sourceTags}><span><FileText size={14} />Laporan #{shortId(source.reportId)}</span>{source.scanId && <span>Scan #{shortId(source.scanId)}</span>}<span className={styles.categoryTag}>{source.categoryName}</span></div>
      <button className={styles.textButton} type="button" onClick={onReport} disabled={busy || dirty}>Lihat laporan dan persetujuan media<ExternalLink size={15} /></button>
      <div className={styles.dateGrid}><div><span>Masuk draf</span><DateStamp value={record?.createdAt ?? null} empty="Belum tersimpan" /></div><div><span>Terposting</span><DateStamp value={record?.publishedAt ?? null} /></div></div>
      <section className={styles.renderPreview} aria-labelledby="instagram-render-title">
        <div><h4 id="instagram-render-title">Poster yang akan ditinjau</h4><p>Persetujuan terikat pada versi poster, foto sumber, caption, dan revisi laporan yang tampil di sini.</p></div>
        {renderUrl ? <img src={renderUrl} alt={record?.altText || source.title} /> : <div className={styles.renderPlaceholder} role="status">
          {record?.rendition.status === "queued" ? <><LoaderCircle className={styles.spin} size={22} /> Poster sedang dirender…</> : record?.rendition.status === "failed" ? <>Render gagal. Muat ulang atau simpan ulang draf untuk mencoba lagi.</> : <>Simpan draf terlebih dahulu untuk membuat poster final.</>}
        </div>}
        {record && <small>Status render: {record.rendition.status === "ready" ? "siap" : record.rendition.status === "queued" ? "antrean" : "gagal"} · {record.approval.status === "approved" ? "persetujuan admin tercatat" : "belum disetujui"}</small>}
      </section>
      <label className={styles.field}><span>Caption Instagram</span><textarea rows={7} maxLength={2200} value={caption} readOnly={!editable} disabled={busy || loading} onChange={(event) => { setCaption(event.target.value); setConfirmAction(null); setMessage(""); }} placeholder="Tulis caption postingan…" /><span className={styles.fieldFoot}><small>{editable ? "Pastikan ringkasan publik akurat dan tidak memuat data pribadi." : "Caption pada saat publikasi."}</small><small>{caption.length}/2.200</small></span></label>
      <label className={styles.field}><span>Teks alternatif foto</span><textarea rows={2} maxLength={1000} value={altText} readOnly={!editable} disabled={busy || loading} onChange={(event) => { setAltText(event.target.value); setConfirmAction(null); setMessage(""); }} placeholder="Deskripsikan isi poster/foto untuk aksesibilitas…" /><span className={styles.fieldFoot}><small>Dipakai untuk aksesibilitas; jangan masukkan identitas orang atau lokasi privat.</small><small>{altText.length}/1.000</small></span></label>
      {!valid && <div className={styles.error} role="alert">Caption dan teks alternatif harus diisi sebelum menyimpan.</div>}
      <div className={styles.destination}><span className={styles.smallIcon}><Instagram size={22} /></span><div><strong>{overview?.account.username ? `@${overview.account.username}` : "Akun belum terhubung"}</strong><small>Poster hasil render · Feed · persetujuan admin diwajibkan</small></div><button className={styles.iconButton} type="button" aria-label="Buka pengaturan postingan" disabled={busy || dirty} onClick={onSettings}><Settings2 size={19} /></button></div>
      <Notice warning={!!record && record.status === "needs_action"}><ShieldCheck size={19} className={styles.inlineIcon} />{record?.status === "published" ? "Sudah terbit di Instagram. Tarik postingan hanya bila ada alasan yang tercatat." : record?.status === "publishing" ? "Operasi publikasi berjalan; status postingan belum menjadi bukti selesai." : record?.status === "retracting" ? "Operasi penarikan sedang berjalan. Periksa status operasi sebelum mengulang." : record?.status === "retracted" ? "Backend mencatat penarikan berhasil." : record?.status === "needs_action" ? "Operasi memerlukan rekonsiliasi admin. Jangan mengirim ulang publish tanpa memeriksa operasi." : "Belum ada posting langsung. Simpan draf, tinjau poster final, lalu catat persetujuan admin."}</Notice>
      {operation && <div className={operation.status === "failed" || operation.status === "needs_action" ? styles.error : styles.success} role={operation.status === "failed" || operation.status === "needs_action" ? "alert" : "status"}><strong>{operation.kind === "publish" ? "Operasi publikasi" : "Operasi penarikan"}: {operation.status}</strong><span>{operation.message}</span>{operation.errorCode && <small>Kode: {operation.errorCode}</small>}</div>}
      {loading && <p className={styles.helper} role="status">Memuat versi terbaru…</p>}
      {(error || record?.publishError) && <div className={styles.error} role="alert">{error || record?.publishError}<button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading || busy || dirty}>Muat versi terbaru</button></div>}
      {message && <div className={styles.success} role="status"><CheckCircle2 size={18} />{message}</div>}
    </DialogShell>
  );
}
