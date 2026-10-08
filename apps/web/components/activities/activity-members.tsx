"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search, UsersRound } from "lucide-react";
import {
  decideMember as defaultDecideMember,
  getActivity as defaultGetActivity,
  listMembers as defaultListMembers,
  recordAttendance as defaultRecordAttendance,
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
import { useI18n } from "../../lib/i18n/provider";

type MemberDecision = Extract<MemberStatus, "accepted" | "waitlisted" | "rejected" | "cancelled">;

export default function ActivityMembers({
  activity,
  onBack,
  onChanged,
  gateway,
  kicker,
}: {
  activity: Activity;
  onBack: () => void;
  onChanged: (a: Activity) => void;
  gateway?: {
    listMembers: typeof defaultListMembers;
    decideMember: typeof defaultDecideMember;
    recordAttendance: typeof defaultRecordAttendance;
    getActivity: typeof defaultGetActivity;
  };
  kicker?: string;
}) {
  const { t, intlLocale } = useI18n();
  const { listMembers, decideMember, recordAttendance, getActivity } =
    gateway ?? {
      listMembers: defaultListMembers,
      decideMember: defaultDecideMember,
      recordAttendance: defaultRecordAttendance,
      getActivity: defaultGetActivity,
    };
  const [status, setStatus] = useState<MemberStatus | "">(""),
    [search, setSearch] = useState(""),
    [items, setItems] = useState<ActivityMember[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [epoch, setEpoch] = useState(0);
  const [selected, setSelected] = useState<ActivityMember | null>(null),
    [choice, setChoice] = useState<MemberDecision | "">(""),
    [reason, setReason] = useState(""),
    [attendance, setAttendance] =
      useState<ActivityMember["attendance"]>("unknown");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [panelError, setPanelError] = useState(""),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false);
  const listGeneration = useRef(0);
  const [latestMember, setLatestMember] = useState<ActivityMember | null>(null);
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
  }, [activity.id, status, epoch, listMembers]);
  const admitted =
    ["registration_open", "registration_closed"].includes(activity.status) &&
    !!activity.startsAt &&
    Date.parse(activity.startsAt) > Date.now();
  const canAttendance =
    selected?.status === "accepted" &&
    ["in_progress", "awaiting_result", "completed"].includes(activity.status);
  const transitions: MemberDecision[] =
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
    setChoice("");
    setReason("");
    setPanelError("");
    setConflict(false);
    setLatestMember(null);
    setCancelConfirmOpen(false);
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
  async function save(kind: "decision" | "attendance", cancellationConfirmed = false) {
    if (!selected || conflict || latestMember || (kind === "decision" && !choice)) return;
    if (kind === "decision" && selected.status === "accepted" && choice === "cancelled" && !cancellationConfirmed) {
      setCancelConfirmOpen(true);
      return;
    }
    setBusy(true);
    setPanelError("");
    try {
      const saved =
        kind === "decision"
          ? await decideMember(selected, choice as MemberDecision, reason.trim())
          : await recordAttendance(selected, attendance);
      setSelected(saved);
      setAttendance(saved.attendance);
      setItems((old) =>
        old
          .map((x) => (x.id === saved.id ? saved : x))
          .filter((x) => !status || x.status === status),
      );
      setReason("");
      setCancelConfirmOpen(false);
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
      setLatestMember(found);
      onChanged(await getActivity(activity.id));
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
        kicker={kicker}
        title={t("Kelola peserta")}
        subtitle={activity.title}
        onBack={onBack}
        action={<Status status={activity.status} />}
      />
      {message && <Notice>{t(message)}</Notice>}
      <div className={s.memberSummary}>
        <span className={s.iconCircle}>
          <UsersRound size={26} />
        </span>
        <div>
          <strong>
            {activity.acceptedCount} / {activity.capacity ?? "—"} {" "}{t("peserta diterima")}</strong>
          <p>
            {activity.capacity == null
              ? t("Kuota belum ditentukan")
              : t("{0} tempat tersedia", { "0": activity.availableSeats })}
          </p>
        </div>
        <div>
          <small>{t("Batas pendaftaran")}</small>
          <strong>{t(dateLabel(activity.registrationClosesAt, true, intlLocale))}</strong>
        </div>
      </div>
      <div className={s.detailLayout}>
        <section className={s.card}>
          <div className={s.sectionHeading}>
            <h2>{t("Daftar peserta")}</h2>
            <button
              className={s.secondary}
              disabled={loading || busy}
              onClick={() => setEpoch((x) => x + 1)}
            >
              {t("Muat ulang")}</button>
          </div>
          <nav className={s.tabs} aria-label={t("Filter status peserta")}>
            <button
              className={!status ? s.activeTab : ""}
              onClick={() => setStatus("")}
            >
              {t("Semua")}</button>
            {Object.entries(memberLabels).map(([value, label]) => (
              <button
                key={value}
                className={status === value ? s.activeTab : ""}
                onClick={() => setStatus(value as MemberStatus)}
              >
                {t(label)}
              </button>
            ))}
          </nav>
          <label className={s.search}>
            <Search size={19} />
            <input
              aria-label={t("Cari peserta yang dimuat")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Cari nama peserta yang dimuat…")}
            />
          </label>
          {error && <Notice error>{t(error)}</Notice>}
          {loading ? (
            <Busy />
          ) : !visible.length ? (
            <Empty title={t("Belum ada peserta pada daftar ini")}>
              {t("Pendaftaran peserta akan ditampilkan sesuai status yang Anda pilih.")}</Empty>
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
                    <small>{t("Mendaftar")}{" "}{t(dateLabel(m.createdAt, true, intlLocale))}</small>
                    {m.status === "accepted" && (
                      <small>
                        {m.attendance === "present"
                          ? t("Hadir")
                          : m.attendance === "absent"
                            ? t("Tidak hadir")
                            : t("Kehadiran belum dicatat")}
                      </small>
                    )}
                  </span>
                  <span
                    className={`${s.badge} ${m.status === "accepted" ? s.green : m.status === "requested" || m.status === "waitlisted" ? s.amber : s.neutral}`}
                  >
                    {t(memberLabels[m.status])}
                  </span>
                  <span className={s.textButton}>{t("Tinjau")}</span>
                </button>
              ))}
            </div>
          )}
          <footer className={s.listFooter}>
            <small>
              {visible.length} {" "}{t("dari")}{" "}{items.length} {" "}{t("peserta dimuat · terbaru lebih dahulu")}</small>
            {cursor && (
              <button
                className={s.secondary}
                disabled={more}
                onClick={() => void loadMore()}
              >
                {more ? t("Memuat…") : t("Muat berikutnya")}
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
                {t(memberLabels[selected.status])}
              </span>
              <p className={s.hint}>
                {t("Mendaftar")}{" "}{t(dateLabel(selected.createdAt, true, intlLocale))}
              </p>
              {selected.reason && (
                <p className={s.preserve}>
                  {t("Catatan sebelumnya:")}{" "}{selected.reason}
                </p>
              )}
              {panelError && <Notice error>{panelError}</Notice>}
              {conflict && (
                <button
                  className={s.secondary}
                  disabled={busy}
                  onClick={() => void latest()}
                >
                  {t("Muat versi terbaru")}</button>
              )}
              {latestMember && (
                <Notice>
                  <strong>
                    {t("Versi terbaru · revisi")}{" "}{latestMember.revision}
                  </strong>
                  <p>
                    {latestMember.displayName} ·{" "}
                    {t(memberLabels[latestMember.status])} {" "}{t("· kehadiran:")}{" "}
                    {latestMember.attendance}
                  </p>
                  <p>{latestMember.reason}</p>
                  <button
                    className={s.secondary}
                    disabled={busy}
                    onClick={() => {
                      setSelected(latestMember);
                      setLatestMember(null);
                      setConflict(false);
                      setPanelError("");
                    }}
                  >
                    {t("Saya sudah meninjau, pertahankan input saya")}</button>
                </Notice>
              )}
              {transitions.length > 0 ? (
                <>
                  <h3>{t("Keputusan peserta")}</h3>
                  <label className={s.field}>
                    {t("Status baru")}<select
                      value={choice && transitions.includes(choice) ? choice : ""}
                      onChange={(e) =>
                        setChoice(e.target.value as typeof choice)
                      }
                    >
                      <option value="" disabled>
                        {t("Pilih keputusan")}</option>
                      {transitions.map((x) => (
                        <option key={x} value={x}>
                          {t(memberLabels[x])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={s.field}>
                    {t("Alasan keputusan")}<textarea
                      rows={4}
                      minLength={5}
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("Jelaskan alasan keputusan, minimal 5 karakter.")}
                    />
                    <small>{reason.length}{t("/1000 karakter")}</small>
                  </label>
                  {choice === "accepted" && !admitted && (
                    <p className={s.hint}>
                      {t("Penerimaan tersedia saat pendaftaran dibuka atau ditutup dan sebelum kegiatan mulai.")}</p>
                  )}
                  {choice === "accepted" && !activity.availableSeats && (
                    <Notice>
                      {t("Kuota penuh. Peserta dapat dipertimbangkan sebagai cadangan.")}</Notice>
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
                      !choice ||
                      !transitions.includes(choice)
                    }
                    onClick={() => void save("decision")}
                  >
                    <Check size={18} />
                    {busy ? t("Menyimpan…") : t("Simpan keputusan")}
                  </button>
                  {cancelConfirmOpen && selected.status === "accepted" && choice === "cancelled" && (
                    <div className={s.cancelConfirm} role="alertdialog" aria-modal="true" aria-labelledby="cancel-member-title">
                      <strong id="cancel-member-title">{t("Batalkan peserta yang diterima?")}</strong>
                      <p>{t("Peserta akan kehilangan status diterima dan kapasitas kegiatan akan tersedia kembali. Alasan yang Anda isi akan dicatat.")}</p>
                      <div>
                        <button type="button" className={s.secondary} disabled={busy} onClick={() => setCancelConfirmOpen(false)}>{t("Kembali")}</button>
                        <button type="button" className={s.danger} disabled={busy || reason.trim().length < 5 || unavailableChoice} onClick={() => { setCancelConfirmOpen(false); void save("decision", true); }}>{t("Ya, batalkan peserta")}</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className={s.hint}>
                  {t("Perubahan status tidak tersedia untuk peserta ini pada kondisi kegiatan sekarang.")}</p>
              )}
              {canAttendance && (
                <section className={s.attendance}>
                  <h3>{t("Catat kehadiran")}</h3>
                  <label className={s.field}>
                    {t("Kehadiran")}<select
                      value={attendance}
                      onChange={(e) =>
                        setAttendance(
                          e.target.value as ActivityMember["attendance"],
                        )
                      }
                    >
                      <option value="unknown">{t("Belum dicatat")}</option>
                      <option value="present">{t("Hadir")}</option>
                      <option value="absent">{t("Tidak hadir")}</option>
                    </select>
                  </label>
                  <button
                    className={s.secondary}
                    disabled={
                      busy || conflict || attendance === selected.attendance
                    }
                    onClick={() => void save("attendance")}
                  >
                    {t("Simpan kehadiran")}</button>
                  <small>
                    {t("Status belum dicatat tidak dihitung sebagai tidak hadir.")}</small>
                </section>
              )}
            </>
          ) : (
            <Empty title={t("Pilih peserta")}>
              {t("Tinjau permintaan, alasan keputusan, dan kehadiran dalam panel ini.")}</Empty>
          )}
        </aside>
      </div>
    </>
  );
}
