"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  MapPin,
  Pencil,
  ShieldCheck,
  UsersRound,
  Clock3,
  FileText,
  Package,
  Truck,
  Accessibility,
  Leaf,
  ExternalLink,
} from "lucide-react";
import { type SapAuditEvent } from "../../lib/api/client";
import { activitiesMockEnabled } from "../../lib/api/activities-mode";
import {
  listActivityAuditEvents,
  commandActivity,
  getActivity,
  getPublicActivity,
  listPublicResults,
  listReviewQueue,
  type Activity,
  type ReviewItem,
} from "../../lib/api/activities";
import {
  commands,
  dateLabel,
  errorMessage,
  isConflict,
  shortId,
  uniqueItems,
  initials,
  displayedActivityStatus,
  registrationClosedMessage,
} from "./activity-utils";
import {
  Busy,
  Empty,
  Notice,
  PageHead,
  Status,
  useIntentKey,
} from "./activity-ui";
import { AdminSourcePhoto, SourcePhoto } from "./activity-photo";
import DialogShell from "../instagram/dialog-shell";
import s from "./activities.module.css";
import d from "./activity-detail.module.css";
import { useI18n } from "../../lib/i18n/provider";


type PublicResults = Awaited<ReturnType<typeof listPublicResults>>["items"];
export default function ActivityDetail({
  activity: a,
  onBack,
  onChanged,
  onNavigate,
  onReview,
  admin = false,
}: {
  activity: Activity;
  onBack: () => void;
  onChanged: (a: Activity) => void;
  onNavigate: (screen: string) => void;
  onReview: (id: string) => void;
  admin?: boolean;
}) {
  const { t, intlLocale } = useI18n();
  const [tab, setTab] = useState("summary"),
    [name, setName] = useState("Koordinator SAP"),
    [command, setCommand] = useState<(typeof commands)[number] | null>(null);
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState("");
  const [history, setHistory] = useState<SapAuditEvent[]>([]),
    [historyCursor, setHistoryCursor] = useState<string | null>(null),
    [review, setReview] = useState<ReviewItem[]>([]),
    [results, setResults] = useState<PublicResults>([]),
    [resultCursor, setResultCursor] = useState<string | null>(null),
    [tabError, setTabError] = useState(""),
    [tabBusy, setTabBusy] = useState(false);
  const intentKey = useIntentKey();
  useEffect(() => {
    const c = new AbortController();
    setName(admin ? a.coordinatorDisplayName || "Koordinator SAP" : "Koordinator SAP");
    if (!admin && a.status !== "draft")
      void getPublicActivity(a.id, c.signal)
        .then((p) => {
          if (!c.signal.aborted && p.kind === "activity")
            setName(p.coordinatorDisplayName);
        })
        .catch(() => {});
    return () => c.abort();
  }, [admin, a.coordinatorDisplayName, a.id, a.status, a.revision]);
  useEffect(() => {
    if (tab === "summary") return;
    const c = new AbortController();
    setTabBusy(true);
    setTabError("");
    const task =
      tab === "history"
        ? listActivityAuditEvents(undefined, c.signal).then((p) => {
            if (!c.signal.aborted) {
              setHistory(p.items);
              setHistoryCursor(p.nextCursor);
            }
          })
        : Promise.allSettled([
            listPublicResults(a.id, undefined, c.signal),
            listReviewQueue(undefined, c.signal),
          ]).then((out) => {
            if (c.signal.aborted) return;
            const [pub, queue] = out;
            if (pub.status === "fulfilled") {
              setResults(pub.value.items);
              setResultCursor(pub.value.nextCursor);
            }
            if (queue.status === "fulfilled")
              setReview(
                queue.value.items.filter((q) => q.reportId === a.reportId),
              );
            const failed = out.filter((x) => x.status === "rejected");
            if (failed.length)
              setTabError(
                failed
                  .map((x) => errorMessage((x as PromiseRejectedResult).reason))
                  .join(" "),
              );
          });
    void task
      .catch((e) => {
        if (!c.signal.aborted) setTabError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setTabBusy(false);
      });
    return () => c.abort();
  }, [tab, a.id, a.reportId]);
  async function runCommand() {
    if (!command) return;
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      const body = {
        id: a.id,
        revision: a.revision,
        action: command.action,
        reason: command.reason ? reason.trim() : null,
      };
      const updated = await commandActivity(
        a,
        command.action,
        body.reason,
        intentKey(body),
      );
      onChanged(updated);
      setMessage("Status kegiatan berhasil diperbarui.");
      setCommand(null);
    } catch (e) {
      setError(errorMessage(e));
      setConflict(isConflict(e));
    } finally {
      setBusy(false);
    }
  }
  async function reloadConflict() {
    setBusy(true);
    try {
      onChanged(await getActivity(a.id));
      setConflict(false);
      setError(
        "Versi terbaru dimuat. Periksa status dan alasan sebelum mengonfirmasi kembali.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function moreHistory() {
    if (!historyCursor) return;
    setTabBusy(true);
    try {
      const p = await listActivityAuditEvents(historyCursor);
      setHistory((old) => uniqueItems(old, p.items));
      setHistoryCursor(p.nextCursor);
    } catch (e) {
      setTabError(errorMessage(e));
    } finally {
      setTabBusy(false);
    }
  }
  async function moreResults() {
    if (!resultCursor) return;
    setTabBusy(true);
    try {
      const p = await listPublicResults(a.id, resultCursor);
      setResults((old) => uniqueItems(old, p.items));
      setResultCursor(p.nextCursor);
    } catch (e) {
      setTabError(errorMessage(e));
    } finally {
      setTabBusy(false);
    }
  }
  const primaryCommand = commands.find(
    (c) => !c.reason && a.actions[c.permission].allowed,
  );
  return (
    <div className={d.page}>
      <div className={d.header}>
        <PageHead
          title={t("Detail kegiatan")}
          subtitle={t("Laporan sumber #{0} · diperbarui {1}", { "0": shortId(a.reportId), "1": dateLabel(a.updatedAt, true, intlLocale) })}
          onBack={onBack}
          kicker={admin ? undefined : "KEGIATAN RELAWAN"}
          action={
            <>
              <button
                className={s.secondary}
                onClick={() => onNavigate("members")}
              >
                <UsersRound size={18} /> {" "}{t("Kelola peserta")}</button>
              <button
                className={s.primary}
                disabled={!a.actions.edit.allowed}
                title={
                  a.actions.edit.allowed
                    ? undefined
                    : t("Perubahan tidak tersedia pada status kegiatan ini.")
                }
                onClick={() => onNavigate("edit")}
              >
                <Pencil size={18} /> {" "}{t("Edit kegiatan")}</button>
            </>
          }
        />
      </div>
      {message && <Notice>{t(message)}</Notice>}
      {activitiesMockEnabled && a.coordinatorId && !a.coordinatorAcceptedAt && (
        <Notice>
          <div className={s.mockConsent}>
            <span>
              {t("Koordinator belum menerima penugasan. Untuk mencoba alur publikasi, simulasikan persetujuannya di mode mock.")}</span>
            <button
              type="button"
              className={s.secondary}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  onChanged(
                    (
                      await import("../../lib/api/activities-mock")
                    ).acceptMockCoordinator(a.id),
                  );
                  setMessage(
                    "Persetujuan koordinator disimulasikan pada data contoh.",
                  );
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Simulasikan persetujuan")}</button>
          </div>
        </Notice>
      )}
      <div className={`${s.detailLayout} ${d.layout}`}>
        <div className={d.main}>
          <section className={`${s.card} ${d.overview}`}>
            <div className={d.hero}>
              <div className={`${s.sourceFrame} ${d.heroPhoto}`}>
                {admin ? (
                  <AdminSourcePhoto reportId={a.reportId} large />
                ) : (
                  <SourcePhoto activityId={a.id} allowed={false} large />
                )}
                <span>{t("Foto laporan sumber")}</span>
              </div>
              <div className={`${s.titleRow} ${d.heroCopy}`}>
                <div>
                  <Status status={displayedActivityStatus(a)} />
                  <h1 className={s.activityTitle}>{a.title}</h1>
                  <p className={s.preserve}>{a.description}</p>
                  <span className={s.meta}>
                    <CalendarDays size={17} /> {t(dateLabel(a.startsAt, true, intlLocale))}{" "}
                    <Clock3 size={17} />{" "}
                    {a.endsAt
                      ? t("Selesai {0}", { "0": dateLabel(a.endsAt, true, intlLocale) })
                      : t("Waktu selesai belum ditentukan")}
                  </span>
                </div>
              </div>
            </div>
            <div className={`${s.detailMetrics} ${d.metrics}`}>
              <div>
                <span className={s.largeInitials}>{initials(name)}</span>
                <small>{t("Koordinator")}</small>
                <strong>{a.coordinatorId ? name : t("Belum ditugaskan")}</strong>
                <small>
                  {a.coordinatorAcceptedAt
                    ? t("● Penugasan diterima")
                    : t("Belum menerima penugasan")}
                </small>
              </div>
              <div>
                <UsersRound />
                <small>{t("Peserta diterima")}</small>
                <strong>
                  {a.acceptedCount} / {a.capacity ?? "—"}
                </strong>
              </div>
              <div>
                <UsersRound />
                <strong>{a.availableSeats}</strong>
                <small>{t("Tempat tersedia")}</small>
              </div>
            </div>
            <nav
              className={`${s.tabs} ${d.tabs}`}
              aria-label={t("Informasi kegiatan")}
            >
              <button
                className={tab === "summary" ? s.activeTab : ""}
                aria-current={tab === "summary" ? "page" : undefined}
                onClick={() => setTab("summary")}
              >
                {t("Ringkasan")}</button>
              <button onClick={() => onNavigate("members")}>{t("Peserta")}</button>
              {[
                { id: "results", label: t("Hasil kegiatan") },
                { id: "history", label: t("Riwayat") },
              ].map((t) => (
                <button
                  key={t.id}
                  className={tab === t.id ? s.activeTab : ""}
                  aria-current={tab === t.id ? "page" : undefined}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </section>
          {tab === "summary" ? (
            <section className={`${s.card} ${d.summaryPanel}`}>
              <section className={d.infoSection}>
                <h3>
                  <ClipboardCheck size={20} /> {" "}{t("Informasi laporan")}</h3>
                <div className={d.report}>
                  <span className={d.reportIcon}>
                    <FileText size={25} />
                  </span>
                  <div>
                    <small>{t("Laporan sumber kegiatan")}</small>
                    <strong>{t("Laporan #")}{shortId(a.reportId)}</strong>
                  </div>
                </div>
              </section>
              <section className={d.infoSection}>
                <h3>
                  <MapPin size={19} /> {" "}{t("Titik kumpul")}</h3>
                <p>
                  {a.meetingPoint?.instructions ||
                    t("Titik kumpul belum ditentukan.")}
                </p>
                {a.meetingPoint?.latitude != null &&
                  a.meetingPoint.longitude != null && (
                    <div className={d.locationMeta}>
                      <small>
                        {t("Koordinat:")}{" "}{a.meetingPoint.latitude.toFixed(5)},{" "}
                        {a.meetingPoint.longitude.toFixed(5)}
                      </small>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${a.meetingPoint.latitude}&mlon=${a.meetingPoint.longitude}#map=17/${a.meetingPoint.latitude}/${a.meetingPoint.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin size={16} /> {" "}{t("Lihat peta")}{" "}
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  )}
              </section>
              <section className={d.infoSection}>
                <h3>
                  <Package size={19} /> {" "}{t("Perlengkapan")}</h3>
                {a.equipment.length ? (
                  <div className={s.chips}>
                    {a.equipment.map((item, i) => (
                      <span key={i}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <p>{t("Ikuti arahan koordinator untuk perlengkapan kegiatan.")}</p>
                )}
              </section>
              <section className={d.infoSection}>
                <h3>
                  <Accessibility size={19} /> {" "}{t("Catatan aksesibilitas")}</h3>
                <p className={s.preserve}>
                  {a.accessibilityNotes ||
                    t("Informasi aksesibilitas belum ditambahkan.")}
                </p>
              </section>
              <section className={d.infoSection}>
                <h3>
                  <Truck size={19} /> {" "}{t("Rencana serah terima sampah")}</h3>
                <p className={s.preserve}>
                  {a.wasteHandoverPlan || t("Rencana belum ditambahkan.")}
                </p>
              </section>
            </section>
          ) : (
            <section
              className={`${s.card} ${s.summarySections} ${d.contentPanel}`}
            >
              {tabError && <Notice error>{tabError}</Notice>}
              {tabBusy && <Busy />}
              {tab === "history" ? (
                <>
                  <h3>{t("Riwayat kegiatan yang dimuat")}</h3>
                  {history.filter((e) => e.targetId === a.id).length
                    ? history
                        .filter((e) => e.targetId === a.id)
                        .map((e) => (
                          <div className={s.timeline} key={e.id}>
                            <span />
                            <div>
                              <strong>{t(auditLabel(e.action))}</strong>
                              <p>{`${e.actorDisplayName} · ${t(dateLabel(e.createdAt, true, intlLocale))}`}</p>
                            </div>
                          </div>
                        ))
                    : !tabBusy && (
                        <Empty title={t("Belum ada riwayat pada halaman yang dimuat")}>
                          {t("Muat halaman audit berikutnya untuk mencari catatan kegiatan yang lebih lama.")}</Empty>
                      )}
                  {historyCursor && (
                    <button
                      className={s.secondary}
                      disabled={tabBusy}
                      onClick={() => void moreHistory()}
                    >
                      {t("Muat audit berikutnya")}</button>
                  )}
                </>
              ) : (
                <>
                  <h3>{t("Hasil publik yang disetujui")}</h3>
                  {results.map((r) => (
                    <article className={s.resultSummary} key={r.id}>
                      <span className={`${s.badge} ${s.green}`}>
                        {r.outcome === "complete"
                          ? t("Pembersihan selesai")
                          : t("Pembersihan sebagian")}
                      </span>
                      <p>{r.summary}</p>
                      <small>{t(dateLabel(r.observedAt, true, intlLocale))}</small>
                      {r.verifiedMeasurement && (
                        <strong>
                          {r.verifiedMeasurement.valueKg} {" "}{t("kg terverifikasi")}</strong>
                      )}
                    </article>
                  ))}
                  {!results.length && !tabBusy && (
                    <p>
                      {t("Belum ada hasil publik yang disetujui pada halaman ini.")}</p>
                  )}
                  {resultCursor && (
                    <button
                      className={s.secondary}
                      onClick={() => void moreResults()}
                      disabled={tabBusy}
                    >
                      {t("Muat hasil publik berikutnya")}</button>
                  )}
                  <h3>{t("Antrean hasil laporan sumber yang dimuat")}</h3>
                  {review.map((q) => (
                    <button
                      key={q.subjectId}
                      className={s.queueLink}
                      onClick={() => onReview(q.subjectId)}
                    >
                      <ClipboardCheck size={21} />
                      <span>
                        {q.title}
                        <small>{t(dateLabel(q.submittedAt, true, intlLocale))}</small>
                      </span>
                      <span>
                        {q.reviewState === "needs_evidence"
                          ? t("Perlu bukti")
                          : t("Tinjau hasil")}
                      </span>
                    </button>
                  ))}
                  {!review.length && !tabBusy && (
                    <p>
                      {t("Tidak ada hasil laporan sumber dalam antrean yang dimuat.")}</p>
                  )}
                </>
              )}
            </section>
          )}
        </div>
        <aside className={`${s.sideStack} ${d.sidebar}`}>
          <section className={`${s.card} ${d.statusCard}`}>
            <h2>
              <Leaf size={22} /> {" "}{t("Status kegiatan")}</h2>
            <Status status={displayedActivityStatus(a)} />
            {registrationClosedMessage(a, intlLocale) && <p role="status">{t(registrationClosedMessage(a, intlLocale)!)}</p>}
            <dl className={s.facts}>
              <div>
                <dt>{t("Pendaftaran ditutup")}</dt>
                <dd>{t(dateLabel(a.registrationClosesAt, true, intlLocale))}</dd>
              </div>
              <div>
                <dt>{t("Kegiatan berakhir")}</dt>
                <dd>{t(dateLabel(a.endsAt, true, intlLocale))}</dd>
              </div>
              <div>
                <dt>{t("Tempat tersedia")}</dt>
                <dd>
                  {a.capacity == null
                    ? t("Kuota belum ditentukan")
                    : t("{0} tempat", { "0": a.availableSeats })}
                </dd>
              </div>
              <div>
                <dt>{t("Zona waktu")}</dt>
                <dd>{t("Waktu Indonesia Barat")}</dd>
              </div>
            </dl>
            {primaryCommand && (
              <button
                className={s.primary}
                disabled={busy}
                onClick={() => {
                  setReason("");
                  setError("");
                  setConflict(false);
                  setCommand(primaryCommand);
                }}
              >
                {t(primaryCommand.label)}
              </button>
            )}
            <details className={d.commands}>
              <summary>{t("Tindakan lainnya")}</summary>
              <div className={s.commandList}>
                {commands
                  .filter(
                    (c) =>
                      c !== primaryCommand &&
                      (c.action !== "cancel" || a.status !== "cancelled"),
                  )
                  .map((c) => (
                    <button
                      key={c.action}
                      className={
                        c.danger
                          ? s.danger
                          : c.action === "publish"
                            ? s.primary
                            : s.secondary
                      }
                      disabled={!a.actions[c.permission].allowed}
                      onClick={() => {
                        setReason("");
                        setError("");
                        setConflict(false);
                        setCommand(c);
                      }}
                      title={
                        !a.actions[c.permission].allowed
                          ? t("Syarat atau status kegiatan belum memungkinkan tindakan ini.")
                          : undefined
                      }
                    >
                      {t(c.label)}
                    </button>
                  ))}
              </div>
              {a.holdReason && (
                <Notice>{t("Alasan penundaan:")}{" "}{a.holdReason}</Notice>
              )}
            </details>
          </section>
          <section className={`${s.card} ${d.participants}`}>
            <h2>
              <UsersRound size={22} /> {" "}{t("Ringkasan peserta")}</h2>
            <div className={s.capacity}>
              <div>
                <strong>
                  {a.acceptedCount} / {a.capacity ?? "—"}
                </strong>
                <small>{t("Peserta diterima")}</small>
              </div>
              <progress
                max={a.capacity || 1}
                value={a.acceptedCount}
                aria-label={t("Kuota peserta")}
              />
            </div>
            <div className={s.infoLine}>
              <UsersRound size={23} />
              <span>
                <strong>{a.availableSeats}</strong>
                <small>{t("Tempat tersedia")}</small>
              </span>
            </div>
            <button className={s.primary} onClick={() => onNavigate("members")}>
              {t("Kelola peserta")}</button>
          </section>
          <section className={`${s.card} ${d.coordinator}`}>
            <h2>{t("Penanggung jawab kegiatan")}</h2>
            <div className={s.coordinatorChoice}>
              <span className={s.largeInitials}>{initials(name)}</span>
              <span>
                <strong>{a.coordinatorId ? name : t("Belum ditugaskan")}</strong>
                <small>{t("Koordinator kegiatan")}</small>
                <small>
                  {a.coordinatorAcceptedAt
                    ? t("● Penugasan diterima")
                    : t("Menunggu penerimaan penugasan")}
                </small>
              </span>
            </div>
          </section>
          {["in_progress", "awaiting_result"].includes(a.status) && (
            <section className={`${s.card} ${s.softCard}`}>
              <ClipboardCheck size={28} />
              <h2>{t("Laporkan hasil aksi")}</h2>
              <p>
                {t("Tambahkan bukti sebelum dan sesudah serta catatan hasil kegiatan.")}</p>
              <button
                className={s.primary}
                onClick={() => onNavigate("result-new")}
              >
                {t("Kirim hasil kegiatan")}</button>
            </section>
          )}
        </aside>
      </div>
      {command && (
        <DialogShell
          title={t(command.label)}
          subtitle={a.title}
          onClose={() => setCommand(null)}
          busy={busy}
          footer={
            <div className={s.actions}>
              <button
                className={s.secondary}
                disabled={busy}
                onClick={() => setCommand(null)}
              >
                {t("Kembali")}</button>
              <button
                className={command.danger ? s.danger : s.primary}
                disabled={
                  busy ||
                  conflict ||
                  !a.actions[command.permission].allowed ||
                  (command.reason && reason.trim().length < 5)
                }
                onClick={() => void runCommand()}
              >
                {busy ? t("Menyimpan…") : t("Konfirmasi")}
              </button>
            </div>
          }
        >
          <p>{t("Status akan diperbarui setelah tindakan diterima oleh SAP.")}</p>
          {command.reason && (
            <label className={s.field}>
              {t("Alasan tindakan")}<textarea
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("Jelaskan alasan tindakan (minimal 5 karakter).")}
                rows={4}
                required
              />
              <small>{reason.length}{t("/1000 karakter")}</small>
            </label>
          )}
          {error && <Notice error>{t(error)}</Notice>}
          {conflict && (
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => void reloadConflict()}
            >
              {t("Muat versi terbaru")}</button>
          )}
        </DialogShell>
      )}
    </div>
  );
}
function auditLabel(action: string) {
  const known: Record<string, string> = {
    activity_created: "Kegiatan dibuat",
    activity_edited: "Kegiatan diperbarui",
    activity_updated: "Kegiatan diperbarui",
    activity_publish: "Pendaftaran kegiatan dibuka",
    activity_published: "Pendaftaran dibuka",
    activity_close_registration: "Pendaftaran kegiatan ditutup",
    activity_cancelled: "Kegiatan dibatalkan",
    activity_cancel: "Kegiatan dibatalkan",
    activity_started: "Kegiatan dimulai",
    activity_start: "Kegiatan dimulai",
    activity_held: "Kegiatan ditunda",
    activity_hold: "Kegiatan ditunda",
    activity_resumed: "Kegiatan dilanjutkan",
    activity_resume: "Kegiatan dilanjutkan",
    coordinator_acceptance: "Penugasan koordinator diperbarui",
    membership_changed: "Pendaftaran peserta diperbarui",
    membership_decided: "Keputusan peserta diperbarui",
    attendance_changed: "Kehadiran peserta diperbarui",
    schedule_acknowledged: "Perubahan jadwal dikonfirmasi",
  };
  return known[action] || "Perubahan kegiatan tercatat";
}
