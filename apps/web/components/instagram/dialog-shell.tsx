"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import styles from "./instagram.module.css";

export default function DialogShell({ title, subtitle, children, footer, onClose, busy = false, wide = false }: {
  title: string; subtitle: string; children: ReactNode; footer?: ReactNode;
  onClose: () => void; busy?: boolean; wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(node => node.getClientRects().length > 0);
      if (!nodes.length) { event.preventDefault(); return; }
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === nodes.length - 1)) { event.preventDefault(); nodes[0].focus(); }
    }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className={styles.overlay}>
    <div className={styles.shade} onClick={() => { if (!busyRef.current) closeRef.current(); }} aria-hidden="true" />
    <section ref={ref} className={`${styles.drawer} ${wide ? styles.wideDrawer : ""}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-subtitle`} tabIndex={-1}>
      <header className={styles.drawerHeader}><div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-subtitle`}>{subtitle}</p></div><button type="button" className={styles.iconButton} onClick={onClose} disabled={busy} aria-label="Tutup panel"><X size={23} /></button></header>
      <div className={styles.drawerBody}>{children}</div>
      {footer && <footer className={styles.drawerFooter}>{footer}</footer>}
    </section>
  </div>, document.body);
}
