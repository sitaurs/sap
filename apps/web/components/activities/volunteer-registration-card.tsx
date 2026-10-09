"use client";

import { useId } from "react";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Clock3, Info, MapPin, UsersRound, XCircle } from "lucide-react";
import type { MemberStatus, MyActivity, PublicActivity } from "../../lib/api/activities";
import { useI18n } from "../../lib/i18n/provider";
import { memberLabels } from "./activity-utils";
import { WorkspaceSchedule } from "./volunteer-schedule";
import v from "./volunteer-workspace.module.css";

const states: Record<MemberStatus, { tone: string; Icon: typeof CheckCircle2; message: string; helper: string }> = {
  accepted: { tone: "green", Icon: CheckCircle2, message: "Anda sudah diterima sebagai peserta.", helper: "Titik kumpul tersedia pada detail kegiatan." },
  requested: { tone: "amber", Icon: Clock3, message: "Menunggu keputusan koordinator.", helper: "Permintaan terkirim. Anda belum menjadi peserta." },
  waitlisted: { tone: "blue", Icon: UsersRound, message: "Anda berada dalam daftar cadangan.", helper: "Keikutsertaan menunggu keputusan koordinator." },
  rejected: { tone: "red", Icon: XCircle, message: "Pendaftaran Anda tidak diterima.", helper: "Periksa informasi terbaru pada detail kegiatan." },
  cancelled: { tone: "neutral", Icon: XCircle, message: "Pendaftaran Anda dibatalkan.", helper: "Periksa informasi terbaru pada detail kegiatan." },
};

export default function VolunteerRegistrationCard({ item, busy, onOpen }: {
  item: MyActivity; busy: boolean; onOpen: (activity: PublicActivity) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const { activity, membership } = item;
  const state = membership ? states[membership.status] : { tone: "neutral", Icon: Info, message: "Status pendaftaran belum tersedia.", helper: "Periksa informasi terbaru pada detail kegiatan." };
  const Icon = state.Icon;
  const label = membership ? memberLabels[membership.status] : "Belum ada";
  const activeAccepted = activity.kind === "activity" && membership?.status === "accepted" && !["completed", "cancelled", "on_hold"].includes(activity.status);
  return <article className={v.registrationCard} data-tone={state.tone} aria-labelledby={id}>
    <Image className={v.registrationLeaf} src="/images/volunteer/member-leaf.webp" alt="" width={44} height={55} aria-hidden="true" />
    <span className={v.memberBadge} aria-label={`${t("Status:")} ${t(label)}`}><Icon size={17} aria-hidden="true" />{t(label)}</span>
    <h3 id={id}>{activity.kind === "activity" ? activity.title : t("Informasi kegiatan berubah")}</h3>
    {activity.kind === "activity" ? <>
      <div className={v.registrationMeta}>
        <WorkspaceSchedule startsAt={activity.startsAt} endsAt={activity.endsAt} />
        <span><MapPin size={17} aria-hidden="true" />{activity.area.label}</span>
      </div>
      <div className={v.memberGuidance}>
        <Icon size={20} aria-hidden="true" /><div><strong>{t(state.message)}</strong><p>{t(membership?.status === "accepted" && !activeAccepted ? "Periksa status dan hasil pada detail kegiatan." : state.helper)}</p></div>
      </div>
      {membership?.reason && <p className={v.memberReason}>{membership.reason}</p>}
      <button type="button" className={activeAccepted ? v.workspacePrimary : v.workspaceOutline} disabled={busy} onClick={() => onOpen(activity)}>
        {t(activeAccepted ? "Lihat detail & titik kumpul" : "Lihat kegiatan")}<ArrowRight size={17} aria-hidden="true" />
      </button>
    </> : <div className={v.activityNotice} role="status"><Info size={19} aria-hidden="true" /><div><p>{activity.message}</p>{activity.cancellationReason && <p>{activity.cancellationReason}</p>}</div></div>}
  </article>;
}
