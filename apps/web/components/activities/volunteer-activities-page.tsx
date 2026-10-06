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
import { SourcePhoto } from "./activity-photo";
import ActivityMembers from "./activity-members";
import ActivityResultForm from "./activity-result-form";
import ActivityForm from "./activity-form";
import { Busy, Empty, Notice, PageHead, Status } from "./activity-ui";
import { dateLabel, errorMessage, uniqueItems, memberLabels } from "./activity-utils";
import s from "./activities.module.css";
import { useI18n } from "../../lib/i18n/provider";

type Screen = "list" | "public-detail" | "manage" | "members" | "edit" | "result-new" | "unsupported";

export default function VolunteerActivitiesPage({ categories }: { categories: SapCategory[] }) {
  const { t, intlLocale } = useI18n();
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
      setMessage(participating ? t("Permintaan bergabung dikirim ke koordinator.") : t("Pendaftaran Anda dibatalkan."));
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
      setMessage(accepted ? t("Penugasan koordinator diterima.") : t("Penugasan ditolak. Admin akan menerima status terbaru."));
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
      setMessage(confirmed ? t("Perubahan jadwal dikonfirmasi.") : t("Kepesertaan dibatalkan karena perubahan jadwal tidak disetujui."));
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
    return <div className={s.page}><ActivityForm activity={managed} categories={categories} admin={false} onBack={() => setScreen("manage")} onSaved={(updated) => { setManaged(updated); setScreen("manage"); setMessage("Rencana kegiatan diperbarui."); refresh(); }} /></div>;
  if (screen === "result-new" && managed)
    return <div className={s.page}><ActivityResultForm activity={managed} onBack={() => setScreen("manage")} onChanged={setManaged} onSaved={() => { setMessage("Hasil kegiatan dikirim ke antrean moderator."); setScreen("manage"); refresh(); }} /></div>;
  if (screen === "manage" && managed)
    return <div className={s.page}>
      {message && <Notice>{t(message)}</Notice>}
      <ActivityDetail activity={managed} onBack={back} onChanged={setManaged} onNavigate={(next) => {
        if (next === "members") setScreen("members");
        else if (next === "result-new") setScreen("result-new");
        else if (next === "edit") setScreen("edit");
      }} onReview={() => setMessage("Pemeriksaan dan keputusan hasil dilakukan moderator admin. Hermes hanya memberikan rekomendasi.")} />
    </div>;
  if (screen === "unsupported")
    return <div className={s.page}><PageHead title={t("Kegiatan relawan")} subtitle={t(message)} onBack={() => setScreen("manage")} /><Notice>{t(message)}</Notice></div>;

  return <div className={s.page}>
    <PageHead title={t("Ruang relawan")} subtitle={t("Cari kegiatan, pantau pendaftaran, dan terima penugasan koordinator.")} />
    {error && <Notice error>{t(error)}</Notice>}
    {message && <Notice>{t(message)}</Notice>}
    {loading ? <Busy /> : <>
      <section className={s.card}>
        <h2>{t("Kegiatan publik")}</h2>
        {publicActivities.length ? <div className={s.activityGrid}>{publicActivities.map((activity) => <button type="button" key={activity.id} className={s.activityCard} onClick={() => void openPublic(activity)}>
          <Status status={activity.status} />
          <strong>{activity.title}</strong>
          <span>{activity.area.label}</span>
          <small>{dateLabel(activity.startsAt, true, intlLocale)} · {activity.availableSeats} {t("tempat tersedia")}</small>
        </button>)}</div> : <Empty title={t("Belum ada kegiatan publik")}>{t("Tidak ada kegiatan publik yang tersedia untuk saat ini.")}</Empty>}
      </section>

      <section className={s.card}>
        <h2>{t("Pendaftaran saya")}</h2>
        {myActivities.filter((item) => !item.isCoordinator).length ? <div className={s.activityGrid}>{myActivities.filter((item) => !item.isCoordinator).map((item) => <article key={item.activity.id} className={s.activityCard}>
          <strong>{item.activity.kind === "activity" ? item.activity.title : t("Informasi kegiatan berubah")}</strong>
          {item.activity.kind === "activity" && <><span>{dateLabel(item.activity.startsAt, true, intlLocale)}</span><span className={s.memberStatus}>{t("Status:")}{" "}{item.membership ? t(memberLabels[item.membership.status]) : t("Belum ada")}{item.membership?.reason ? ` · ${item.membership.reason}` : ""}</span><button type="button" className={s.secondary} onClick={() => void openPublic(item.activity as PublicActivity)}>{t("Lihat kegiatan")}</button></>}
          {item.activity.kind === "activity_notice" && <span>{item.activity.message}</span>}
        </article>)}</div> : <Empty title={t("Belum ada pendaftaran")}>{t("Permintaan bergabung dan status relawan Anda akan tampil di sini.")}</Empty>}
      </section>

      <section className={s.card}>
        <h2>{t("Penugasan koordinator")}</h2>
        {assignments.length ? <div className={s.assignmentList}>{assignments.map((activity) => <article key={activity.id} className={s.assignmentCard}>
          <div><strong>{activity.title}</strong><p>{activity.reportId.slice(0, 8)} · {activity.status} {t("· revisi")}{" "}{activity.revision}</p></div>
          {activity.coordinatorAcceptedAt ? <><span className={s.memberStatus}>{t("Diterima")}{" "}{dateLabel(activity.coordinatorAcceptedAt, true, intlLocale)}</span><button type="button" className={s.secondary} onClick={() => void openManagement(activity.id)}>{t("Kelola kegiatan")}</button></> : <>
            <label className={s.consentRow}><input type="checkbox" checked={showNameByActivity[activity.id] ?? false} onChange={(event) => setShowNameByActivity((old) => ({ ...old, [activity.id]: event.target.checked }))} disabled={busy} /> {t("Izinkan nama tampilan saya ditampilkan sebagai koordinator pada laman publik.")}</label>
            <div className={s.buttonRow}><button type="button" className={s.primary} onClick={() => void acceptAssignment(activity, true)} disabled={busy}>{t("Terima penugasan")}</button><button type="button" className={s.secondary} onClick={() => void acceptAssignment(activity, false)} disabled={busy}>{t("Tolak penugasan")}</button></div>
          </>}
        </article>)}</div> : <Empty title={t("Belum ada penugasan")}>{t("Penugasan admin akan muncul setelah Anda dipilih sebagai koordinator.")}</Empty>}
      </section>
    </>}

    {screen === "public-detail" && <div className={s.activityOverlay} role="dialog" aria-modal="true" aria-label={t("Detail kegiatan relawan")}>
      <div className={s.activityDialog}><button type="button" className={s.dialogClose} onClick={() => setScreen("list")}>{t("Tutup")}</button>
        {busy && !selectedPublic ? <Busy /> : selectedPublic?.kind === "activity" ? <>
          <p className={s.eyebrow}>{t("KEGIATAN RELAWAN")}</p><h2>{selectedPublic.title}</h2><Status status={selectedPublic.status} />
          <p>{selectedPublic.description}</p>
          {viewer?.membership?.status === "accepted" && (
            <div className={`${s.sourceFrame} ${s.volunteerSourceFrame}`}>
              <SourcePhoto activityId={selectedPublic.id} allowed large />
              <span>{t("Foto laporan sumber")}</span>
            </div>
          )}<dl><div><dt>{t("Waktu")}</dt><dd>{dateLabel(selectedPublic.startsAt, true, intlLocale)} — {dateLabel(selectedPublic.endsAt, true, intlLocale)}</dd></div><div><dt>{t("Koordinator")}</dt><dd>{selectedPublic.coordinatorDisplayName}</dd></div><div><dt>{t("Tempat tersedia")}</dt><dd>{selectedPublic.availableSeats} {t("dari kapasitas")}{" "}{selectedPublic.capacity}</dd></div></dl>
          {selectedPublic.equipment.length > 0 && <p><strong>{t("Perlengkapan:")}</strong> {selectedPublic.equipment.join(", ")}</p>}
          {selectedPublic.accessibilityNotes && <p><strong>{t("Aksesibilitas:")}</strong> {selectedPublic.accessibilityNotes}</p>}
          {selectedPublic.wasteHandoverPlan && <p><strong>{t("Rencana serah-terima:")}</strong> {selectedPublic.wasteHandoverPlan}</p>}
          {viewer?.meetingPoint && <div className={s.meeting}><strong>{t("Titik kumpul")}</strong><p>{viewer.meetingPoint.instructions}</p>{viewer.meetingPoint.latitude !== null && viewer.meetingPoint.longitude !== null && <small>{t("Koordinat hanya terlihat oleh peserta diterima dan koordinator.")}</small>}</div>}
          {viewer?.scheduleAcknowledgementRequired && <div className={s.warning}><strong>{t("Jadwal kegiatan berubah.")}</strong><p>{t("Konfirmasikan apakah Anda menerima perubahan jadwal. Menolak akan membatalkan kepesertaan.")}</p><div className={s.buttonRow}><button className={s.primary} type="button" onClick={() => void acknowledge(viewer.scheduleRevision, true)} disabled={busy}>{t("Saya menerima jadwal baru")}</button><button className={s.secondary} type="button" onClick={() => void acknowledge(viewer.scheduleRevision, false)} disabled={busy}>{t("Batalkan kepesertaan")}</button></div></div>}
          {viewer?.membership && <p className={s.memberStatus}>{t("Pendaftaran Anda:")}{" "}{t(memberLabels[viewer.membership.status])}{viewer.membership.reason ? ` · ${viewer.membership.reason}` : ""}</p>}
          {viewer?.actions.join.allowed ? <button type="button" className={s.primary} onClick={() => void join(true)} disabled={busy}>{t("Ajukan untuk bergabung")}</button> : viewer?.actions.cancelMembership.allowed ? <button type="button" className={s.secondary} onClick={() => void join(false)} disabled={busy}>{t("Batalkan pendaftaran")}</button> : <p className={s.helper}>{t("Pendaftaran saat ini tidak tersedia:")}{" "}{viewer?.actions.join.reasonCode ?? t("status kegiatan tidak memungkinkan")}.</p>}
          {error && <Notice error>{t(error)}</Notice>}{message && <Notice>{t(message)}</Notice>}
        </> : selectedPublic?.kind === "activity_notice" ? <><h2>{t("Informasi kegiatan berubah")}</h2><p>{selectedPublic.message}</p>{selectedPublic.cancellationReason && <p>{selectedPublic.cancellationReason}</p>}</> : null}
      </div>
    </div>}
  </div>;
}
