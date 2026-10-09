"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type SapCategory,
} from "../../lib/api/client";
import { getIncident } from "../../lib/api/community";
import { reportLifecycle, reportPublications, searchInstagramReportSources, type InstagramReportSourcePage } from "../../lib/api/instagram";
import { permissionReason, type R1 } from "../../lib/api/r1";
import PublicationPhoto from "./publication-photo";
import DialogShell from "./dialog-shell";
import { Notice } from "./publication-ui";
import { publicationError, shortId } from "./publication-utils";
import { publicationLabels, type PostPreview } from "./types";
import { Empty, Failure } from "../community/community-ui";
import styles from "./instagram.module.css";
import { useI18n } from "../../lib/i18n/provider";

type ReportSource = InstagramReportSourcePage["items"][number];

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
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [reports, setReports] = useState<ReportSource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (query: string, next?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    if (!next) {
      setReports([]);
      setCursor(null);
    }
    try {
      const page = await searchInstagramReportSources(query, next, controller.signal);
      if (controller.signal.aborted) return;
      setReports(current => next
        ? [...new Map([...current, ...page.items].map(report => [report.reportId, report])).values()]
        : page.items);
      setCursor(page.nextCursor);
      setSubmittedSearch(query);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    request.current?.abort();
    setLoading(true);
    const timer = window.setTimeout(() => void load(search.trim()), 250);
    return () => {
      window.clearTimeout(timer);
      request.current?.abort();
    };
  }, [load, search]);
  const searchPending = search.trim() !== submittedSearch;
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
        <span>{t("Cari ringkasan, kategori, tanggal, atau ID laporan")}</span>
        <input
          type="search"
          value={search}
          maxLength={150}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className={styles.sourceList}>
        {reports.map((report) => (
          <EligibleSource
            key={report.reportId}
            report={report}
            categories={categories}
            onChoose={onChoose}
          />
        ))}
      </div>
      {error !== null && (
        <Failure error={error} retry={() => void load(search.trim())} />
      )}{" "}
      {loading ? (
        <p role="status">{t("Memuat laporan…")}</p>
      ) : !reports.length && error === null ? (
        <Empty>
          {t("Belum ada laporan yang cocok. Tinjau sumber melalui moderasi.")}</Empty>
      ) : null}
      {cursor && (
        <button
          className={styles.secondary}
          disabled={loading || searchPending}
          onClick={() => void load(submittedSearch, cursor)}
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
  report: ReportSource;
  categories: SapCategory[];
  onChoose: (preview: Omit<PostPreview, "caption">) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [checkVersion, setCheckVersion] = useState(0),
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
    setLifecycle(null);
    setIncident(null);
    setPosts([]);
    setMilestone("");
    Promise.all([
      reportLifecycle(report.reportId, c.signal),
      getIncident(report.reportId, c.signal),
      reportPublications(report.reportId, undefined, c.signal),
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
        if (!c.signal.aborted) setError(publicationError(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [open, report.reportId, checkVersion]);
  const selected = lifecycle?.publicationMilestones.find(
      (m) => m.id === milestone,
    ),
    currentSeries = lifecycle?.instagramPublicationSeries.find(
      (series) =>
        series.kind === kind &&
        series.milestoneId === (kind === "resolution" ? selected?.id ?? null : null),
    ),
    seriesBlocked = currentSeries !== undefined && !currentSeries.canCreate,
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
      seriesBlocked ||
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
        reportId: report.reportId,
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
          categories.find((c) => c.id === report.categoryName || c.name === report.categoryName)?.name ??
          report.categoryName ?? t("Sampah lainnya"),
        mediaId,
        publicSummary:
          kind === "resolution" ? selected!.summary : incident.summary,
      },
    });
  }
  return (
    <article className={styles.sourceCard}>
      <h3>{report.publicSummary ?? `Laporan #${shortId(report.reportId)}`}</h3>
      <button className={styles.secondary} onClick={() => setOpen((v) => !v)}>
        {open ? t("Tutup pilihan") : t("Periksa kelayakan publikasi")}
      </button>
      {open && (
        <>
          {loading ? (
            <p role="status">{t("Memeriksa lifecycle dan foto berizin…")}</p>
          ) : error ? (
            <div>
              <p className={styles.error} role="alert">{t(error)}</p>
              <button type="button" className={styles.secondary} onClick={() => setCheckVersion(v => v + 1)}>{t("Muat ulang")}</button>
            </div>
          ) : !eligible ? (
            <Notice warning>
              {t("Publikasi belum diizinkan:")}{" "}
              {t(permissionReason(lifecycle?.actions.createInstagramDraft.reasonCode) ||
                "Sumber laporan belum memenuhi syarat publikasi.")}
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
                  <option value="initial" disabled={lifecycle!.instagramPublicationSeries.some(
                    (series) => series.kind === "initial" && !series.canCreate,
                  )}>{t("Kejadian awal")}{lifecycle!.instagramPublicationSeries.some(
                    (series) => series.kind === "initial" && !series.canCreate,
                  ) ? ` · ${t("generation aktif")}` : ""}</option>
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
                      <option key={m.id} value={m.id} disabled={lifecycle!.instagramPublicationSeries.some(
                        (series) => series.kind === "resolution" && series.milestoneId === m.id && !series.canCreate,
                      )}>
                        {m.outcome === "partial" ? "Sebagian" : "Lengkap"} ·{" "}
                        {m.summary}{lifecycle!.instagramPublicationSeries.some(
                          (series) => series.kind === "resolution" && series.milestoneId === m.id && !series.canCreate,
                        ) ? ` · ${t("generation aktif")}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {seriesBlocked && currentSeries && (
                <Notice warning>
                  {t("Generation {0} seri ini masih berstatus {1}. Kelola postingan yang ada di tab Postingan; batalkan draf/gagal atau tarik posting yang sudah terbit sebelum membuat generation baru.", {
                    "0": currentSeries.generation,
                    "1": t(publicationLabels[currentSeries.status]),
                  })}
                </Notice>
              )}
              <div className={styles.sourcePhotos}>
                {assets.map((asset, index) => (
                  <button
                    className={styles.photoChoice}
                    key={asset.mediaId}
                    disabled={seriesBlocked || (kind === "resolution" && !selected)}
                    onClick={() => choose(asset.mediaId)}
                  >
                    <PublicationPhoto
                      mediaId={asset.mediaId}
                      reportId={report.reportId}
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
