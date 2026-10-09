"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { askReportEvidence, type SapReport } from "../../lib/api/client";
import { useI18n } from "../../lib/i18n/provider";
import { DecisionDialogShell } from "./decision-dialog-shell";
import ui from "./decision-dialog.module.css";

export function RequestEvidenceModal({ report, onClose }: { report: SapReport; onClose: () => void }) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const valid = message.trim().length >= 5 && message.trim().length <= 1000;

  async function submit() {
    if (!valid || sent || sending.current) return;
    sending.current = true;
    setBusy(true); setError("");
    try {
      const result = await askReportEvidence(report.id, message.trim());
      if (!result.notified || result.reportId !== report.id) throw new Error("Permintaan klarifikasi belum dapat dikirim.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error && cause.message.trim() ? cause.message : "Permintaan klarifikasi belum dapat dikirim.");
    } finally { sending.current = false; setBusy(false); }
  }

  return <DecisionDialogShell compact title="Minta klarifikasi/bukti" description="Kirim permintaan kepada pelapor melalui notifikasi aplikasi."
    metadata={<span>#{report.id.slice(0, 8)}</span>} pending={busy} onClose={onClose}
    footer={<div className={ui.actions}>
      {sent ? <button type="button" className={ui.save} onClick={onClose}><Check size={18} />{t("Selesai")}</button> : <>
        <button type="button" className={ui.outline} disabled={busy} onClick={onClose}>{t("Batal")}</button>
        <button type="button" className={ui.save} disabled={!valid || busy} onClick={() => void submit()}>{busy ? <Loader2 size={18} className={ui.spin} /> : <Send size={18} />}{t("Kirim permintaan")}</button>
      </>}
    </div>}>
    {sent ? <p className={ui.success} role="status">{t("Permintaan klarifikasi/bukti terkirim ke notifikasi pelapor. Status laporan tetap sama.")}</p> : <div className={ui.bulkReview}>
      <label className={ui.field}><span>{t("Pesan kepada pelapor")}</span>
        <textarea aria-label={t("Pesan kepada pelapor")} autoFocus minLength={5} maxLength={1000} required disabled={busy} value={message} onChange={event => setMessage(event.target.value)} aria-describedby="request-evidence-help" />
        <small id="request-evidence-help">{t("Jelaskan klarifikasi atau bukti yang diperlukan (5–1000 karakter).")}</small>
      </label>
      <p className={ui.fieldHint}>{t("Permintaan ini tidak mengubah status laporan atau izin publikasi foto.")}</p>
      {error && <p className={ui.error} role="alert">{t(error)}</p>}
    </div>}
  </DecisionDialogShell>;
}
