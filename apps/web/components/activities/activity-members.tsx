"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search, UsersRound } from "lucide-react";
import {
  decideMember,
  getActivity,
  listMembers,
  recordAttendance,
  type Activity,
  type ActivityMember,
  type MemberStatus,
} from "../../lib/api/activities";
import {
  dateLabel,
  errorMessage,
  initials,
  isConflict,
  memberLabels,
  uniqueItems,
} from "./activity-utils";
import { Busy, Empty, Notice, PageHead, Status } from "./activity-ui";
import s from "./activities.module.css";

export default function ActivityMembers({
  activity,
  onBack,
  onChanged,
}: {
  activity: Activity;
  onBack: () => void;
  onChanged: (a: Activity) => void;
}) {
  const [status, setStatus] = useState<MemberStatus | "">(""),
    [search, setSearch] = useState(""),
    [items, setItems] = useState<ActivityMember[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [epoch, setEpoch] = useState(0);
  const [selected, setSelected] = useState<ActivityMember | null>(null),
    [choice, setChoice] = useState<
      "accepted" | "waitlisted" | "rejected" | "cancelled"
    >("accepted"),
    [reason, setReason] = useState(""),
    [attendance, setAttendance] =
      useState<ActivityMember["attendance"]>("unknown");
  const [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [panelError, setPanelError] = useState(""),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false);
  const listGeneration = useRef(0);
  useEffect(() => {
    const c = new AbortController();
    listGeneration.current += 1;
    setLoading(true);
    setError("");
    setItems([]);
    setCursor(null);
    void listMembers(activity.id, status || undefined, undefined, c.signal)
      .then((p) => {
        if (!c.signal.aborted) {
          setItems(p.items);
          setCursor(p.nextCursor);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [activity.id, status, epoch]);
  const admitted =
    ["registration_open", "registration_closed"].includes(activity.status) &&
    !!activity.startsAt &&
    Date.parse(activity.startsAt) > Date.now();
  const canAttendance =
    selected?.status === "accepted" &&
    ["in_progress", "awaiting_result", "completed"].includes(activity.status);
  const transitions: (typeof choice)[] =
    selected?.status === "requested" || selected?.status === "waitlisted"
      ? (["accepted", "waitlisted", "rejected", "cancelled"] as const).filter(
          (x) => x !== selected.status,
        )
      : selected?.status === "accepted" &&
          !["completed", "cancelled"].includes(activity.status)
        ? ["cancelled" as const]
        : [];
  function select(m: ActivityMember) {
    setSelected(m);
    setAttendance(m.attendance);
    setChoice(m.status === "accepted" ? "cancelled" : "accepted");
    setReason("");
    setPanelError("");
    setConflict(false);
  }
  async function loadMore() {
    if (!cursor || more || loading) return;
    const generation = listGeneration.current;
    setMore(true);
    try {
      const p = await listMembers(activity.id, status || undefined, cursor);
      if (generation !== listGeneration.current) return;
      setItems((old) => uniqueItems(old, p.items));
      setCursor(p.nextCursor);
    } catch (e) {
      if (generation === listGeneration.current) setError(errorMessage(e));
    } finally {
      setMore(false);
    }
  }
  async function save(kind: "decision" | "attendance") {
    if (!selected) return;
    setBusy(true);
    setPanelError("");
    try {
      const saved =
        kind === "decision"
          ? await decideMember(selected, choice, reason.trim())
          : await recordAttendance(selected, attendance);
      setSelected(saved);
      setAttendance(saved.attendance);
      setItems((old) =>
        old
          .map((x) => (x.id === saved.id ? saved : x))
          .filter((x) => !status || x.status === status),
      );
      setReason("");
      setMessage(
        kind === "decision"
          ? "Keputusan peserta tersimpan."
          : "Kehadiran peserta tersimpan.",
      );
      onChanged(await getActivity(activity.id));
      setEpoch((e) => e + 1);
    } catch (e) {
      setPanelError(errorMessage(e));
      setConflict(isConflict(e));
    } finally {
      setBusy(false);
    }
  }
  async function latest() {
    if (!selected) return;
    setBusy(true);
    try {
      let page = await listMembers(activity.id);
      let found = page.items.find((m) => m.id === selected.id);
      const seen = new Set<string>();
      while (!found && page.nextCursor && !seen.has(page.nextCursor)) {
        seen.add(page.nextCursor);
        page = await listMembers(activity.id, undefined, page.nextCursor);
        found = page.items.find((m) => m.id === selected.id);
      }
      if (!found)
        throw new Error(
          "Peserta tidak tersedia lagi. Pilih peserta dari daftar terbaru.",
        );
      setSelected(found);
      setAttendance(found.attendance);
      onChanged(await getActivity(activity.id));
      setConflict(false);
      setPanelError(
        "Data terbaru dimuat. Periksa keputusan dan alasan sebelum menyimpan ulang.",
      );
      setEpoch((x) => x + 1);
    } catch (e) {
      setPanelError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const visible = items.filter((m) =>
    m.displayName.toLowerCase().includes(search.toLowerCase()),
  );
  const unavailableChoice =
    choice === "accepted"
      ? !admitted || activity.availableSeats < 1
      : ["completed", "cancelled"].includes(activity.status);
  return (
    <>
      <PageHead
        title="Kelola peserta"
        subtitle={activity.title}
        onBack={onBack}
        action={<Status status={activity.status} />}
      />
      {message && <Notice>{message}</Notice>}
      <div className={s.memberSummary}>
        <span className={s.iconCircle}>
          <UsersRound size={26} />
        </span>
        <div>
          <strong>
            {activity.acceptedCount} / {activity.capacity ?? "—"} peserta
            diterima
          </strong>
          <p>
            {activity.capacity == null
              ? "Kuota belum ditentukan"
              : `${activity.availableSeats} tempat tersedia`}
          </p>
        </div>
        <div>
          <small>Batas pendaftaran</small>
          <strong>{dateLabel(activity.registrationClosesAt, true)}</strong>
        </div>
      </div>
      <div className={s.detailLayout}>
        <section className={s.card}>
          <div className={s.sectionHeading}>
            <h2>Daftar peserta</h2>
            <button
              className={s.secondary}
              disabled={loading || busy}
              onClick={() => setEpoch((x) => x + 1)}
            >
              Muat ulang
            </button>
          </div>
          <nav className={s.tabs} aria-label="Filter status peserta">
            <button
              className={!status ? s.activeTab : ""}
              onClick={() => setStatus("")}
            >
              Semua
            </button>
            {Object.entries(memberLabels).map(([value, label]) => (
              <button
                key={value}
                className={status === value ? s.activeTab : ""}
                onClick={() => setStatus(value as MemberStatus)}
              >
                {label}
              </button>
            ))}
          </nav>
          <label className={s.search}>
            <Search size={19} />
            <input
              aria-label="Cari peserta yang dimuat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama peserta yang dimuat…"
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          {loading ? (
            <Busy />
          ) : !visible.length ? (
            <Empty title="Belum ada peserta pada daftar ini">
              Pendaftaran peserta akan ditampilkan sesuai status yang Anda
              pilih.
            </Empty>
          ) : (
            <div className={s.memberList}>
              {visible.map((m) => (
                <button
                  key={m.id}
                  className={selected?.id === m.id ? s.selectedRow : ""}
                  onClick={() => select(m)}
                  disabled={busy}
                >
                  <span className={s.initials}>{initials(m.displayName)}</span>
                  <span>
                    <strong>{m.displayName}</strong>
                    <small>Mendaftar {dateLabel(m.createdAt, true)}</small>
                    {m.status === "accepted" && (
                      <small>
                        {m.attendance === "present"
                          ? "Hadir"
                          : m.attendance === "absent"
                            ? "Tidak hadir"
                            : "Kehadiran belum dicatat"}
                      </small>
                    )}
                  </span>
                  <span
                    className={`${s.badge} ${m.status === "accepted" ? s.green : m.status === "requested" || m.status === "waitlisted" ? s.amber : s.neutral}`}
                  >
                    {memberLabels[m.status]}
                  </span>
                  <span className={s.textButton}>Tinjau</span>
                </button>
              ))}
            </div>
          )}
          <footer className={s.listFooter}>
            <small>
              {visible.length} dari {items.length} peserta dimuat · terbaru
              lebih dahulu
            </small>
            {cursor && (
              <button
                className={s.secondary}
                disabled={more}
                onClick={() => void loadMore()}
              >
                {more ? "Memuat…" : "Muat berikutnya"}
              </button>
            )}
          </footer>
        </section>
        <aside className={`${s.card} ${s.memberPanel}`}>
          {selected ? (
            <>
              <span className={s.largeInitials}>
                {initials(selected.displayName)}
              </span>
              <h2>{selected.displayName}</h2>
              <span className={`${s.badge} ${s.neutral}`}>
                {memberLabels[selected.status]}
              </span>
              <p className={s.hint}>
                Mendaftar {dateLabel(selected.createdAt, true)}
              </p>
              {selected.reason && (
                <p className={s.preserve}>
                  Catatan sebelumnya: {selected.reason}
                </p>
              )}
              {panelError && <Notice error>{panelError}</Notice>}
              {conflict && (
                <button
                  className={s.secondary}
                  disabled={busy}
                  onClick={() => void latest()}
                >
                  Muat versi terbaru
                </button>
              )}
              {transitions.length > 0 ? (
                <>
                  <h3>Keputusan peserta</h3>
                  <label className={s.field}>
                    Status baru
                    <select
                      value={transitions.includes(choice) ? choice : ""}
                      onChange={(e) =>
                        setChoice(e.target.value as typeof choice)
                      }
                    >
                      <option value="" disabled>
                        Pilih keputusan
                      </option>
                      {transitions.map((x) => (
                        <option key={x} value={x}>
                          {memberLabels[x]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={s.field}>
                    Alasan keputusan
                    <textarea
                      rows={4}
                      minLength={5}
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Jelaskan alasan keputusan, minimal 5 karakter."
                    />
                    <small>{reason.length}/1000 karakter</small>
                  </label>
                  {choice === "accepted" && !admitted && (
                    <p className={s.hint}>
                      Penerimaan tersedia saat pendaftaran dibuka atau ditutup
                      dan sebelum kegiatan mulai.
                    </p>
                  )}
                  {choice === "accepted" && !activity.availableSeats && (
                    <Notice>
                      Kuota penuh. Peserta dapat dipertimbangkan sebagai
                      cadangan.
                    </Notice>
                  )}
                  <button
                    className={
                      choice === "rejected" || choice === "cancelled"
                        ? s.danger
                        : s.primary
                    }
                    disabled={
                      busy ||
                      conflict ||
                      reason.trim().length < 5 ||
                      unavailableChoice ||
                      !transitions.includes(choice)
                    }
                    onClick={() => void save("decision")}
                  >
                    <Check size={18} />
                    {busy ? "Menyimpan…" : "Simpan keputusan"}
                  </button>
                </>
              ) : (
                <p className={s.hint}>
                  Perubahan status tidak tersedia untuk peserta ini pada kondisi
                  kegiatan sekarang.
                </p>
              )}
              {canAttendance && (
                <section className={s.attendance}>
                  <h3>Catat kehadiran</h3>
                  <label className={s.field}>
                    Kehadiran
                    <select
                      value={attendance}
                      onChange={(e) =>
                        setAttendance(
                          e.target.value as ActivityMember["attendance"],
                        )
                      }
                    >
                      <option value="unknown">Belum dicatat</option>
                      <option value="present">Hadir</option>
                      <option value="absent">Tidak hadir</option>
                    </select>
                  </label>
                  <button
                    className={s.secondary}
                    disabled={
                      busy || conflict || attendance === selected.attendance
                    }
                    onClick={() => void save("attendance")}
                  >
                    Simpan kehadiran
                  </button>
                  <small>
                    Status belum dicatat tidak dihitung sebagai tidak hadir.
                  </small>
                </section>
              )}
            </>
          ) : (
            <Empty title="Pilih peserta">
              Tinjau permintaan, alasan keputusan, dan kehadiran dalam panel
              ini.
            </Empty>
          )}
        </aside>
      </div>
    </>
  );
}
