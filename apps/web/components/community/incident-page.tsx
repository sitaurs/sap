"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import {
  followIncident,
  getIncident,
  incidentTimeline,
  incidentViewer,
  supportIncident,
} from "../../lib/api/community";
import { permissionReason, type R1 } from "../../lib/api/r1";
import { loginDestination, safeReturnTo } from "../../lib/auth-return";
import ConditionForm from "./condition-form";
import {
  date,
  Empty,
  Evidence,
  Failure,
  Heading,
  PublicShell,
} from "./community-ui";
import s from "./community.module.css";
import { useI18n } from "../../lib/i18n/provider";

export default function IncidentPage({ id }: { id: string }) {
  const { t, intlLocale } = useI18n();
  const router = useRouter();
  const [incident, setIncident] = useState<R1["PublicIncident"] | null>(null),
    [events, setEvents] = useState<R1["PublicTimelineEvent"][]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [viewer, setViewer] = useState<R1["IncidentViewer"] | null>(null),
    [guest, setGuest] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [timelineError, setTimelineError] = useState<unknown>(null),
    [epoch, setEpoch] = useState(0),
    [form, setForm] = useState(false);
  const actionBlocked =
    busy ||
    (timelineError instanceof ApiError &&
      timelineError.code === "OPERATION_UNCERTAIN");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError(null);
    setTimelineError(null);
    setIncident(null);
    setEvents([]);
    setCursor(null);
    setViewer(null);
    setGuest(false);
    setForm(false);
    void getIncident(id, c.signal)
      .then(async (value) => {
        if (c.signal.aborted) return;
        if (value.kind === "redirect") {
          const target = safeReturnTo(value.canonicalPath);
          if (
            target !== `/incidents/${value.canonicalId}` ||
            value.canonicalId === id
          )
            throw new Error("Tujuan kejadian canonical tidak valid.");
          router.replace(target);
          return;
        }
        setIncident(value);
        const results = await Promise.allSettled([
          incidentTimeline(id, undefined, c.signal),
          incidentViewer(id, c.signal),
        ]);
        if (c.signal.aborted) return;
        const timeline = results[0];
        if (timeline.status === "fulfilled") {
          setEvents(timeline.value.items);
          setCursor(timeline.value.nextCursor);
        } else if (
          timeline.reason instanceof ApiError &&
          timeline.reason.status === 410
        ) {
          setIncident(null);
          setEvents([]);
          setError(timeline.reason);
          return;
        } else setTimelineError(timeline.reason);
        const access = results[1];
        if (access.status === "fulfilled") setViewer(access.value);
        else if (
          access.reason instanceof ApiError &&
          access.reason.status === 410
        ) {
          setIncident(null);
          setEvents([]);
          setError(access.reason);
        } else if (
          access.reason instanceof ApiError &&
          access.reason.status === 401
        )
          setGuest(true);
        else setTimelineError(access.reason);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setIncident(null);
          setEvents([]);
          setError(e);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, epoch, router]);
  async function action(kind: "support" | "follow") {
    if (!viewer || !incident || busy) return;
    setBusy(true);
    setTimelineError(null);
    try {
      if (kind === "support") {
        const value = await supportIncident(id, !viewer.supported);
        setViewer({ ...viewer, supported: value.supported });
        setIncident({
          ...incident,
          supportCount: value.supportCount,
          supportClosed: value.supportClosed,
        });
      } else {
        const value = await followIncident(id, !viewer.following);
        setViewer({ ...viewer, following: value.following });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) {
        setIncident(null);
        setEvents([]);
        setError(e);
      } else setTimelineError(e);
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const page = await incidentTimeline(id, cursor);
      setEvents((v) => [...v, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) {
        setIncident(null);
        setEvents([]);
        setError(e);
      } else setTimelineError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell>
      {loading ? (
        <p role="status">{t("Memuat kejadian publik…")}</p>
      ) : error !== null ? (
        <Failure error={error} retry={() => setEpoch((v) => v + 1)} />
      ) : incident ? (
        <>
          <Heading title={incident.title}>{incident.area.label}</Heading>
          <div className={s.grid}>
            <div className={s.page}>
              <section className={s.card}>
                <div className={s.meta}>
                  <span className={s.badge}>
                    {
                      {
                        verified: t("Terverifikasi"),
                        in_progress: t("Dalam penanganan"),
                        resolved: t("Selesai"),
                      }[incident.status]
                    }
                  </span>
                  <span>{date(incident.occurredAt, intlLocale)}</span>
                </div>
                <p className={s.pre}>{incident.summary}</p>
                <Evidence items={incident.evidence} />
                <button
                  className={s.secondary}
                  onClick={() => setEpoch((v) => v + 1)}
                >
                  {t("Perbarui informasi dan foto")}</button>
              </section>
              <section className={s.card}>
                <h2>{t("Perjalanan kejadian")}</h2>
                {events.length ? (
                  <ol className={s.timeline}>
                    {events.map((event) => (
                      <li key={event.id}>
                        <strong>{date(event.occurredAt, intlLocale)}</strong>
                        <p>{event.summary}</p>
                        <Evidence items={event.evidence} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty>{t("Belum ada kabar publik untuk kejadian ini.")}</Empty>
                )}
                {cursor && (
                  <button
                    className={s.secondary}
                    disabled={busy}
                    onClick={() => void more()}
                  >
                    {t("Muat kabar berikutnya")}</button>
                )}
              </section>
              {form && (
                <ConditionForm
                  incidentId={id}
                  onSaved={() => setForm(false)}
                  onClose={() => setForm(false)}
                />
              )}
            </div>
            <aside className={s.card}>
              <h2>{t("Ikut peduli")}</h2>
              <p>
                <strong>{incident.supportCount}</strong> {" "}{t("dukungan warga")}</p>
              <p className={s.muted}>
                {t("Dukung kejadian untuk menunjukkan kepedulian. Ikuti kabar untuk menerima pembaruan.")}</p>
              {guest ? (
                <Link
                  className={s.button}
                  href={loginDestination(`/incidents/${id}`)}
                >
                  {t("Masuk untuk berkontribusi")}</Link>
              ) : viewer ? (
                <>
                  <button
                    className={s.button}
                    disabled={actionBlocked || !viewer.actions.support.allowed}
                    onClick={() => void action("support")}
                  >
                    {viewer.supported ? t("Batalkan dukungan") : t("Dukung kejadian")}
                  </button>
                  <button
                    className={s.secondary}
                    disabled={actionBlocked || !viewer.actions.follow.allowed}
                    onClick={() => void action("follow")}
                  >
                    {viewer.following ? t("Berhenti mengikuti") : t("Ikuti kabar")}
                  </button>
                  <button
                    className={s.secondary}
                    disabled={busy || !viewer.actions.update.allowed}
                    onClick={() => setForm(true)}
                  >
                    {t("Bagikan kondisi terbaru")}</button>
                  {Object.values(viewer.actions)
                    .filter((a) => !a.allowed && a.reasonCode)
                    .map((a, i) => (
                      <small key={i} className={s.muted}>
                        {t(permissionReason(a.reasonCode))}
                      </small>
                    ))}
                </>
              ) : null}
              {incident.supportClosed && (
                <p className={s.notice}>{t("Dukungan baru telah ditutup.")}</p>
              )}
              <h3>{t("Kegiatan terkait")}</h3>
              {incident.relatedActivityIds.length ? (
                incident.relatedActivityIds.map((activity) => (
                  <Link
                    className={s.link}
                    key={activity}
                    href={`/activities/${activity}`}
                  >
                    {t("Lihat kegiatan relawan →")}</Link>
                ))
              ) : (
                <p className={s.muted}>{t("Belum ada kegiatan publik.")}</p>
              )}
            </aside>
          </div>
          {timelineError !== null && (
            <Failure
              error={timelineError}
              retry={() => setEpoch((v) => v + 1)}
            />
          )}
        </>
      ) : (
        <Empty>{t("Informasi kejadian belum tersedia.")}</Empty>
      )}
    </PublicShell>
  );
}
