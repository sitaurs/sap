"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Camera, Check, ChevronDown, Flashlight, Image as Gallery, Lightbulb, LoaderCircle, RotateCcw, ShieldCheck, SwitchCamera, X } from "lucide-react";
import useCamera from "./use-camera";
import styles from "./camera-capture.module.css";
import { useI18n } from "../lib/i18n/provider";


type Props = { onClose: () => void; onUpload: () => void; onPhoto: (photo: File) => void };

export default function CameraCapture({ onClose, onUpload, onPhoto }: Props) {
  const { t } = useI18n();
  const camera = useCamera();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const capturePending = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [taking, setTaking] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [review, setReview] = useState<File | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      mounted.current = false;
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (!review) { setReviewUrl(null); return; }
    const url = URL.createObjectURL(review);
    setReviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [review]);

  async function takePhoto() {
    if (capturePending.current || camera.status !== "ready") return;
    capturePending.current = true;
    setTaking(true); setCaptureError("");
    try {
      const photo = await camera.capture();
      if (!mounted.current) return;
      camera.stop();
      setReview(photo);
    } catch (cause) {
      if (mounted.current && !(cause instanceof DOMException && cause.name === "AbortError")) setCaptureError(cause instanceof Error ? cause.message : "Foto belum berhasil diambil. Silakan coba lagi.");
    } finally {
      capturePending.current = false;
      if (mounted.current) setTaking(false);
    }
  }

  function retake() { setReview(null); setCaptureError(""); camera.restart(); }
  const cameraUnavailable = !review && (camera.status === "error" || camera.status === "stopped");

  return <dialog ref={dialog} className={`${styles.dialog} ${review ? styles.reviewMode : ""}`} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <div className={styles.layout}>
      <header className={styles.header}>
        <button className={styles.mobileBack} type="button" onClick={onClose} aria-label={t("Kembali ke halaman scan")}><ArrowLeft size={25} /></button>
        <span className={styles.headingIcon} aria-hidden="true"><Camera size={27} /></span>
        <div className={styles.heading}><h2 id={titleId}>{review ? t("Tinjau foto") : t("Kamera SAP")}</h2><p id={descriptionId}>{review ? t("Pastikan objek terlihat jelas sebelum dipindai.") : t("Ambil foto sampah untuk dipindai dengan AI.")}</p></div>
        <div className={styles.headerActions}>
          {!review && <label className={styles.cameraSelect}><Camera size={18} aria-hidden="true" /><select aria-label={t("Pilih kamera")} value={camera.activeDeviceId} disabled={camera.status === "loading" || camera.devices.length < 2} onChange={event => camera.chooseDevice(event.target.value)}>
            {!camera.devices.some(device => device.deviceId === camera.activeDeviceId) && <option value={camera.activeDeviceId}>{t("Kamera utama")}</option>}
            {camera.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("Kamera {0}", { "0": index + 1 })}</option>)}
          </select><ChevronDown size={17} aria-hidden="true" /></label>}
          {!review && camera.torchAvailable && <button className={styles.torchButton} type="button" onClick={() => void camera.toggleTorch()} aria-label={camera.torchOn ? t("Matikan senter") : t("Nyalakan senter")} aria-pressed={camera.torchOn}><Flashlight size={22} /></button>}
          <button className={styles.close} type="button" onClick={onClose} aria-label={t("Tutup kamera")}><X size={24} /></button>
        </div>
      </header>

      <div className={styles.preview}>
        <video ref={camera.videoRef} className={`${styles.video} ${review || cameraUnavailable ? styles.hiddenVideo : ""}`} autoPlay muted playsInline onLoadedData={camera.markReady} onCanPlay={camera.markReady} aria-label={t("Pratinjau langsung dari kamera")} />
        {reviewUrl && <Image className={styles.reviewImage} src={reviewUrl} alt={t("Foto yang baru Anda ambil untuk ditinjau")} fill unoptimized sizes="(max-width: 640px) 100vw, 1000px" />}
        {!review && camera.status === "ready" && <>
          <div className={styles.mobilePrompt}><h3>{t("Arahkan kamera ke sampah")}</h3><p>{t("Posisikan satu objek di dalam bingkai.")}</p></div>
          <span className={styles.activeBadge}><i />{t("Kamera aktif")}</span>
          <span className={styles.focusFrame} aria-hidden="true" />
          <span className={styles.frameHint}>{t("Posisikan satu objek di dalam bingkai.")}</span>
          <span className={styles.mobileTip}><Lightbulb size={19} />{t("Gunakan cahaya yang cukup.")}</span>
        </>}
        {review && <span className={styles.reviewBadge}><Check size={17} />{t("Foto siap ditinjau")}</span>}
        {!review && camera.status === "loading" && <div className={styles.state} role="status"><LoaderCircle className={styles.spinner} size={36} /><h3>{t("Membuka kamera…")}</h3><p>{t("Izinkan akses kamera saat browser meminta izin.")}</p><button type="button" onClick={onUpload}>{t("Pilih foto dari perangkat")}</button></div>}
        {cameraUnavailable && <div className={styles.state}>
          <Image src="/images/camera/camera-idle.svg" alt="" width={78} height={78} />
          <h3>{camera.status === "stopped" ? t("Kamera dijeda") : t("Kamera belum tersedia")}</h3>
          <p role="alert">{camera.status === "stopped" ? t("Kamera dihentikan saat Anda berpindah aplikasi. Aktifkan kembali untuk melanjutkan.") : camera.error}</p>
          <div className={styles.stateActions}><button type="button" onClick={camera.restart}><RotateCcw size={17} />{t("Coba lagi")}</button><button type="button" onClick={onUpload}><Gallery size={17} />{t("Unggah foto")}</button></div>
        </div>}
      </div>

      <footer className={styles.footer}>
        {captureError && <p className={styles.captureError} role="alert">{captureError}</p>}
        {review ? <div className={styles.reviewActions}><button className={styles.retake} type="button" onClick={retake}><RotateCcw size={20} />{t("Ambil ulang")}</button><button className={styles.usePhoto} type="button" onClick={() => onPhoto(review)}><Check size={21} />{t("Gunakan foto")}</button></div> : <div className={styles.captureActions}>
          <button className={styles.secondaryAction} type="button" onClick={onUpload}><span><Gallery size={28} /></span><small><span className={styles.desktopText}>{t("Unggah foto")}</span><span className={styles.mobileText}>{t("Galeri")}</span></small></button>
          <button className={styles.shutter} type="button" onClick={() => void takePhoto()} disabled={camera.status !== "ready" || taking}><span>{taking ? <LoaderCircle className={styles.spinner} size={30} /> : <Camera size={31} strokeWidth={2.5} />}</span><strong>{taking ? t("Mengambil…") : t("Ambil foto")}</strong></button>
          <button className={styles.secondaryAction} type="button" onClick={camera.switchCamera} disabled={camera.status === "loading" || camera.devices.length < 2} title={camera.devices.length < 2 ? t("Hanya satu kamera tersedia") : t("Gunakan kamera berikutnya")}><span><SwitchCamera size={29} /></span><small><span className={styles.desktopText}>{t("Ganti kamera")}</span><span className={styles.mobileText}>{t("Balik kamera")}</span></small></button>
        </div>}
        <p className={styles.privacy}><ShieldCheck size={19} /><span>{review ? t("Foto belum diunggah. Lanjutkan dengan Pindai dengan AI di halaman scan.") : t("Foto baru diunggah setelah Anda memilih Pindai dengan AI.")}</span></p>
      </footer>
    </div>
  </dialog>;
}
