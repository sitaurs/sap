"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
import { useI18n } from "../../lib/i18n/provider";
import ui from "./post-detail.module.css";

/** A top-layer dialog remains centered outside the dashboard's animated panels. */
export default function PostDetailDialog({ status, children, footer, busy, onClose }: {
  status: ReactNode; children: ReactNode; footer: ReactNode;
  busy: boolean; onClose: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.body); }, []);
  useEffect(() => {
    if (!target) return;
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [target]);
  if (!target) return null;
  return createPortal(<dialog data-motion="dialog" ref={ref} className={ui.dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      if (!busy) onClose();
    }}
    onKeyDown={event => {
      if (event.key !== "Tab" || (event.target as HTMLElement).closest("dialog") !== event.currentTarget) return;
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget || busy) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className={ui.header}>
      <span className={ui.headerIcon} aria-hidden="true"><FileText size={27} /></span>
      <div className={ui.heading}><h2 id={`${id}-title`}>{t("Detail postingan")}</h2><p id={`${id}-description`}>{t("Tinjau gambar final, persetujuan, dan riwayat publikasi.")}</p></div>
      <div className={ui.status}>{status}</div>
      <button type="button" className={ui.close} disabled={busy} onClick={onClose} aria-label={t("Tutup panel")}><X size={23} /></button>
    </header>
    <div className={ui.body} data-post-detail-body>{children}</div>
    <footer className={ui.footer}>{footer}</footer>
  </dialog>, target);
}
