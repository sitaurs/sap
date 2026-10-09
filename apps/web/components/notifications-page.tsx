"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, Check, Loader2, Mail, MailOpen, RefreshCw } from "lucide-react";
import { apiGet, apiMutate } from "../lib/api/client";
import { notifications as listNotifications, readNotification as setNotificationRead } from "../lib/api/community";
import type { R1 } from "../lib/api/r1";
import { useI18n } from "../lib/i18n/provider";
import styles from "./operations/operations.module.css";

type Notification = R1["Notification"];
const messageFor = (cause: unknown) => cause instanceof Error ? cause.message : "Permintaan belum berhasil. Coba lagi.";

// Decode only to validate: navigation retains the original escaping and query.
export function safeNotificationTarget(target: string | undefined): string | null {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return null;
  let decoded = target;
  try {
    for (let index = 0; index < 4; index++) {
      if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return null;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return null;
    const url = new URL(target, "https://sap.invalid");
    if (url.origin !== "https://sap.invalid") return null;
    const path = new URL(decoded, "https://sap.invalid").pathname;
    if (/^\/community-updates(?:\/|$)/.test(path)) return "/dashboard?view=reports";
    if (path === "/incidents") return "/incidents";
    if (/^\/incidents\/[a-zA-Z0-9-]+\/?$/.test(path) || /^\/activities(?:\/[a-zA-Z0-9-]+(?:\/manage)?)?\/?$/.test(path)) return `${url.pathname}${url.search}${url.hash}`;
    if (path === "/dashboard") {
      if (url.searchParams.get("view") === "community-updates") return "/dashboard?view=reports";
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return null;
  } catch { return null; }
}

export default function NotificationsPage({ notify }: { notify?: (message: string) => void }) {
  const { t, intlLocale } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);
  const [emailDraft, setEmailDraft] = useState(false);
  const [preferenceLoading, setPreferenceLoading] = useState(true);
  const [preferenceError, setPreferenceError] = useState("");
  const [preferenceReload, setPreferenceReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const preferenceLock = useRef(false);

  const load = useCallback(async (next?: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError("");
    if (!next) { setItems([]); setCursor(null); }
    try {
      const page = await listNotifications(next, controller.signal);
      if (controller.signal.aborted) return;
      setItems(previous => next ? [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()] : page.items); setCursor(page.nextCursor);
    } catch (cause) { if (!controller.signal.aborted) setError(messageFor(cause)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  useEffect(() => {
    const controller = new AbortController(); setPreferenceLoading(true); setPreferenceError("");
    void apiGet<{ emailEnabled: boolean }>("/users/me/report-notification-preferences", AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])).then(value => { if (!controller.signal.aborted) { setEmailEnabled(value.emailEnabled); setEmailDraft(value.emailEnabled); } }).catch(cause => { if (!controller.signal.aborted) setPreferenceError(messageFor(cause)); }).finally(() => { if (!controller.signal.aborted) setPreferenceLoading(false); });
    return () => controller.abort();
  }, [preferenceReload]);

  async function savePreference() {
    if (preferenceLock.current || emailEnabled === null || emailEnabled === emailDraft) return;
    preferenceLock.current = true; setSaving(true); setPreferenceError("");
    try {
      const value = await apiMutate<{ emailEnabled: boolean }>("PUT", "/users/me/report-notification-preferences", { body: { emailEnabled: emailDraft }, signal: AbortSignal.timeout(30_000) });
      setEmailEnabled(value.emailEnabled); setEmailDraft(value.emailEnabled); setMessage("Preferensi notifikasi tersimpan."); notify?.(t("Preferensi notifikasi tersimpan."));
    } catch (cause) { setPreferenceError(messageFor(cause)); }
    finally { preferenceLock.current = false; setSaving(false); }
  }

  async function mark(item: Notification, read: boolean) {
    if (pendingRef.current.has(item.id)) return;
    pendingRef.current.add(item.id); setPending(new Set(pendingRef.current)); setError("");
    try {
      const updated = await setNotificationRead(item.id, read);
      setItems(previous => previous.map(value => value.id === updated.id ? updated : value));
    } catch (cause) { setError(messageFor(cause)); }
    finally { pendingRef.current.delete(item.id); setPending(new Set(pendingRef.current)); }
  }

  const visible = unreadOnly ? items.filter(item => !item.read) : items;
  return <section className={styles.page} aria-label={t("Notifikasi")}>
    <header className={styles.header}><h2>{t("Notifikasi")}</h2><button type="button" className={styles.icon} disabled={loading || pending.size > 0} onClick={() => void load()} aria-label={t("Muat ulang")} title={t("Muat ulang")}><RefreshCw size={18} /></button></header>
    <form className={styles.preference} onSubmit={event => { event.preventDefault(); void savePreference(); }}>
      <label className={styles.check}><input type="checkbox" checked={emailDraft} disabled={emailEnabled === null || preferenceLoading || saving} onChange={event => setEmailDraft(event.target.checked)} /><Mail size={18} />{t("Notifikasi laporan melalui email")}</label>
      <button type="submit" className={styles.button} disabled={emailEnabled === null || preferenceLoading || saving || emailEnabled === emailDraft}>{saving ? <Loader2 size={17} className={styles.spin} /> : <Check size={17} />}{t("Simpan preferensi")}</button>
      {preferenceLoading && <span className={styles.muted} role="status">{t("Memuat preferensi...")}</span>}
    </form>
    {preferenceError && <div className={styles.error} role="alert">{t(preferenceError)} <button type="button" className={styles.button} onClick={() => setPreferenceReload(value => value + 1)} disabled={saving || preferenceLoading}>{t("Coba lagi")}</button></div>}
    {message && <p className={styles.success} role="status">{t(message)}</p>}
    <div className={styles.toolbar}><label className={styles.check}><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} />{t("Belum dibaca saja")}</label></div>
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    <ul className={styles.inbox} aria-busy={loading}>{visible.map(item => {
      const target = safeNotificationTarget(item.targetPath || (item as Notification & { target_path?: string }).target_path);
      const date = new Date(item.createdAt);
      return <li key={item.id} className={styles.notification} data-unread={!item.read}><Bell size={21} aria-hidden="true" /><div><h3>{t(item.title)}</h3><p>{t(item.message)}</p>{Number.isFinite(date.getTime()) && <time dateTime={item.createdAt}>{new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(date)}</time>}<div className={styles.actions}>{!item.read && <span className={styles.badge}>{t("Belum dibaca")}</span>}{target && <a className={styles.button} href={target} onClick={() => { if (!item.read) void mark(item, true); }}>{t("Buka")}<ArrowUpRight size={16} /></a>}</div></div><button type="button" className={styles.icon} disabled={pending.has(item.id)} onClick={() => void mark(item, !item.read)} title={t(item.read ? "Tandai belum dibaca" : "Tandai dibaca")} aria-label={t(item.read ? "Tandai belum dibaca" : "Tandai dibaca")}>{pending.has(item.id) ? <Loader2 size={18} className={styles.spin} /> : item.read ? <Mail size={18} /> : <MailOpen size={18} />}</button></li>;
    })}</ul>
    {loading && <div className={styles.empty} role="status"><Loader2 size={20} className={styles.spin} />{t("Memuat notifikasi...")}</div>}
    {!loading && !error && !visible.length && <div className={styles.empty}>{t(unreadOnly ? "Tidak ada notifikasi belum dibaca pada halaman yang dimuat." : "Belum ada notifikasi.")}</div>}
    <div className={styles.pager}><span className={styles.muted}>{t("{0} ditampilkan", { "0": visible.length })}</span>{cursor && <button type="button" className={styles.button} disabled={loading || pending.size > 0} onClick={() => void load(cursor)}>{t("Muat lagi")}</button>}{error && <button type="button" className={styles.button} disabled={loading || pending.size > 0} onClick={() => void load()}>{t("Coba lagi")}</button>}</div>
  </section>;
}
