"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import PublicationPhoto from "./publication-photo";
import AnimatedNumber from "../motion/animated-number";
import { listInstagramPosts } from "../../lib/api/instagram";
import {
  Busy,
  DateStamp,
  EmptyPublication,
  Notice,
  PostStatus,
} from "./publication-ui";
import { shortId } from "./publication-utils";
import type {
  InstagramOverview,
  InstagramPost,
  PublicationFilter,
  PublicationPage,
  PublicationQuery,
} from "./types";
import { publicationLabels } from "./types";
import styles from "./instagram.module.css";
import { useI18n } from "../../lib/i18n/provider";


export default function PublicationList({
  overview,
  available,
  loadingOverview,
  reloadKey,
  onOpen,
  onChoose,
  onRefresh,
}: {
  overview: InstagramOverview | null;
  available: boolean;
  loadingOverview: boolean;
  reloadKey: number;
  onOpen: (post: InstagramPost) => void;
  onChoose: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PublicationFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [period, setPeriod] = useState<PublicationQuery["period"]>("all");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState<PublicationPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const cursor = cursors.at(-1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCursors([undefined]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setCursors([undefined]);
  }, [reloadKey]);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listInstagramPosts(
      { status, search: debouncedSearch, period, cursor },
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setPage(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setPage(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Daftar postingan belum dapat dimuat.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [available, status, debouncedSearch, period, cursor, reloadKey, retry]);
  const filter = (value: PublicationFilter) => {
    setStatus(value);
    setCursors([undefined]);
  };
  const stats = [
    {
      label: "Total postingan",
      value: overview?.stats.total,
      icon: Layers3,
      filter: "all" as const,
    },
    {
      label: "Draf / belum terposting",
      value: overview?.stats.byStatus.draft,
      icon: FileText,
      filter: "draft" as const,
    },
    {
      label: "Terposting",
      value: overview?.stats.byStatus.published,
      icon: Send,
      filter: "published" as const,
    },
  ];
  const pending = loading || loadingOverview;
  const filtered = status !== "all" || !!search || period !== "all";
  return (
    <>
      <div className={styles.stats}>
        {stats.map(({ label, value, icon: Icon, filter: selection }) => (
          <button
            key={label}
            type="button"
            data-motion="card"
            className={styles.stat}
            onClick={() => filter(selection)}
            disabled={!available}
            aria-label={t("{0}: {1}, tampilkan daftar", { "0": label, "1": value ?? t("belum tersedia") })}
          >
            <span className={styles.statIcon}>
              <Icon size={26} />
            </span>
            <span>
              <small>{t(label)}</small>
              <strong><AnimatedNumber value={value ?? "—"} /></strong>
            </span>
          </button>
        ))}
      </div>
      <section className={styles.panel} aria-labelledby="instagram-list-title">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="instagram-list-title">{t("Daftar postingan")}</h2>
            <p>{t("Foto laporan, status, dan riwayat waktu publikasi.")}</p>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            onClick={() => {
              onRefresh();
              setRetry((value) => value + 1);
            }}
            disabled={pending}
            aria-label={t("Muat ulang publikasi")}
          >
            <RefreshCw size={19} />
          </button>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label={t("Filter status")}>
            {(
              [
                "all",
                "draft",
                "publishing",
                "published",
                "failed",
                "cancelled",
                "retracting",
                "retracted",
                "needs_action",
              ] as const
            ).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => filter(value)}
                aria-pressed={status === value}
                className={status === value ? styles.activeFilter : ""}
              >
                {value === "all" ? t("Semua") : publicationLabels[value]}
              </button>
            ))}
          </div>
          <div className={styles.toolbarFields}>
            <label className={styles.select}>
              <CalendarDays size={18} />
              <select
                aria-label={t("Periode masuk draf")}
                value={period}
                onChange={(event) => {
                  setPeriod(event.target.value as PublicationQuery["period"]);
                  setCursors([undefined]);
                }}
              >
                <option value="all">{t("Semua periode")}</option>
                <option value="7d">{t("7 hari terakhir")}</option>
                <option value="30d">{t("30 hari terakhir")}</option>
              </select>
            </label>
            <label className={styles.search}>
              <Search size={18} />
              <input
                type="search"
                aria-label={t("Cari postingan")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Cari postingan…")}
                maxLength={150}
              />
            </label>
          </div>
        </div>
        <div className={styles.table} aria-busy={pending}>
          <div className={styles.tableHeader} aria-hidden="true">
            <span>{t("Foto laporan / scan")}</span>
            <span>{t("Status")}</span>
            <span>{t("Masuk draf")}</span>
            <span>{t("Terposting")}</span>
            <span />
          </div>
          {pending ? (
            <Busy>{t("Memuat postingan…")}</Busy>
          ) : error ? (
            <div className={styles.error} role="alert">
              <strong>{t("Postingan belum dapat dimuat")}</strong>
              <p>{t(error)}</p>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                {t("Coba lagi")}</button>
            </div>
          ) : !available ? (
            <EmptyPublication title={t("Publikasi belum tersedia")}>
              {t("Pengelola perlu menyiapkan layanan R1. Data contoh tidak digunakan sebagai pengganti API.")}</EmptyPublication>
          ) : !page?.items.length ? (
            <EmptyPublication
              title={
                filtered
                  ? t("Tidak ada postingan yang cocok")
                  : t("Belum ada postingan")
              }
              action={
                filtered ? (
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={() => {
                      filter("all");
                      setSearch("");
                      setPeriod("all");
                    }}
                  >
                    {t("Reset filter")}</button>
                ) : (
                  <button
                    className={styles.primary}
                    type="button"
                    disabled={!overview?.capabilities.canCreateDraft}
                    onClick={onChoose}
                  >
                    <Plus size={18} />
                    {t("Pilih laporan")}</button>
                )
              }
            >
              {filtered
                ? t("Coba status, periode, atau kata pencarian yang lain.")
                : t("Pilih laporan yang disetujui untuk membuat draf Instagram.")}
            </EmptyPublication>
          ) : (
            page.items.map((post) => (
              <button
                type="button"
                className={styles.tableRow}
                key={post.id}
                onClick={() => onOpen(post)}
                aria-label={t("Detail {0}, {1}", { "0": post.source.title, "1": post.status === "published" ? "terposting" : t("belum terposting") })}
              >
                <span className={styles.contentCell}>
                  <PublicationPhoto
                    mediaId={post.source.mediaId}
                    reportId={post.source.reportId}
                    alt={post.source.title}
                    className={styles.rowPhoto}
                  />
                  <span className={styles.rowCopy}>
                    <strong>{post.source.title}</strong>
                    <span>{post.source.categoryName}</span>
                    <small>
                      {t("Laporan #")}{shortId(post.source.reportId)}
                      {post.source.scanId &&
                        ` · Scan #${shortId(post.source.scanId)}`}
                    </small>
                  </span>
                </span>
                <span className={styles.statusCell}>
                  <PostStatus status={post.status} />
                </span>
                <span className={styles.timestampCell}>
                  <span className={styles.mobileLabel}>{t("Masuk draf")}</span>
                  <DateStamp value={post.createdAt} />
                </span>
                <span className={styles.timestampCell}>
                  <span className={styles.mobileLabel}>{t("Terposting")}</span>
                  <DateStamp value={post.publishedAt} />
                </span>
                <ChevronRight
                  className={styles.rowChevron}
                  size={21}
                  aria-hidden="true"
                />
              </button>
            ))
          )}
        </div>
        {available && page && !pending && !error && (
          <div className={styles.tableFooter}>
            <span>
              {page.items.length
                ? t("Menampilkan {0}–{1} dari {2} postingan", { "0": (cursors.length - 1) * 12 + 1, "1": (cursors.length - 1) * 12 + page.items.length, "2": page.total })
                : t("0 postingan")}
            </span>
            <nav aria-label={t("Halaman postingan")}>
              <button
                className={styles.iconButton}
                type="button"
                disabled={cursors.length === 1}
                onClick={() => setCursors((current) => current.slice(0, -1))}
                aria-label={t("Halaman sebelumnya")}
              >
                <ChevronLeft size={18} />
              </button>
              <span>{t("Halaman")}{" "}{cursors.length}</span>
              <button
                className={styles.iconButton}
                type="button"
                disabled={!page.nextCursor}
                onClick={() => {
                  if (page.nextCursor)
                    setCursors((current) => [...current, page.nextCursor!]);
                }}
                aria-label={t("Halaman berikutnya")}
              >
                <ChevronRight size={18} />
              </button>
            </nav>
          </div>
        )}
        <Notice>
          <strong>{t("Publikasi yang dapat ditelusuri")}</strong>
          <p>
            {t("Waktu masuk draf dicatat saat tersimpan. Waktu terposting dicatat setelah publikasi Instagram berhasil.")}</p>
        </Notice>
      </section>
    </>
  );
}
