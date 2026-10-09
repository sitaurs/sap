"use client";

import { useEffect, useRef } from "react";

/** The accessible value and reserved width always use the actual, final API value. */
export default function AnimatedNumber({ value }: { value: string | number }) {
  const text = String(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element) element.textContent = text;
    const match = /^(\d+)(.*)$/.exec(text);
    if (!element || !match || !window.IntersectionObserver) return;
    const target = Number(match[1]);
    if (!Number.isSafeInteger(target) || target <= 0) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); element.textContent = text; };
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      if (preference.matches || document.hidden) return;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / 650, 1);
        const next = `${Math.round(target * (1 - (1 - progress) ** 3))}${match[2]}`;
        if (element.textContent !== next) element.textContent = next;
        if (progress < 1) frame = requestAnimationFrame(tick);
        else finish();
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.1 });
    observer.observe(element);
    const preferenceChanged = () => { if (preference.matches) finish(); };
    const visibilityChanged = () => { if (document.hidden) finish(); };
    preference.addEventListener("change", preferenceChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      observer.disconnect(); finish();
      preference.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [text]);
  return <span className="sap-motion-number">
    <span className="sap-motion-number-accessible">{text}</span>
    <span className="sap-motion-number-space" aria-hidden="true">{text}</span>
    <span ref={ref} className="sap-motion-number-value" aria-hidden="true">{text}</span>
  </span>;
}
