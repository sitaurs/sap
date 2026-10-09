"use client";

import { useId } from "react";
import Image from "next/image";
import { ArrowRight, Check, CheckCircle2, Clock3, FileText, MapPin, UsersRound } from "lucide-react";
import type { Activity } from "../../lib/api/activities";
import { useI18n } from "../../lib/i18n/provider";
import { dateLabel, displayedActivityStatus, statusLabels } from "./activity-utils";
import { WorkspaceSchedule } from "./volunteer-schedule";
import v from "./volunteer-workspace.module.css";

export function assignmentNeedsResponse(activity: Activity) {
  return !activity.coordinatorAcceptedAt && activity.status !== "completed" && activity.status !== "cancelled";
}

export default function VolunteerAssignmentCard({ activity, areaLabel, publishName, busy, onNameChange, onDecision, onManage }: {
  activity: Activity; areaLabel?: string; publishName: boolean; busy: boolean;
  onNameChange: (value: boolean) => void; onDecision: (accepted: boolean) => void; onManage: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const id = useId();
  const pending = assignmentNeedsResponse(activity);
  const accepted = !!activity.coordinatorAcceptedAt;
  const Icon = accepted ? CheckCircle2 : Clock3;
  return <article className={v.assignmentCard} data-pending={pending} aria-labelledby={`${id}-title`}>
    <Image className={v.assignmentLeaf} src="/images/volunteer/assignment-leaf.webp" alt="" width={58} height={70} aria-hidden="true" />
    <span className={v.assignmentIcon} aria-hidden="true">{accepted ? <UsersRound size={23} /> : <FileText size={23} />}</span>
    <div className={v.assignmentContent}>
      <div className={v.assignmentBadges}>
        <span className={v.assignmentBadge} data-accepted={accepted} data-closed={!accepted && !pending}><Icon size={17} aria-hidden="true" />{t(accepted ? "Penugasan diterima" : pending ? "Perlu konfirmasi" : "Penugasan berakhir")}</span>
        <span className={v.activityState}>{t(activity.status === "draft" ? "Draf kegiatan" : statusLabels[displayedActivityStatus(activity)])}</span>
      </div>
      <h3 id={`${id}-title`}>{activity.title}</h3>
      <div className={v.assignmentMeta}>
        <WorkspaceSchedule startsAt={activity.startsAt} endsAt={activity.endsAt} />
        <span>{areaLabel ? <MapPin size={17} aria-hidden="true" /> : <FileText size={17} aria-hidden="true" />}{areaLabel ?? `${t("Laporan #")}${activity.reportId.slice(0, 8)}`}</span>
        <span><UsersRound size={17} aria-hidden="true" />{activity.capacity === null ? t("Kuota belum ditentukan") : t("Kapasitas {count} relawan", { count: activity.capacity })}</span>
      </div>
      {accepted ? <p className={v.assignmentAccepted}>{t("Diterima")} <time dateTime={activity.coordinatorAcceptedAt!}>{dateLabel(activity.coordinatorAcceptedAt, true, intlLocale)}</time></p> : <p className={v.assignmentDescription}>{t(pending ? "Koordinasikan peserta, persiapan, dan laporan hasil kegiatan." : "Kegiatan telah berakhir. Penerimaan penugasan tidak tersedia.")}</p>}
      {pending && <div className={v.assignmentConsent}>
        <input id={`${id}-consent`} type="checkbox" checked={publishName} disabled={busy} onChange={event => onNameChange(event.target.checked)} aria-describedby={`${id}-consent-help`} />
        <div><label htmlFor={`${id}-consent`}>{t("Izinkan nama tampilan saya ditampilkan sebagai koordinator pada laman publik.")}</label><p id={`${id}-consent-help`}>{t("Opsional. Penugasan tetap dapat diterima tanpa menampilkan nama.")}</p></div>
      </div>}
    </div>
    <div className={v.assignmentActions}>
      {accepted ? <button type="button" className={v.workspacePrimary} disabled={busy} onClick={onManage}>{t("Kelola kegiatan")}<ArrowRight size={18} aria-hidden="true" /></button>
        : pending && <><button type="button" className={v.workspaceOutline} disabled={busy} onClick={() => onDecision(false)}>{t("Tolak penugasan")}</button><button type="button" className={v.workspacePrimary} disabled={busy} onClick={() => onDecision(true)}><Check size={18} aria-hidden="true" />{t("Terima penugasan")}</button></>}
    </div>
  </article>;
}
