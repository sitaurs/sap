"use client";

import { useRef, useState } from "react";
import {
  AlignLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Instagram,
  LoaderCircle,
  Save,
  Settings2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  getInstagramOverview,
  saveInstagramSettings,
} from "../../lib/api/instagram";
import { Notice } from "./publication-ui";
import {
  PREVIEW_SETTINGS,
  type InstagramOverview,
  type PublicationSettings,
} from "./types";
import { revisionConflict, r1Error } from "../../lib/api/r1";
import styles from "./instagram.module.css";
import { useI18n } from "../../lib/i18n/provider";


export default function PublicationSettingsPanel({
  overview,
  available,
  onSaved,
  onAccount,
  onBack,
}: {
  overview: InstagramOverview | null;
  available: boolean;
  onSaved: () => void;
  onAccount: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(overview?.settings ?? PREVIEW_SETTINGS);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [latest, setLatest] = useState<PublicationSettings | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const hashtagCount = (draft.hashtags.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  const valid =
    !!draft.captionTemplate.trim() &&
    draft.captionTemplate.length <= 1800 &&
    draft.hashtags.length <= 400 &&
    hashtagCount <= 30;
  function patch(next: Partial<PublicationSettings>) {
    setDraft((current) => ({ ...current, ...next }));
    setError("");
    setMessage("");
  }
  function insert(token: string) {
    const input = captionRef.current;
    const start = input?.selectionStart ?? draft.captionTemplate.length;
    const end = input?.selectionEnd ?? start;
    const value =
      draft.captionTemplate.slice(0, start) +
      token +
      draft.captionTemplate.slice(end);
    if (value.length > 1800) return;
    patch({ captionTemplate: value });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }
  async function save() {
    if (!available || busy || !dirty || !valid || latest) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await saveInstagramSettings(draft);
      setSaved(result);
      setDraft(result);
      setMessage("Pengaturan publikasi tersimpan.");
      onSaved();
    } catch (cause) {
      setError(r1Error(cause));
      if (revisionConflict(cause)) {
        try {
          setLatest((await getInstagramOverview()).settings);
        } catch (load) {
          setError(r1Error(load));
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={styles.settingsForm}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className={styles.settingsGrid}>
        <section className={styles.settingsPanel}>
          <header className={styles.cardHeader}>
            <span className={styles.cardIcon}>
              <Settings2 size={24} />
            </span>
            <div>
              <h2>{t("Pengaturan publikasi")}</h2>
              <p>{t("Tentukan alur postingan dari laporan.")}</p>
            </div>
          </header>
          <fieldset className={styles.modeField}>
            <legend>{t("Alur postingan")}</legend>
            <label
              className={`${styles.modeOption} ${draft.draftGeneration === "manual" ? styles.modeSelected : ""}`}
            >
              <input
                type="radio"
                name="publication-mode"
                value="manual"
                checked={draft.draftGeneration === "manual"}
                onChange={() => patch({ draftGeneration: "manual" })}
                disabled={busy}
              />
              <FileText size={23} />
              <span>
                <strong>{t("Masuk ke draf")}</strong>
                <small>{t("Admin meninjau foto dan caption sebelum posting.")}</small>
              </span>
            </label>
            <label
              className={`${styles.modeOption} ${draft.draftGeneration === "automatic" ? styles.modeSelected : ""} ${!overview?.capabilities.canAutomate ? styles.unavailableOption : ""}`}
            >
              <input
                type="radio"
                name="publication-mode"
                value="automatic"
                checked={draft.draftGeneration === "automatic"}
                onChange={() => patch({ draftGeneration: "automatic" })}
                disabled={busy || !overview?.capabilities.canAutomate}
              />
              <Zap size={23} />
              <span>
                <strong>{t("Buat draf otomatis")}</strong>
                <small>
                  {overview?.capabilities.canAutomate
                    ? t("Buat draf dari laporan yang memenuhi aturan.")
                    : t("Tersedia setelah layanan automasi diaktifkan.")}
                </small>
              </span>
            </label>
          </fieldset>
          <label className={styles.field}>
            <span>{t("Sumber konten")}</span>
            <select value={draft.source} disabled>
              <option value="reports">{t("Laporan terverifikasi")}</option>
            </select>
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked disabled />
            <span>
              <strong>{t("Hanya laporan terverifikasi")}</strong>
              <small>
                {t("Gunakan foto dan ringkasan publik yang disetujui admin.")}</small>
            </span>
            <ShieldCheck size={20} />
          </label>
          <Notice>
            {draft.draftGeneration === "manual"
              ? t("Postingan tetap menjadi draf sampai admin memilih Posting sekarang.")
              : t("Laporan yang lolos aturan dibuat menjadi draf. Admin tetap menyetujui dan memposting secara terpisah.")}
          </Notice>
        </section>
        <section className={styles.settingsPanel}>
          <header className={styles.cardHeader}>
            <span className={styles.cardIcon}>
              <Instagram size={25} />
            </span>
            <div>
              <h2>{t("Tujuan publikasi")}</h2>
              <p>{t("Atur akun dan format postingan.")}</p>
            </div>
          </header>
          <div className={styles.accountCard}>
            <div>
              <Instagram size={25} />
              <span>
                <strong>
                  {overview?.account.username
                    ? `@${overview.account.username}`
                    : t("Akun Instagram")}
                </strong>
                <small>
                  <i
                    data-connected={overview?.account.status === "connected"}
                  />
                  {overview?.account.status === "connected"
                    ? t("Terhubung")
                    : overview?.account.status === "expired"
                      ? t("Perlu dihubungkan ulang")
                      : t("Belum terhubung")}
                </small>
              </span>
            </div>
            <button
              className={styles.secondary}
              type="button"
              onClick={onAccount}
            >
              {t("Kelola akun")}<ArrowRight size={16} />
            </button>
          </div>
          <div className={styles.settingFields}>
            <label className={styles.field}>
              <span>{t("Format postingan")}</span>
              <select value="feed" disabled>
                <option value="feed">{t("Feed · satu foto")}</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>{t("Zona waktu")}</span>
              <select value="Asia/Jakarta" disabled>
                <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
              </select>
            </label>
          </div>
          <div className={styles.originalPhoto}>
            <span className={styles.cardIcon}>
              <ImageIcon size={25} />
            </span>
            <div>
              <strong>{t("Gambar final publikasi")}</strong>
              <p>
                {t("Gambar dirender dari bukti berizin. Tinjau preview final pada detail draf sebelum menyetujui konten.")}</p>
            </div>
            <CheckCircle2 size={21} />
          </div>
          <p className={styles.helper}>
            {t("Waktu masuk draf dan terposting dicatat oleh layanan publikasi, lalu ditampilkan dalam WIB.")}</p>
        </section>
      </div>
      <section className={styles.settingsPanel}>
        <header className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <AlignLeft size={24} />
          </span>
          <div>
            <h2>{t("Caption postingan")}</h2>
            <p>{t("Gunakan template yang konsisten untuk draf baru.")}</p>
          </div>
        </header>
        <div className={styles.captionGrid}>
          <label className={styles.field}>
            <span>{t("Template caption")}</span>
            <textarea
              ref={captionRef}
              rows={6}
              maxLength={1800}
              value={draft.captionTemplate}
              onChange={(event) =>
                patch({ captionTemplate: event.target.value })
              }
              disabled={busy}
            />
            <small>{draft.captionTemplate.length}{t("/1.800 karakter")}</small>
          </label>
          <div className={styles.captionTools}>
            <label className={styles.field}>
              <span>Hashtag</span>
              <textarea
                rows={3}
                maxLength={400}
                value={draft.hashtags}
                onChange={(event) => patch({ hashtags: event.target.value })}
                disabled={busy}
              />
              <small>{hashtagCount}{t("/30 hashtag")}</small>
            </label>
            <div className={styles.tokens}>
              <span>{t("Sisipkan data laporan")}</span>
              <div>
                <button
                  className={styles.token}
                  type="button"
                  disabled={busy}
                  onClick={() => insert("{jenis_sampah}")}
                >
                  {t("+ Jenis sampah")}</button>
                <button
                  className={styles.token}
                  type="button"
                  disabled={busy}
                  onClick={() => insert("{ringkasan_laporan}")}
                >
                  {t("+ Ringkasan publik")}</button>
              </div>
            </div>
          </div>
        </div>
        <Notice>
          {t("Caption tetap dapat diedit pada detail draf. Perubahan template tidak mengubah postingan yang sudah ada.")}</Notice>
      </section>
      {!available && (
        <Notice warning>
          {t("Ini pratinjau pengaturan. Preferensi belum tersimpan sampai layanan publikasi diaktifkan.")}</Notice>
      )}
      {!valid && (
        <div className={styles.error} role="alert">
          {t("Isi template caption dan gunakan maksimal 30 hashtag.")}</div>
      )}
      {latest && (
        <div className={styles.confirmation} role="alert">
          <strong>{t("Pengaturan terbaru · revisi")}{" "}{latest.revision}</strong>
          <p>{latest.captionTemplate}</p>
          <p>{latest.hashtags}</p>
          <p>
            {t("Pembuatan draf:")}{" "}
            {latest.draftGeneration === "automatic" ? "Otomatis" : "Manual"}{t(". Publish: wajib persetujuan admin.")}</p>
          <p>
            {t("Input tetap dipertahankan. Tinjau versi terbaru sebelum menyimpan ulang.")}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setSaved(latest);
              setDraft((current) => ({
                ...current,
                revision: latest.revision,
              }));
              setLatest(null);
              setError("");
            }}
          >
            {t("Saya sudah meninjau, gunakan revisi terbaru")}</button>
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {t(error)}
        </div>
      )}
      {message && (
        <div className={styles.success} role="status">
          <CheckCircle2 size={18} />
          {t(message)}
        </div>
      )}
      <div className={styles.settingsActions}>
        <span>
          {dirty
            ? t("Ada perubahan yang belum tersimpan.")
            : available
              ? t("Pengaturan sesuai data tersimpan.")
              : t("Pratinjau · belum tersimpan")}
        </span>
        <button
          className={styles.secondary}
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(saved);
            setError("");
            setMessage("");
            if (!dirty) onBack();
          }}
        >
          {dirty ? t("Batalkan perubahan") : t("Kembali")}
        </button>
        <button
          className={styles.primary}
          type="submit"
          disabled={busy || !available || !dirty || !valid || !!latest}
        >
          {busy ? (
            <LoaderCircle className={styles.spin} size={18} />
          ) : (
            <Save size={18} />
          )}
          {t("Simpan pengaturan")}</button>
      </div>
    </form>
  );
}
