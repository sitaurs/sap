"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Leaf, Quote } from "lucide-react";
import { mobileStories } from "./content";
import styles from "./mobile-stories.module.css";
import { useI18n } from "../../lib/i18n/provider";


export default function MobileStories({ onSelect }: { onSelect: (index: number) => void }) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function show(next: number) {
    const element = track.current;
    if (!element) return;
    const target = Math.max(0, Math.min(mobileStories.length - 1, next));
    const slide = element.children[target] as HTMLElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: slide.offsetLeft, behavior: reducedMotion ? "instant" : "smooth" });
  }

  return <div className={styles.mobileOnly}>
    <p className={styles.eyebrow}>{t("Cerita pelanggan")}</p>
    <h2>{t("Bersama menuju masa depan yang")}{" "}<span>{t("lebih berkelanjutan.")}</span></h2>
    <span className={styles.example}>{t("Contoh tampilan")}</span>
    <div className={styles.track} ref={track} role="region" aria-roledescription="carousel" aria-label={t("Contoh cerita pelanggan")} tabIndex={0} onKeyDown={event => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); show(index + (event.key === "ArrowRight" ? 1 : -1)); }
    }} onScroll={event => {
      const element = event.currentTarget;
      const stride = element.clientWidth + 16;
      setIndex(Math.min(mobileStories.length - 1, Math.max(0, Math.round(element.scrollLeft / stride))));
    }}>
      {mobileStories.map((person, i) => <article key={person.name} className={styles.slide} aria-roledescription="slide" aria-label={t("{0} dari {1}", { "0": i + 1, "1": mobileStories.length })}>
        <button type="button" className={styles.story} onClick={() => onSelect(i)} aria-label={t("Baca contoh cerita {0}", { "0": person.name })} tabIndex={index === i ? 0 : -1}>
          <Quote className={styles.quoteIcon} aria-hidden="true" />
          <span className={styles.quote}>{t(person.quote)}</span>
          <span className={styles.person}>
            <Image src={`/images/lower/${person.image}.png`} width={64} height={64} sizes="64px" alt="" />
            <span><strong>{person.name}</strong><span>{t(person.role)}</span><span>{t(person.company)}</span></span>
          </span>
        </button>
      </article>)}
    </div>
    <div className={styles.controls}>
      <div className={styles.dots} aria-label={t("Pilih cerita")}>
        {mobileStories.map((person, i) => <button key={person.name} type="button" aria-label={t("Cerita {0}: {1}", { "0": i + 1, "1": person.name })} aria-pressed={index === i} onClick={() => show(i)}><span /></button>)}
      </div>
      <span className={styles.counter} aria-live="polite" aria-atomic="true">{index + 1} / {mobileStories.length}</span>
      <button className={styles.arrow} type="button" aria-label={t("Cerita sebelumnya")} disabled={index === 0} onClick={() => show(index - 1)}><ArrowLeft aria-hidden="true" /></button>
      <button className={styles.arrow} type="button" aria-label={t("Cerita berikutnya")} disabled={index === mobileStories.length - 1} onClick={() => show(index + 1)}><ArrowRight aria-hidden="true" /></button>
    </div>
    <p className={styles.caption}>{t("Contoh cerita untuk pratinjau tampilan.")}</p>
    <div className={styles.invitation}>
      <h3><Leaf aria-hidden="true" />{t("Mulai dari satu foto.")}</h3>
      <p>{t("Kenali sampah dan bantu jaga lingkungan sekitar.")}</p>
      <a href="/signup">{t("Coba Sekarang")}</a>
    </div>
  </div>;
}
