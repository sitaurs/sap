"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  Empty,
  Evidence,
  Failure,
  Heading,
  PublicShell,
  usePage,
} from "./community-ui";
import { memberLabels, statusLabels } from "../activities/activity-utils";
import s from "./community.module.css";
import { useI18n } from "../../lib/i18n/provider";

export function ActivityExplore() {
  const { t, intlLocale } = useI18n();
  const [available, setAvailable] = useState(false);
  const loader = useCallback(
    (cursor?: string, signal?: AbortSignal) =>
      publicActivities({ cursor, availableOnly: available }, signal),
    [available],
  );
  const page = usePage(loader);
  return (
    <PublicShell>
      <Heading title={t("Temukan aksi bersama")}>
        {t("Pilih kegiatan lingkungan dan ajukan keikutsertaan Anda.")}</Heading>
      <label className={s.check}>
        <input
          type="checkbox"
          checked={available}
          onChange={(e) => setAvailable(e.target.checked)}
        />
        {t("Hanya kegiatan dengan tempat tersedia")}</label>
      {page.error !== null && (
        <Failure error={page.error} retry={page.refresh} />
      )}
      <div className={s.cards}>
        {page.items.map((a) => (
          <article className={s.card} key={a.id}>
            <span className={s.badge}>{t(statusLabels[a.status])}</span>
            <h2>{a.title}</h2>
            <p className={s.muted}>{a.area.label}</p>
            <p>{date(a.startsAt, intlLocale)}</p>
            <p>
              {a.acceptedCount}/{a.capacity} {" "}{t("peserta ·")}{" "}{a.availableSeats} {" "}{t("tempat tersedia")}</p>
            <Link className={s.button} href={`/activities/${a.id}`}>
              {t("Lihat kegiatan")}</Link>
          </article>
        ))}
      </div>
      {page.loading ? (
        <p role="status">{t("Memuat kegiatan…")}</p>
      ) : !page.items.length && page.error === null ? (
        <Empty>{t("Belum ada kegiatan publik untuk filter ini.")}</Empty>
      ) : null}
      {page.cursor && (
        <button
          disabled={page.loading}
          className={s.secondary}
          onClick={() => void page.more()}
        >
          {t("Muat kegiatan berikutnya")}</button>
      )}
    </PublicShell>
  );
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
    <PublicShell>
      <Link className={s.link} href="/activities">
        {t("← Semua kegiatan")}</Link>
      {loading ? (
        <p role="status">{t("Memuat detail kegiatan…")}</p>
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
          <Heading title={activity.title}>{activity.area.label}</Heading>
          <div className={s.grid}>
            <div className={s.page}>
              <section className={s.card}>
                <span className={s.badge}>{t(statusLabels[activity.status])}</span>
                <p className={s.pre}>{activity.description}</p>
                <div className={s.meta}>
                  <span>{t("Mulai:")}{" "}{date(activity.startsAt, intlLocale)}</span>
                  <span>{t("Selesai:")}{" "}{date(activity.endsAt, intlLocale)}</span>
                </div>
                <p>{t("Batas pendaftaran:")}{" "}{date(activity.registrationClosesAt, intlLocale)}</p>
                <h3>{t("Perlengkapan")}</h3>
                <div className={s.meta}>
                  {activity.equipment.map((text) => (
                    <span className={s.badge} key={text}>
                      {text}
                    </span>
                  ))}
                </div>
                <h3>{t("Aksesibilitas")}</h3>
                <p>{activity.accessibilityNotes || t("Belum ada catatan.")}</p>
                <h3>{t("Rencana serah terima sampah")}</h3>
                <p>{activity.wasteHandoverPlan || t("Belum tersedia.")}</p>
                <Link
                  className={s.link}
                  href={`/incidents/${activity.reportId}`}
                >
                  {t("Lihat kejadian sumber →")}</Link>
              </section>
              <section className={s.card}>
                <h2>{t("Hasil yang disetujui")}</h2>
                {results.error !== null && (
                  <Failure error={results.error} retry={results.refresh} />
                )}{" "}
                {results.loading ? (
                  <p role="status">{t("Memuat hasil…")}</p>
                ) : !results.items.length && results.error === null ? (
                  <Empty>{t("Belum ada hasil publik yang disetujui.")}</Empty>
                ) : null}
                {results.items.map((result) => (
                  <article key={result.id} className={s.row}>
                    <span className={s.badge}>
                      {result.outcome === "partial"
                        ? t("Penanganan sebagian")
                        : t("Penanganan lengkap")}
                    </span>
                    <p>{result.summary}</p>
                    <p className={s.muted}>{date(result.observedAt, intlLocale)}</p>
                    <Evidence items={result.evidence} />
                    <p>
                      {result.verifiedMeasurement
                        ? `${result.verifiedMeasurement.valueKg} kg · ${result.verifiedMeasurement.stage}`
                        : t("Berat terverifikasi belum tersedia.")}
                    </p>
                  </article>
                ))}
                {results.cursor && (
                  <button
                    className={s.secondary}
                    disabled={results.loading}
                    onClick={() => void results.more()}
                  >
                    {t("Muat hasil berikutnya")}</button>
                )}
              </section>
            </div>
            <aside className={s.card}>
              <h2>{t("Ikut kegiatan")}</h2>
              <strong>
                {activity.acceptedCount} / {activity.capacity} {" "}{t("peserta diterima")}</strong>
              <p>{activity.availableSeats} {" "}{t("tempat tersedia")}</p>
              <p className={s.muted}>
                {t("Koordinator:")}{" "}{activity.coordinatorDisplayName}
              </p>
              {guest ? (
                <Link
                  className={s.button}
                  href={loginDestination(`/activities/${id}`)}
                >
                  {t("Masuk untuk ikut")}</Link>
              ) : viewer ? (
                <>
                  <p>
                    {t("Status Anda:")}{" "}
                    <strong>
                      {viewer.membership
                        ? memberLabels[viewer.membership.status]
                        : t("Belum meminta ikut")}
                    </strong>
                  </p>
                  {viewer.membership?.reason && (
                    <p>{viewer.membership.reason}</p>
                  )}
                  <button
                    className={s.button}
                    disabled={actionBlocked || !viewer.actions.join.allowed}
                    onClick={() => void participate(true)}
                  >
                    {t("Ajukan ikut kegiatan")}</button>
                  <button
                    className={s.secondary}
                    disabled={
                      actionBlocked || !viewer.actions.cancelMembership.allowed
                    }
                    onClick={() => setConfirm("cancel")}
                  >
                    {t("Batalkan permintaan / ikut")}</button>
                  {viewer.meetingPoint && (
                    <div className={s.notice}>
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
                    <div className={s.notice}>
                      <strong>{t("Jadwal berubah · perlu konfirmasi")}</strong>
                      <p>
                        {date(activity.startsAt, intlLocale)} — {date(activity.endsAt, intlLocale)}
                      </p>
                      <button
                        className={s.button}
                        disabled={actionBlocked}
                        onClick={() => void acknowledge(true)}
                      >
                        {t("Saya dapat hadir di jadwal baru")}</button>
                      <button
                        className={s.secondary}
                        disabled={actionBlocked}
                        onClick={() => setConfirm("decline_schedule")}
                      >
                        {t("Jadwal tidak sesuai")}</button>
                    </div>
                  )}
                  {viewer.actions.manage.allowed && (
                    <Link
                      className={s.secondary}
                      href={`/activities/${id}/manage`}
                    >
                      {t("Kelola sebagai koordinator")}</Link>
                  )}
                </>
              ) : null}
            </aside>
          </div>
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
