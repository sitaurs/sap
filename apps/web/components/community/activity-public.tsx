"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Clock3, FileText, LockKeyhole, MapPin, Scale, Search, UsersRound, X } from "lucide-react";
import { ApiError } from "../../lib/api/client";
import {
  acknowledgeSchedule,
  activityViewer,
  joinActivity,
  publicActivities,
  publicActivity,
  publicResults,
} from "../../lib/api/community";
import type { R1 } from "../../lib/api/r1";
import { loginDestination } from "../../lib/auth-return";
import {
  date,
  Evidence,
  Failure,
  Heading,
  PublicShell,
  usePage,
} from "./community-ui";
import { displayedActivityStatus, memberLabels, statusLabels } from "../activities/activity-utils";
import s from "./community.module.css";
import p from "./public-community.module.css";
import d from "./public-activity-detail.module.css";
import { ActivityIllustration, CardOptions, CommunityHero, ExploreEmpty, ListSkeleton, publicAreaLabel } from "./public-community";
import { ActivityDetailHeading, ActivityDetailSkeleton, ActivityInformation, ActivityParticipation } from "./public-activity-detail";
import { useI18n } from "../../lib/i18n/provider";

export function ActivityExplore() {
  const { t, intlLocale } = useI18n();
  const [available, setAvailable] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const range = useMemo(() => {
    const now = new Date().toISOString();
    return { from: period === "upcoming" ? now : undefined, to: period === "past" ? now : undefined };
  }, [period]);
  const loader = useCallback((cursor?: string, signal?: AbortSignal) => publicActivities({ cursor, availableOnly: available, ...range }, signal), [available, range]);
  const page = usePage(loader);
  const items = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(intlLocale);
    return query ? page.items.filter((activity) => (activity.title + " " + activity.description + " " + activity.area.label).toLocaleLowerCase(intlLocale).includes(query)) : page.items;
  }, [page.items, search, intlLocale]);
  const hasFilters = Boolean(available || search || period !== "all");
  function reset() { setAvailable(false); setSearch(""); setPeriod("all"); }
  return <PublicShell>
    <CommunityHero variant="activities" title={t("Temukan aksi bersama")}>
      {t("Pilih kegiatan lingkungan dan ajukan keikutsertaan Anda. Bersama, kita wujudkan lingkungan yang lebih bersih, sehat, dan berkelanjutan.")}
    </CommunityHero>
    <div className={p.activityFilters} role="group" aria-label={t("Filter kegiatan relawan")}>
      <label className={p.availableCheck}><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} />{t("Hanya kegiatan dengan tempat tersedia")}</label>
      <label className={[p.searchField, p.activitySearch, search ? p.activitySearchOpen : ""].join(" ")} htmlFor="cari-kegiatan"><span className={p.srOnly}>{t("Cari kegiatan")}</span><Search size={17} aria-hidden="true" />
        <input id="cari-kegiatan" type="search" aria-label={t("Cari kegiatan")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Cari kegiatan")} autoComplete="off" />
        {search && <button className={p.clearSearch} type="button" aria-label={t("Hapus pencarian")} onClick={() => setSearch("")}><X size={14} aria-hidden="true" /></button>}
      </label>
      <label className={[p.selectField, p.periodField].join(" ")}><span className={p.srOnly}>{t("Periode kegiatan")}</span><CalendarDays size={17} aria-hidden="true" />
        <select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">{t("Semua kegiatan")}</option><option value="upcoming">{t("Kegiatan mendatang")}</option><option value="past">{t("Kegiatan sebelumnya")}</option></select><ChevronDown size={15} aria-hidden="true" />
      </label>
    </div>
    {page.error !== null && <Failure error={page.error} retry={page.refresh} />}
    <section className={p.resultsSection} aria-labelledby="activity-results-title" aria-busy={page.loading}>
      <div className={[p.resultsBar, !hasFilters && !page.loading ? p.resultsBarCompact : ""].join(" ")}>
        <h2 id="activity-results-title" className={!hasFilters && !page.loading ? p.srOnly : undefined} aria-live="polite">{page.loading ? t("Memuat kegiatan…") : t("{count} kegiatan relawan", { count: String(items.length) + (page.cursor ? "+" : "") })}</h2>
        {hasFilters && items.length > 0 && <button type="button" className={p.textButton} onClick={reset}><X size={14} aria-hidden="true" />{t("Reset filter")}</button>}
      </div>
      {page.loading && !page.items.length ? <ListSkeleton activities /> : <div className={p.cardGrid}>
        {items.map((activity) => {
          const status = displayedActivityStatus(activity);
          const Icon = status === "completed" ? CheckCircle2 : status === "registration_open" ? UsersRound : status === "registration_closed" ? LockKeyhole : Clock3;
          return <article className={[p.listCard, p.activityCard].join(" ")} key={activity.id}>
            <div className={p.cardTop}><span className={p.statusBadge} data-status={status}><Icon size={15} aria-hidden="true" />{t(statusLabels[status])}</span><CardOptions href={"/activities/" + activity.id} title={activity.title} /></div>
            <ActivityIllustration id={activity.id} title={activity.title} description={activity.description} />
            <h2 className={p.cardTitle}><Link href={"/activities/" + activity.id}>{activity.title}</Link></h2>
            <div className={p.cardMetadata}>
              <span className={p.metadataItem}><MapPin size={16} aria-hidden="true" />{publicAreaLabel(activity.area, t)}</span>
              <span className={p.metadataItem}><CalendarDays size={16} aria-hidden="true" /><time dateTime={activity.startsAt}>{date(activity.startsAt, intlLocale)}</time></span>
              <span className={p.metadataItem}><UsersRound size={17} aria-hidden="true" /><span>{activity.registrationOpen ? t("{0}/{1} peserta · {2} tempat tersedia", { "0": activity.acceptedCount, "1": activity.capacity, "2": activity.availableSeats }) : <>{activity.acceptedCount}/{activity.capacity} {t("peserta")} · {t(status === "completed" ? "Kegiatan selesai" : "Pendaftaran ditutup")}</>}</span></span>
            </div>
            <div className={p.cardFooter}><Link className={p.cardButton} href={"/activities/" + activity.id}>{t("Lihat kegiatan")}<ChevronRight size={18} aria-hidden="true" /></Link></div>
          </article>;
        })}
      </div>}
      {!page.loading && !items.length && page.error === null && <ExploreEmpty title={t("Belum ada kegiatan publik untuk filter ini.")} onReset={hasFilters ? reset : undefined}>{t("Coba kegiatan lain, atau ubah periode dan pilihan tempat tersedia.")}</ExploreEmpty>}
      {page.loading && page.items.length > 0 && <p className={p.loadingText} role="status">{t("Memuat kegiatan…")}</p>}
    </section>
    {page.cursor && <button type="button" disabled={page.loading} className={[p.secondaryButton, p.loadMore].join(" ")} onClick={() => void page.more()}>{t("Muat kegiatan berikutnya")}<ChevronDown size={16} aria-hidden="true" /></button>}
  </PublicShell>;
}
export default function ActivityPublic({ id }: { id: string }) {
  const { t, intlLocale } = useI18n();
  const [activity, setActivity] = useState<R1["PublicActivityDetail"] | null>(
      null,
    ),
    [viewer, setViewer] = useState<R1["ActivityViewer"] | null>(null),
    [guest, setGuest] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [actionError, setActionError] = useState<unknown>(null),
    [message, setMessage] = useState(""),
    [epoch, setEpoch] = useState(0),
    [confirm, setConfirm] = useState<"cancel" | "decline_schedule" | null>(
      null,
    );
  const resultLoader = useCallback(
    (cursor?: string, signal?: AbortSignal) =>
      publicResults(id, cursor, signal),
    [id],
  );
  const results = usePage(resultLoader);
  const actionBlocked = busy || actionError !== null;
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError(null);
    setActivity(null);
    setViewer(null);
    setGuest(false);
    setActionError(null);
    setConfirm(null);
    publicActivity(id, c.signal)
      .then(async (a) => {
        if (c.signal.aborted) return;
        setActivity(a);
        try {
          const v = await activityViewer(id, c.signal);
          if (!c.signal.aborted) setViewer(v);
        } catch (e) {
          if (c.signal.aborted) return;
          if (e instanceof ApiError && e.status === 401) setGuest(true);
          else if (e instanceof ApiError && e.status === 410) {
            setActivity(null);
            setError(e);
          } else setActionError(e);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, epoch]);
  async function participate(value: boolean) {
    if (actionBlocked) return;
    setBusy(true);
    setActionError(null);
    try {
      const membership = await joinActivity(id, value);
      setViewer((v) => (v ? { ...v, membership } : v));
      setMessage(
        value
          ? "Permintaan ikut terkirim. Tunggu keputusan koordinator; Anda belum dinyatakan diterima."
          : "Keikutsertaan dibatalkan.",
      );
      setConfirm(null);
      setEpoch((v) => v + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) {
        setActivity(null);
        setViewer(null);
        setError(e);
      } else setActionError(e);
    } finally {
      setBusy(false);
    }
  }
  async function acknowledge(confirmed: boolean) {
    if (!viewer || actionBlocked) return;
    setBusy(true);
    try {
      await acknowledgeSchedule(id, viewer.scheduleRevision, confirmed);
      setMessage(
        confirmed
          ? "Jadwal baru dikonfirmasi."
          : "Keikutsertaan dibatalkan karena jadwal tidak sesuai.",
      );
      setConfirm(null);
      setEpoch((v) => v + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) {
        setActivity(null);
        setViewer(null);
        setError(e);
        setConfirm(null);
      } else setActionError(e); /* Read the schedule again before retrying. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell variant="activity-detail">
      <Link className={d.backLink} href="/activities">
        {t("← Semua kegiatan")}</Link>
      {loading ? (
        <ActivityDetailSkeleton />
      ) : error !== null ? (
        <Failure error={error} retry={() => setEpoch((v) => v + 1)} />
      ) : activity?.kind === "activity_notice" ? (
        <section className={s.card}>
          <Heading title={t(statusLabels[activity.status])} />
          <p>{activity.message}</p>
          {activity.cancellationReason && <p>{activity.cancellationReason}</p>}
          {viewer?.actions.cancelMembership.allowed && (
            <button
              className={s.danger}
              disabled={actionBlocked}
              onClick={() => setConfirm("cancel")}
            >
              {t("Batalkan keikutsertaan")}</button>
          )}
        </section>
      ) : activity ? (
        <>
          <ActivityDetailHeading activity={activity} />
          <div className={d.detailGrid}>
            <ActivityInformation activity={activity} />
            <ActivityParticipation activity={activity}>
              {guest ? (
                <Link
                  className={d.primaryAction}
                  href={loginDestination(`/activities/${id}`)}
                >
                  {t("Masuk untuk ikut")}<ArrowRight size={18} aria-hidden="true" /></Link>
              ) : viewer ? (
                <>
                  <p className={d.memberStatus}>
                    {t("Status Anda:")}{" "}
                    <strong>
                      {viewer.membership
                        ? t(memberLabels[viewer.membership.status])
                        : t("Belum meminta ikut")}
                    </strong>
                  </p>
                  {viewer.membership?.reason && (
                    <p>{viewer.membership.reason}</p>
                  )}
                  <button
                    className={d.primaryAction}
                    disabled={actionBlocked || !activity.registrationOpen || !viewer.actions.join.allowed}
                    onClick={() => void participate(true)}
                  >
                    {t("Ajukan ikut kegiatan")}<ArrowRight size={18} aria-hidden="true" /></button>
                  <button
                    className={d.secondaryAction}
                    disabled={
                      actionBlocked || !viewer.actions.cancelMembership.allowed
                    }
                    onClick={() => setConfirm("cancel")}
                  >
                    {t("Batalkan permintaan / ikut")}</button>
                  {viewer.meetingPoint && (
                    <div className={d.notice}>
                      <strong>{t("Titik kumpul")}</strong>
                      <p>{viewer.meetingPoint.instructions}</p>
                      {viewer.meetingPoint.latitude !== null &&
                        viewer.meetingPoint.longitude !== null && (
                          <p>
                            {viewer.meetingPoint.latitude},{" "}
                            {viewer.meetingPoint.longitude}
                          </p>
                        )}
                    </div>
                  )}
                  {viewer.scheduleAcknowledgementRequired && (
                    <div className={d.notice}>
                      <strong>{t("Jadwal berubah · perlu konfirmasi")}</strong>
                      <p>
                        {date(activity.startsAt, intlLocale)} — {date(activity.endsAt, intlLocale)}
                      </p>
                      <button
                        className={d.primaryAction}
                        disabled={actionBlocked}
                        onClick={() => void acknowledge(true)}
                      >
                        {t("Saya dapat hadir di jadwal baru")}</button>
                      <button
                        className={d.secondaryAction}
                        disabled={actionBlocked}
                        onClick={() => setConfirm("decline_schedule")}
                      >
                        {t("Jadwal tidak sesuai")}</button>
                    </div>
                  )}
                  {viewer.actions.manage.allowed && (
                    <Link
                      className={d.secondaryAction}
                      href={`/activities/${id}/manage`}
                    >
                      {t("Kelola sebagai koordinator")}</Link>
                  )}
                </>
              ) : null}
            </ActivityParticipation>
          </div>
          <section className={[d.card, d.results].join(" ")} aria-labelledby="approved-results-title">
            <h2 id="approved-results-title"><FileText size={23} aria-hidden="true" />{t("Hasil yang disetujui")}</h2>
            {results.error !== null && <Failure error={results.error} retry={results.refresh} />}
            {results.loading ? <p role="status">{t("Memuat hasil…")}</p> : !results.items.length && results.error === null ? <div className={d.resultsEmpty}><FileText size={22} aria-hidden="true" /><p>{t("Belum ada hasil publik yang disetujui.")}</p></div> : null}
            {results.items.map((result) => <article key={result.id} className={d.resultArticle}>
              <span className={s.badge}>{result.outcome === "partial" ? t("Penanganan sebagian") : t("Penanganan lengkap")}</span>
              <p className={s.pre}>{result.summary}</p>
              <p className={d.resultMeta}><CalendarDays size={16} aria-hidden="true" /><time dateTime={result.observedAt}>{date(result.observedAt, intlLocale)}</time></p>
              <Evidence items={result.evidence} />
              <p className={d.resultMeta}><Scale size={17} aria-hidden="true" />{result.verifiedMeasurement ? `${result.verifiedMeasurement.valueKg} kg · ${result.verifiedMeasurement.stage}` : t("Berat terverifikasi belum tersedia.")}</p>
            </article>)}
            {results.cursor && <button className={d.secondaryAction} disabled={results.loading} onClick={() => void results.more()}>{t("Muat hasil berikutnya")}</button>}
          </section>
        </>
      ) : null}
      {confirm && (
        <div className={s.conflict} role="alert">
          <strong>
            {confirm === "cancel"
              ? t("Batalkan keikutsertaan Anda?")
              : t("Tolak jadwal baru dan batalkan keikutsertaan?")}
          </strong>
          <div className={s.actions}>
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t("Kembali")}</button>
            <button
              className={s.danger}
              disabled={actionBlocked}
              onClick={() =>
                void (confirm === "cancel"
                  ? participate(false)
                  : acknowledge(false))
              }
            >
              {t("Ya, batalkan")}</button>
          </div>
        </div>
      )}
      {actionError !== null && (
        <Failure error={actionError} retry={() => setEpoch((v) => v + 1)} />
      )}{" "}
      {message && (
        <p role="status" className={s.notice}>
          {t(message)}
        </p>
      )}
    </PublicShell>
  );
}
