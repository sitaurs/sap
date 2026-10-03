"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SAPA_MOTIONS, type SapaMotion } from "./sapa-motion-data";
import styles from "./sapa-sprite.module.css";

const ASSET_ROOT = "/images/sapa/animation-v1/";
const images = new Map<SapaMotion, Promise<HTMLImageElement>>();

// Load only the active sheet; subsequent reactions reuse its decoded image.
function loadSheet(motion: SapaMotion) {
  let promise = images.get(motion);
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => { images.delete(motion); reject(new Error("SAPA artwork unavailable")); };
      image.src = ASSET_ROOT + SAPA_MOTIONS[motion].file;
    });
    images.set(motion, promise);
  }
  return promise;
}

type Props = {
  motion: SapaMotion;
  playId: number;
  paused?: boolean;
  calm?: boolean;
  onComplete: (playId: number) => void;
};

/** Frame playback stays outside React rendering; the click target never moves. */
export default function SapaSprite({ motion, playId, paused = false, calm = false, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completeRef = useRef(onComplete);
  const [ready, setReady] = useState(false);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let raf = 0;
    let previousTime = 0;
    let elapsed = 0;
    let lastDraw = -1;
    let finished = false;
    let sheet: HTMLImageElement | null = null;
    const spec = SAPA_MOTIONS[motion];
    const total = spec.durations.reduce((sum, duration) => sum + duration, 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resolution = Math.round(128 * dpr);
    if (canvas.width !== resolution || canvas.height !== resolution) {
      canvas.width = resolution;
      canvas.height = resolution;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    function finish() {
      if (finished || spec.loop) return;
      finished = true;
      completeRef.current(playId);
    }

    function draw(time: number) {
      if (!sheet) return;
      const reduced = media.matches;
      const phaseTime = spec.loop ? time % total : Math.min(time, total - 1);
      let frame = 0;
      let boundary: number = spec.durations[0];
      while (frame < 7 && phaseTime >= boundary) boundary += spec.durations[++frame];
      if (reduced || paused) frame = 0;
      // Calm breathing only while idle, never while the user is chatting/dragging.
      const breath = motion === "idle" && !calm && !reduced && !paused
        ? (1 - Math.cos(time / 3600 * Math.PI * 2)) * .35 : 0;
      // Normalize the source feet, then add the deliberate takeoff/landing arc.
      const flight = motion === "success" && !reduced && !paused
        ? Math.sin(Math.PI * Math.max(0, Math.min(1, (time - 160) / 290))) * 10 : 0;
      const sourceWidth = sheet.naturalWidth / 4;
      const sourceHeight = sheet.naturalHeight / 2;
      const scale = 112 / sourceHeight;
      const [anchorX, anchorY] = spec.anchors[frame];
      context!.clearRect(0, 0, 128, 128);
      context!.drawImage(sheet, (frame % 4) * sourceWidth, Math.floor(frame / 4) * sourceHeight,
        sourceWidth, sourceHeight, 64 - anchorX * scale, 119 - anchorY * scale - breath - flight,
        sourceWidth * scale, sourceHeight * scale);
    }

    function tick(now: number) {
      if (disposed || !sheet || document.hidden) return;
      if (previousTime) elapsed += Math.min(now - previousTime, 64);
      previousTime = now;
      // Smooth body movement at 30 FPS; pose changes use their own authored holds.
      if (now - lastDraw >= 1000 / 30) { draw(elapsed); lastDraw = now; }
      if (!spec.loop && elapsed >= total) { draw(total); finish(); return; }
      if (!paused && !media.matches) raf = requestAnimationFrame(tick);
      else { draw(0); finish(); }
    }

    function resume() {
      cancelAnimationFrame(raf);
      previousTime = 0;
      if (document.hidden || !sheet || disposed) return;
      draw(elapsed);
      if (finished) return;
      raf = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", resume);
    media.addEventListener("change", resume);
    void loadSheet(motion).then(image => {
      if (disposed) return;
      sheet = image;
      draw(0);
      setReady(true);
      resume();
    }).catch(() => {
      if (disposed) return;
      setReady(false);
      finish();
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", resume);
      media.removeEventListener("change", resume);
    };
  }, [motion, playId, paused, calm]);

  return <span className={styles.sprite} aria-hidden="true">
    <Image className={`${styles.fallback} ${ready ? styles.hidden : ""}`} src={`${ASSET_ROOT}sapa-master.png`} alt="" width={128} height={128} sizes="112px" draggable={false} />
    <canvas ref={canvasRef} className={`${styles.canvas} ${ready ? styles.ready : ""}`} width={128} height={128} />
  </span>;
}
