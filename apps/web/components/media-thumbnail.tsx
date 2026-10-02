"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Camera, ImageOff, LoaderCircle } from "lucide-react";
import { mediaUrl } from "../lib/api/client";
import styles from "./media-thumbnail.module.css";

/** Private media stays behind the existing ownership-checked signed-URL endpoint. */
export default function MediaThumbnail({ mediaId, alt, caption = false, className = "", fallback }: {
  mediaId?: string | null; alt: string; caption?: boolean; className?: string; fallback?: ReactNode;
}) {
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  useEffect(() => {
    if (!mediaId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setFailedId(null);
    async function load() {
      try {
        const signed = await mediaUrl(mediaId!, controller.signal);
        if (controller.signal.aborted) return;
        setPhoto({ id: mediaId!, url: signed.url });
        setFailedId(null);
        timer = setTimeout(() => void load(), Math.min(2_147_000_000, Math.max(15_000, Date.parse(signed.expiresAt) - Date.now() - 30_000)));
      } catch { if (!controller.signal.aborted) { setPhoto(null); setFailedId(mediaId!); } }
    }
    void load();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [mediaId]);
  const available = !!mediaId && photo?.id === mediaId && failedId !== mediaId;
  const failed = !mediaId || failedId === mediaId;
  const label = available ? "Foto unggahan" : failed ? "Foto tidak tersedia" : "Memuat foto…";
  return <span className={`${styles.wrap} ${className}`}><span className={styles.frame} aria-label={available ? undefined : label} title={label}>
    {available ? <Image src={photo.url} alt={alt} fill unoptimized sizes={caption ? "112px" : "80px"} onError={() => setFailedId(mediaId)} />
      : !failed ? <LoaderCircle className={styles.spinner} size={23} aria-hidden="true" />
        : fallback ?? (mediaId ? <ImageOff size={27} strokeWidth={1.7} aria-hidden="true" /> : <Camera size={27} strokeWidth={1.7} aria-hidden="true" />)}
  </span>{caption && <small>{label}</small>}</span>;
}
