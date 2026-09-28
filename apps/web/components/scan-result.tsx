"use client";

import Image from "next/image";
import { ArrowRight, Check, CircleHelp, Clock3, FilePlus2, FileText, History, ImagePlus, Info, Leaf, Recycle } from "lucide-react";
import type { ScanResponse } from "./scan-client";
import type { SapCategory } from "../lib/api/client";
import styles from "./scan-result.module.css";

const labels: Record<string, string> = {
  battery: "Baterai", biological: "Organik", cardboard: "Kardus", clothes: "Pakaian",
  glass: "Kaca", metal: "Logam", paper: "Kertas", shoes: "Sepatu",
  plastic: "Plastik", trash: "Residu",
};

type Props = {
  preview: string;
  fileName: string;
  scan: ScanResponse;
  categories: SapCategory[];
  onRefresh: () => void;
  onChangePhoto: () => void;
  onOpenReport: () => void;
  onOpenHistory: () => void;
};

export default function ScanResult({ preview, fileName, scan, categories, onRefresh, onChangePhoto, onOpenReport, onOpenHistory }: Props) {
  const waiting = scan?.status === "queued" || scan?.status === "processing";
  const classified = scan?.status === "succeeded" && scan.outcome === "classified" && !!scan.categoryId;
  const name = (id: string) => categories.find(item => item.id === id)?.name || labels[id] || id;
  const category = classified ? name(scan.categoryId!) : null;
  const alternatives = classified ? scan.predictions.filter(item => item.categoryId !== scan.categoryId).slice(0, 2) : [];
  const stateTitle = waiting ? "Pemindaian diproses" : scan.status === "failed" ? "Pemindaian belum berhasil" : "Pemindaian selesai";
  const stateDescription = waiting ? "AI sedang memeriksa foto Anda. Hasil akan muncul setelah proses selesai." : scan.status === "failed" ? "Layanan belum dapat memproses foto ini. Coba foto lain." : "Foto berhasil diproses oleh AI.";

  return <div className={styles.screen}>
    <div className={styles.heading}><span className={styles.eyebrow}><i /> SCAN SAMPAH</span><h1>Hasil scan</h1><p>Periksa hasil pengenalan dari foto Anda.</p></div>
    <div className={styles.grid}>
      <section className={styles.card} aria-labelledby="scan-photo-title">
        <div className={styles.cardHeading}><span className={styles.doneIcon}><Check size={21} strokeWidth={3} /></span><div><h2 id="scan-photo-title">{stateTitle}</h2><p>{stateDescription}</p></div></div>
        <div className={styles.photo}><Image src={preview} alt={`Foto yang dipilih: ${fileName}`} fill unoptimized sizes="(max-width: 1050px) 100vw, 42vw" /></div>
        <button className={styles.changeButton} type="button" onClick={onChangePhoto}><ImagePlus size={22} />Ganti foto</button>
      </section>

      <section className={styles.card} aria-labelledby="scan-material-title">
        <div className={styles.cardHeading}><span className={styles.documentIcon}><FileText size={22} /></span><div><h2 id="scan-material-title">Jenis material teridentifikasi</h2><p>Berdasarkan analisis gambar menggunakan AI.</p></div></div>

        {category ? <div className={styles.material}><span className={styles.materialIcon}><Recycle size={28} /></span><strong>{category}</strong><span className={styles.materialTag}>{category}</span></div>
          : <div className={styles.materialEmpty}><span className={styles.materialIcon}>{waiting ? <Clock3 size={28} /> : <CircleHelp size={28} />}</span><div><strong>{waiting ? "Sedang mengenali material" : scan?.outcome === "no_waste" ? "Tidak ada sampah terdeteksi" : scan?.status === "failed" ? "Hasil belum tersedia" : "Material belum dikenali"}</strong><small>{waiting ? "Silakan tunggu sebentar." : scan?.outcome === "no_waste" ? "Coba foto lain jika ada sampah pada lokasi ini." : "Anda tetap dapat membuat laporan lokasi."}</small></div></div>}

        <div className={styles.candidates}><span>{alternatives.length ? "Kandidat lain" : "Langkah berikutnya"}</span>{alternatives.length ? <div className={styles.candidateList}>{alternatives.map(item => <span key={item.categoryId}><Recycle size={17} />{name(item.categoryId)}</span>)}</div> : <p>Anda dapat mengganti foto atau melaporkan lokasi temuan.</p>}</div>

        <div className={styles.info}><Info size={21} /><p>Hasil AI membantu mengenali material; laporan lokasi tetap perlu ditinjau.</p></div>
        {waiting && <button className={styles.secondary} type="button" onClick={onRefresh}>Periksa hasil terbaru</button>}
        <div className={styles.actions}><button className={styles.primary} type="button" onClick={onOpenReport}><FilePlus2 size={21} />Buat laporan lokasi <ArrowRight size={18} /></button><button className={styles.secondary} type="button" onClick={onOpenHistory}><History size={21} />Lihat riwayat</button></div>
        <p className={styles.footer}><Leaf size={18} />Anda juga dapat membuat laporan lokasi tanpa pemindaian.</p>
      </section>
    </div>
  </div>;
}
