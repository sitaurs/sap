import Image from "next/image";
import { CheckCircle2, ChevronRight, CircleAlert, Info, ShieldCheck } from "lucide-react";
import type { ImpactSummary } from "../../lib/api/impact";
import { impactAssets as art } from "./impact-assets";
import { numberLabel, updatedLabel, weightLabel } from "./impact-utils";
import s from "./impact.module.css";

function Asset({ src, size = 52, className = "" }: { src: string; size?: number; className?: string }) {
  return <Image src={src} width={size} height={size} alt="" aria-hidden="true" className={`${s.asset} ${className}`} />;
}

export default function ImpactSummaryCards({ data, onMethod }: { data: ImpactSummary; onMethod: () => void }) {
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
    <section className={s.metrics} aria-label="Ringkasan dampak">
      {metrics.map(metric => <article key={metric.label} className={`${s.card} ${s.metric}`}>
        <Asset src={metric.icon} size={64} />
        <div><strong className={s.metricValue}>{numberLabel(metric.value)}</strong><h2>{metric.label}</h2><p>{metric.note}</p></div>
      </article>)}
    </section>

    <div className={s.evidenceGrid}>
      <section className={`${s.card} ${s.weightCard}`} aria-labelledby="impact-weight-title">
        <div className={s.cardHeading}><Asset src={art.verification} size={48} /><div><h2 id="impact-weight-title">Berat sampah terverifikasi</h2><p>Pengukuran yang telah ditinjau dan disetujui.</p></div></div>
        <div className={s.stages}>
          {stages.map(stage => <div className={s.stage} key={stage.label}>
            <Asset src={stage.icon} size={50} />
            <h3>{stage.label}</h3>
            <div className={s.stageWeight}>
              <strong>{stage.value === null ? "Belum ada data" : weightLabel(stage.value)}</strong>
              {stage.value === null
                ? <p className={s.noMeasurement}>Belum ada pengukuran terverifikasi.</p>
                : <div className={s.barTrack} aria-hidden="true"><span className={stage.tone} style={{ width: `${stage.value / max * 100}%` }} /></div>}
            </div>
          </div>)}
        </div>
        <p className={s.infoStrip}><Info size={18} aria-hidden="true" />Setiap tahap dicatat terpisah dan tidak dijumlahkan.</p>
      </section>

      <section className={`${s.card} ${s.coverageCard}`} aria-labelledby="impact-coverage-title">
        <h2 id="impact-coverage-title">Cakupan bukti</h2>
        <div className={s.ring} role="img" aria-label={percentage === null ? "Belum ada hasil disetujui untuk menghitung cakupan" : `${percentage}%: ${covered} dari ${total} hasil memiliki berat terkumpul terverifikasi`}>
          <svg viewBox="0 0 156 156" aria-hidden="true"><circle cx="78" cy="78" r="66" className={s.ringTrack} /><circle cx="78" cy="78" r="66" className={s.ringValue} strokeDasharray={dash} strokeDashoffset={dash * (1 - (percentage ?? 0) / 100)} /></svg>
          <span><strong>{percentage === null ? "—" : `${percentage}%`}</strong><ShieldCheck size={24} fill="#087c62" color="white" strokeWidth={1.6} aria-hidden="true" /></span>
        </div>
        <strong className={s.coverageValue}>{total ? `${numberLabel(covered)} dari ${numberLabel(total)} hasil` : "Belum ada hasil"}</strong>
        <p className={s.coverageDescription}>{total ? "Memiliki berat terkumpul terverifikasi." : "Cakupan dihitung setelah hasil kegiatan disetujui."}</p>
        {total > 0 && <p className={missing ? s.warning : s.success}><span>{missing ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}</span>{missing ? `${numberLabel(missing)} hasil belum memiliki berat terverifikasi.` : "Semua hasil memiliki berat terkumpul terverifikasi."}</p>}
        <p className={s.coverageNote}><Info size={18} aria-hidden="true" />Berat yang belum diketahui berbeda dari 0 kg.</p>
      </section>
    </div>

    <div className={s.bottomGrid}>
      <section className={`${s.card} ${s.responseCard}`} aria-labelledby="impact-response-title">
        <h2 id="impact-response-title">Respons penanganan</h2>
        <div className={s.responseContent}><Asset src={art.clock} size={60} /><div><strong>{data.medianResolutionHours === null ? "Belum ada data" : `${numberLabel(data.medianResolutionHours)} jam`}</strong><h3>Median waktu penyelesaian</h3><p>Dari laporan masuk hingga keputusan selesai yang disetujui.</p></div></div>
        <Image src={art.seedling} width={146} height={120} alt="" aria-hidden="true" className={s.seedling} />
      </section>
      <section className={`${s.card} ${s.methodCard}`} aria-labelledby="impact-method-title">
        <Asset src={art.methodology} size={48} />
        <div className={s.methodCopy}><h2 id="impact-method-title">Dasar perhitungan</h2><ul>
          <li><CheckCircle2 size={17} aria-hidden="true" />Sumber publik yang disetujui</li>
          <li><CheckCircle2 size={17} aria-hidden="true" />Periode dan cakupan mengikuti filter</li>
          <li><CheckCircle2 size={17} aria-hidden="true" />Tanpa estimasi berat dari foto</li>
        </ul><p className={s.updated}>Diperbarui {updatedLabel(data.asOf)}</p></div>
        <button className={s.methodLink} type="button" onClick={onMethod}>Lihat metode <ChevronRight size={17} aria-hidden="true" /></button>
      </section>
    </div>
  </>;
}
