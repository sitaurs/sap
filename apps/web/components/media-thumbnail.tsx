"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Camera, ImageOff, LoaderCircle } from "lucide-react";
import { mediaUrl, type SapMediaUrl } from "../lib/api/client";
import styles from "./media-thumbnail.module.css";

/** Private media stays behind the existing ownership-checked signed-URL endpoint. */
export default function MediaThumbnail({ mediaId, alt, caption = false, className = "", fallback, loadUrl = mediaUrl }: {
  mediaId?: string | null; alt: string; caption?: boolean; className?: string; fallback?: ReactNode;
  loadUrl?: (id: string, signal?: AbortSignal) => Promise<SapMediaUrl>;
}) {
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const attempts = useRef(0);
  useEffect(() => {
    attempts.current = 0;
    setPhoto(null);
    setFailedId(null);
  }, [mediaId, loadUrl]);
  useEffect(() => {
    if (!mediaId) return;
    const currentId = mediaId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const signed = await loadUrl(currentId, controller.signal);
        if (controller.signal.aborted) return;
        setPhoto({ id: currentId, url: signed.url });
        setFailedId(null);
        timer = setTimeout(() => void load(), Math.min(2_147_000_000, Math.max(15_000, Date.parse(signed.expiresAt) - Date.now() - 30_000)));
      } catch {
        if (controller.signal.aborted) return;
        setPhoto(null);
        if (attempts.current < 3) {
          const delay = 1000 * 2 ** attempts.current++;
          timer = setTimeout(() => void load(), delay);
        } else setFailedId(currentId);
      }
    }
    void load();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [mediaId, loadUrl, retry]);
  const available = !!mediaId && photo?.id === mediaId && failedId !== mediaId;
  const failed = !mediaId || failedId === mediaId;
  const label = available ? "Foto unggahan" : failed ? "Foto tidak tersedia" : "Memuat foto…";
  function retryImage() {
    if (!mediaId) return;
    if (attempts.current >= 3) { setPhoto(null); setFailedId(mediaId); return; }
    attempts.current += 1;
    setPhoto(null);
    setFailedId(null);
    setRetry(value => value + 1);
  }
  const content = available ? <Image src={photo.url} alt={alt} fill unoptimized sizes={caption ? "112px" : "80px"} onLoad={() => { attempts.current = 0; }} onError={retryImage} />
    : !failed ? <LoaderCircle className={styles.spinner} size={23} aria-hidden="true" />
      : fallback ?? (mediaId ? <ImageOff size={27} strokeWidth={1.7} aria-hidden="true" /> : <Camera size={27} strokeWidth={1.7} aria-hidden="true" />);
  return <span className={`${styles.wrap} ${className}`}><span className={styles.frame} aria-label={available ? undefined : label} title={label}>
    {content}
  </span>{caption && <small>{label}</small>}</span>;
}
