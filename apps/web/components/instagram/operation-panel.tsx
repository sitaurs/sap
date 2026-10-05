"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPublicationOperation,
  retryPublicationOperation,
  confirmManualRetraction,
} from "../../lib/api/instagram";
import { uploadEvidence } from "../../lib/api/community";
import { r1Error } from "../../lib/api/r1";
import { useIntentKey } from "../activities/activity-ui";
import { DateStamp, Notice } from "./publication-ui";
import type { PublicationOperation } from "./types";
import styles from "./instagram.module.css";
import { useI18n } from "../../lib/i18n/provider";

const labels = {
  queued: "Dalam antrean",
  running: "Sedang diproses",
  succeeded: "Operasi selesai",
  failed: "Operasi gagal",
  needs_action: "Perlu tindakan manual",
  cancelled: "Operasi dibatalkan",
};
const sapLabels = {
  unaffected: "Tidak berubah",
  hidden: "Disembunyikan",
  cancelled: "Dibatalkan",
};
const instagramLabels = {
  not_created: "Belum dibuat",
  pending: "Menunggu hasil",
  published: "Terposting",
  deleted: "Dihapus",
  needs_action: "Perlu tindakan",
};
export default function OperationPanel({
  id,
  initial,
  onCompleted,
}: {
  id: string;
  initial?: PublicationOperation;
  onCompleted: () => void;
}) {
  const { t } = useI18n();
  const [operation, setOperation] = useState(initial ?? null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [epoch, setEpoch] = useState(0),
    [explanation, setExplanation] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [limited, setLimited] = useState(false);
  const key = useIntentKey(),
    uploaded = useRef(new Map<File, string>()),
    completed = useRef(""),
    callback = useRef(onCompleted);
  useEffect(() => {
    callback.current = onCompleted;
  }, [onCompleted]);
  const refresh = useCallback(() => setEpoch((v) => v + 1), []);
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 120_000;
    setLimited(false);
    async function read() {
      if (c.signal.aborted || document.hidden) return;
      try {
        const value = await getPublicationOperation(id, c.signal);
        if (c.signal.aborted) return;
        setOperation(value);
        setError("");
        if (["queued", "running"].includes(value.status)) {
          if (Date.now() < deadline)
            timer = setTimeout(() => void read(), 5000);
          else setLimited(true);
        } else if (completed.current !== `${id}:${value.status}`) {
          completed.current = `${id}:${value.status}`;
          callback.current();
        }
      } catch (e) {
        if (!c.signal.aborted) {
          setError(r1Error(e));
          setLimited(true);
        }
      }
    }
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (!document.hidden && Date.now() < deadline) void read();
      else if (Date.now() >= deadline) setLimited(true);
    };
    void read();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      c.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id, epoch]);
  async function retry() {
    setBusy(true);
    try {
      setOperation(
        await retryPublicationOperation(
          id,
          key({ id, action: "retry", attempt: operation?.attemptCount }),
        ),
      );
      refresh();
    } catch (e) {
      setError(r1Error(e));
    } finally {
      setBusy(false);
    }
  }
  async function manual() {
    if (!files.length || files.length > 3 || explanation.trim().length < 20)
      return;
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const file of files) {
        let mediaId = uploaded.current.get(file);
        if (!mediaId) {
          mediaId = (await uploadEvidence(file, "resolution")).id;
          uploaded.current.set(file, mediaId);
        }
        ids.push(mediaId);
      }
      setOperation(
        await confirmManualRetraction(
          id,
          ids,
          explanation.trim(),
          key({ id, ids, explanation }),
        ),
      );
      refresh();
    } catch (e) {
      setError(r1Error(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.operation} aria-label={t("Status operasi publikasi")}>
      <h3>{operation ? labels[operation.status] : t("Memuat operasi…")}</h3>
      {operation && (
        <>
          <p>{operation.message}</p>
          <p>
            SAP: {t(sapLabels[operation.channels.sap])} {" "}{t("· Instagram:")}{" "}
            {t(instagramLabels[operation.channels.instagram])}
          </p>
          <p>
            {t("Percobaan")}{" "}{operation.attemptCount} ·{" "}
            <DateStamp value={operation.updatedAt} />
          </p>
          {operation.nextRetryAt && (
            <p>
              {t("Percobaan berikutnya:")}{" "}<DateStamp value={operation.nextRetryAt} />
            </p>
          )}
          {operation.errorCode && <small>{t("Kode:")}{" "}{operation.errorCode}</small>}
        </>
      )}
      {limited && (
        <Notice warning>
          {t("Pemantauan otomatis berhenti. Permintaan belum dianggap berhasil; periksa status terbaru.")}</Notice>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {t(error)}
        </p>
      )}
      <div className={styles.footerActions}>
        <button className={styles.secondary} disabled={busy} onClick={refresh}>
          {t("Periksa status operasi")}</button>
        {operation?.status === "failed" && (
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => void retry()}
          >
            {t("Coba ulang operasi yang sama")}</button>
        )}
      </div>
      {operation?.kind === "retract" && operation.status === "needs_action" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void manual();
          }}
          className={styles.operation}
        >
          <Notice warning>
            {t("Konfirmasi hanya setelah postingan dihapus secara manual di Instagram. Lampirkan bukti penghapusan.")}</Notice>
          <label className={styles.field}>
            <span>{t("Bukti penghapusan (1–3 foto)")}</span>
            <input
              type="file"
              multiple
              required
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                if (
                  chosen.length > 3 ||
                  chosen.some(
                    (f) =>
                      f.size > 10 * 1024 * 1024 ||
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        f.type,
                      ),
                  )
                ) {
                  setError(
                    "Gunakan 1–3 foto JPEG, PNG, atau WebP hingga 10 MB.",
                  );
                  e.target.value = "";
                  return;
                }
                setFiles(chosen);
              }}
            />
          </label>
          <label className={styles.field}>
            <span>{t("Penjelasan penghapusan")}</span>
            <textarea
              value={explanation}
              minLength={20}
              maxLength={1000}
              required
              disabled={busy}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </label>
          <button className={styles.primary} disabled={busy || !files.length}>
            {t("Konfirmasi penghapusan manual")}</button>
        </form>
      )}
    </section>
  );
}
