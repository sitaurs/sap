"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Download, ExternalLink, Info, Save, Send, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  approveInstagramPost,
  cancelInstagramPost,
  createInstagramDraft,
  getInstagramPost,
  getPublicationPreview,
  publishInstagramPost,
  retractInstagramPost,
  updateInstagramDraft,
} from "../../lib/api/instagram";
import { revisionConflict, r1Error, type R1 } from "../../lib/api/r1";
import { ApiError } from "../../lib/api/client";
import { useIntentKey } from "../activities/activity-ui";
import PostDetailDialog from "./post-detail-dialog";
import PostPreviewPanel from "./post-preview-panel";
import PostContentEditor from "./post-content-editor";
import OperationPanel from "./operation-panel";
import { PostStatus } from "./publication-ui";
import { instagramPermalink } from "./publication-utils";
import type {
  InstagramOverview,
  InstagramPost,
  PostPreview,
  PublicationOperation,
} from "./types";
import ui from "./post-detail.module.css";
import { useI18n } from "../../lib/i18n/provider";

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
  const { t } = useI18n();
  const [record, setRecord] = useState(post),
    [caption, setCaption] = useState(post?.caption ?? preview?.caption ?? ""),
    [altText, setAltText] = useState(
      post?.altText ?? preview?.source.title ?? "",
    ),
    [final, setFinal] = useState<R1["PublicationPreview"] | null>(null),
    [loading, setLoading] = useState(!!post),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState<
      "publish" | "approve" | "cancel" | "retract" | "discard" | null
    >(null),
    [reason, setReason] = useState(""),
    [latest, setLatest] = useState<{
      post: InstagramPost;
      preview: R1["PublicationPreview"];
    } | null>(null),
    [operation, setOperation] = useState<PublicationOperation | null>(null),
    [epoch, setEpoch] = useState(0),
    [expired, setExpired] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const confirmationRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirm) confirmationRef.current?.focus({ preventScroll: true }); }, [confirm]);
  const key = useIntentKey(),
    id = record?.id ?? post?.id,
    dirty =
      caption !== (record?.caption ?? preview?.caption ?? "") ||
      altText !== (record?.altText ?? preview?.source.title ?? ""),
    dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (!id) return;
    const c = new AbortController();
    setLoading(true);
    Promise.all([
      getInstagramPost(id, c.signal),
      getPublicationPreview(id, c.signal),
    ])
      .then(([p, v]) => {
        if (c.signal.aborted) return;
        setUncertain(false);
        if (dirtyRef.current) {
          setLatest({ post: p, preview: v });
        } else {
          setRecord(p);
          setCaption(p.caption);
          setAltText(p.altText);
          setFinal(v);
          setError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(r1Error(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, epoch]);
  useEffect(() => {
    setExpired(false);
    if (!final?.rendition.expiresAt) return;
    const delay = Date.parse(final.rendition.expiresAt) - Date.now();
    if (delay <= 0) {
      setExpired(true);
      return;
    }
    const timer = setTimeout(
      () => setExpired(true),
      Math.min(delay, 2_147_000_000),
    );
    return () => clearTimeout(timer);
  }, [final]);
  const source = record?.source ?? preview?.source;
  if (!source) return null;
  const editable = !record || record.actions.edit.allowed,
    valid =
      caption.trim().length > 0 &&
      caption.length <= 2200 &&
      altText.trim().length > 0 &&
      altText.length <= 1000;
  const ready =
    !!final &&
    !expired &&
    final.rendition.status === "ready" &&
    !!final.rendition.url &&
    final.contentRevision === record?.contentRevision &&
    final.sourceRevision === record?.source.sourceRevision;
  const approved =
    record?.approval.status === "approved" &&
    record.approval.contentRevision === record.contentRevision &&
    record.approval.sourceRevision === record.source.sourceRevision &&
    record.approval.renditionId === final?.rendition.id;
  const blocked =
    busy || loading || dirty || !!latest || uncertain || !available;
  async function execute(
    action: "save" | "approve" | "publish" | "cancel" | "retract",
  ) {
    if (busy || loading || latest || (uncertain && record) || !available)
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let updated: InstagramPost | undefined;
      if (action === "save") {
        if (!valid) return;
        if (record)
          updated = await updateInstagramDraft(record, caption, altText);
        else {
          const body = {
            reportId: source!.reportId,
            mediaId: source!.mediaId,
            caption,
            altText,
            kind: preview!.kind,
            milestoneId: preview!.milestoneId,
            replacesPostId: preview!.replacesPostId,
          };
          updated = await createInstagramDraft(body, key(body));
        }
      } else if (
        action === "approve" &&
        record &&
        final &&
        ready &&
        !dirty &&
        record.actions.approve.allowed
      )
        updated = await approveInstagramPost(
          record,
          final,
          key({
            action,
            id,
            revision: record.revision,
            contentRevision: final.contentRevision,
            renditionId: final.rendition.id,
          }),
        );
      else if (
        action === "publish" &&
        record &&
        approved &&
        record.actions.publish.allowed &&
        !dirty
      ) {
        const op = await publishInstagramPost(
          record,
          key({ action, id, revision: record.revision }),
        );
        setOperation(op);
        setMessage(
          "Permintaan publish masuk antrean. Hasil akan ditampilkan dari status operasi.",
        );
      } else if (action === "cancel" && record && record.actions.cancel.allowed)
        updated = await cancelInstagramPost(
          record,
          reason.trim(),
          key({ action, id, revision: record.revision, reason }),
        );
      else if (
        action === "retract" &&
        record &&
        record.actions.retract.allowed
      ) {
        setOperation(
          await retractInstagramPost(
            record,
            reason.trim(),
            key({ action, id, revision: record.revision, reason }),
          ),
        );
        setMessage(
          "Permintaan penarikan diterima. Penghapusan Instagram menunggu hasil operasi.",
        );
      }
      if (updated) {
        setUncertain(false);
        setRecord(updated);
        setCaption(updated.caption);
        setAltText(updated.altText);
        setFinal(null);
        setMessage(
          action === "approve"
            ? "Konten disetujui; belum diposting."
            : action === "cancel"
              ? "Draf dibatalkan."
              : "Draf tersimpan; tinjau ulang preview final.",
        );
      }
      setConfirm(null);
      setEpoch((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(r1Error(e));
      if (e instanceof ApiError && e.code === "OPERATION_UNCERTAIN") {
        setUncertain(true);
        setConfirm(null);
      }
      if (revisionConflict(e) && record) {
        try {
          const [p, v] = await Promise.all([
            getInstagramPost(record.id),
            getPublicationPreview(record.id),
          ]);
          setLatest({ post: p, preview: v });
        } catch (load) {
          setError(r1Error(load));
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const link = instagramPermalink(record?.permalink ?? null),
    operationId = operation?.id ?? record?.lastOperationId;
  const approvalLabel = !record ? "Belum tersimpan"
    : dirty || record.approval.status === "invalidated" || (record.approval.status === "approved" && !approved)
      ? "Perlu ditinjau ulang" : approved ? "Disetujui" : "Belum disetujui";
  const footerHint = busy ? "Memproses tindakan…"
    : loading ? "Memuat versi terbaru…"
    : !available ? "Publikasi belum tersedia"
    : latest ? "Tinjau versi terbaru sebelum menyimpan."
    : uncertain ? "Periksa status terbaru sebelum melanjutkan."
    : dirty ? "Simpan perubahan sebelum menyetujui konten."
    : !record ? "Simpan draf untuk menghasilkan preview gambar final."
    : operationId && ["publishing", "retracting", "needs_action"].includes(record.status) ? "Periksa hasil melalui status operasi publikasi."
    : record.status === "published" ? "Postingan sudah diterbitkan di Instagram."
    : record.status === "retracted" ? "Ditarik"
    : record.status === "cancelled" ? "Draf dibatalkan."
    : !ready ? "Tinjau gambar final yang siap sebelum menyetujui."
    : !approved ? "Setujui konten sebelum memposting."
    : "Konten disetujui; belum diposting.";
  return (
    <PostDetailDialog status={<PostStatus status={record?.status ?? "preview"} />} busy={busy}
      onClose={() => (dirty ? setConfirm("discard") : onClose())}
      footer={<>
        {error && <p role="alert" className={`${ui.feedback} ${ui.error}`}>{t(error)}</p>}
        {record?.publishError && <p role="alert" className={`${ui.feedback} ${ui.error}`}>{record.publishError}</p>}
        {message && <p role="status" className={ui.feedback}>{t(message)}</p>}
        {confirm && <div className={ui.confirmation} ref={confirmationRef} tabIndex={-1} role="group" aria-label={t("Konfirmasi tindakan")}>
          <strong>{confirm === "discard" ? t("Caption dan deskripsi belum tersimpan.")
            : confirm === "approve" ? t("Setujui gambar final dan caption ini?")
            : confirm === "publish" ? t("Posting konten yang telah disetujui sekarang?")
            : confirm === "cancel" ? t("Batalkan draf?") : t("Tarik postingan dari Instagram?")}</strong>
          {(confirm === "cancel" || confirm === "retract") && <label className={ui.field}><span>{t("Alasan")}</span><textarea value={reason} maxLength={1000} minLength={5} disabled={busy} onChange={event => setReason(event.target.value)} /></label>}
          <div className={ui.confirmationActions}>
            <button type="button" className={ui.outline} disabled={busy} onClick={() => setConfirm(null)}>{t(confirm === "discard" ? "Lanjut mengedit" : "Kembali meninjau")}</button>
            {confirm === "discard" ? <button type="button" className={ui.outline} onClick={onClose}>{t("Tutup tanpa menyimpan")}</button>
              : <button type="button" className={ui.primary} disabled={busy || ((confirm === "cancel" || confirm === "retract") && reason.trim().length < 5)} onClick={() => void execute(confirm)}>{t("Konfirmasi tindakan")}</button>}
          </div>
        </div>}
        <div className={ui.footerRow}>
          <p className={ui.footerHint}><Info size={20} aria-hidden="true" />{t(footerHint)}</p>
          <div className={ui.actions}>
            {editable && <button type="button" className={ui.outline}
              disabled={busy || loading || !available || !valid || !!latest || !!confirm || (!!record && (!dirty || uncertain))}
              onClick={() => void execute("save")}><Save size={18} />{t(uncertain && !record ? "Periksa penyimpanan draf" : "Simpan draf")}</button>}
            {record && <>
              <button type="button" className={approved ? ui.outline : ui.primary} disabled={blocked || !ready || !!confirm || !record.actions.approve.allowed} onClick={() => setConfirm("approve")}><ShieldCheck size={18} />{t("Setujui konten")}</button>
              <button type="button" className={`${ui.primary} ${ui.publish}`} disabled={blocked || !approved || !!confirm || !record.actions.publish.allowed || !overview?.capabilities.canPublish} onClick={() => setConfirm("publish")}><Send size={18} />{t("Posting sekarang")}</button>
            </>}
          </div>
        </div>
      </>}>
      <h3 className={ui.title}>{source.title}</h3>
      <div className={ui.columns}>
        <PostPreviewPanel source={source} record={record} kind={record?.kind ?? preview?.kind ?? "initial"}
          url={final?.rendition.status === "ready" && final.rendition.url && !expired ? final.rendition.url : null}
          altText={final?.altText ?? altText}
          fallback={!record ? "Simpan draf untuk menghasilkan preview gambar final."
            : expired ? "Preview kedaluwarsa. Perbarui informasi untuk mengambil URL baru."
            : final?.rendition.status === "failed" ? "Pembuatan gambar final gagal. Hubungi pengelola."
            : "Preview gambar final sedang disiapkan atau belum tersedia."}
          refreshing={loading} canRefresh={!busy && !loading && !!id}
          canOpenReport={!dirty && !busy} onRefresh={() => setEpoch(value => value + 1)} onReport={onReport} onImageError={() => setExpired(true)} />
        <section className={ui.editorColumn} aria-label={t("Konten postingan")}>
          <PostContentEditor caption={caption} altText={altText} editable={editable} disabled={busy || loading || uncertain}
            approved={approved && !dirty} approvalLabel={approvalLabel}
            onCaption={value => { setCaption(value); setConfirm(null); setMessage(""); }}
            onAltText={value => { setAltText(value); setConfirm(null); setMessage(""); }} />
          {latest && <div className={ui.conflict} role="alert">
            <strong>{t("Versi terbaru · revisi")} {latest.post.revision}</strong><p>{latest.post.caption}</p><p>{latest.post.altText}</p><PostStatus status={latest.post.status} />
            <p>{t("Input Anda tetap ada. Konfirmasi sebelum menyimpan ke revisi terbaru.")}</p>
            <button type="button" className={ui.outline} onClick={() => { setRecord(latest.post); setFinal(latest.preview); setLatest(null); setError(""); setConfirm(null); }}>{t("Saya sudah meninjau, pertahankan input saya")}</button>
          </div>}
          <button type="button" className={ui.settings} disabled={dirty || busy} onClick={onSettings}><SlidersHorizontal size={19} />{t("Pengaturan publikasi")}<ChevronRight size={18} /></button>
          {record && <div className={ui.secondaryActions}>
            <button type="button" className={ui.danger} disabled={blocked || !record.actions.cancel.allowed} onClick={() => setConfirm("cancel")}><Trash2 size={18} />{t("Batalkan draf")}</button>
            <button type="button" disabled={blocked || !record.actions.retract.allowed || !overview?.capabilities.canRetract} onClick={() => setConfirm("retract")}><Download size={18} />{t("Tarik postingan")}</button>
            {link && <a href={link} target="_blank" rel="noopener noreferrer">{t("Periksa di Instagram")}<ExternalLink size={16} /></a>}
          </div>}
          {operationId && <OperationPanel key={operationId} id={operationId} initial={operation ?? undefined} onCompleted={() => { setEpoch(value => value + 1); onChanged(); }} />}
          {loading && <p role="status" className={ui.loading}>{t("Memuat versi terbaru…")}</p>}
        </section>
      </div>
    </PostDetailDialog>
  );
}
