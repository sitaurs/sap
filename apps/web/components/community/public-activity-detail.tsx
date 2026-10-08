"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Accessibility, Backpack, CalendarDays, CheckCircle2, Clock3, FileText, LockKeyhole, MapPin, Recycle, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import type { R1 } from "../../lib/api/r1";
import { useI18n } from "../../lib/i18n/provider";
import { displayedActivityStatus, registrationClosedMessage, statusLabels } from "../activities/activity-utils";
import { date } from "./community-ui";
import d from "./public-activity-detail.module.css";

type Activity = R1["PublicActivity"];

export function ActivityDetailHeading({ activity }: { activity: Activity }) {
  const { t, locale } = useI18n();
  return <header className={d.heading}>
    <span className={d.eyebrow}>{t("SAP · Aksi warga")}</span>
    <h1>{activity.title}</h1>
    <p className={d.area}><MapPin size={22} aria-hidden="true" />{activity.area.label}</p>
    {locale === "id" ? <Image className={d.quote} src="/images/community/activity-detail/nature-quote.webp" alt="" width={342} height={98} aria-hidden="true" /> : <blockquote className={d.quoteText}>{t("Aksi kecil, lingkungan lebih bersih untuk masa depan yang lebih baik.")}</blockquote>}
  </header>;
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return <span className={d.iconTile}><Icon size={25} strokeWidth={2} aria-hidden="true" /></span>;
}

function DateFact({ label, value, icon }: { label: string; value: string | null; icon: LucideIcon }) {
  const { t, intlLocale } = useI18n();
  return <div className={d.dateFact}>
    <IconTile icon={icon} /><div><dt>{t(label)}</dt><dd>{value ? <time dateTime={value}>{date(value, intlLocale)}</time> : t("Belum tersedia.")}</dd></div>
  </div>;
}

function InformationRow({ title, icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  const { t } = useI18n();
  return <div className={d.informationRow}><IconTile icon={icon} /><div><h3>{t(title)}</h3><div className={d.informationValue}>{children}</div></div></div>;
}

export function ActivityInformation({ activity }: { activity: Activity }) {
  const { t, intlLocale } = useI18n();
  const status = displayedActivityStatus(activity);
  const closedMessage = registrationClosedMessage(activity, intlLocale);
  const StatusIcon = status === "registration_closed" ? LockKeyhole : status === "completed" || status === "registration_open" ? CheckCircle2 : Clock3;
  return <section className={[d.card, d.informationCard].join(" ")} aria-label={t("Informasi dan jadwal kegiatan")}>
    <div className={d.statusNotice} data-status={status}>
      <span className={d.statusIcon}><StatusIcon size={26} aria-hidden="true" /></span>
      <div><h2>{t(statusLabels[status])}</h2>{closedMessage && <p role="status">{t(closedMessage)}</p>}</div>
    </div>
    <p className={d.description}>{activity.description}</p>
    <dl className={d.dates}>
      <DateFact label="Mulai" value={activity.startsAt} icon={CalendarDays} />
      <DateFact label="Selesai" value={activity.endsAt} icon={CalendarDays} />
      <DateFact label="Batas pendaftaran" value={activity.registrationClosesAt} icon={Clock3} />
    </dl>
    <div className={d.informationRows}>
      <InformationRow title="Perlengkapan" icon={Backpack}>{activity.equipment.length ? <ul className={d.equipment}>{activity.equipment.map((item) => <li key={item}>{item}</li>)}</ul> : <span>—</span>}</InformationRow>
      <InformationRow title="Aksesibilitas" icon={Accessibility}><p>{activity.accessibilityNotes || t("Belum ada catatan.")}</p></InformationRow>
      <InformationRow title="Rencana serah terima sampah" icon={Recycle}><p>{activity.wasteHandoverPlan || t("Belum tersedia.")}</p></InformationRow>
    </div>
    <Link className={d.sourceLink} href={"/incidents/" + activity.reportId}>{t("Lihat kejadian sumber →")}</Link>
  </section>;
}

export function ActivityParticipation({ activity, children }: { activity: Activity; children: ReactNode }) {
  const { t } = useI18n();
  return <aside className={[d.card, d.joinCard].join(" ")} aria-labelledby="activity-participation-title">
    <Image className={d.cardLeaf} src="/images/community/activity-detail/leaf-card.webp" alt="" width={114} height={147} aria-hidden="true" />
    <h2 id="activity-participation-title">{t("Ikut kegiatan")}</h2>
    <div className={d.participants}><IconTile icon={UsersRound} /><div><strong>{activity.acceptedCount} / {activity.capacity} {t("peserta diterima")}</strong><p>{activity.availableSeats} {t("tempat tersedia")}</p></div></div>
    <div className={d.coordinator}><IconTile icon={UserRound} /><div><span>{t("Koordinator")}</span><p>{activity.coordinatorDisplayName || t("Belum tersedia.")}</p></div></div>
    <div className={d.joinActions}>{children}</div>
  </aside>;
}

export function ActivityDetailSkeleton() {
  const { t } = useI18n();
  return <div className={d.loading}>
    <p role="status"><FileText size={18} aria-hidden="true" />{t("Memuat detail kegiatan…")}</p>
    <div className={d.skeletonHeading} aria-hidden="true" />
    <div className={d.detailGrid} aria-hidden="true"><div className={[d.card, d.skeletonMain].join(" ")} /><div className={[d.card, d.skeletonJoin].join(" ")} /></div>
  </div>;
}
