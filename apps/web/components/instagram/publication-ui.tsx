import Image from "next/image";
import { Ban, CheckCircle2, Clock3, FileText, Info, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { PublicationStatus } from "./types";
import { publicationDate } from "./publication-utils";
import styles from "./instagram.module.css";

export function PostStatus({ status }: { status: PublicationStatus | "preview" }) {
  const states = {
    preview: { text: "Pratinjau draf", icon: FileText, tone: "draftBadge" },
    draft: { text: "Draf", icon: FileText, tone: "draftBadge" },
    publishing: { text: "Sedang memposting", icon: LoaderCircle, tone: "pendingBadge" },
    published: { text: "Terposting", icon: CheckCircle2, tone: "publishedBadge" },
    failed: { text: "Gagal posting", icon: TriangleAlert, tone: "errorBadge" },
    cancelled: { text: "Dibatalkan", icon: Ban, tone: "draftBadge" },
    retracting: { text: "Penarikan diproses", icon: LoaderCircle, tone: "pendingBadge" },
    retracted: { text: "Ditarik", icon: RotateCcw, tone: "draftBadge" },
    needs_action: { text: "Perlu tindakan admin", icon: TriangleAlert, tone: "errorBadge" },
  };
  const state = states[status];
  const Icon = state.icon;
  return <span className={`${styles.badge} ${styles[state.tone]}`}><Icon size={15} aria-hidden="true" />{state.text}</span>;
}
export function DateStamp({ value, empty = "Belum diposting" }: { value: string | null; empty?: string }) {
  if (!value) return <span className={styles.dateEmpty}>{empty}</span>;
  const date = publicationDate(value);
  return <time dateTime={value} className={styles.date}><span>{date.day}</span><small><Clock3 size={13} aria-hidden="true" />{date.time}</small></time>;
}
export function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`${styles.notice} ${warning ? styles.warning : ""}`}><Info size={20} aria-hidden="true" /><div>{children}</div></div>;
}
export function EmptyPublication({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className={styles.empty}><Image src="/images/instagram/publication-empty.svg" alt="" width={210} height={150} /><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function Busy({ children }: { children: ReactNode }) {
  return <div className={styles.busy} role="status"><LoaderCircle size={23} className={styles.spin} aria-hidden="true" />{children}</div>;
}
