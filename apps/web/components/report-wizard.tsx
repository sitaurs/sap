"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import {
  ArrowLeft, ArrowRight, CalendarDays, Camera, Check, Clock3,
  Info, LocateFixed, MapPin, Recycle, Send, ShieldCheck, SignalMedium, X,
} from "lucide-react";
import ReportMap, { type ReportPoint } from "./report-map";
import { createReport, getReportCsrf, uploadReportPhoto } from "./report-client";
import type { ReportInput } from "../lib/api/client";
import styles from "./report-wizard.module.css";

type Severity = "small" | "medium" | "large";
type CategoryId = NonNullable<ReportInput["categoryId"]>;
type CategoryOption = { id: CategoryId; label: string };
export type ReportSummary = { id: string; category: string; description: string; point: ReportPoint; occurredAt: string };
type Props = { onClose: () => void; onSubmitted: (summary: ReportSummary) => void; categories?: { id: CategoryId; name: string }[] };

// Fallback labels used only when the /categories list has not loaded; the live
// list from the API is preferred so labels stay in sync with the backend.
const FALLBACK_CATEGORIES: CategoryOption[] = [
  { id: "plastic", label: "Plastik" }, { id: "paper", label: "Kertas" }, { id: "cardboard", label: "Kardus" },
  { id: "metal", label: "Logam" }, { id: "glass", label: "Kaca" }, { id: "biological", label: "Organik" },
  { id: "battery", label: "Baterai" }, { id: "clothes", label: "Pakaian" }, { id: "shoes", label: "Sepatu" }, { id: "trash", label: "Lainnya" },
];
const severities: { id: Severity; label: string; detail: string }[] = [
  { id: "small", label: "Kecil", detail: "Beberapa benda" },
  { id: "medium", label: "Sedang", detail: "Satu tumpukan" },
  { id: "large", label: "Besar", detail: "Area luas" },
];
const examplePhoto = "/images/dashboard/report-example-photo.png";

function localDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16) };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ReportWizard({ onClose, onSubmitted, categories }: Props) {
  const categoryOptions: CategoryOption[] = categories && categories.length
    ? categories.map(item => ({ id: item.id, label: item.name }))
    : FALLBACK_CATEGORIES;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<NonNullable<ReportInput["categoryId"]> | "">("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [point, setPoint] = useState<ReportPoint | null>(null);
  const [pointConfirmed, setPointConfirmed] = useState(false);
  const [date, setDate] = useState(() => localDateTime().date);
  const [time, setTime] = useState(() => localDateTime().time);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [locating, setLocating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mediaIdsRef = useRef<string[]>([]);
  const idempotencyRef = useRef<string | null>(null);

  useEffect(() => {
    const urls = photos.map(file => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [photos]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [step]);

  function invalidateSubmission(photosChanged = false) {
    idempotencyRef.current = null;
    if (photosChanged) mediaIdsRef.current = [];
    setError("");
    setNotice("");
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files || []);
    event.target.value = "";
    if (!incoming.length) return;
    const valid = incoming.filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 10 * 1024 * 1024);
    if (valid.length !== incoming.length) {
      setError("Pilih foto JPG, PNG, atau WebP dengan ukuran maksimal 10 MB per foto.");
      return;
    }
    if (photos.length + valid.length > 3) {
      setError("Maksimal 3 foto untuk satu laporan.");
      return;
    }
    if (valid.length) { setPhotos(current => [...current, ...valid]); invalidateSubmission(true); }
  }

  function goToLocation() {
    if (!photos.length) return setError("Tambahkan setidaknya satu foto bukti untuk melanjutkan.");
    if (description.trim().length < 20 || description.trim().length > 2000) return setError("Keterangan harus berisi 20–2000 karakter.");
    if (!severity) return setError("Pilih tingkat tumpukan berdasarkan kondisi yang Anda lihat.");
    setError("");
    setStep(2);
  }

  function goToReview() {
    if (!point || !pointConfirmed) return setError("Pilih titik pada peta, lalu konfirmasi bahwa pin berada di lokasi temuan.");
    const occurred = new Date(`${date}T${time}`);
    if (!date || !time || Number.isNaN(occurred.getTime())) return setError("Isi tanggal dan jam kejadian yang valid.");
    const age = Date.now() - occurred.getTime();
    if (age < 0 || age > 30 * 86_400_000) return setError("Waktu kejadian tidak boleh di masa depan atau lebih lama dari 30 hari.");
    setError("");
    setStep(3);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return setError("Lokasi perangkat tidak tersedia. Pilih pin secara manual pada peta.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      setPoint({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setPointConfirmed(false);
      setLocating(false);
      setError("");
      invalidateSubmission();
    }, () => {
      setLocating(false);
      setError("Izin lokasi tidak tersedia. Anda tetap dapat memilih pin manual pada peta.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  async function submit() {
    if (busy || !point || !severity) return;
    setBusy(true);
    setError("");
    try {
      setPhase("Memeriksa sesi akun…");
      const csrfToken = await getReportCsrf();
      for (let index = mediaIdsRef.current.length; index < photos.length; index++) {
        setPhase(`Mengunggah foto ${index + 1} dari ${photos.length}…`);
        mediaIdsRef.current.push(await uploadReportPhoto(photos[index], csrfToken));
      }
      if (!idempotencyRef.current) idempotencyRef.current = crypto.randomUUID();
      setPhase("Mengirim laporan untuk diperiksa…");
      const occurredAt = new Date(`${date}T${time}`).toISOString();
      const result = await createReport({
        mediaIds: mediaIdsRef.current,
        description: description.trim(),
        location: point,
        occurredAt,
        reportedSeverity: severity,
        categoryId: categoryId || null,
      }, csrfToken, idempotencyRef.current);
      if (!result.id || result.status !== "submitted") throw new Error("Server belum mengonfirmasi status laporan. Coba buka Laporan saya sebelum mengirim ulang.");
      onSubmitted({
        id: result.id,
        category: categoryOptions.find(item => item.id === categoryId)?.label || "Tanpa kategori",
        description: description.trim(),
        point,
        occurredAt,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Laporan belum terkirim. Coba lagi.");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  const categoryLabel = categoryOptions.find(item => item.id === categoryId)?.label || "Belum dipilih";
  const severityLabel = severities.find(item => item.id === severity)?.label || "Belum dipilih";
  const occurredAt = date && time ? new Date(`${date}T${time}`) : null;

  return <div className={styles.wizard}>
    <div className={styles.headingRow}>
      <div><p className={styles.eyebrow}>LAPORKAN TEMUAN</p><h1 ref={headingRef} tabIndex={-1}>{step === 1 ? "Buat laporan penumpukan" : step === 2 ? "Lokasi & waktu" : "Tinjau laporan"}</h1><p className={styles.subtitle}>{step === 1 ? "Tambahkan foto dan jelaskan temuan." : step === 2 ? "Tentukan titik dan waktu temuan." : "Pastikan informasi sudah benar sebelum dikirim."}</p></div>
      <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Tutup pembuatan laporan"><X size={20} /></button>
    </div>

    <ol className={styles.steps} aria-label="Langkah pembuatan laporan">
      {([1, 2, 3] as const).map((number, index) => <li key={number} className={`${styles.step} ${number === step ? styles.activeStep : ""} ${number < step ? styles.doneStep : ""}`} aria-current={number === step ? "step" : undefined}>
        <span className={styles.stepCircle}>{number < step ? <Check size={23} strokeWidth={3} /> : number}</span>
        <span>{["Bukti foto", "Lokasi & waktu", "Tinjau"][index]}</span>
      </li>)}
    </ol>

    {step === 1 && <>
      <section className={`${styles.card} ${styles.evidenceCard}`} aria-label="Bukti foto dan keterangan">
        <div className={styles.photosColumn}>
          <h2>Bukti foto</h2>
          <div className={styles.photos}>
            {photos.length ? previews.map((url, index) => <div className={styles.photoTile} key={url}>
              <Image src={url} alt={`Foto bukti ${index + 1}`} fill unoptimized sizes="(max-width: 760px) 70vw, 260px" />
              <button type="button" onClick={() => { setPhotos(current => current.filter((_, i) => i !== index)); invalidateSubmission(true); }} aria-label={`Hapus foto ${index + 1}`}><X size={20} /></button>
            </div>) : <div className={styles.photoTile}><Image src={examplePhoto} alt="Contoh foto penumpukan sampah" fill sizes="(max-width: 760px) 70vw, 260px" /><span className={styles.exampleBadge}>Contoh foto</span></div>}
            {photos.length < 3 && <button className={styles.addPhoto} type="button" onClick={() => fileRef.current?.click()}><Camera size={35} strokeWidth={1.8} /><strong>Tambah foto</strong></button>}
          </div>
          <input ref={fileRef} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} aria-label="Pilih hingga tiga foto bukti" />
          <p className={styles.photoCaption}>{photos.length} dari 3 foto <span>· JPG, PNG, atau WebP · maks. 10 MB</span></p>
        </div>
        <div className={styles.detailsColumn}>
          <label className={styles.field}><span>Jenis sampah <small>Opsional</small></span><span className={styles.selectShell}><Recycle size={24} /><select value={categoryId} onChange={event => { setCategoryId(event.target.value as typeof categoryId); invalidateSubmission(); }}><option value="">Pilih jenis sampah</option>{categoryOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></span></label>
          <fieldset className={styles.severityField}><legend>Tingkat tumpukan <span>Wajib</span></legend><div className={styles.severityOptions}>{severities.map(item => <label key={item.id} className={severity === item.id ? styles.selectedSeverity : ""}><input type="radio" name="severity" value={item.id} checked={severity === item.id} onChange={() => { setSeverity(item.id); invalidateSubmission(); }} /><strong>{item.label}</strong><small>{item.detail}</small></label>)}</div></fieldset>
          <label className={styles.field}><span>Keterangan <small>Minimal 20 karakter</small></span><textarea value={description} onChange={event => { setDescription(event.target.value); invalidateSubmission(); }} maxLength={2000} placeholder="Ceritakan kondisi temuan, jenis sampah, dan hal yang perlu diperhatikan…" rows={4} /></label>
          <p className={styles.counter}>{description.trim().length} / 2000 karakter</p>
        </div>
      </section>
      <div className={styles.infoBar}><Info size={22} /><span>Lokasi rinci dan waktu kejadian diisi pada langkah berikutnya.</span></div>
      <div className={styles.actions}><button className={styles.primaryButton} type="button" onClick={goToLocation}>Lanjut ke lokasi <ArrowRight size={22} /></button></div>
    </>}

    {step === 2 && <>
      <section className={`${styles.card} ${styles.locationCard}`} aria-label="Lokasi dan waktu temuan">
        <div className={styles.mapColumn}><div className={styles.sectionHeading}><h2>Titik lokasi</h2><button type="button" onClick={useCurrentLocation} disabled={locating}><LocateFixed size={18} />{locating ? "Mencari…" : "Lokasi saya"}</button></div><div className={styles.mapFrame}><ReportMap point={point} onPick={picked => { setPoint(picked); setPointConfirmed(false); invalidateSubmission(); }} /></div><div className={styles.mapBottom}><span><MapPin size={16} />{point ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : "Klik peta atau geser pin untuk memilih titik"}</span><button type="button" disabled={!point} className={pointConfirmed ? styles.confirmedButton : styles.confirmButton} onClick={() => { if (!point) return; setPointConfirmed(true); setError(""); }}><Check size={17} />{pointConfirmed ? "Titik dikonfirmasi" : "Konfirmasi pin"}</button></div></div>
        <div className={styles.timeColumn}><h2>Waktu kejadian</h2><label className={styles.field}><span>Tanggal</span><span className={styles.inputShell}><input type="date" value={date} max={localDateTime().date} onChange={event => { setDate(event.target.value); invalidateSubmission(); }} /><CalendarDays size={21} /></span></label><label className={styles.field}><span>Jam</span><span className={styles.inputShell}><input type="time" value={time} onChange={event => { setTime(event.target.value); invalidateSubmission(); }} /><Clock3 size={21} /></span></label><div className={styles.sideNote}><Info size={23} /><span>Pastikan pin berada di lokasi temuan. Lokasi perangkat hanya digunakan jika Anda memilihnya.</span></div></div>
      </section>
      <div className={styles.actions}><button className={styles.textButton} type="button" onClick={() => { setError(""); setStep(1); }}><ArrowLeft size={18} />Kembali ke bukti</button><button className={styles.primaryButton} type="button" onClick={goToReview}>Lanjut ke tinjau <ArrowRight size={22} /></button></div>
    </>}

    {step === 3 && <>
      <section className={`${styles.card} ${styles.reviewCard}`} aria-label="Ringkasan laporan">
        <div className={styles.reviewColumn}><div className={styles.sectionHeading}><h2>Bukti temuan</h2><button type="button" onClick={() => { setError(""); setStep(1); }}>Ubah</button></div><div className={styles.reviewPhotos}>{previews.map((url, index) => <div className={styles.reviewPhoto} key={url}><Image src={url} alt={`Bukti temuan ${index + 1}`} fill unoptimized sizes="(max-width: 760px) 80vw, 350px" /></div>)}</div><div className={styles.reviewChips}><span><Recycle size={17} />{categoryLabel}</span><span><SignalMedium size={18} />Tumpukan {severityLabel.toLowerCase()}</span></div><p className={styles.reviewDescription}>{description.trim()}</p></div>
        <div className={styles.reviewColumn}><div className={styles.sectionHeading}><h2>Lokasi & waktu</h2><button type="button" onClick={() => { setError(""); setStep(2); }}>Ubah</button></div><div className={styles.reviewMap}><ReportMap point={point} readOnly /></div><div className={styles.reviewFacts}><span><MapPin size={19} />{point?.latitude.toFixed(5)}, {point?.longitude.toFixed(5)}</span><span><CalendarDays size={19} />{occurredAt && !Number.isNaN(occurredAt.getTime()) ? formatDateTime(occurredAt.toISOString()) : "Waktu belum dipilih"}</span><span><SignalMedium size={19} />Tingkat tumpukan: {severityLabel}</span></div></div>
      </section>
      <div className={styles.infoBar}><ShieldCheck size={23} /><span>Laporan akan ditinjau sebelum dipublikasikan. Foto dan koordinat rinci tidak langsung tampil di peta publik.</span></div>
      <div className={styles.actions}><button className={styles.textButton} type="button" disabled={busy} onClick={() => { setError(""); setStep(2); }}><ArrowLeft size={18} />Kembali</button><button className={styles.primaryButton} type="button" disabled={busy} onClick={submit}>{busy ? phase : "Kirim laporan"}{!busy && <Send size={21} />}</button></div>
    </>}

    {error && <div className={styles.error} role="alert"><Info size={20} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Tutup pesan"><X size={16} /></button></div>}
    {notice && <div className={styles.notice} role="status"><Info size={20} /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Tutup pesan"><X size={16} /></button></div>}
  </div>;
}
