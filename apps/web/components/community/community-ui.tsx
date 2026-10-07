"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError } from "../../lib/api/client";
import { r1Error, type R1, type Page } from "../../lib/api/r1";
import { loginDestination } from "../../lib/auth-return";
import BrandLogo from "../brand-logo";
import s from "./community.module.css";
import { useI18n } from "../../lib/i18n/provider";

export const date = (value: string | null, locale = "id-ID") =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Jakarta",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value)) + " WIB"
    : "Belum tersedia";
export function PublicShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <main className={`${s.page} ${s.public}`}>
      <header className={s.publicHeader}>
        <Link href="/" aria-label={t("Beranda SAP")}>
          <BrandLogo width={165} />
        </Link>
        <nav aria-label={t("Navigasi publik")}>
          <Link className={s.link} href="/incidents">
            {t("Kejadian publik")}</Link>
          <Link className={s.link} href="/activities">
            {t("Kegiatan relawan")}</Link>
          <Link className={s.secondary} href="/dashboard">
            {t("Dashboard")}</Link>
        </nav>
      </header>
      {children}
    </main>
  );
}
export function Heading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <header className={s.heading}>
      <span className={s.eyebrow}>{t("SAP · Aksi warga")}</span>
      <h1>{title}</h1>
      {children && <p className={s.muted}>{children}</p>}
    </header>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t } = useI18n();
  const needsLogin =
    error instanceof ApiError &&
    (error.status === 401 ||
      ["EMAIL_UNVERIFIED", "EMAIL_NOT_VERIFIED"].includes(error.code));
  return (
    <div className={`${s.notice} ${s.error}`} role="alert">
      <p>{t(r1Error(error))}</p>
      <div className={s.actions}>
        {needsLogin && (
          <Link
            className={s.secondary}
            href={loginDestination(
              typeof window === "undefined"
                ? "/dashboard"
                : window.location.pathname + window.location.search,
            )}
          >
            {t("Masuk / verifikasi email")}</Link>
        )}
        {retry && (
          <button type="button" className={s.secondary} onClick={retry}>
            {t("Muat ulang")}</button>
        )}
      </div>
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>;
}
export function Evidence({ items }: { items: R1["PublicEvidence"][] }) {
  const { t } = useI18n();
  return items.length ? (
    <div className={s.evidence}>
      {items.map((item) => (
        <PublicPhoto key={item.id} item={item} />
      ))}
    </div>
  ) : (
    <p className={s.muted}>{t("Belum ada bukti yang disetujui untuk publik.")}</p>
  );
}
function PublicPhoto({ item }: { item: R1["PublicEvidence"] }) {
  const { t, intlLocale } = useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    const wait = Date.parse(item.expiresAt) - Date.now();
    if (wait <= 0) {
      setFailed(true);
      return;
    }
    const timer = setTimeout(
      () => setFailed(true),
      Math.min(wait, 2_147_000_000),
    );
    return () => clearTimeout(timer);
  }, [item.url, item.expiresAt]);
  return (
    <figure className={s.photo}>
      {!failed ? (
        <img
          src={item.url}
          alt={item.caption || t("Bukti yang disetujui")}
          onError={() => setFailed(true)}
        />
      ) : (
        <p className={s.notice}>
          {t("Foto kedaluwarsa atau belum dapat dimuat. Muat ulang informasi.")}</p>
      )}
      <figcaption>
        {item.caption}
        {item.observedAt && <> · {date(item.observedAt, intlLocale)}</>}
      </figcaption>
    </figure>
  );
}
export function usePage<T>(
  loader: (cursor?: string, signal?: AbortSignal) => Promise<Page<T>>,
) {
  const [items, setItems] = useState<T[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<unknown>(null),
    [epoch, setEpoch] = useState(0);
  const refresh = useCallback(() => setEpoch((v) => v + 1), []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setItems([]);
    setCursor(null);
    setError(null);
    loader(undefined, c.signal)
      .then((p) => {
        if (!c.signal.aborted) {
          setItems(p.items);
          setCursor(p.nextCursor);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [loader, epoch]);
  async function more() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const p = await loader(cursor);
      setItems((v) => [...v, ...p.items]);
      setCursor(p.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  return { items, setItems, cursor, loading, error, refresh, more };
}
