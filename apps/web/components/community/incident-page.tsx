"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import {
  followIncident,
  getIncident,
  incidentTimeline,
  incidentViewer,
  publicIncidents,
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
  usePage,
} from "./community-ui";
import s from "./community.module.css";
import { useI18n } from "../../lib/i18n/provider";

type IncidentCard = R1["PublicIncidentListItem"];
type IncidentStatus = IncidentCard["status"];
type IncidentCategory = NonNullable<IncidentCard["categoryId"]>;

const statusLabels: Record<IncidentStatus, string> = {
  verified: "Terverifikasi",
  in_progress: "Dalam penanganan",
  resolved: "Selesai",
};
const categoryLabels: Record<IncidentCategory, string> = {
  battery: "Baterai",
  biological: "Organik",
  cardboard: "Kardus",
  clothes: "Pakaian",
  glass: "Kaca",
  metal: "Logam",
  paper: "Kertas",
  plastic: "Plastik",
  shoes: "Sepatu",
  trash: "Residu",
};
const categories = Object.entries(categoryLabels) as [IncidentCategory, string][];

export function IncidentExplore() {
  const { t, intlLocale } = useI18n();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [categoryId, setCategoryId] = useState<IncidentCategory | "">("");
  const [filters, setFilters] = useState({
    search: "",
    status: "" as IncidentStatus | "",
    categoryId: "" as IncidentCategory | "",
  });
  const loader = useCallback(
    (cursor?: string, signal?: AbortSignal) =>
      publicIncidents(
        {
          cursor,
          search: filters.search || undefined,
          status: filters.status || undefined,
          categoryId: filters.categoryId || undefined,
        },
        signal,
      ),
    [filters],
  );
  const page = usePage(loader);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ search: search.trim(), status, categoryId });
  }
  function reset() {
    const next = { search: "", status: "" as IncidentStatus | "", categoryId: "" as IncidentCategory | "" };
    setSearch(next.search);
    setStatus(next.status);
    setCategoryId(next.categoryId);
    setFilters(next);
  }
  return (
    <PublicShell>
      <Heading title={t("Kejadian publik dan kontribusi warga")}>
        {t("Lihat laporan publik yang sudah diverifikasi, lalu bantu kirim kondisi terbaru atau foto bukti untuk ditinjau moderator.")}</Heading>
      <section className={`${s.card} ${s.highlightCard}`}>
        <h2>{t("Akses publik tidak perlu login")}</h2>
        <p className={s.muted}>
          {t("Semua orang bisa membaca kejadian publik. Login dan verifikasi email hanya diperlukan saat ingin mendukung, mengikuti kabar, atau mengirim pembaruan dengan foto.")}</p>
        <div className={s.actions}>
          <a className={s.button} href="#daftar-kejadian">
            {t("Lihat daftar kejadian")}</a>
          <Link className={s.secondary} href={loginDestination("/incidents")}>
            {t("Masuk untuk berkontribusi")}</Link>
        </div>
      </section>
      <form id="daftar-kejadian" className={`${s.card} ${s.filterPanel}`} onSubmit={submit}>
        <div>
          <h2>{t("Daftar kejadian publik")}</h2>
          <p className={s.muted}>
            {t("Cari berdasarkan ringkasan, area, atau ID kejadian. Hanya kejadian publik yang terverifikasi, sedang ditangani, atau selesai yang tampil di sini.")}</p>
        </div>
        <div className={s.filters}>
          <label className={s.field}>
            {t("Cari kejadian")}
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Contoh: plastik, sungai, area")}
            />
          </label>
          <label className={s.field}>
            {t("Status")}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as IncidentStatus | "")}
            >
              <option value="">{t("Semua status")}</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{t(label)}</option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            {t("Kategori")}
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value as IncidentCategory | "")}
            >
              <option value="">{t("Semua kategori")}</option>
              {categories.map(([value, label]) => (
                <option key={value} value={value}>{t(label)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className={s.actions}>
          <button className={s.button} type="submit" disabled={page.loading}>
            {t("Terapkan filter")}</button>
          <button className={s.secondary} type="button" onClick={reset} disabled={page.loading}>
            {t("Reset filter")}</button>
        </div>
      </form>
      {page.error !== null && <Failure error={page.error} retry={page.refresh} />}
      <div className={s.cards}>
        {page.items.map((incident) => (
          <article className={s.card} key={incident.id}>
            <div className={s.meta}>
              <span className={s.badge}>{t(statusLabels[incident.status])}</span>
              {incident.categoryId && <span>{t(categoryLabels[incident.categoryId])}</span>}
            </div>
            <h2>{incident.title}</h2>
            <p className={s.muted}>{incident.area.label}</p>
            <p>{date(incident.lastObservedAt ?? incident.occurredAt, intlLocale)}</p>
            <p className={s.pre}>{incident.summary || t("Ringkasan publik belum tersedia.")}</p>
            {incident.evidence.length ? (
              <Evidence items={incident.evidence} />
            ) : (
              <p className={s.muted}>{t("Bukti publik belum tersedia; pembaruan warga masih bisa dikirim untuk ditinjau.")}</p>
            )}
            <p className={s.muted}>
              {incident.supportCount} {t("dukungan warga")}</p>
            <div className={s.actions}>
              <Link className={s.button} href={`${incident.canonicalPath}#kontribusi-warga`}>
                {t("Lihat detail & kontribusi")}</Link>
            </div>
          </article>
        ))}
      </div>
      {page.loading ? (
        <p role="status">{t("Memuat kejadian…")}</p>
      ) : !page.items.length && page.error === null ? (
        <Empty>{t("Belum ada kejadian publik untuk filter ini.")}</Empty>
      ) : null}
      {page.cursor && (
        <button
          disabled={page.loading}
          className={s.secondary}
          onClick={() => void page.more()}
        >
          {t("Muat kejadian berikutnya")}</button>
      )}
    </PublicShell>
  );
}

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
    [form, setForm] = useState(false),
    [contributionMessage, setContributionMessage] = useState("");
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
    setContributionMessage("");
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
                  <span className={s.badge}>{t(statusLabels[incident.status])}</span>
                  <span>{date(incident.occurredAt, intlLocale)}</span>
                </div>
                <p className={s.pre}>{incident.summary}</p>
                <Evidence items={incident.evidence} />
                <button
                  className={s.secondary}
                  onClick={() => setEpoch((v) => v + 1)}
                >
                  {t("Muat ulang informasi")}</button>
              </section>
              <section className={`${s.card} ${s.contributionCard}`} id="kontribusi-warga">
                <span className={s.eyebrow}>{t("Kontribusi Warga")}</span>
                <h2>{t("Kirim kondisi terbaru atau foto bukti")}</h2>
                <p className={s.muted}>
                  {t("Pembaruan warga masuk ke antrean moderator/admin. Foto yang Anda unggah menjadi bukti privat dulu, lalu hanya tampil publik jika disetujui.")}</p>
                {guest ? (
                  <div className={s.actions}>
                    <Link className={s.button} href={loginDestination(`/incidents/${id}#kontribusi-warga`)}>
                      {t("Masuk untuk kirim pembaruan")}</Link>
                    <Link className={s.secondary} href="/incidents">
                      {t("Lihat kejadian publik lain")}</Link>
                  </div>
                ) : viewer ? (
                  <>
                    <div className={s.actions}>
                      <button
                        className={s.button}
                        disabled={busy || !viewer.actions.update.allowed}
                        onClick={() => setForm(true)}
                      >
                        {t("Kirim pembaruan warga")}</button>
                      <Link className={s.secondary} href="/incidents">
                        {t("Lihat kejadian publik lain")}</Link>
                    </div>
                    {!viewer.actions.update.allowed && viewer.actions.update.reasonCode && (
                      <small className={s.muted}>
                        {t(permissionReason(viewer.actions.update.reasonCode))}</small>
                    )}
                  </>
                ) : (
                  <p className={s.muted}>{t("Memeriksa akses kontribusi…")}</p>
                )}
              </section>
              {form && (
                <ConditionForm
                  incidentId={id}
                  onSaved={() => {
                    setForm(false);
                    setContributionMessage(
                      "Pembaruan terkirim untuk ditinjau. Moderator akan memutuskan sebelum foto atau ringkasan tampil publik.",
                    );
                  }}
                  onClose={() => setForm(false)}
                />
              )}
              {contributionMessage && (
                <p role="status" className={s.notice}>
                  {t(contributionMessage)}</p>
              )}
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
                  href={loginDestination(`/incidents/${id}#kontribusi-warga`)}
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
