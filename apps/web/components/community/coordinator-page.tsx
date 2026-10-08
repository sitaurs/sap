"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { acceptAssignment } from "../../lib/api/community";
import {
  coordinatorCommand,
  coordinatorEdit,
  coordinatorMembers,
  coordinatorResultGateway,
  manageActivity,
} from "../../lib/api/coordinator";
import type { Activity, ActivityInput } from "../../lib/api/activities";
import { revisionConflict } from "../../lib/api/r1";
import ActivityMembers from "../activities/activity-members";
import ActivityResultForm from "../activities/activity-result-form";
import { useIntentKey } from "../activities/activity-ui";
import {
  displayedActivityStatus,
  localDate,
  fromLocalDate,
  registrationClosedMessage,
  statusLabels,
} from "../activities/activity-utils";
import { date, Failure, Heading, PublicShell } from "./community-ui";
import s from "./community.module.css";
import { useI18n } from "../../lib/i18n/provider";

export default function CoordinatorPage({ id }: { id: string }) {
  const { t, intlLocale } = useI18n();
  const [activity, setActivity] = useState<Activity | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [epoch, setEpoch] = useState(0),
    [nameConsent, setNameConsent] = useState(false),
    [screen, setScreen] = useState<
      "overview" | "members" | "schedule" | "result"
    >("overview"),
    [latest, setLatest] = useState<Activity | null>(null),
    [command, setCommand] = useState<
      "close_registration" | "start" | "request_result" | "cancel" | null
    >(null),
    [reason, setReason] = useState(""),
    [resultId, setResultId] = useState<string | undefined>();
  const intent = useIntentKey(),
    resultGateway = useMemo(() => coordinatorResultGateway(id), [id]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("result");
    if (
      value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      setResultId(value);
      if (params.get("screen") === "result") setScreen("result");
    }
  }, [id]);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError(null);
    manageActivity(id, c.signal)
      .then((a) => {
        if (!c.signal.aborted) setActivity(a);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, epoch]);
  async function execute(accepted?: boolean) {
    if (!activity || busy || latest) return;
    setBusy(true);
    setError(null);
    try {
      const updated =
        accepted !== undefined
          ? await acceptAssignment(id, activity.revision, accepted, nameConsent)
          : await coordinatorCommand(
              activity,
              command!,
              reason.trim() || null,
              intent({ id, revision: activity.revision, command, reason }),
            );
      setActivity(updated);
      setCommand(null);
    } catch (e) {
      setError(e);
      if (revisionConflict(e)) {
        try {
          setLatest(await manageActivity(id));
        } catch (load) {
          setError(load);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicShell>
      <Link
        className={s.link}
        href={`/activities/${id}`}
      >
        ← {t("Detail kegiatan")}</Link>
      {loading ? (
        <p role="status">{t("Memuat penugasan…")}</p>
      ) : activity ? (
        <>
          <Heading title={activity.title}>
            {t("Koordinator ·")} {t(statusLabels[displayedActivityStatus(activity)])}
          </Heading>
          {registrationClosedMessage(activity, intlLocale) && (
            <p role="status">{t(registrationClosedMessage(activity, intlLocale)!)}</p>
          )}
          {screen === "members" ? (
            <ActivityMembers
              activity={activity}
              gateway={coordinatorMembers}
              kicker="SAP · KOORDINATOR KEGIATAN"
              onBack={() => setScreen("overview")}
              onChanged={setActivity}
            />
          ) : screen === "schedule" ? (
            <ScheduleForm
              activity={activity}
              onSaved={(a) => {
                setActivity(a);
                setScreen("overview");
              }}
              onBack={() => setScreen("overview")}
            />
          ) : screen === "result" && activity.coordinatorAcceptedAt ? (
            <ActivityResultForm
              activity={activity}
              resultId={resultId}
              gateway={resultGateway}
              kicker="SAP · KOORDINATOR KEGIATAN"
              onBack={() => setScreen("overview")}
              onChanged={setActivity}
              onSaved={(r) => {
                setResultId(r.id);
                const url = new URL(window.location.href);
                url.searchParams.set("result", r.id);
                url.searchParams.delete("screen");
                window.history.replaceState(
                  null,
                  "",
                  url.pathname + url.search,
                );
                setScreen("overview");
                setEpoch((v) => v + 1);
              }}
            />
          ) : (
            <section className={s.card}>
              <p>{activity.description}</p>
              <p>
                {date(activity.startsAt, intlLocale)} — {date(activity.endsAt, intlLocale)}
              </p>
              <p>
                {activity.acceptedCount}/{activity.capacity ?? "—"} {" "}{t("peserta diterima")}</p>
              {!activity.coordinatorAcceptedAt ? (
                <>
                  <h2>{t("Jawab penugasan")}</h2>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={nameConsent}
                      disabled={busy}
                      onChange={(e) => setNameConsent(e.target.checked)}
                    />
                    {t("Saya mengizinkan nama saya ditampilkan sebagai koordinator pada kegiatan ini.")}</label>
                  <div className={s.actions}>
                    <button
                      className={s.button}
                      disabled={busy || !!latest}
                      onClick={() => void execute(true)}
                    >
                      {t("Terima penugasan")}</button>
                    <button
                      className={s.secondary}
                      disabled={busy || !!latest}
                      onClick={() => void execute(false)}
                    >
                      {t("Tolak penugasan")}</button>
                  </div>
                </>
              ) : (
                <>
                  <div className={s.actions}>
                    <button
                      className={s.button}
                      onClick={() => setScreen("members")}
                    >
                      {t("Kelola peserta")}</button>
                    <button
                      className={s.secondary}
                      disabled={!activity.actions.edit.allowed}
                      onClick={() => setScreen("schedule")}
                    >
                      {t("Atur jadwal dan informasi")}</button>
                    {["in_progress", "awaiting_result"].includes(
                      activity.status,
                    ) && (
                      <button
                        className={s.secondary}
                        onClick={() => setScreen("result")}
                      >
                        {resultId ? t("Lengkapi hasil") : t("Kirim hasil kegiatan")}
                      </button>
                    )}
                  </div>
                  <div className={s.actions}>
                    {(
                      [
                        {
                          action: "close_registration",
                          permission: "closeRegistration",
                          label: t("Tutup pendaftaran"),
                        },
                        {
                          action: "start",
                          permission: "start",
                          label: t("Mulai kegiatan"),
                        },
                        {
                          action: "request_result",
                          permission: "requestResult",
                          label: t("Minta hasil"),
                        },
                        {
                          action: "cancel",
                          permission: "cancel",
                          label: t("Batalkan kegiatan"),
                        },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.action}
                        className={s.secondary}
                        disabled={
                          busy || !activity.actions[item.permission].allowed
                        }
                        onClick={() => {
                          setCommand(item.action);
                          setReason("");
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {command && (
                <div className={s.conflict}>
                  <strong>{t("Konfirmasi tindakan:")}{" "}{command}</strong>
                  <label className={s.field}>
                    {t("Alasan")}<textarea
                      value={reason}
                      maxLength={1000}
                      minLength={5}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <div className={s.actions}>
                    <button
                      className={s.secondary}
                      disabled={busy}
                      onClick={() => setCommand(null)}
                    >
                      {t("Kembali")}</button>
                    <button
                      className={s.button}
                      disabled={
                        busy ||
                        !!latest ||
                        (command === "cancel" && reason.trim().length < 5)
                      }
                      onClick={() => void execute()}
                    >
                      {t("Konfirmasi")}</button>
                  </div>
                </div>
              )}
              {latest && (
                <div className={s.conflict} role="alert">
                  <strong>{t("Versi terbaru · revisi")}{" "}{latest.revision}</strong>
                  <p>
                    {latest.title} · {t(statusLabels[latest.status])}
                  </p>
                  <p>
                    {date(latest.startsAt, intlLocale)} — {date(latest.endsAt, intlLocale)}
                  </p>
                  <button
                    className={s.secondary}
                    onClick={() => {
                      setActivity(latest);
                      setLatest(null);
                      setError(null);
                    }}
                  >
                    {t("Saya sudah meninjau, gunakan versi terbaru")}</button>
                </div>
              )}
            </section>
          )}
        </>
      ) : null}
      {error !== null && (
        <Failure error={error} retry={() => setEpoch((v) => v + 1)} />
      )}
    </PublicShell>
  );
}
function ScheduleForm({
  activity,
  onSaved,
  onBack,
}: {
  activity: Activity;
  onSaved: (a: Activity) => void;
  onBack: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const [baseline, setBaseline] = useState(activity),
    [title, setTitle] = useState(activity.title),
    [description, setDescription] = useState(activity.description),
    [start, setStart] = useState(localDate(activity.startsAt)),
    [end, setEnd] = useState(localDate(activity.endsAt)),
    [close, setClose] = useState(localDate(activity.registrationClosesAt)),
    [capacity, setCapacity] = useState(String(activity.capacity ?? "")),
    [point, setPoint] = useState(activity.meetingPoint?.instructions ?? ""),
    [equipment, setEquipment] = useState(activity.equipment.join("\n")),
    [access, setAccess] = useState(activity.accessibilityNotes),
    [handover, setHandover] = useState(activity.wasteHandoverPlan),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [latest, setLatest] = useState<Activity | null>(null);
  async function save() {
    if (busy || latest) return;
    setBusy(true);
    try {
      const body: ActivityInput = {
        reportId: baseline.reportId,
        coordinatorId: baseline.coordinatorId,
        title,
        description,
        startsAt: fromLocalDate(start),
        endsAt: fromLocalDate(end),
        registrationClosesAt: fromLocalDate(close),
        capacity: capacity ? Number(capacity) : null,
        timezone: "Asia/Jakarta",
        meetingPoint: {
          instructions: point,
          latitude: baseline.meetingPoint?.latitude ?? null,
          longitude: baseline.meetingPoint?.longitude ?? null,
        },
        equipment: equipment
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
        accessibilityNotes: access,
        wasteHandoverPlan: handover,
      };
      onSaved(await coordinatorEdit(baseline, body));
    } catch (e) {
      setError(e);
      if (revisionConflict(e)) {
        try {
          setLatest(await manageActivity(activity.id));
        } catch (load) {
          setError(load);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`${s.card} ${s.form}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2>{t("Informasi dan jadwal kegiatan")}</h2>
      <p className={s.notice}>
        {t("Peserta yang diterima akan diminta mengonfirmasi perubahan jadwal. Penugasan koordinator tetap dikelola admin.")}</p>
      <label className={s.field}>
        {t("Judul")}<input
          value={title}
          required
          minLength={5}
          maxLength={150}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className={s.field}>
        {t("Deskripsi")}<textarea
          value={description}
          required
          minLength={20}
          maxLength={3000}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {[
        { label: t("Mulai (WIB)"), value: start, set: setStart },
        { label: t("Selesai (WIB)"), value: end, set: setEnd },
        { label: t("Batas pendaftaran (WIB)"), value: close, set: setClose },
      ].map((field) => (
        <label className={s.field} key={field.label}>
          {field.label}
          <input
            type="datetime-local"
            value={field.value}
            required
            disabled={busy}
            onChange={(e) => field.set(e.target.value)}
          />
        </label>
      ))}
      <label className={s.field}>
        {t("Kuota")}<input
          type="number"
          value={capacity}
          min={1}
          max={500}
          required
          disabled={busy}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </label>
      <label className={s.field}>
        {t("Instruksi titik kumpul")}<textarea
          value={point}
          maxLength={1000}
          disabled={busy}
          onChange={(e) => setPoint(e.target.value)}
        />
      </label>
      <label className={s.field}>
        {t("Perlengkapan (satu per baris)")}<textarea
          value={equipment}
          disabled={busy}
          onChange={(e) => setEquipment(e.target.value)}
        />
      </label>
      <label className={s.field}>
        {t("Aksesibilitas")}<textarea
          value={access}
          disabled={busy}
          onChange={(e) => setAccess(e.target.value)}
        />
      </label>
      <label className={s.field}>
        {t("Rencana serah terima")}<textarea
          value={handover}
          disabled={busy}
          onChange={(e) => setHandover(e.target.value)}
        />
      </label>
      {latest && (
        <div className={s.conflict} role="alert">
          <strong>{t("Revisi terbaru")}{" "}{latest.revision}</strong>
          <p>{latest.title}</p>
          <p>
            {date(latest.startsAt, intlLocale)} — {date(latest.endsAt, intlLocale)}
          </p>
          <p className={s.pre}>{latest.description}</p>
          <p>
            {t("Batas pendaftaran:")}{" "}{date(latest.registrationClosesAt, intlLocale)} {" "}{t("· kuota:")}{" "}
            {latest.capacity ?? t("Belum diatur")}
          </p>
          <p>
            {t("Titik kumpul:")}{" "}{latest.meetingPoint?.instructions || t("Belum diatur")}
          </p>
          <p>{t("Perlengkapan:")}{" "}{latest.equipment.join(", ") || t("Belum diatur")}</p>
          <p>{t("Aksesibilitas:")}{" "}{latest.accessibilityNotes || t("Belum diatur")}</p>
          <p>{t("Serah terima:")}{" "}{latest.wasteHandoverPlan || t("Belum diatur")}</p>
          <p>
            {t("Input Anda tetap disimpan. Periksa perbedaan sebelum menyimpan ulang.")}</p>
          <button
            type="button"
            className={s.secondary}
            onClick={() => {
              setBaseline(latest);
              setLatest(null);
              setError(null);
            }}
          >
            {t("Saya sudah meninjau versi terbaru")}</button>
        </div>
      )}
      {error !== null && <Failure error={error} />}
      <div className={s.actions}>
        <button
          type="button"
          className={s.secondary}
          disabled={busy}
          onClick={onBack}
        >
          {t("Kembali")}</button>
        <button
          className={s.button}
          disabled={busy || !!latest || !baseline.actions.edit.allowed}
        >
          {busy ? t("Menyimpan…") : t("Simpan perubahan")}
        </button>
      </div>
    </form>
  );
}
