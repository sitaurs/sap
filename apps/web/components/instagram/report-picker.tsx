"use client";
import { useCallback, useEffect, useState } from "react";
import {
  listAdminReports,
  type SapCategory,
  type SapReport,
} from "../../lib/api/client";
import { getIncident } from "../../lib/api/community";
import { reportLifecycle, reportPublications } from "../../lib/api/instagram";
import { r1Error, type R1 } from "../../lib/api/r1";
import PublicationPhoto from "./publication-photo";
import DialogShell from "./dialog-shell";
import { Notice } from "./publication-ui";
import { shortId } from "./publication-utils";
import type { PostPreview } from "./types";
import { Empty, Failure, usePage } from "../community/community-ui";
import styles from "./instagram.module.css";
import { useI18n } from "../../lib/i18n/provider";

export default function ReportPicker({
  categories,
  onChoose,
  onClose,
  onModeration,
}: {
  categories: SapCategory[];
  onChoose: (preview: Omit<PostPreview, "caption">) => void;
  onClose: () => void;
  onModeration: () => void;
}) {
  const { t } = useI18n();
  const loader = useCallback(
      (cursor?: string, signal?: AbortSignal) =>
        listAdminReports(undefined, cursor, signal),
      [],
    ),
    page = usePage(loader);
  const [search, setSearch] = useState("");
  const visible = page.items.filter(
    (r) =>
      ["verified", "in_progress", "resolved"].includes(r.status) &&
      `${r.publicSummary ?? ""} ${r.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <DialogShell
      wide
      title={t("Pilih sumber publikasi")}
      subtitle={t("Foto berizin, laporan terverifikasi, dan milestone yang disetujui.")}
      onClose={onClose}
    >
      <Notice>
        {t("Daftar laporan bukan bukti izin Instagram. Kelayakan dan versi foto diperiksa melalui lifecycle tiap laporan.")}</Notice>
      <label className={styles.field}>
        <span>{t("Cari laporan yang dimuat")}</span>
        <input
          type="search"
          value={search}
          maxLength={150}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className={styles.sourceList}>
        {visible.map((report) => (
          <EligibleSource
            key={report.id}
            report={report}
            categories={categories}
            onChoose={onChoose}
          />
        ))}
      </div>
      {page.error !== null && (
        <Failure error={page.error} retry={page.refresh} />
      )}{" "}
      {page.loading ? (
        <p role="status">{t("Memuat laporan…")}</p>
      ) : !visible.length && page.error === null ? (
        <Empty>
          {t("Belum ada laporan yang cocok. Tinjau sumber melalui moderasi.")}</Empty>
      ) : null}
      {page.cursor && (
        <button
          className={styles.secondary}
          disabled={page.loading}
          onClick={() => void page.more()}
        >
          {t("Muat laporan berikutnya")}</button>
      )}
      <button className={styles.textButton} onClick={onModeration}>
        {t("Buka moderasi laporan")}</button>
    </DialogShell>
  );
}
function EligibleSource({
  report,
  categories,
  onChoose,
}: {
  report: SapReport;
  categories: SapCategory[];
  onChoose: (preview: Omit<PostPreview, "caption">) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [lifecycle, setLifecycle] = useState<R1["ReportLifecycle"] | null>(null),
    [incident, setIncident] = useState<R1["PublicIncident"] | null>(null),
    [posts, setPosts] = useState<R1["InstagramPost"][]>([]),
    [kind, setKind] = useState<"initial" | "resolution">("initial"),
    [milestone, setMilestone] = useState("");
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      reportLifecycle(report.id, c.signal),
      getIncident(report.id, c.signal),
      reportPublications(report.id, undefined, c.signal),
    ])
      .then(([l, i, p]) => {
        if (c.signal.aborted) return;
        if (i.kind !== "incident" || i.sourceRevision !== l.sourceRevision)
          throw new Error(
            "Sumber berubah atau dialihkan. Muat ulang laporan canonical sebelum membuat draf.",
          );
        setLifecycle(l);
        setIncident(i);
        setPosts(p.items);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(r1Error(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [open, report.id]);
  const selected = lifecycle?.publicationMilestones.find(
      (m) => m.id === milestone,
    ),
    eligible =
      lifecycle?.actions.createInstagramDraft.allowed &&
      lifecycle.instagramAllowed &&
      incident;
  const assets =
    lifecycle?.publicationAssets.filter(
      (a) =>
        a.channels.includes("instagram") &&
        (kind === "initial"
          ? a.sourceType === "report"
          : !!selected &&
            (selected.type === "activity_result"
              ? a.sourceType === "activity_result" && a.sourceId === selected.id
              : a.sourceType === "report" ||
                lifecycle.approvedResolutionEvidence.some(
                  (e) =>
                    e.mediaId === a.mediaId &&
                    e.status === "valid" &&
                    e.sourceId === a.sourceId &&
                    e.sourceType === a.sourceType,
                ))),
    ) ?? [];
  function choose(mediaId: string) {
    if (
      !eligible ||
      !incident ||
      !lifecycle ||
      (kind === "resolution" && !selected)
    )
      return;
    const history = posts
        .filter(
          (p) => p.kind === kind && p.milestoneId === (selected?.id ?? null),
        )
        .sort((a, b) => b.generation - a.generation),
      replacement = history[0];
    onChoose({
      kind,
      milestoneId: kind === "resolution" ? selected!.id : null,
      replacesPostId:
        replacement && ["cancelled", "retracted"].includes(replacement.status)
          ? replacement.id
          : null,
      source: {
        reportId: report.id,
        sourceRevision: lifecycle.sourceRevision,
        scanId: report.scanId,
        status: incident.status,
        occurredAt: incident.occurredAt,
        area: incident.area,
        title:
          kind === "resolution"
            ? `${selected?.outcome === "partial" ? "Penanganan sebagian" : "Hasil penanganan"}: ${incident.title}`
            : incident.title,
        categoryName:
          categories.find((c) => c.id === report.categoryId)?.name ??
          "Sampah lainnya",
        mediaId,
        publicSummary:
          kind === "resolution" ? selected!.summary : incident.summary,
      },
    });
  }
  return (
    <article className={styles.sourceCard}>
      <h3>{report.publicSummary ?? `Laporan #${shortId(report.id)}`}</h3>
      <button className={styles.secondary} onClick={() => setOpen((v) => !v)}>
        {open ? t("Tutup pilihan") : t("Periksa kelayakan publikasi")}
      </button>
      {open && (
        <>
          {loading ? (
            <p role="status">{t("Memeriksa lifecycle dan foto berizin…")}</p>
          ) : error ? (
            <p className={styles.error} role="alert">
              {t(error)}
            </p>
          ) : !eligible ? (
            <Notice warning>
              {t("Publikasi belum diizinkan:")}{" "}
              {lifecycle?.actions.createInstagramDraft.reasonCode ??
                t("sumber belum tersedia")}
              .
            </Notice>
          ) : (
            <>
              <label className={styles.field}>
                <span>{t("Jenis publikasi")}</span>
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as typeof kind);
                    setMilestone("");
                  }}
                >
                  <option value="initial">{t("Kejadian awal")}</option>
                  <option value="resolution">
                    {t("Hasil penanganan yang disetujui")}</option>
                </select>
              </label>
              {kind === "resolution" && (
                <label className={styles.field}>
                  <span>{t("Milestone hasil")}</span>
                  <select
                    value={milestone}
                    onChange={(e) => setMilestone(e.target.value)}
                  >
                    <option value="">{t("Pilih hasil yang disetujui")}</option>
                    {lifecycle!.publicationMilestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.outcome === "partial" ? "Sebagian" : "Lengkap"} ·{" "}
                        {m.summary}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className={styles.sourcePhotos}>
                {assets.map((asset, index) => (
                  <button
                    className={styles.photoChoice}
                    key={asset.mediaId}
                    disabled={kind === "resolution" && !selected}
                    onClick={() => choose(asset.mediaId)}
                  >
                    <PublicationPhoto
                      mediaId={asset.mediaId}
                      reportId={report.id}
                      alt={t("Bukti berizin dari laporan")}
                      className={styles.choicePhoto}
                    />
                    <span>{t("Pilih foto berizin")}{" "}{index + 1}</span>
                  </button>
                ))}
              </div>
              {!assets.length && (
                <p className={styles.helper}>
                  {t("Belum ada foto berizin yang memenuhi pilihan ini.")}</p>
              )}
            </>
          )}
        </>
      )}
    </article>
  );
}
