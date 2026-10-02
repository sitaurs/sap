"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraStatus = "loading" | "ready" | "error" | "stopped";
type CameraRequest = { deviceId?: string; facing: "environment" | "user"; attempt: number };
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraints = MediaTrackConstraintSet & { torch?: boolean };

function cameraMessage(cause: unknown) {
  if (cause instanceof DOMException) {
    if (cause.name === "NotAllowedError" || cause.name === "SecurityError") return "Akses kamera belum diizinkan. Izinkan kamera melalui pengaturan situs di browser, lalu coba lagi.";
    if (cause.name === "NotFoundError" || cause.name === "OverconstrainedError") return "Kamera yang dipilih tidak tersedia. Sambungkan kamera atau gunakan unggah foto.";
    if (cause.name === "NotReadableError" || cause.name === "AbortError") return "Kamera belum dapat dibuka. Tutup aplikasi lain yang menggunakan kamera, lalu coba lagi.";
  }
  return "Kamera belum dapat digunakan. Coba lagi atau unggah foto dari perangkat.";
}

/** Owns camera tracks only; capturing a photo never uploads it. */
export default function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [request, setRequest] = useState<CameraRequest>({ facing: "environment", attempt: 0 });
  const [status, setStatus] = useState<CameraStatus>("loading");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    release();
    setStatus("stopped");
    setTorchOn(false);
    setTorchAvailable(false);
  }, [release]);

  useEffect(() => {
    const ticket = ++generation.current;
    let current = true;
    release();
    setStatus("loading"); setError(""); setTorchOn(false); setTorchAvailable(false);

    async function refreshDevices() {
      try {
        const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput");
        if (current && generation.current === ticket) setDevices(cameras);
      } catch { /* Labels/device enumeration can be restricted without blocking capture. */ }
    }

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError(!window.isSecureContext ? "Kamera memerlukan koneksi HTTPS. Di komputer ini, Anda juga bisa membuka situs melalui localhost. Anda tetap dapat mengunggah foto." : "Browser ini belum mendukung kamera langsung. Gunakan browser terbaru atau unggah foto.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(request.deviceId ? { deviceId: { exact: request.deviceId } } : { facingMode: { ideal: request.facing } }),
            width: { ideal: 1920 }, height: { ideal: 1080 },
          },
        });
        if (!current || generation.current !== ticket) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        setActiveDeviceId(track.getSettings().deviceId || "");
        setTorchAvailable(Boolean((track.getCapabilities?.() as TorchCapabilities | undefined)?.torch));
        track.addEventListener("ended", () => {
          if (!current || generation.current !== ticket) return;
          release(); setStatus("error"); setError("Kamera terputus. Sambungkan kembali kamera, lalu pilih Coba lagi.");
        }, { once: true });
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play(); }
        if (!current || generation.current !== ticket) return;
        await refreshDevices();
      } catch (cause) {
        if (!current || generation.current !== ticket) return;
        release(); setStatus("error"); setError(cameraMessage(cause));
      }
    }

    function pauseWhenHidden() {
      if (document.hidden && generation.current === ticket) stop();
    }
    void start();
    document.addEventListener("visibilitychange", pauseWhenHidden);
    window.addEventListener("pagehide", stop);
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => {
      current = false;
      generation.current += 1;
      release();
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      window.removeEventListener("pagehide", stop);
      navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
    };
  }, [request, release, stop]);

  function markReady() {
    if (streamRef.current && videoRef.current && videoRef.current.videoWidth > 0) setStatus("ready");
  }
  function restart() { setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 })); }
  function chooseDevice(deviceId: string) { setRequest(previous => ({ ...previous, deviceId: deviceId || undefined, attempt: previous.attempt + 1 })); }
  function switchCamera() {
    if (devices.length > 1) {
      const index = devices.findIndex(device => device.deviceId === activeDeviceId);
      chooseDevice(devices[(index + 1) % devices.length].deviceId);
    } else setRequest(previous => ({ facing: previous.facing === "environment" ? "user" : "environment", attempt: previous.attempt + 1 }));
  }
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;
    const ticket = generation.current;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraints] });
      if (ticket === generation.current) setTorchOn(next);
    } catch {
      if (ticket === generation.current) { setTorchAvailable(false); setTorchOn(false); }
    }
  }

  async function capture(): Promise<File> {
    const video = videoRef.current;
    if (!video || status !== "ready" || video.readyState < 2 || !video.videoWidth) throw new Error("Tunggu sampai gambar kamera terlihat, lalu ambil foto.");
    const ticket = generation.current;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    let sourceX = 0; let sourceY = 0;
    // Mobile uses cover; capture exactly the visible preview instead of hidden edges.
    if (getComputedStyle(video).objectFit === "cover") {
      const bounds = video.getBoundingClientRect();
      const aspect = bounds.width / bounds.height;
      if (sourceWidth / sourceHeight > aspect) { const width = sourceHeight * aspect; sourceX = (sourceWidth - width) / 2; sourceWidth = width; }
      else { const height = sourceWidth / aspect; sourceY = (sourceHeight - height) / 2; sourceHeight = height; }
    }
    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale)); canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Foto belum dapat diambil. Coba lagi atau unggah foto.");
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (ticket !== generation.current) throw new DOMException("Capture cancelled", "AbortError");
    if (!blob) throw new Error("Foto belum dapat disimpan. Silakan ambil ulang.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([blob], `SAP-scan-${stamp}.jpg`, { type: "image/jpeg" });
  }

  return { videoRef, status, error, devices, activeDeviceId, torchAvailable, torchOn, markReady, restart, chooseDevice, switchCamera, toggleTorch, capture, stop };
}
