"use client";

import Image from "next/image";
import { CheckCircle2, ChevronRight, CircleAlert, Info, ShieldCheck } from "lucide-react";
import type { ImpactSummary } from "../../lib/api/impact";
import { impactAssets as art } from "./impact-assets";
import { numberLabel, updatedLabel, weightLabel } from "./impact-utils";
import s from "./impact.module.css";
import { useI18n } from "../../lib/i18n/provider";


function Asset({ src, size = 52, className = "" }: { src: string; size?: number; className?: string }) {
  return <Image src={src} width={size} height={size} alt="" aria-hidden="true" className={`${s.asset} ${className}`} />;
}

export default function ImpactSummaryCards({ data, onMethod }: { data: ImpactSummary; onMethod: () => void }) {
  const { t, intlLocale } = useI18n();
  const metrics = [
    { label: "Laporan terselesaikan", note: "Keputusan penyelesaian disetujui", value: data.resolvedIncidents, icon: art.reports },
    { label: "Kegiatan disetujui", note: "Hasil kegiatan dalam periode ini", value: data.approvedActivities, icon: art.activities },
    { label: "Relawan unik", note: "Dihitung satu kali per pengguna", value: data.uniqueVolunteers, icon: art.volunteers },
    { label: "Total kehadiran", note: "Kehadiran pada kegiatan disetujui", value: data.volunteerAttendances, icon: art.attendance },
  ];
  const stages = [
    { label: "Terkumpul", value: data.verifiedKg.collected, icon: art.collected, tone: s.collected },
    { label: "Diserahkan", value: data.verifiedKg.handedOver, icon: art.handedOver, tone: s.handedOver },
    { label: "Didaur ulang", value: data.verifiedKg.recycled, icon: art.recycled, tone: s.recycled },
  ];
  const max = Math.max(1, ...stages.map(stage => stage.value ?? 0));
  const { approvedResults: total, resultsWithVerifiedWeight: covered } = data.measurementCoverage;
  const percentage = total > 0 ? Math.round(covered / total * 100) : null;
  const missing = Math.max(0, total - covered);
  const dash = 2 * Math.PI * 66;

  return <>
    <section className={s.metrics} aria-label={t("Ringkasan dampak")}>
      {metrics.map(metric => <article key={metric.label} className={`${s.card} ${s.metric}`}>
        <Asset src={metric.icon} size={64} />
        <div><strong className={s.metricValue}>{t(numberLabel(metric.value, intlLocale))}</strong><h2>{t(metric.label)}</h2><p>{t(metric.note)}</p></div>
      </article>)}
    </section>

    <div className={s.evidenceGrid}>
      <section className={`${s.card} ${s.weightCard}`} aria-labelledby="impact-weight-title">
        <div className={s.cardHeading}><Asset src={art.verification} size={48} /><div><h2 id="impact-weight-title">{t("Berat sampah terverifikasi")}</h2><p>{t("Pengukuran yang telah ditinjau dan disetujui.")}</p></div></div>
        <div className={s.stages}>
          {stages.map(stage => <div className={s.stage} key={stage.label}>
            <Asset src={stage.icon} size={50} />
            <h3>{t(stage.label)}</h3>
            <div className={s.stageWeight}>
              <strong>{stage.value === null ? t("Belum ada data") : weightLabel(stage.value, intlLocale)}</strong>
              {stage.value === null
                ? <p className={s.noMeasurement}>{t("Belum ada pengukuran terverifikasi.")}</p>
                : <div className={s.barTrack} aria-hidden="true"><span className={stage.tone} style={{ width: `${stage.value / max * 100}%` }} /></div>}
            </div>
          </div>)}
        </div>
        <p className={s.infoStrip}><Info size={18} aria-hidden="true" />{t("Setiap tahap dicatat terpisah dan tidak dijumlahkan.")}</p>
      </section>

      <section className={`${s.card} ${s.coverageCard}`} aria-labelledby="impact-coverage-title">
        <h2 id="impact-coverage-title">{t("Cakupan bukti")}</h2>
        <div className={s.ring} role="img" aria-label={percentage === null ? t("Belum ada hasil disetujui untuk menghitung cakupan") : t("{0}%: {1} dari {2} hasil memiliki berat terkumpul terverifikasi", { "0": percentage, "1": covered, "2": total })}>
          <svg viewBox="0 0 156 156" aria-hidden="true"><circle cx="78" cy="78" r="66" className={s.ringTrack} /><circle cx="78" cy="78" r="66" className={s.ringValue} strokeDasharray={dash} strokeDashoffset={dash * (1 - (percentage ?? 0) / 100)} /></svg>
          <span><strong>{percentage === null ? "—" : `${percentage}%`}</strong><ShieldCheck size={24} fill="#087c62" color="white" strokeWidth={1.6} aria-hidden="true" /></span>
        </div>
        <strong className={s.coverageValue}>{total ? t("{0} dari {1} hasil", { "0": numberLabel(covered, intlLocale), "1": numberLabel(total, intlLocale) }) : t("Belum ada hasil")}</strong>
        <p className={s.coverageDescription}>{total ? t("Memiliki berat terkumpul terverifikasi.") : t("Cakupan dihitung setelah hasil kegiatan disetujui.")}</p>
        {total > 0 && <p className={missing ? s.warning : s.success}><span>{missing ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}</span>{missing ? t("{0} hasil belum memiliki berat terverifikasi.", { "0": numberLabel(missing, intlLocale) }) : t("Semua hasil memiliki berat terkumpul terverifikasi.")}</p>}
        <p className={s.coverageNote}><Info size={18} aria-hidden="true" />{t("Berat yang belum diketahui berbeda dari 0 kg.")}</p>
      </section>
    </div>

    <div className={s.bottomGrid}>
      <section className={`${s.card} ${s.responseCard}`} aria-labelledby="impact-response-title">
        <h2 id="impact-response-title">{t("Respons penanganan")}</h2>
        <div className={s.responseContent}><Asset src={art.clock} size={60} /><div><strong>{data.medianResolutionHours === null ? t("Belum ada data") : t("{0} jam", { "0": numberLabel(data.medianResolutionHours, intlLocale) })}</strong><h3>{t("Median waktu penyelesaian")}</h3><p>{t("Dari laporan masuk hingga keputusan selesai yang disetujui.")}</p></div></div>
        <Image src={art.seedling} width={146} height={120} alt="" aria-hidden="true" className={s.seedling} />
      </section>
      <section className={`${s.card} ${s.methodCard}`} aria-labelledby="impact-method-title">
        <Asset src={art.methodology} size={48} />
        <div className={s.methodCopy}><h2 id="impact-method-title">{t("Dasar perhitungan")}</h2><ul>
          <li><CheckCircle2 size={17} aria-hidden="true" />{t("Sumber publik yang disetujui")}</li>
          <li><CheckCircle2 size={17} aria-hidden="true" />{t("Periode dan cakupan mengikuti filter")}</li>
          <li><CheckCircle2 size={17} aria-hidden="true" />{t("Tanpa estimasi berat dari foto")}</li>
        </ul><p className={s.updated}>{t("Diperbarui: {0}", { "0": t(updatedLabel(data.asOf, intlLocale)) })}</p></div>
        <button className={s.methodLink} type="button" onClick={onMethod}>{t("Lihat metode")}{" "}<ChevronRight size={17} aria-hidden="true" /></button>
      </section>
    </div>
  </>;
}
