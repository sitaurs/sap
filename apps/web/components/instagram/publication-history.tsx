"use client";
import { useCallback, useState } from "react";
import { reportPublications } from "../../lib/api/instagram";
import { usePage } from "../community/community-ui";
import { r1Error } from "../../lib/api/r1";
import { DateStamp, PostStatus } from "./publication-ui";
import { shortId } from "./publication-utils";
import s from "./instagram.module.css";
import { useI18n } from "../../lib/i18n/provider";

export default function PublicationHistory({ reportId }: { reportId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t("Riwayat publikasi sumber")}</summary>
      {open && <History reportId={reportId} />}
    </details>
  );
}
function History({ reportId }: { reportId: string }) {
  const { t } = useI18n();
  const loader = useCallback(
    (cursor?: string, signal?: AbortSignal) =>
      reportPublications(reportId, cursor, signal),
    [reportId],
  );
  const page = usePage(loader);
  return (
    <section className={s.operation} aria-label={t("Riwayat publikasi")}>
      {page.loading && <p role="status">{t("Memuat riwayat…")}</p>}
      {page.items.map((post) => (
        <article key={post.id} className={s.operation}>
          <strong>
            {post.kind === "initial" ? t("Kejadian awal") : t("Hasil penanganan")} {" "}{t("· generasi")}{" "}{post.generation}
          </strong>
          <PostStatus status={post.status} />
          <small>#{shortId(post.id)}</small>
          <p>
            {t("Masuk draf:")}{" "}<DateStamp value={post.createdAt} />
          </p>
          <p>
            {t("Pernah terposting:")}{" "}<DateStamp value={post.publishedAt} />
          </p>
          {post.retractedAt && (
            <p>
              {t("Ditarik:")}{" "}<DateStamp value={post.retractedAt} />
            </p>
          )}
          {post.replacesPostId && (
            <p>{t("Menggantikan generasi #")}{shortId(post.replacesPostId)}</p>
          )}
        </article>
      ))}
      {!page.loading && !page.items.length && page.error === null && (
        <p>{t("Belum ada riwayat publikasi.")}</p>
      )}
      {page.error !== null && (
        <p role="alert" className={s.error}>
          {r1Error(page.error)}
        </p>
      )}
      <button
        className={s.secondary}
        disabled={page.loading}
        onClick={page.refresh}
      >
        {t("Perbarui riwayat")}</button>
      {page.cursor && (
        <button
          className={s.secondary}
          disabled={page.loading}
          onClick={() => void page.more()}
        >
          {t("Muat riwayat berikutnya")}</button>
      )}
    </section>
  );
}
