"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  ChevronRight,
  ClipboardCheck,
  FlaskConical,
  Plus,
  RefreshCw,
  Search,
  UsersRound,
  Link2,
} from "lucide-react";
import Image from "next/image";
import { ApiError, type SapCategory } from "../../lib/api/client";
import {
  activityStatuses,
  getActivity,
  getActivityResult,
  getPublicActivity,
  listActivities,
  listReviewQueue,
  type Activity,
  type ActivityStatus,
  type ReviewItem,
} from "../../lib/api/activities";
import {
  dateLabel,
  errorMessage,
  shortId,
  statusLabels,
  uniqueItems,
  initials,
} from "./activity-utils";
import { Busy, Empty, Notice, PageHead, Status } from "./activity-ui";
import { AdminSourcePhoto } from "./activity-photo";
import ActivityDetail from "./activity-detail";
import ActivityForm from "./activity-form";
import ActivityMembers from "./activity-members";
import ActivityResultReview from "./activity-result";
import ActivityResultForm from "./activity-result-form";
import s from "./activities.module.css";
import { activitiesMockEnabled } from "../../lib/api/activities-mode";

type Route = { screen: string; activity: string; result: string };
export default function ActivitiesPage({
  categories,
}: {
  categories: SapCategory[];
}) {
  const [resetKey, setResetKey] = useState(0);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  async function resetMock() {
    setResetBusy(true);
    setResetError("");
    try {
      (await import("../../lib/api/activities-mock")).resetActivitiesMock();
      const url = new URL(window.location.href);
      for (const key of ["activityScreen", "activity", "result"])
        url.searchParams.delete(key);
      window.history.replaceState(null, "", url);
      setResetKey((k) => k + 1);
    } catch (e) {
      setResetError(errorMessage(e));
    } finally {
      setResetBusy(false);
    }
  }
  if (!activitiesMockEnabled)
    return <ActivitiesPageContent categories={categories} />;
  return (
    <div className={s.page} data-mode="activities-mock">
      <section className={s.mockBanner} aria-label="Mode mock kegiatan relawan">
        <span className={s.iconCircle}>
          <FlaskConical size={23} />
        </span>
        <div>
          <strong>Mode mock · Kegiatan relawan</strong>
          <p>
            Data dan foto contoh untuk mencoba frontend. Perubahan disimpan di
            browser ini; tidak dikirim ke backend atau Instagram.
          </p>
        </div>
        <button
          type="button"
          className={s.secondary}
          onClick={() => void resetMock()}
          disabled={resetBusy}
        >
          <RefreshCw size={17} /> Reset data contoh
        </button>
      </section>
      {resetError && <Notice error>{resetError}</Notice>}
      <ActivitiesPageContent key={resetKey} categories={categories} />
    </div>
  );
}
function readRoute(): Route {
  const p = new URLSearchParams(window.location.search);
  return {
    screen: p.get("activityScreen") || "list",
    activity: p.get("activity") || "",
    result: p.get("result") || "",
  };
}
function ActivitiesPageContent({ categories }: { categories: SapCategory[] }) {
  const [route, setRoute] = useState<Route>({
    screen: "list",
    activity: "",
    result: "",
  });
  const [items, setItems] = useState<Activity[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [status, setStatus] = useState<ActivityStatus | "">("");
  const [search, setSearch] = useState(""),
    [source, setSource] = useState(""),
    [selected, setSelected] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [unavailable, setUnavailable] = useState(false),
    [epoch, setEpoch] = useState(0);
  const [queue, setQueue] = useState<ReviewItem[]>([]),
    [queueCursor, setQueueCursor] = useState<string | null>(null),
    [queueError, setQueueError] = useState(""),
    [queueLoading, setQueueLoading] = useState(false);
  const [detailError, setDetailError] = useState(""),
    [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Activity | null>(null);
  const listGeneration = useRef(0);
  useEffect(() => {
    setRoute(readRoute());
    const listener = () => setRoute(readRoute());
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  const go = useCallback((screen: string, activity = "", result = "") => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({
      activityScreen: screen === "list" ? "" : screen,
      activity,
      result,
    })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.pushState(null, "", url);
    setRoute({ screen, activity, result });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  useEffect(() => {
    const c = new AbortController();
    listGeneration.current += 1;
    setLoading(true);
    setError("");
    setUnavailable(false);
    setItems([]);
    setCursor(null);
    void listActivities(
      { status: status || undefined, reportId: source || undefined },
      c.signal,
    )
      .then((p) => {
        if (!c.signal.aborted) {
          setItems(p.items);
          setCursor(p.nextCursor);
          setSelected(
            (previous) =>
              p.items.find((x) => x.id === previous?.id) ?? p.items[0] ?? null,
          );
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(errorMessage(e));
          setUnavailable(
            e instanceof ApiError && e.code === "FEATURE_UNAVAILABLE",
          );
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [status, source, epoch]);
  useEffect(() => {
    const c = new AbortController();
    setQueueError("");
    setQueueLoading(true);
    void listReviewQueue(undefined, c.signal)
      .then((p) => {
        if (!c.signal.aborted) {
          setQueue(p.items);
          setQueueCursor(p.nextCursor);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setQueue([]);
          setQueueError(errorMessage(e));
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setQueueLoading(false);
      });
    return () => c.abort();
  }, [epoch]);
  useEffect(() => {
    if (!route.activity || route.screen === "list") return;
    const c = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    void getActivity(route.activity, c.signal)
      .then((a) => {
        if (!c.signal.aborted) setDetail(a);
      })
      .catch((e) => {
        if (!c.signal.aborted) setDetailError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setDetailLoading(false);
      });
    return () => c.abort();
  }, [route.activity, route.screen, epoch]);
  const refresh = () => setEpoch((x) => x + 1);
  const changed = (a: Activity) => {
    setSelected(a);
    setDetail(a);
    setItems((old) => uniqueItems(old, [a]));
  };
  const visible = useMemo(
    () =>
      items.filter((a) =>
        `${a.title} ${a.description} ${a.reportId}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [items, search],
  );
  const sources = [
    ...new Set([...items.map((a) => a.reportId), ...(source ? [source] : [])]),
  ];
  async function loadMore() {
    if (!cursor || more) return;
    const generation = listGeneration.current;
    setMore(true);
    try {
      const p = await listActivities({
        status: status || undefined,
        reportId: source || undefined,
        cursor,
      });
      if (generation !== listGeneration.current) return;
      setItems((old) => uniqueItems(old, p.items));
      setCursor(p.nextCursor);
    } catch (e) {
      if (generation === listGeneration.current) setError(errorMessage(e));
    } finally {
      setMore(false);
    }
  }
  async function openResult(id: string) {
    setDetailLoading(true);
    setDetailError("");
    try {
      const r = await getActivityResult(id);
      go("review", r.activityId, r.id);
    } catch (e) {
      setDetailError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }
  async function moreQueue() {
    if (!queueCursor || queueLoading) return;
    setQueueLoading(true);
    try {
      const p = await listReviewQueue(queueCursor);
      setQueue((old) =>
        uniqueItems(
          old.map((x) => ({ ...x, id: x.subjectId })),
          p.items.map((x) => ({ ...x, id: x.subjectId })),
        ),
      );
      setQueueCursor(p.nextCursor);
    } catch (e) {
      setQueueError(errorMessage(e));
    } finally {
      setQueueLoading(false);
    }
  }
  if (route.screen === "create")
    return (
      <div className={s.page}>
        <ActivityForm
          categories={categories}
          onBack={() => go("list")}
          onSaved={(a) => {
            changed(a);
            go("detail", a.id);
            refresh();
          }}
        />
      </div>
    );
  if (route.screen !== "list") {
    if (detailLoading)
      return (
        <div className={s.page}>
          <PageHead
            title="Kegiatan relawan"
            subtitle="Menyiapkan informasi kegiatan."
            onBack={() => go("list")}
          />
          <Busy />
        </div>
      );
    if (detailError || !detail || detail.id !== route.activity)
      return (
        <div className={s.page}>
          <PageHead
            title="Kegiatan relawan"
            subtitle="Informasi kegiatan belum dapat ditampilkan."
            onBack={() => go("list")}
          />
          <Notice error>{detailError || "Pilih kegiatan dari daftar."}</Notice>
          <button className={s.secondary} onClick={refresh}>
            Muat ulang
          </button>
        </div>
      );
    const common = {
      activity: detail,
      onBack: () => go("list"),
      onChanged: changed,
    };
    return (
      <div className={s.page}>
        {route.screen === "edit" ? (
          <ActivityForm
            categories={categories}
            activity={detail}
            onBack={() => go("detail", detail.id)}
            onSaved={(a) => {
              changed(a);
              go("detail", a.id);
            }}
          />
        ) : route.screen === "members" ? (
          <ActivityMembers {...common} />
        ) : route.screen === "review" && route.result ? (
          <ActivityResultReview
            {...common}
            resultId={route.result}
            onEdit={() => go("result-edit", detail.id, route.result)}
          />
        ) : route.screen === "result-new" || route.screen === "result-edit" ? (
          <ActivityResultForm
            {...common}
            resultId={route.screen === "result-edit" ? route.result : undefined}
            onSaved={(r) => {
              go("review", detail.id, r.id);
              refresh();
            }}
          />
        ) : (
          <ActivityDetail
            {...common}
            admin
            onNavigate={(screen) => go(screen, detail.id)}
            onReview={(id) => void openResult(id)}
          />
        )}
      </div>
    );
  }
  const preview = visible.find((a) => a.id === selected?.id) ?? visible[0];
  const cards: { label: string; status: ActivityStatus; asset: string }[] = [
    {
      label: "Pendaftaran dibuka",
      status: "registration_open",
      asset: "registration",
    },
    { label: "Berlangsung", status: "in_progress", asset: "in-progress" },
    {
      label: "Menunggu hasil",
      status: "awaiting_result",
      asset: "awaiting-result",
    },
    { label: "Selesai", status: "completed", asset: "completed" },
  ];
  return (
    <div className={s.page}>
      <PageHead
        title="Kegiatan relawan"
        subtitle="Kelola kegiatan, koordinator, dan peserta dalam satu tempat."
        action={
          <>
            <button
              className={s.secondary}
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={18} /> Muat ulang
            </button>
            <button
              className={s.primary}
              onClick={() => go("create")}
              disabled={unavailable || loading}
            >
              <Plus size={20} /> Buat kegiatan
            </button>
          </>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {unavailable ? (
        <section className={s.card}>
          <Empty title="Kegiatan relawan belum diaktifkan">
            Pengelola perlu menyiapkan layanan R1 dan mengaktifkan fitur
            kegiatan pada backend. Setelah tersedia, muat ulang halaman ini.
          </Empty>
        </section>
      ) : (
        <>
          <div className={s.sectionHeading}>
            <h2>Ringkasan kegiatan yang dimuat</h2>
            <small>{items.length} kegiatan · angka mengikuti filter</small>
          </div>
          <div className={s.stats}>
            {cards.map((c) => (
              <button
                key={c.status}
                className={`${s.stat} ${status === c.status ? s.selectedStat : ""}`}
                onClick={() => setStatus(status === c.status ? "" : c.status)}
              >
                <Image
                  src={`/images/activities/${c.asset}.png`}
                  alt=""
                  width={54}
                  height={54}
                />
                <span>
                  <strong>
                    {loading || error
                      ? "—"
                      : items.filter((a) => a.status === c.status).length}
                  </strong>
                    {c.label}
                </span>
              </button>
            ))}
          </div>
          <div className={s.listLayout}>
            <section className={`${s.card} ${s.listCard}`}>
              <div className={s.sectionHeading}>
                <div>
                  <h2>Daftar kegiatan</h2>
                  <p>{items.length} kegiatan dimuat</p>
                </div>
              </div>
              <div className={s.filters}>
                <label className={s.search}>
                  <Search size={19} />
                  <input
                    aria-label="Cari kegiatan yang dimuat"
                    placeholder="Cari kegiatan yang dimuat…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter status kegiatan"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as ActivityStatus | "")
                  }
                >
                  <option value="">Semua status</option>
                  {activityStatuses.map((x) => (
                    <option key={x} value={x}>
                      {statusLabels[x]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter laporan sumber"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Semua laporan sumber</option>
                  {sources.map((id) => (
                    <option key={id} value={id}>
                      Laporan #{shortId(id)}
                    </option>
                  ))}
                </select>
              </div>
              {loading ? (
                <Busy />
              ) : !visible.length ? (
                <Empty
                  title={
                    search ? "Kegiatan tidak ditemukan" : "Belum ada kegiatan"
                  }
                >
                  {search
                    ? "Coba kata kunci lain pada kegiatan yang sudah dimuat."
                    : "Buat kegiatan dari laporan sumber untuk mulai mengajak relawan."}
                </Empty>
              ) : (
                <div className={s.activityRows}>
                  <div className={s.activityTableHead} aria-hidden="true"><span>Kegiatan</span><span>Jadwal</span><span>Koordinator</span><span>Peserta</span><span>Status</span><span /></div>
                  {visible.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className={`${s.activityRow} ${preview?.id === a.id ? s.selectedRow : ""}`}
                      aria-pressed={preview?.id === a.id}
                    >
                      <span className={s.rowHeading}>
                        <AdminSourcePhoto reportId={a.reportId} />
                        <span className={s.rowMain}>
                          <strong>{a.title}</strong>
                          <small>Laporan #{shortId(a.reportId)}</small>
                        </span>
                      </span>
                      <span className={s.rowSchedule}><small className={s.mobileRowLabel}>Jadwal</small><span>{dateLabel(a.startsAt)}</span><small>{timeRange(a.startsAt, a.endsAt)}</small></span>
                      <CoordinatorSummary activity={a} compact />
                      <span className={s.rowQuota}><strong>{a.acceptedCount} / {a.capacity ?? "—"}</strong><small>Diterima</small></span>
                      <span className={s.rowStatus}><Status status={a.status} /></span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              )}
              <footer className={s.listFooter}>
                <small>
                  {visible.length} kegiatan ditampilkan dari {items.length} yang
                  dimuat
                </small>
                {!!visible.length && <small className={s.mobileListHint}>Pilih kegiatan untuk melihat ringkasannya di bawah.</small>}
                {cursor && (
                  <button
                    className={s.secondary}
                    onClick={() => void loadMore()}
                    disabled={more || loading}
                  >
                    {more ? "Memuat…" : "Muat berikutnya"}
                  </button>
                )}
              </footer>
            </section>
            <aside className={`${s.card} ${s.preview}`}>
              <div className={s.sectionHeading}>
                <h2>Kegiatan terpilih</h2>
              </div>
              {preview ? (
                <>
                  <div className={s.sourceFrame}><AdminSourcePhoto reportId={preview.reportId} large /><span>Foto laporan sumber</span></div>
                  <div className={s.previewTitle}><h3>{preview.title}</h3><Status status={preview.status} /></div>
                  <div className={s.infoLine}><Link2 size={19} /><span><small>Terhubung ke laporan</small>Laporan #{shortId(preview.reportId)}</span></div>
                  <div className={s.infoLine}>
                    <Clock3 size={19} />
                    <span>
                      <small>Jadwal kegiatan</small>
                      {dateLabel(preview.startsAt, true)}
                    </span>
                  </div>
                  <div className={s.infoLine}>
                    <CalendarDays size={19} />
                    <span>
                      <small>Batas pendaftaran</small>
                      {dateLabel(preview.registrationClosesAt, true)}
                    </span>
                  </div>
                  <CoordinatorSummary activity={preview} />
                  <div className={s.capacity}>
                    <div>
                      <strong>Peserta diterima<br /><b>{preview.acceptedCount} / {preview.capacity ?? "—"}</b></strong>
                      <small>
                        {preview.capacity == null
                          ? "Kuota belum ditentukan"
                          : `${preview.availableSeats} tempat tersedia`}
                      </small>
                    </div>
                    <progress
                      max={preview.capacity || 1}
                      value={preview.acceptedCount}
                      aria-label="Kuota peserta"
                    />
                  </div>
                  <button
                    className={s.primary}
                    onClick={() => go("detail", preview.id)}
                  >
                    Lihat detail kegiatan <ArrowRight size={18} />
                  </button>
                  <button
                    className={s.secondary}
                    onClick={() => go("members", preview.id)}
                  >
                    <UsersRound size={18} /> Kelola peserta
                  </button>
                </>
              ) : (
                <Empty title="Pilih kegiatan">
                  Ringkasan dan foto laporan akan muncul di sini.
                </Empty>
              )}
            </aside>
          <section className={`${s.card} ${s.queueCard}`}>
            <div className={s.sectionHeading}>
              <div>
                <h2>
                  <ClipboardCheck size={22} /> Hasil perlu ditinjau
                </h2>
              </div>
              <small>{queue.length} hasil dimuat</small>
            </div>
            {queueError ? (
              <Notice error>{queueError}</Notice>
            ) : queueLoading && !queue.length ? (
              <Busy />
            ) : !queue.length ? (
              <Empty title="Tidak ada hasil dalam antrean yang dimuat">
                Hasil baru akan muncul setelah koordinator mengirim bukti
                kegiatan.
              </Empty>
            ) : (
              <div className={s.queue}>
                {queue.map((q) => (
                  <button
                    key={q.subjectId}
                    onClick={() => void openResult(q.subjectId)}
                    disabled={detailLoading}
                  >
                    <AdminSourcePhoto reportId={q.reportId} />
                    <span>
                      <strong>{q.title}</strong>
                      <small>
                        Foto sebelum & sesudah ·{" "}
                        {dateLabel(q.submittedAt, true)}
                      </small>
                      <small>Periksa bukti sebelum menyatakan laporan selesai.</small>
                    </span>
                    <span className={`${s.badge} ${s.amber}`}>
                      {q.reviewState === "needs_evidence"
                        ? "Perlu bukti tambahan"
                        : "Menunggu tinjauan"}
                    </span>
                    <span className={s.reviewAction}>Tinjau hasil <ArrowRight size={17} /></span>
                  </button>
                ))}
              </div>
            )}
            {detailError && <Notice error>{detailError}</Notice>}
            {queueCursor && (
              <button
                className={s.secondary}
                onClick={() => void moreQueue()}
                disabled={queueLoading}
              >
                Muat hasil berikutnya
              </button>
            )}
          </section>
          </div>
        </>
      )}
    </div>
  );
}
function timeRange(starts: string | null, ends: string | null) {
  if (!starts) return "Belum ditentukan";
  const format = (value: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return `${format(starts)}${ends ? ` – ${format(ends)}` : ""} WIB`;
}
function CoordinatorSummary({ activity, compact = false }: { activity: Activity; compact?: boolean }) {
  const [name, setName] = useState("Koordinator SAP");
  useEffect(() => {
    const c = new AbortController();
    setName("Koordinator SAP");
    if (activity.status !== "draft" || activitiesMockEnabled)
      void getPublicActivity(activity.id, c.signal)
        .then((p) => {
          if (!c.signal.aborted && p.kind === "activity")
            setName(p.coordinatorDisplayName);
        })
        .catch(() => {});
    return () => c.abort();
  }, [activity.id, activity.status, activity.revision]);
  return (
    <span className={compact ? s.rowCoordinator : s.infoLine}>
      {compact && <small className={s.mobileRowLabel}>Koordinator</small>}
      {compact ? <span className={s.coordinatorInitials}>{activity.coordinatorId ? initials(name) : "—"}</span> : <UsersRound size={19} />}
      <span>
        {!compact && <small>Koordinator kegiatan</small>}
        {activity.coordinatorId ? name : "Belum ditugaskan"}
      </span>
    </span>
  );
}
