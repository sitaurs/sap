"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Instagram,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { SapCategory } from "../../lib/api/client";
import { ApiError } from "../../lib/api/client";
import {
  disconnectInstagram,
  getInstagramAuthorization,
  getInstagramOverview,
} from "../../lib/api/instagram";
import DialogShell from "./dialog-shell";
import PublicationDetail from "./publication-detail";
import PublicationList from "./publication-list";
import PublicationSettingsPanel from "./publication-settings";
import ReportPicker from "./report-picker";
import { Notice } from "./publication-ui";
import { buildCaption } from "./publication-utils";
import {
  PREVIEW_SETTINGS,
  type InstagramOverview,
  type InstagramPost,
  type PostPreview,
  type PublicationSource,
} from "./types";
import { r1Error, permissionReason } from "../../lib/api/r1";
import { useIntentKey } from "../activities/activity-ui";
import OperationPanel from "./operation-panel";
import type { PublicationOperation } from "./types";
import styles from "./instagram.module.css";
import { useI18n } from "../../lib/i18n/provider";


export default function InstagramPublication({
  categories,
  onModeration,
}: {
  categories: SapCategory[];
  onModeration: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<"posts" | "settings">("posts");
  const [overview, setOverview] = useState<InstagramOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [picker, setPicker] = useState(false);
  const [detail, setDetail] = useState<{
    post: InstagramPost | null;
    preview: PostPreview | null;
  } | null>(null);
  const [account, setAccount] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connectionResult, setConnectionResult] = useState<
    "connected" | "failed" | "state-invalid" | null
  >(null);
  const [connectionReason, setConnectionReason] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const id = useId();
  const intent = useIntentKey();
  const [disconnectConfirm, setDisconnectConfirm] = useState(false),
    [pendingAcknowledged, setPendingAcknowledged] = useState(false),
    [disconnectOperation, setDisconnectOperation] =
      useState<PublicationOperation | null>(null);
  const available = !!overview && !unavailable;
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("publication") ===
      "settings"
    )
      setSection("settings");
    const url = new URL(window.location.href);
    const result = url.searchParams.get("connection");
    if (
      result === "connected" ||
      result === "failed" ||
      result === "state-invalid"
    )
      setConnectionResult(result);
    const reason = url.searchParams.get("connectionReason");
    if (reason) setConnectionReason(reason);
    if (result) {
      url.searchParams.delete("connection");
      url.searchParams.delete("connectionReason");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getInstagramOverview(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setOverview(value);
          setUnavailable(false);
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setOverview(null);
        const missing =
          cause instanceof ApiError &&
          (cause.status === 404 || cause.code === "FEATURE_UNAVAILABLE");
        setUnavailable(missing);
        if (!missing) setError(r1Error(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);
  function selectSection(next: "posts" | "settings") {
    setSection(next);
    const url = new URL(window.location.href);
    if (next === "settings") url.searchParams.set("publication", "settings");
    else url.searchParams.delete("publication");
    window.history.replaceState(null, "", url);
  }
  function choose(value: Omit<PostPreview, "caption">) {
    setPicker(false);
    setDetail({
      post: null,
      preview: {
        ...value,
        caption: buildCaption(
          value.source,
          overview?.settings ?? PREVIEW_SETTINGS,
        ),
      },
    });
  }
  async function connect() {
    if (!overview?.capabilities.canConnect || connecting) return;
    setConnecting(true);
    setConnectionError("");
    try {
      const data = await getInstagramAuthorization();
      if (Date.parse(data.expiresAt) <= Date.now())
        throw new Error(
          "Tautan otorisasi sudah kedaluwarsa. Mulai koneksi kembali.",
        );
      const url = new URL(data.authorizationUrl);
      if (
        url.protocol !== "https:" ||
        ![
          "www.facebook.com",
          "facebook.com",
          "www.instagram.com",
          "api.instagram.com",
        ].includes(url.hostname)
      )
        throw new Error(
          "Tautan otorisasi Instagram belum valid. Hubungi pengelola SAP.",
        );
      window.location.assign(url.href);
    } catch (cause) {
      setConnectionError(
        cause instanceof Error
          ? cause.message
          : "Akun belum dapat dihubungkan.",
      );
      setConnecting(false);
    }
  }
  async function disconnect() {
    setConnecting(true);
    setConnectionError("");
    try {
      const operation = await disconnectInstagram(
        pendingAcknowledged,
        intent({ action: "disconnect", pendingAcknowledged }),
      );
      setDisconnectOperation(operation);
      setDisconnectConfirm(false);
    } catch (cause) {
      setConnectionError(r1Error(cause));
    } finally {
      setConnecting(false);
    }
  }
  return (
    <div className={styles.page}>
      <header data-motion="heading" className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>
            <CircleDot size={13} />
            {t("ADMIN · PUBLIKASI")}</span>
          <h1>{t("Publikasi Instagram")}</h1>
          <p>{t("Kelola publikasi dari foto laporan dan hasil scan.")}</p>
          <button
            className={styles.connectionPill}
            type="button"
            onClick={() => {
              setAccount(true);
              setConnectionError("");
            }}
          >
            <Instagram size={19} />
            <strong>
              {overview?.account.username
                ? `@${overview.account.username}`
                : t("Akun Instagram")}
            </strong>
            <span className={styles.connectionSeparator} />
            <span>
              <i data-connected={overview?.account.status === "connected"} />
              {loading
                ? t("Memuat…")
                : overview?.account.status === "connected"
                  ? t("Terhubung")
                  : overview?.account.status === "expired"
                    ? t("Perlu dihubungkan ulang")
                    : overview?.account.status === "needs_action"
                      ? t("Perlu tindakan")
                      : t("Belum terhubung")}
            </span>
          </button>
        </div>
        <button
          className={styles.primary}
          type="button"
          disabled={!available || !overview?.capabilities.canCreateDraft}
          onClick={() => setPicker(true)}
        >
          <Plus size={20} />
          {t("Pilih laporan")}</button>
      </header>
      {connectionResult && (
        <Notice warning={connectionResult !== "connected"}>
          <strong>
            {connectionResult === "connected"
              ? t("Akun Instagram berhasil dihubungkan.")
              : connectionResult === "state-invalid"
                ? t("Permintaan login kedaluwarsa atau sudah pernah digunakan.")
                : t(connectionFailure(connectionReason).title)}
          </strong>
          <p>
            {connectionResult === "connected"
              ? t("SAP sudah menerima akun publikasi. Muat ulang informasi akun bila status belum berubah.")
              : connectionResult === "state-invalid"
                ? t("Mulai lagi dari tombol Hubungkan akun. Jangan membuka ulang URL callback dari percobaan sebelumnya.")
                : t(connectionFailure(connectionReason).message)}
          </p>
          {connectionResult !== "connected" && (
            <button
              className={styles.textButton}
              type="button"
              onClick={() => setAccount(true)}
            >
              {t("Coba hubungkan lagi")}<ArrowRight size={15} />
            </button>
          )}
        </Notice>
      )}
      <div
        className={styles.tabs}
        role="tablist"
        aria-label={t("Publikasi Instagram")}
        onKeyDown={(event) => {
          if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "posts"
                : event.key === "End"
                  ? "settings"
                  : section === "posts"
                    ? "settings"
                    : "posts";
            selectSection(next);
            document.getElementById(`${id}-tab-${next}`)?.focus();
          }
        }}
      >
        <button
          id={`${id}-tab-posts`}
          role="tab"
          type="button"
          aria-selected={section === "posts"}
          aria-controls={`${id}-posts`}
          tabIndex={section === "posts" ? 0 : -1}
          onClick={() => selectSection("posts")}
        >
          <FileTextIcon />
          {t("Postingan")}</button>
        <button
          id={`${id}-tab-settings`}
          role="tab"
          type="button"
          aria-selected={section === "settings"}
          aria-controls={`${id}-settings`}
          tabIndex={section === "settings" ? 0 : -1}
          onClick={() => selectSection("settings")}
        >
          {t("Pengaturan postingan")}</button>
      </div>
      {unavailable && !loading && (
        <Notice warning>
          <strong>{t("Publikasi Instagram belum diaktifkan")}</strong>
          <p>
            {t("Pengelola perlu menyiapkan layanan R1. Penyimpanan, persetujuan, dan publish belum tersedia.")}</p>
        </Notice>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <strong>{t("Informasi publikasi belum tersedia")}</strong>
          <p>{t(error)}</p>
          <button type="button" onClick={refresh}>
            <RefreshCw size={16} />
            {t("Coba lagi")}</button>
        </div>
      )}
      {savedMessage && (
        <p className={styles.success} role="status">
          <CheckCircle2 size={18} />
          {savedMessage}
        </p>
      )}
      <div
        id={`${id}-posts`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-posts`}
        hidden={section !== "posts"}
        className={styles.tabPanel}
      >
        <PublicationList
          overview={overview}
          available={available}
          loadingOverview={loading}
          reloadKey={reloadKey}
          onChoose={() => setPicker(true)}
          onOpen={(post) => setDetail({ post, preview: null })}
          onRefresh={refresh}
        />
      </div>
      <div
        id={`${id}-settings`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-settings`}
        hidden={section !== "settings"}
        className={styles.tabPanel}
      >
        {loading && !overview ? (
          <div className={styles.busy} role="status">
            <LoaderCircle size={22} className={styles.spin} />
            {t("Memuat pengaturan…")}</div>
        ) : (
          <PublicationSettingsPanel
            key={overview?.settings.revision ?? "preview"}
            overview={overview}
            available={available}
            onSaved={() => {
              setSavedMessage("Pengaturan publikasi tersimpan.");
              refresh();
            }}
            onAccount={() => setAccount(true)}
            onBack={() => selectSection("posts")}
          />
        )}
      </div>
      {picker && (
        <ReportPicker
          categories={categories}
          onClose={() => setPicker(false)}
          onChoose={choose}
          onModeration={onModeration}
        />
      )}
      {detail && (
        <PublicationDetail
          key={detail.post?.id ?? detail.preview?.source.mediaId}
          post={detail.post}
          preview={detail.preview}
          overview={overview}
          available={available}
          onClose={() => setDetail(null)}
          onChanged={refresh}
          onSettings={() => {
            setDetail(null);
            selectSection("settings");
          }}
          onReport={onModeration}
        />
      )}
      {account && (
        <DialogShell
          title={t("Akun Instagram")}
          subtitle={t("Tujuan publikasi SAP.")}
          onClose={() => setAccount(false)}
          busy={connecting}
          footer={
            <button
              className={styles.primary}
              type="button"
              onClick={() => void connect()}
              disabled={
                !available || !overview?.capabilities.canConnect || connecting
              }
            >
              {connecting ? (
                <LoaderCircle className={styles.spin} size={18} />
              ) : (
                <Instagram size={18} />
              )}
              {overview?.account.status === "connected"
                ? t("Hubungkan ulang akun")
                : t("Hubungkan akun")}
              <ArrowRight size={17} />
            </button>
          }
        >
          <div className={styles.connectionArt}>
            <Instagram size={46} />
            <h3>
              {overview?.account.username
                ? `@${overview.account.username}`
                : t("Hubungkan akun publikasi SAP")}
            </h3>
            <p>
              {overview?.account.status === "connected"
                ? t("Akun terhubung ke layanan publikasi.")
                : t("Akun diperlukan untuk menerbitkan foto dan caption ke Instagram.")}
            </p>
          </div>
          <Notice>
            <ShieldCheck size={19} className={styles.inlineIcon} />
            {available && overview?.capabilities.canConnect
              ? t("Lanjutkan melalui halaman otorisasi resmi Meta. Kata sandi dan token tidak dimasukkan di SAP.")
              : t("Koneksi akun belum diaktifkan oleh pengelola. Foto laporan tetap tersedia untuk ditinjau.")}
          </Notice>
          {overview?.account.status === "connected" && (
            <p className={styles.success}>
              <CheckCircle2 size={18} />
              {t("Terhubung")}</p>
          )}
          {overview &&
            Object.entries(overview.capabilityReasons)
              .filter(([, reason]) => reason)
              .map(([capability, reason]) => (
                <p key={capability} className={styles.helper}>
                  {t(permissionReason(reason))}
                </p>
              ))}
          {overview && overview.account.status !== "disconnected" && (
            <button
              className={styles.secondary}
              disabled={connecting}
              onClick={() => setDisconnectConfirm(true)}
            >
              {t("Putuskan koneksi akun")}</button>
          )}
          {disconnectConfirm && (
            <div className={styles.confirmation}>
              <strong>{t("Putuskan koneksi Instagram?")}</strong>
              <p>
                {t("Penarikan yang masih berjalan mungkin memerlukan tindakan manual.")}</p>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={pendingAcknowledged}
                  onChange={(e) => setPendingAcknowledged(e.target.checked)}
                />
                {t("Saya memahami penarikan yang tertunda dapat memerlukan penanganan manual.")}</label>
              <button
                className={styles.secondary}
                disabled={connecting}
                onClick={() => setDisconnectConfirm(false)}
              >
                {t("Kembali")}</button>
              <button
                className={styles.primary}
                disabled={connecting}
                onClick={() => void disconnect()}
              >
                {t("Konfirmasi putus koneksi")}</button>
            </div>
          )}
          {disconnectOperation && (
            <OperationPanel
              id={disconnectOperation.id}
              initial={disconnectOperation}
              onCompleted={refresh}
            />
          )}
          {connectionError && (
            <div className={styles.error} role="alert">
              {t(connectionError)}
            </div>
          )}
        </DialogShell>
      )}
    </div>
  );
}

function FileTextIcon() {
  return <span className={styles.tabDot} aria-hidden="true" />;
}

function connectionFailure(reason: string | null): {
  title: string;
  message: string;
} {
  const failures: Record<string, { title: string; message: string }> = {
    USER_DENIED: {
      title: "Izin Meta belum disetujui.",
      message: "Mulai hubungkan lagi dan setujui permintaan akses akun SAP.",
    },
    META_PERMISSION_REQUIRED: {
      title: "Izin Instagram belum lengkap.",
      message:
        "Pastikan izin instagram_basic, instagram_content_publish, pages_show_list, dan pages_read_engagement diminta dan disetujui.",
    },
    META_PROFESSIONAL_ACCOUNT_REQUIRED: {
      title: "Instagram belum ditemukan pada Facebook Page.",
      message:
        "Pastikan akun Instagram bertipe Professional (Business atau Creator), sudah ditautkan ke Facebook Page, dan akun Facebook yang dipakai memiliki akses ke Page tersebut.",
    },
    META_ACCOUNT_AMBIGUOUS: {
      title: "Ada lebih dari satu akun Instagram yang tertaut.",
      message:
        "Hubungi admin SAP untuk memilih Facebook Page tujuan publikasi.",
    },
    META_RATE_LIMITED: {
      title: "Meta membatasi sementara permintaan ini.",
      message: "Tunggu sebentar, lalu coba hubungkan lagi.",
    },
    META_RESPONSE_UNCERTAIN: {
      title: "SAP belum menerima jawaban dari Meta.",
      message:
        "Periksa koneksi internet lalu coba lagi. Jika berulang, kirim kode admin di bawah ke pengelola SAP.",
    },
    META_TOKEN_EXPIRED: {
      title: "Token dari Meta sudah kedaluwarsa.",
      message:
        "Mulai ulang proses Hubungkan akun agar Meta memberikan token baru.",
    },
    META_TOKEN_INVALID: {
      title: "Meta tidak memberikan token yang dapat digunakan.",
      message:
        "Coba hubungkan ulang. Jika gagal lagi, kirim kode admin di bawah ke pengelola SAP.",
    },
    META_CODE_MISSING: {
      title: "Meta tidak mengirim kode izin.",
      message: "Mulai ulang proses Hubungkan akun.",
    },
    META_CONFIGURATION_REQUIRED: {
      title: "Konfigurasi Meta di SAP belum lengkap.",
      message: "Hubungi pengelola SAP dan kirim kode admin di bawah.",
    },
    META_VERSION_INVALID: {
      title: "Versi Graph API SAP tidak valid.",
      message: "Hubungi pengelola SAP dan kirim kode admin di bawah.",
    },
    META_REQUEST_FAILED: {
      title: "Meta menolak permintaan koneksi.",
      message:
        "Coba lagi. Jika gagal lagi, kirim kode admin di bawah agar pengelola bisa memeriksa izin dan konfigurasi Meta.",
    },
  };
  return (
    failures[reason ?? ""] ?? {
      title: "Meta belum berhasil menghubungkan akun.",
      message: reason
        ? "Kirim kode admin di bawah ke pengelola SAP agar penyebabnya bisa diperiksa."
        : "Coba hubungkan lagi. Jika gagal, pengelola SAP perlu memeriksa log koneksi Meta.",
    }
  );
}
