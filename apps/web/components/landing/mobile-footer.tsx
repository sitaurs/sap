"use client";

import { ChevronDown } from "lucide-react";
import BrandLogo from "../brand-logo";
import styles from "./mobile-footer.module.css";
import { useI18n } from "../../lib/i18n/provider";


type FooterGroup = { title: string; items: readonly { label: string; href?: string }[] };

const legalLabels = ["Kebijakan Privasi", "Ketentuan Layanan", "Pengaturan Cookie"] as const;

export default function MobileFooter({ groups, onOpen }: { groups: readonly FooterGroup[]; onOpen: (label: string) => void }) {
  const { t } = useI18n();
  return <div className={styles.mobileOnly}>
    <a href="#beranda" aria-label={t("SAP, kembali ke beranda")}><BrandLogo width={144} /></a>
    <p className={styles.tagline}>{t("Bersama untuk masa depan yang lebih berkelanjutan.")}</p>
    <nav className={styles.groups} aria-label={t("Navigasi footer mobile")}>
      {groups.map(group => <details key={t(group.title)} open={group.title === "Produk"}>
        <summary>{t(group.title)}<ChevronDown aria-hidden="true" /></summary>
        <div className={styles.links}>
          {group.items.map(item => item.href ? <a key={t(item.label)} href={item.href}>{t(item.label)}</a> : <button key={t(item.label)} type="button" onClick={() => onOpen(item.label)}>{t(item.label)}</button>)}
        </div>
      </details>)}
    </nav>
    <div className={styles.legal}>
      {legalLabels.map(label => <button key={label} type="button" onClick={() => onOpen(label)}>{t(label)}</button>)}
    </div>
    <p className={styles.copyright}>© 2026 SAP. Sustainable AI Platform.</p>
  </div>;
}
