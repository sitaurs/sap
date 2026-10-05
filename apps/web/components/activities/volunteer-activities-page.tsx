"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, type SapCategory } from "../../lib/api/client";
import {
  acknowledgeActivitySchedule,
  decideCoordinatorAssignment,
  getActivity,
  getActivityViewer,
  getPublicActivity,
  listCoordinatorAssignments,
  listMyActivities,
  listPublicActivities,
  setActivityMembership,
  type Activity,
  type ActivityViewer,
  type MyActivity,
  type PublicActivity,
  type PublicActivityDetail,
} from "../../lib/api/activities";
import ActivityDetail from "./activity-detail";
import ActivityMembers from "./activity-members";
import ActivityResultForm from "./activity-result-form";
import ActivityForm from "./activity-form";
import { Busy, Empty, Notice, PageHead, Status } from "./activity-ui";
import { dateLabel, errorMessage, uniqueItems } from "./activity-utils";
import s from "./activities.module.css";

type Screen = "list" | "public-detail" | "manage" | "members" | "edit" | "result-new" | "unsupported";

export default function VolunteerActivitiesPage({ categories }: { categories: SapCategory[] }) {
  const [publicActivities, setPublicActivities] = useState<PublicActivity[]>([]);
  const [myActivities, setMyActivities] = useState<MyActivity[]>([]);
  const [assignments, setAssignments] = useState<Activity[]>([]);
  const [selectedPublic, setSelectedPublic] = useState<PublicActivityDetail | null>(null);
  const [viewer, setViewer] = useState<ActivityViewer | null>(null);
  const [managed, setManaged] = useState<Activity | null>(null);
  const [screen, setScreen] = useState<Screen>("list");
  const [showNameByActivity, setShowNameByActivity] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([
      listPublicActivities(undefined, controller.signal),
      listMyActivities(undefined, controller.signal),
      listCoordinatorAssignments(undefined, controller.signal),
    ])
      .then(([publicPage, mine, assigned]) => {
        if (controller.signal.aborted) return;
        setPublicActivities(publicPage.items);
        setMyActivities(mine.items);
        setAssignments(assigned.items);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(cause));
          if (cause instanceof ApiError && cause.code === "FEATURE_UNAVAILABLE")
            setError("Fitur kegiatan relawan belum diaktifkan oleh pengelola SAP.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [epoch]);

  const refresh = useCallback(() => setEpoch((value) => value + 1), []);

  async function openPublic(activity: PublicActivity) {
    setScreen("public-detail");
    setSelectedPublic(null);
    setViewer(null);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const [detail, currentViewer] = await Promise.all([
        getPublicActivity(activity.id),
        getActivityViewer(activity.id),
      ]);
      setSelectedPublic(detail);
      setViewer(currentViewer);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  }

  async function openManagement(activityId: string) {
    setScreen("manage");
    setBusy(true);
    setError("");
    try {
      const activity = await getActivity(activityId);
      setManaged(activity);
    } catch (cause) {
      setError(errorMessage(cause));
      setScreen("list");
    } finally { setBusy(false); }
  }

  async function join(participating: boolean) {
    if (!selectedPublic || selectedPublic.kind !== "activity" || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const membership = await setActivityMembership(selectedPublic.id, participating);
      const freshViewer = await getActivityViewer(selectedPublic.id).catch(() => null);
      setMessage(participating ? "Permintaan bergabung dikirim ke koordinator." : "Pendaftaran Anda dibatalkan.");
      setViewer((old) => freshViewer ?? (old ? {
          ...old,
          membership,
          actions: {
            ...old.actions,
            join: { allowed: !participating, reasonCode: null },
            cancelMembership: { allowed: participating, reasonCode: null },
          },
        } : old));
      refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  }

  async function acceptAssignment(current: Activity, accepted: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await decideCoordinatorAssignment(current, accepted, showNameByActivity[current.id] ?? false);
      setAssignments((old) => uniqueItems(old, [updated]));
      setMessage(accepted ? "Penugasan koordinator diterima." : "Penugasan ditolak. Admin akan menerima status terbaru.");
      refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  }

  async function acknowledge(scheduleRevision: number, confirmed: boolean) {
    if (!selectedPublic || selectedPublic.kind !== "activity" || busy) return;
    if (!confirmed && !window.confirm("Menolak perubahan jadwal akan membatalkan kepesertaan Anda. Lanjutkan?")) return;
    setBusy(true);
    setError("");
    try {
      const membership = await acknowledgeActivitySchedule(selectedPublic.id, scheduleRevision, confirmed);
      const freshViewer = await getActivityViewer(selectedPublic.id).catch(() => null);
      setViewer((old) => freshViewer ?? (old?.membership ? { ...old, membership } : old));
      setMessage(confirmed ? "Perubahan jadwal dikonfirmasi." : "Kepesertaan dibatalkan karena perubahan jadwal tidak disetujui.");
      refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  function back() {
    setScreen("list");
    setSelectedPublic(null);
    setViewer(null);
    setManaged(null);
    setError("");
    setMessage("");
    refresh();
  }

  if (screen === "members" && managed)
    return <div className={s.page}><ActivityMembers activity={managed} onBack={() => setScreen("manage")} onChanged={setManaged} /></div>;
  if (screen === "edit" && managed)
    return <div className={s.page}><ActivityForm activity={managed} categories={categories} onBack={() => setScreen("manage")} onSaved={(updated) => { setManaged(updated); setScreen("manage"); setMessage("Rencana kegiatan diperbarui."); refresh(); }} /></div>;
  if (screen === "result-new" && managed)
    return <div className={s.page}><ActivityResultForm activity={managed} onBack={() => setScreen("manage")} onChanged={setManaged} onSaved={() => { setMessage("Hasil kegiatan dikirim ke antrean moderator."); setScreen("manage"); refresh(); }} /></div>;
  if (screen === "manage" && managed)
    return <div className={s.page}>
      {message && <Notice>{message}</Notice>}
      <ActivityDetail activity={managed} onBack={back} onChanged={setManaged} onNavigate={(next) => {
        if (next === "members") setScreen("members");
        else if (next === "result-new") setScreen("result-new");
        else if (next === "edit") setScreen("edit");
      }} onReview={() => setMessage("Pemeriksaan dan keputusan hasil dilakukan moderator admin. Hermes hanya memberikan rekomendasi.")} />
    </div>;
  if (screen === "unsupported")
    return <div className={s.page}><PageHead title="Kegiatan relawan" subtitle={message} onBack={() => setScreen("manage")} /><Notice>{message}</Notice></div>;

  return <div className={s.page}>
    <PageHead title="Ruang relawan" subtitle="Cari kegiatan, pantau pendaftaran, dan terima penugasan koordinator." />
    {error && <Notice error>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
    {loading ? <Busy /> : <>
      <section className={s.card}>
        <h2>Kegiatan publik</h2>
        {publicActivities.length ? <div className={s.activityGrid}>{publicActivities.map((activity) => <button type="button" key={activity.id} className={s.activityCard} onClick={() => void openPublic(activity)}>
          <Status status={activity.status} />
          <strong>{activity.title}</strong>
          <span>{activity.area.label}</span>
          <small>{dateLabel(activity.startsAt)} · {activity.availableSeats} tempat tersedia</small>
        </button>)}</div> : <Empty title="Belum ada kegiatan publik">Tidak ada kegiatan publik yang tersedia untuk saat ini.</Empty>}
      </section>

      <section className={s.card}>
        <h2>Pendaftaran saya</h2>
        {myActivities.filter((item) => !item.isCoordinator).length ? <div className={s.activityGrid}>{myActivities.filter((item) => !item.isCoordinator).map((item) => <article key={item.activity.id} className={s.activityCard}>
          <strong>{item.activity.kind === "activity" ? item.activity.title : "Informasi kegiatan berubah"}</strong>
          {item.activity.kind === "activity" && <><span>{dateLabel(item.activity.startsAt)}</span><span className={s.memberStatus}>Status: {item.membership?.status ?? "Belum ada"}{item.membership?.reason ? ` · ${item.membership.reason}` : ""}</span><button type="button" className={s.secondary} onClick={() => void openPublic(item.activity as PublicActivity)}>Lihat kegiatan</button></>}
          {item.activity.kind === "activity_notice" && <span>{item.activity.message}</span>}
        </article>)}</div> : <Empty title="Belum ada pendaftaran">Permintaan bergabung dan status relawan Anda akan tampil di sini.</Empty>}
      </section>

      <section className={s.card}>
        <h2>Penugasan koordinator</h2>
        {assignments.length ? <div className={s.assignmentList}>{assignments.map((activity) => <article key={activity.id} className={s.assignmentCard}>
          <div><strong>{activity.title}</strong><p>{activity.reportId.slice(0, 8)} · {activity.status} · revisi {activity.revision}</p></div>
          {activity.coordinatorAcceptedAt ? <><span className={s.memberStatus}>Diterima {dateLabel(activity.coordinatorAcceptedAt)}</span><button type="button" className={s.secondary} onClick={() => void openManagement(activity.id)}>Kelola kegiatan</button></> : <>
            <label className={s.consentRow}><input type="checkbox" checked={showNameByActivity[activity.id] ?? false} onChange={(event) => setShowNameByActivity((old) => ({ ...old, [activity.id]: event.target.checked }))} disabled={busy} /> Izinkan nama tampilan saya ditampilkan sebagai koordinator pada laman publik.</label>
            <div className={s.buttonRow}><button type="button" className={s.primary} onClick={() => void acceptAssignment(activity, true)} disabled={busy}>Terima penugasan</button><button type="button" className={s.secondary} onClick={() => void acceptAssignment(activity, false)} disabled={busy}>Tolak penugasan</button></div>
          </>}
        </article>)}</div> : <Empty title="Belum ada penugasan">Penugasan admin akan muncul setelah Anda dipilih sebagai koordinator.</Empty>}
      </section>
    </>}

    {screen === "public-detail" && <div className={s.activityOverlay} role="dialog" aria-modal="true" aria-label="Detail kegiatan relawan">
      <div className={s.activityDialog}><button type="button" className={s.dialogClose} onClick={() => setScreen("list")}>Tutup</button>
        {busy && !selectedPublic ? <Busy /> : selectedPublic?.kind === "activity" ? <>
          <p className={s.eyebrow}>KEGIATAN RELAWAN</p><h2>{selectedPublic.title}</h2><Status status={selectedPublic.status} />
          <p>{selectedPublic.description}</p><dl><div><dt>Waktu</dt><dd>{dateLabel(selectedPublic.startsAt)} — {dateLabel(selectedPublic.endsAt)}</dd></div><div><dt>Koordinator</dt><dd>{selectedPublic.coordinatorDisplayName}</dd></div><div><dt>Tempat tersedia</dt><dd>{selectedPublic.availableSeats} dari kapasitas {selectedPublic.capacity}</dd></div></dl>
          {selectedPublic.equipment.length > 0 && <p><strong>Perlengkapan:</strong> {selectedPublic.equipment.join(", ")}</p>}
          {selectedPublic.accessibilityNotes && <p><strong>Aksesibilitas:</strong> {selectedPublic.accessibilityNotes}</p>}
          {selectedPublic.wasteHandoverPlan && <p><strong>Rencana serah-terima:</strong> {selectedPublic.wasteHandoverPlan}</p>}
          {viewer?.meetingPoint && <div className={s.meeting}><strong>Titik kumpul</strong><p>{viewer.meetingPoint.instructions}</p>{viewer.meetingPoint.latitude !== null && viewer.meetingPoint.longitude !== null && <small>Koordinat hanya terlihat oleh peserta diterima dan koordinator.</small>}</div>}
          {viewer?.scheduleAcknowledgementRequired && <div className={s.warning}><strong>Jadwal kegiatan berubah.</strong><p>Konfirmasikan apakah Anda menerima perubahan jadwal. Menolak akan membatalkan kepesertaan.</p><div className={s.buttonRow}><button className={s.primary} type="button" onClick={() => void acknowledge(viewer.scheduleRevision, true)} disabled={busy}>Saya menerima jadwal baru</button><button className={s.secondary} type="button" onClick={() => void acknowledge(viewer.scheduleRevision, false)} disabled={busy}>Batalkan kepesertaan</button></div></div>}
          {viewer?.membership && <p className={s.memberStatus}>Pendaftaran Anda: {viewer.membership.status}{viewer.membership.reason ? ` · ${viewer.membership.reason}` : ""}</p>}
          {viewer?.actions.join.allowed ? <button type="button" className={s.primary} onClick={() => void join(true)} disabled={busy}>Ajukan untuk bergabung</button> : viewer?.actions.cancelMembership.allowed ? <button type="button" className={s.secondary} onClick={() => void join(false)} disabled={busy}>Batalkan pendaftaran</button> : <p className={s.helper}>Pendaftaran saat ini tidak tersedia: {viewer?.actions.join.reasonCode ?? "status kegiatan tidak memungkinkan"}.</p>}
          {error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
        </> : selectedPublic?.kind === "activity_notice" ? <><h2>Informasi kegiatan berubah</h2><p>{selectedPublic.message}</p>{selectedPublic.cancellationReason && <p>{selectedPublic.cancellationReason}</p>}</> : null}
      </div>
    </div>}
  </div>;
}
