"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Camera, Check, ChevronDown, Flashlight, Image as Gallery, Lightbulb, LoaderCircle, RotateCcw, ShieldCheck, SwitchCamera, X } from "lucide-react";
import useCamera from "./use-camera";
import styles from "./camera-capture.module.css";

type Props = { onClose: () => void; onUpload: () => void; onPhoto: (photo: File) => void };

export default function CameraCapture({ onClose, onUpload, onPhoto }: Props) {
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
        <button className={styles.mobileBack} type="button" onClick={onClose} aria-label="Kembali ke halaman scan"><ArrowLeft size={25} /></button>
        <span className={styles.headingIcon} aria-hidden="true"><Camera size={27} /></span>
        <div className={styles.heading}><h2 id={titleId}>{review ? "Tinjau foto" : "Kamera SAP"}</h2><p id={descriptionId}>{review ? "Pastikan objek terlihat jelas sebelum dipindai." : "Ambil foto sampah untuk dipindai dengan AI."}</p></div>
        <div className={styles.headerActions}>
          {!review && <label className={styles.cameraSelect}><Camera size={18} aria-hidden="true" /><select aria-label="Pilih kamera" value={camera.activeDeviceId} disabled={camera.status === "loading" || camera.devices.length < 2} onChange={event => camera.chooseDevice(event.target.value)}>
            {!camera.devices.some(device => device.deviceId === camera.activeDeviceId) && <option value={camera.activeDeviceId}>Kamera utama</option>}
            {camera.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Kamera ${index + 1}`}</option>)}
          </select><ChevronDown size={17} aria-hidden="true" /></label>}
          {!review && camera.torchAvailable && <button className={styles.torchButton} type="button" onClick={() => void camera.toggleTorch()} aria-label={camera.torchOn ? "Matikan senter" : "Nyalakan senter"} aria-pressed={camera.torchOn}><Flashlight size={22} /></button>}
          <button className={styles.close} type="button" onClick={onClose} aria-label="Tutup kamera"><X size={24} /></button>
        </div>
      </header>

      <div className={styles.preview}>
        <video ref={camera.videoRef} className={`${styles.video} ${review || cameraUnavailable ? styles.hiddenVideo : ""}`} autoPlay muted playsInline onLoadedData={camera.markReady} onCanPlay={camera.markReady} aria-label="Pratinjau langsung dari kamera" />
        {reviewUrl && <Image className={styles.reviewImage} src={reviewUrl} alt="Foto yang baru Anda ambil untuk ditinjau" fill unoptimized sizes="(max-width: 640px) 100vw, 1000px" />}
        {!review && camera.status === "ready" && <>
          <div className={styles.mobilePrompt}><h3>Arahkan kamera ke sampah</h3><p>Posisikan satu objek di dalam bingkai.</p></div>
          <span className={styles.activeBadge}><i />Kamera aktif</span>
          <span className={styles.focusFrame} aria-hidden="true" />
          <span className={styles.frameHint}>Posisikan satu objek di dalam bingkai.</span>
          <span className={styles.mobileTip}><Lightbulb size={19} />Gunakan cahaya yang cukup.</span>
        </>}
        {review && <span className={styles.reviewBadge}><Check size={17} />Foto siap ditinjau</span>}
        {!review && camera.status === "loading" && <div className={styles.state} role="status"><LoaderCircle className={styles.spinner} size={36} /><h3>Membuka kamera…</h3><p>Izinkan akses kamera saat browser meminta izin.</p><button type="button" onClick={onUpload}>Pilih foto dari perangkat</button></div>}
        {cameraUnavailable && <div className={styles.state}>
          <Image src="/images/camera/camera-idle.svg" alt="" width={78} height={78} />
          <h3>{camera.status === "stopped" ? "Kamera dijeda" : "Kamera belum tersedia"}</h3>
          <p role="alert">{camera.status === "stopped" ? "Kamera dihentikan saat Anda berpindah aplikasi. Aktifkan kembali untuk melanjutkan." : camera.error}</p>
          <div className={styles.stateActions}><button type="button" onClick={camera.restart}><RotateCcw size={17} />Coba lagi</button><button type="button" onClick={onUpload}><Gallery size={17} />Unggah foto</button></div>
        </div>}
      </div>

      <footer className={styles.footer}>
        {captureError && <p className={styles.captureError} role="alert">{captureError}</p>}
        {review ? <div className={styles.reviewActions}><button className={styles.retake} type="button" onClick={retake}><RotateCcw size={20} />Ambil ulang</button><button className={styles.usePhoto} type="button" onClick={() => onPhoto(review)}><Check size={21} />Gunakan foto</button></div> : <div className={styles.captureActions}>
          <button className={styles.secondaryAction} type="button" onClick={onUpload}><span><Gallery size={28} /></span><small><span className={styles.desktopText}>Unggah foto</span><span className={styles.mobileText}>Galeri</span></small></button>
          <button className={styles.shutter} type="button" onClick={() => void takePhoto()} disabled={camera.status !== "ready" || taking}><span>{taking ? <LoaderCircle className={styles.spinner} size={30} /> : <Camera size={31} strokeWidth={2.5} />}</span><strong>{taking ? "Mengambil…" : "Ambil foto"}</strong></button>
          <button className={styles.secondaryAction} type="button" onClick={camera.switchCamera} disabled={camera.status === "loading" || camera.devices.length < 2} title={camera.devices.length < 2 ? "Hanya satu kamera tersedia" : "Gunakan kamera berikutnya"}><span><SwitchCamera size={29} /></span><small><span className={styles.desktopText}>Ganti kamera</span><span className={styles.mobileText}>Balik kamera</span></small></button>
        </div>}
        <p className={styles.privacy}><ShieldCheck size={19} /><span>{review ? "Foto belum diunggah. Lanjutkan dengan Pindai dengan AI di halaman scan." : "Foto baru diunggah setelah Anda memilih Pindai dengan AI."}</span></p>
      </footer>
    </div>
  </dialog>;
}
