"use client";
import { useCallback } from "react";
import Link from "next/link";
import { areaIncidents } from "../../lib/api/community";
import { Failure, usePage } from "./community-ui";
import s from "./community.module.css";
import { useI18n } from "../../lib/i18n/provider";

export default function AreaIncidentLinks({
  cellId,
  from,
  to,
  categoryId,
}: {
  cellId: string;
  from: string;
  to: string;
  categoryId?: string;
}) {
  const { t } = useI18n();
  const loader = useCallback(
      (cursor?: string, signal?: AbortSignal) =>
        areaIncidents(cellId, from, to, categoryId, cursor, signal),
      [cellId, from, to, categoryId],
    ),
    page = usePage(loader);
  return (
    <section
      className={`${s.page} ${s.row}`}
      aria-label={t("Kejadian publik pada area")}
    >
      <h3>{t("Kejadian publik")}</h3>
      {page.items.map((item) => (
        <Link className={s.link} key={item.id} href={`/incidents/${item.id}`}>
          {item.summary || t("Lihat kejadian terverifikasi")} →
        </Link>
      ))}
      {page.error !== null && (
        <Failure error={page.error} retry={page.refresh} />
      )}{" "}
      {page.loading ? (
        <p role="status">{t("Memuat kejadian…")}</p>
      ) : !page.items.length && page.error === null ? (
        <p className={s.muted}>{t("Belum ada kejadian publik dalam periode ini.")}</p>
      ) : null}
      {page.cursor && (
        <button
          className={s.secondary}
          disabled={page.loading}
          onClick={() => void page.more()}
        >
          {t("Muat kejadian berikutnya")}</button>
      )}
    </section>
  );
}
