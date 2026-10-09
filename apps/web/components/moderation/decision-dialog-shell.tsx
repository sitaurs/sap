"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, X } from "lucide-react";
import { useI18n } from "../../lib/i18n/provider";
import ui from "./decision-dialog.module.css";

/** The browser's top layer keeps this dialog outside transformed dashboard panels. */
export function DecisionDialogShell({ metadata, children, footer, pending, onClose, title = "Tinjau laporan", description = "Periksa bukti dan tentukan hasil moderasi.", compact = false }: {
  metadata: ReactNode; children: ReactNode; footer: ReactNode;
  pending: boolean; onClose: () => void;
  title?: string; description?: string;
  compact?: boolean;
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
  return createPortal(<dialog data-motion="dialog" ref={ref} className={`${ui.dialog} ${compact ? ui.compact : ""}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      if (!pending) onClose();
    }}
    onKeyDown={event => {
      if (event.key !== "Tab" || (event.target as HTMLElement).closest("dialog") !== event.currentTarget) return;
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget || pending) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className={ui.header}>
      <span className={ui.headerIcon} aria-hidden="true"><ShieldCheck size={25} /></span>
      <div className={ui.heading}><h2 id={`${id}-title`}>{t(title)}</h2><p id={`${id}-description`}>{t(description)}</p></div>
      <div className={ui.metadata}>{metadata}</div>
      <button className={ui.close} type="button" onClick={onClose} disabled={pending} aria-label={t("Tutup")}><X size={23} /></button>
    </header>
    <div className={ui.body} data-moderation-body>{children}</div>
    <footer className={ui.footer}>{footer}</footer>
  </dialog>, target);
}
