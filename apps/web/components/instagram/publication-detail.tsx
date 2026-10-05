"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Save, Send, ShieldCheck } from "lucide-react";
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
import DialogShell from "./dialog-shell";
import OperationPanel from "./operation-panel";
import PublicationHistory from "./publication-history";
import { DateStamp, Notice, PostStatus } from "./publication-ui";
import { instagramPermalink, shortId } from "./publication-utils";
import type {
  InstagramOverview,
  InstagramPost,
  PostPreview,
  PublicationOperation,
} from "./types";
import styles from "./instagram.module.css";
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
  return (
    <DialogShell
      title={t("Detail postingan")}
      subtitle={t("Tinjau gambar final, persetujuan, dan riwayat operasi.")}
      busy={busy}
      onClose={() => (dirty ? setConfirm("discard") : onClose())}
      footer={
        <div className={styles.footerActions}>
          {editable && (
            <button
              className={styles.secondary}
              disabled={
                busy ||
                loading ||
                !available ||
                !valid ||
                !!latest ||
                (!!record && (!dirty || uncertain))
              }
              onClick={() => void execute("save")}
            >
              <Save size={18} />
              {uncertain && !record
                ? t("Periksa penyimpanan draf")
                : t("Simpan draf")}
            </button>
          )}
          {record && (
            <>
              <button
                className={styles.secondary}
                disabled={blocked || !ready || !record.actions.approve.allowed}
                onClick={() => setConfirm("approve")}
              >
                <ShieldCheck size={18} />
                {t("Setujui konten")}</button>
              <button
                className={styles.primary}
                disabled={
                  blocked ||
                  !approved ||
                  !record.actions.publish.allowed ||
                  !overview?.capabilities.canPublish
                }
                onClick={() => setConfirm("publish")}
              >
                <Send size={18} />
                {t("Posting sekarang")}</button>
            </>
          )}
        </div>
      }
    >
      <div className={styles.detailTitle}>
        <h3>{source.title}</h3>
        <PostStatus status={record?.status ?? "preview"} />
      </div>
      {final?.rendition.status === "ready" &&
      final.rendition.url &&
      !expired ? (
        <img
          className={styles.finalPhoto}
          src={final.rendition.url}
          alt={final.altText}
          onError={() => setExpired(true)}
        />
      ) : (
        <Notice warning>
          {!record
            ? t("Simpan draf untuk menghasilkan preview gambar final.")
            : expired
              ? t("Preview kedaluwarsa. Perbarui informasi untuk mengambil URL baru.")
              : final?.rendition.status === "failed"
                ? t("Pembuatan gambar final gagal. Hubungi pengelola.")
                : t("Preview gambar final sedang disiapkan atau belum tersedia.")}
        </Notice>
      )}
      <button
        className={styles.secondary}
        disabled={busy || loading || !id}
        onClick={() => setEpoch((v) => v + 1)}
      >
        <RefreshCw size={17} />
        {t("Perbarui versi dan preview")}</button>
      <div className={styles.sourceTags}>
        <span>{t("Laporan #")}{shortId(source.reportId)}</span>
        <span>{source.categoryName}</span>
        <span>
          {record?.kind ?? preview?.kind} {" "}{t("· generasi")}{" "}
          {record?.generation ?? "baru"}
        </span>
      </div>
      <button
        className={styles.textButton}
        disabled={dirty || busy}
        onClick={onReport}
      >
        {t("Buka moderasi laporan")}</button>
      <div className={styles.dateGrid}>
        <div>
          <span>{t("Masuk draf")}</span>
          <DateStamp
            value={record?.createdAt ?? null}
            empty="Belum tersimpan"
          />
        </div>
        <div>
          <span>{t("Pernah terposting")}</span>
          <DateStamp value={record?.publishedAt ?? null} />
        </div>
        <div>
          <span>{t("Ditarik")}</span>
          <DateStamp
            value={record?.retractedAt ?? null}
            empty="Belum ditarik"
          />
        </div>
      </div>
      <label className={styles.field}>
        <span>{t("Caption Instagram")}</span>
        <textarea
          rows={6}
          maxLength={2200}
          value={caption}
          readOnly={!editable}
          disabled={busy || loading || uncertain}
          onChange={(e) => {
            setCaption(e.target.value);
            setConfirm(null);
            setMessage("");
          }}
        />
        <small>{caption.length}{t("/2.200 karakter")}</small>
      </label>
      <label className={styles.field}>
        <span>{t("Deskripsi gambar untuk aksesibilitas")}</span>
        <textarea
          rows={3}
          value={altText}
          maxLength={1000}
          readOnly={!editable}
          disabled={busy || loading || uncertain}
          onChange={(e) => setAltText(e.target.value)}
        />
      </label>
      <Notice>
        {t("Persetujuan:")}{" "}
        {record
          ? {
              unapproved: t("Belum disetujui"),
              approved: "Disetujui",
              invalidated: t("Perlu ditinjau ulang"),
            }[record.approval.status]
          : t("Belum tersimpan")}
        {t(". Persetujuan terikat pada revisi konten, sumber, dan gambar final. Perubahan dapat membatalkan persetujuan.")}</Notice>
      {latest && (
        <div className={styles.confirmation} role="alert">
          <strong>{t("Versi terbaru · revisi")}{" "}{latest.post.revision}</strong>
          <p>{latest.post.caption}</p>
          <p>{latest.post.altText}</p>
          <PostStatus status={latest.post.status} />
          <p>
            {t("Input Anda tetap ada. Konfirmasi sebelum menyimpan ke revisi terbaru.")}</p>
          <button
            className={styles.secondary}
            onClick={() => {
              setRecord(latest.post);
              setFinal(latest.preview);
              setLatest(null);
              setError("");
              setConfirm(null);
            }}
          >
            {t("Saya sudah meninjau, pertahankan input saya")}</button>
        </div>
      )}
      {confirm === "discard" ? (
        <div className={styles.confirmation}>
          <strong>{t("Caption dan deskripsi belum tersimpan.")}</strong>
          <button className={styles.secondary} onClick={() => setConfirm(null)}>
            {t("Lanjut mengedit")}</button>
          <button className={styles.textButton} onClick={onClose}>
            {t("Tutup tanpa menyimpan")}</button>
        </div>
      ) : confirm ? (
        <div className={styles.confirmation}>
          <strong>
            {confirm === "approve"
              ? t("Setujui gambar final dan caption ini?")
              : confirm === "publish"
                ? t("Posting konten yang telah disetujui sekarang?")
                : confirm === "cancel"
                  ? t("Batalkan draf?")
                  : t("Tarik postingan dari Instagram?")}
          </strong>
          {(confirm === "cancel" || confirm === "retract") && (
            <label className={styles.field}>
              <span>{t("Alasan")}</span>
              <textarea
                value={reason}
                maxLength={1000}
                minLength={5}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <div className={styles.footerActions}>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t("Kembali meninjau")}</button>
            <button
              className={styles.primary}
              disabled={
                busy ||
                ((confirm === "cancel" || confirm === "retract") &&
                  reason.trim().length < 5)
              }
              onClick={() => void execute(confirm)}
            >
              {t("Konfirmasi tindakan")}</button>
          </div>
        </div>
      ) : null}
      {record && (
        <div className={styles.footerActions}>
          <button
            className={styles.secondary}
            disabled={blocked || !record.actions.cancel.allowed}
            onClick={() => setConfirm("cancel")}
          >
            {t("Batalkan draf")}</button>
          <button
            className={styles.secondary}
            disabled={
              blocked ||
              !record.actions.retract.allowed ||
              !overview?.capabilities.canRetract
            }
            onClick={() => setConfirm("retract")}
          >
            {t("Tarik postingan")}</button>
          {link && (
            <a
              className={styles.secondary}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Periksa di Instagram")}<ExternalLink size={16} />
            </a>
          )}
          <button
            className={styles.textButton}
            disabled={dirty || busy}
            onClick={onSettings}
          >
            {t("Pengaturan publikasi")}</button>
        </div>
      )}
      {operationId && (
        <OperationPanel
          key={operationId}
          id={operationId}
          initial={operation ?? undefined}
          onCompleted={() => {
            setEpoch((v) => v + 1);
            onChanged();
          }}
        />
      )}
      {record && (
        <PublicationHistory key={record.id} reportId={record.source.reportId} />
      )}
      {loading && (
        <p role="status" className={styles.helper}>
          {t("Memuat versi terbaru…")}</p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {t(error)}
        </p>
      )}
      {record?.publishError && (
        <p role="alert" className={styles.error}>
          {record.publishError}
        </p>
      )}
      {message && (
        <p role="status" className={styles.notice}>
          {t(message)}
        </p>
      )}
    </DialogShell>
  );
}
