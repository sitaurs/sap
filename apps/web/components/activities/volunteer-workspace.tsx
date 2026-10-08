"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Leaf, LockKeyhole, MapPin, UserRound, UsersRound, XCircle, type LucideIcon } from "lucide-react";
import type { PublicActivity } from "../../lib/api/activities";
import { useI18n } from "../../lib/i18n/provider";
import { dateLabel, displayedActivityStatus, statusLabels } from "./activity-utils";
import v from "./volunteer-workspace.module.css";

export function WorkspaceHeading() {
  const { t } = useI18n();
  return <header className={v.heading}>
    <p className={v.eyebrow}>{t("ADMIN SAP · KEGIATAN RELAWAN")}</p>
    <h1 id="volunteer-workspace-title">{t("Ruang relawan")}</h1>
    <p className={v.subtitle}>{t("Cari kegiatan, pantau pendaftaran, dan terima penugasan koordinator.")}</p>
  </header>;
}

export function WorkspaceSection({ title, icon: Icon, children, explore = false }: { title: string; icon: LucideIcon; children: ReactNode; explore?: boolean }) {
  const { t } = useI18n();
  return <section className={v.section} aria-label={t(title)}>
    <div className={v.sectionHeading}>
      <h2><span className={v.sectionIcon}><Icon size={21} strokeWidth={1.8} aria-hidden="true" /></span>{t(title)}</h2>
      {explore && <Link className={v.exploreLink} href="/activities">{t("Lihat semua kegiatan")}<ArrowRight size={15} aria-hidden="true" /></Link>}
    </div>
    {children}
  </section>;
}

export function WorkspaceActivityCard({ activity, onOpen }: { activity: PublicActivity; onOpen: (activity: PublicActivity) => void }) {
  const { t, intlLocale } = useI18n();
  const status = displayedActivityStatus(activity);
  const tone = status === "cancelled" ? "red" : status === "completed" || status === "registration_open" ? "green" : status === "in_progress" ? "blue" : status === "awaiting_result" || status === "on_hold" ? "amber" : "neutral";
  const Icon = status === "cancelled" ? XCircle : status === "completed" || status === "registration_open" ? CheckCircle2 : status === "registration_closed" ? LockKeyhole : Clock3;
  const leaf = tone === "red" ? "leaf-red.webp" : tone === "green" ? "leaf-green.webp" : "leaf-neutral.webp";
  return <button type="button" className={v.activityCard} data-tone={tone} onClick={() => onOpen(activity)}>
    <Image className={v.cardLeaf} src={"/images/volunteer/" + leaf} alt="" width={48} height={53} aria-hidden="true" />
    <span className={v.badge}><Icon size={14} aria-hidden="true" />{t(statusLabels[status])}</span>
    <strong className={v.activityTitle}>{activity.title}</strong>
    <span className={v.area}><MapPin size={14} aria-hidden="true" />{activity.area.label}</span>
    <span className={v.cardFooter}>
      <span><CalendarDays size={13} aria-hidden="true" />{activity.startsAt ? <time dateTime={activity.startsAt}>{dateLabel(activity.startsAt, true, intlLocale)}</time> : t("Belum ditentukan")}</span>
      <span><UsersRound size={14} aria-hidden="true" />{activity.availableSeats} {t("tempat tersedia")}</span>
    </span>
  </button>;
}

export function WorkspaceEmpty({ kind, title, children }: { kind: "registration" | "assignment" | "activities"; title: string; children: ReactNode }) {
  const { t } = useI18n();
  return <div className={v.empty}>
    {kind === "activities" ? <span className={v.emptyLeaf}><Leaf size={29} aria-hidden="true" /></span> : <Image src={`/images/volunteer/${kind}-empty.webp`} alt="" width={112} height={64} aria-hidden="true" className={v.emptyIllustration} />}
    <h3>{t(title)}</h3><p>{children}</p>
  </div>;
}

export function WorkspaceLoading() {
  const { t } = useI18n();
  return <div className={v.loading}>
    <p role="status">{t("Memuat ruang relawan…")}</p>
    <WorkspaceSection title="Kegiatan publik" icon={Leaf}><div className={v.activityGrid} aria-hidden="true">{[0, 1, 2, 3].map(item => <div key={item} className={v.skeletonCard} />)}</div></WorkspaceSection>
    <WorkspaceSection title="Pendaftaran saya" icon={UserRound}><div className={v.skeletonEmpty} aria-hidden="true" /></WorkspaceSection>
    <WorkspaceSection title="Penugasan koordinator" icon={UsersRound}><div className={v.skeletonEmpty} aria-hidden="true" /></WorkspaceSection>
  </div>;
}
