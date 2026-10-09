"use client";

import { CalendarDays } from "lucide-react";
import { useI18n } from "../../lib/i18n/provider";
import { dateLabel } from "./activity-utils";
import v from "./volunteer-workspace.module.css";

export function WorkspaceSchedule({ startsAt, endsAt }: { startsAt: string | null; endsAt: string | null }) {
  const { t, intlLocale } = useI18n();
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (!start || !Number.isFinite(start.getTime())) return <span className={v.schedule}><CalendarDays size={17} aria-hidden="true" />{t("Belum ditentukan")}</span>;
  const day = new Intl.DateTimeFormat(intlLocale, { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });
  const clock = new Intl.DateTimeFormat(intlLocale, { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const validEnd = end && Number.isFinite(end.getTime());
  const label = validEnd && day.format(start) !== day.format(end)
    ? `${dateLabel(startsAt, true, intlLocale)} — ${dateLabel(endsAt, true, intlLocale)}`
    : `${day.format(start)} · ${clock.format(start)}${validEnd ? `–${clock.format(end)}` : ""} WIB`;
  return <span className={v.schedule}><CalendarDays size={17} aria-hidden="true" /><time dateTime={startsAt!}>{label}</time></span>;
}
