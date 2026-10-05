"use client";

import { useState } from "react";
import { Check, Languages } from "lucide-react";
import { useI18n } from "../lib/i18n/provider";
import type { Locale } from "../lib/i18n/config";
import styles from "./settings-view.module.css";

const languages: { value: Locale; name: string; code: string }[] = [
  { value: "id", name: "Bahasa Indonesia", code: "ID" },
  { value: "en", name: "English", code: "EN" },
];

export default function LanguageSettings() {
  const { locale, t, setLocale } = useI18n();
  const [feedback, setFeedback] = useState<"saved" | "temporary" | null>(null);
  return <section className={`${styles.card} ${styles.languageCard}`}>
    <header className={styles.cardHeading}>
      <span className={styles.headingIcon}><Languages size={28} aria-hidden="true" /></span>
      <div><h2>{t("Bahasa")}</h2><p>{t("Pilih bahasa tampilan SAP.")}</p></div>
    </header>
    <fieldset className={styles.languageOptions}>
      <legend className={styles.languageLegend}>{t("Bahasa antarmuka")}</legend>
      {languages.map(language => <label key={language.value} className={`${styles.languageOption} ${locale === language.value ? styles.languageSelected : ""}`}>
        <input type="radio" name="sap-language" value={language.value} checked={locale === language.value} onChange={() => setFeedback(setLocale(language.value) ? "saved" : "temporary")} />
        <span className={styles.languageCode} aria-hidden="true">{language.code}</span>
        <span className={styles.languageCopy}><strong lang={language.value}>{language.name}</strong><small>{language.value === "id" ? "Indonesian" : "Bahasa Inggris"}</small></span>
        {locale === language.value && <Check className={styles.languageCheck} size={20} aria-hidden="true" />}
      </label>)}
    </fieldset>
    <p className={styles.languageHint}>{t("Perubahan langsung diterapkan. Pilihan bahasa tersimpan di browser ini.")}</p>
    {feedback && <p className={feedback === "saved" ? styles.success : styles.error} role="status">{feedback === "saved" ? <><Check size={17} aria-hidden="true" />{t("Bahasa tampilan berhasil diubah.")}</> : t("Bahasa berubah untuk sesi ini. Izinkan penyimpanan browser agar pilihan tetap tersimpan.")}</p>}
  </section>;
}
