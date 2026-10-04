"use client";

import { useRef, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Leaf,
  LoaderCircle,
} from "lucide-react";
import type { ActivityStatus } from "../../lib/api/activities";
import { statusLabels } from "./activity-utils";
import s from "./activities.module.css";

export function useIntentKey() {
  const intents = useRef(new Map<string, string>());
  return (body: unknown) => {
    const fingerprint = JSON.stringify(body);
    if (!intents.current.has(fingerprint))
      intents.current.set(fingerprint, createIntentId());
    return intents.current.get(fingerprint)!;
  };
}
function createIntentId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues also works on HTTP LAN previews where randomUUID is absent.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`${s.notice} ${error ? s.error : ""}`}
      role={error ? "alert" : "status"}
    >
      <AlertCircle size={19} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>
        <Leaf size={31} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Busy() {
  return (
    <div className={s.loading} role="status">
      <LoaderCircle size={24} className={s.spin} /> Memuat informasi kegiatan…
    </div>
  );
}
export function Status({ status }: { status: ActivityStatus }) {
  const tone =
    status === "completed" || status === "registration_open"
      ? s.green
      : status === "in_progress"
        ? s.blue
        : status === "awaiting_result" || status === "on_hold"
          ? s.amber
          : status === "cancelled"
            ? s.red
            : s.neutral;
  return (
    <span className={`${s.badge} ${tone}`}>
      {status === "completed" && <CheckCircle2 size={14} />}
      {statusLabels[status]}
    </span>
  );
}
export function PageHead({
  title,
  subtitle,
  action,
  onBack,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <header className={s.pageHead}>
      <div>
        {onBack && (
          <button type="button" className={s.back} onClick={onBack}>
            <ArrowLeft size={18} /> Kembali
          </button>
        )}
        <p className={s.eyebrow}>ADMIN SAP · KEGIATAN RELAWAN</p>
        <h1>{title}</h1>
        <p className={s.subtitle}>{subtitle}</p>
      </div>
      {action && <div className={s.actions}>{action}</div>}
    </header>
  );
}
