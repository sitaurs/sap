"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight, Bell, Camera, Check, Copy, Download, Eye, EyeOff, Info, KeyRound, LoaderCircle, LockKeyhole, LogOut, Mail, Save, Settings, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import {
  beginMfaEnrollment, changePassword, clearApiSession, confirmMfaEnrollment,
  deleteAccount, disableMfa, getMfaStatus, mediaUrl, reauthenticate,
  regenerateMfaRecoveryCodes, setAvatar, uploadMedia,
  type SapMfaEnrollment, type SapMfaStatus, type SapUser,
} from "../lib/api/client";
import styles from "./settings-view.module.css";
import LanguageSettings from "./language-settings";
import { useI18n } from "../lib/i18n/provider";


type Props = {
  email: string;
  displayName: string;
  avatarMediaId: string | null;
  onAvatarChanged: (user: SapUser) => void;
  onSaveProfile: (name: string) => Promise<void>;
  onSignOut: () => void | Promise<void>;
  onAccountDeleted: () => void;
  sapaEnabled: boolean;
  sapaSaving: boolean;
  onToggleSapa: () => void;
};

const messageOf = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function enrollmentSecret(enrollment: SapMfaEnrollment | null) {
  if (!enrollment) return "";
  try {
    const uri = new URL(enrollment.provisioningUri);
    return uri.protocol === "otpauth:" && uri.hostname === "totp" ? uri.searchParams.get("secret") ?? "" : "";
  } catch { return ""; }
}

function CardHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  const { t } = useI18n();
  return <header className={styles.cardHeading}><span className={styles.headingIcon}>{icon}</span><div><h2>{t(title)}</h2><p>{t(description)}</p></div></header>;
}

function Feedback({ error, success }: { error?: string; success?: string }) {
  const { t } = useI18n();
  return <>{error && <p className={styles.error} role="alert">{t(error)}</p>}{success && <p className={styles.success} role="status"><Check size={17} />{t(success)}</p>}</>;
}

function Modal({ title, description, children, onClose, busy = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <dialog data-motion="dialog" ref={dialog} className={styles.modal} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}><button className={styles.closeButton} type="button" aria-label={t("Tutup dialog")} onClick={onClose} disabled={busy}><X size={21} /></button><span className={styles.headingIcon}><ShieldCheck size={28} /></span><h2 id={titleId}>{t(title)}</h2>{description && <p id={descriptionId} className={styles.modalDescription}>{t(description)}</p>}{children}</dialog>;
}

function PasswordField({ label, value, onChange, current = false }: { label: string; value: string; onChange: (value: string) => void; current?: boolean }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <label className={styles.field} htmlFor={id}>{t(label)}<span className={styles.inputWrap}><LockKeyhole size={19} /><input id={id} type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} autoComplete={current ? "current-password" : "new-password"} minLength={current ? undefined : 12} maxLength={128} required /><button className={styles.eyeButton} type="button" onClick={() => setVisible(!visible)} aria-label={`${visible ? t("Sembunyikan") : t("Tampilkan")} ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>;
}

function PasswordChange() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  function close() { if (busy) return; setOpen(false); setCurrent(""); setNext(""); setConfirmation(""); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError("");
    if (next !== confirmation) { setError("Konfirmasi kata sandi belum cocok."); return; }
    if (next === current) { setError("Kata sandi baru harus berbeda dari yang sekarang."); return; }
    setBusy(true);
    try { await changePassword(current, next); setSaved(true); setOpen(false); setCurrent(""); setNext(""); setConfirmation(""); }
    catch (cause) { setError(messageOf(cause, "Kata sandi belum berhasil diperbarui.")); }
    finally { setBusy(false); }
  }
  return <><div className={styles.passwordRow}><span className={styles.smallIcon}><LockKeyhole size={24} /></span><div><h3>{t("Kata sandi")}</h3><p>{t("Gunakan kata sandi yang kuat dan unik.")}</p></div><button className={styles.outlineButton} type="button" onClick={() => { setSaved(false); setOpen(true); }}><KeyRound size={18} />{t("Ganti kata sandi")}</button></div><p className={styles.passwordNote}><Info size={17} />{t("Perangkat lain akan keluar setelah kata sandi diubah.")}</p><Feedback success={saved ? t("Kata sandi diperbarui. Sesi pada perangkat lain telah keluar.") : undefined} />{open && <Modal title={t("Ganti kata sandi")} description={t("Masukkan kata sandi sekarang dan pilih kata sandi baru, minimal 12 karakter.")} onClose={close} busy={busy}><form className={styles.modalForm} onSubmit={submit}><PasswordField label={t("Kata sandi saat ini")} value={current} onChange={setCurrent} current /><PasswordField label={t("Kata sandi baru")} value={next} onChange={setNext} /><PasswordField label={t("Konfirmasi kata sandi baru")} value={confirmation} onChange={setConfirmation} /><Feedback error={t(error)} /><div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={close} disabled={busy}>{t("Batal")}</button><button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? <LoaderCircle className={styles.spinner} size={18} /> : <Save size={18} />}{busy ? t("Memperbarui…") : t("Perbarui kata sandi")}</button></div></form></Modal>}</>;
}

type MfaAction = "enroll" | "regenerate" | "disable";
function MfaSettings() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SapMfaStatus | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [action, setAction] = useState<MfaAction | null>(null);
  const [step, setStep] = useState<"password" | "code">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<SapMfaEnrollment | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      const results = await Promise.allSettled([
        getMfaStatus(abort.signal),
        fetch("/api/settings-capabilities", { signal: abort.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw new Error(); return await response.json() as { mfaAvailable: boolean }; }),
      ]);
      if (abort.signal.aborted) return;
      if (results[0].status === "fulfilled") setStatus(results[0].value);
      else setStatusError(messageOf(results[0].reason, "Status verifikasi dua langkah belum dapat dimuat."));
      if (results[1].status === "fulfilled") setAvailable(results[1].value.mfaAvailable);
      else setStatusError("Ketersediaan verifikasi dua langkah belum dapat dimuat.");
      setLoading(false);
    }
    void load(); return () => abort.abort();
  }, []);
  useEffect(() => {
    let active = true; setQr(null);
    if (enrollment) void import("qrcode").then(module => module.toDataURL(enrollment.provisioningUri, { width: 216, margin: 2, color: { dark: "#075c47", light: "#ffffff" } })).then(value => { if (active) setQr(value); }).catch(() => { /* The provisioning link remains usable when QR rendering fails. */ });
    return () => { active = false; };
  }, [enrollment]);
  const active = status?.status === "active";
  const pending = status?.status === "pending";
  const unavailable = available === false && !active && !pending;
  const manualSecret = enrollmentSecret(enrollment);
  const label = loading ? "Memuat status…" : statusError ? "Status tidak tersedia" : unavailable ? "Belum tersedia" : active ? "Aktif" : pending ? "Penyiapan tertunda" : "Belum aktif";
  function close() { if (busy || copying) return; setAction(null); setStep("password"); setPassword(""); setCode(""); setEnrollment(null); setQr(null); setError(""); setCopied(false); setCopyError(""); }
  function open(next: MfaAction) { close(); setAction(next); }
  function returnToLogin() { if (recoveryCodes && !recoverySaved) return; setRecoveryCodes(null); clearApiSession(); window.location.assign("/login"); }
  async function copyManualSecret() {
    if (!manualSecret || copying) return;
    setCopying(true); setCopied(false); setCopyError("");
    try { await navigator.clipboard.writeText(manualSecret); setCopied(true); }
    catch { setCopyError("Kode belum dapat disalin. Pilih dan salin kode manual yang ditampilkan."); }
    finally { setCopying(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!action || busy) return;
    setBusy(true); setError("");
    try {
      if (step === "password") {
        await reauthenticate(password); setPassword("");
        if (action === "enroll") { setEnrollment(await beginMfaEnrollment()); setStatus({ status: "pending" }); }
        setStep("code");
      } else if (action === "disable") {
        await disableMfa(code); setCode(""); setAction(null); setDisabled(true);
      } else {
        const result = action === "enroll" ? await confirmMfaEnrollment(code) : await regenerateMfaRecoveryCodes(code);
        setRecoverySaved(false); setRecoveryCodes(result.recoveryCodes); setEnrollment(null); setQr(null); setCode(""); setAction(null); setStatus({ status: "active" });
      }
    } catch (cause) { setError(messageOf(cause, "Perubahan verifikasi dua langkah belum berhasil.")); }
    finally { setBusy(false); }
  }
  function downloadRecovery() {
    if (!recoveryCodes) return;
    const url = URL.createObjectURL(new Blob([t("SAP — Kode pemulihan") + "\n" + t("Simpan di tempat aman. Setiap kode hanya dapat digunakan sekali.") + "\n\n" + recoveryCodes.join("\n")], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "sap-kode-pemulihan.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={styles.mfaSection} aria-label={t("Verifikasi dua langkah")}><div className={styles.sectionHeading}><span className={styles.smallIcon}><KeyRound size={24} /></span><h3>{t("Verifikasi dua langkah")}</h3></div><div className={styles.securityInset}><Image src="/images/settings/security-shield.webp" alt="" width={235} height={235} sizes="(max-width: 600px) 150px, 220px" /><div><h4>{t("Aplikasi autentikator")}</h4><p>{t("Tambahkan kode verifikasi saat masuk.")}</p><span className={`${styles.statusBadge} ${active ? styles.statusActive : ""}`} role="status"><span />{t(label)}</span><p className={styles.statusHint}>{unavailable ? t("Fitur ini belum diaktifkan oleh pengelola SAP.") : active ? t("Kode pemulihan hanya ditampilkan saat dibuat.") : pending ? t("Selesaikan atau mulai ulang penyiapan akun Anda.") : t("Saat aktif, gunakan kode autentikator atau kode pemulihan untuk masuk.")}</p></div></div><Feedback error={t(statusError)} />{!loading && !statusError && !unavailable && available !== null && <div className={styles.mfaActions}>{active ? <><button className={styles.outlineButton} type="button" onClick={() => open("regenerate")}>{t("Buat kode pemulihan baru")}</button><button className={styles.dangerLink} type="button" onClick={() => open("disable")}>{t("Nonaktifkan verifikasi dua langkah")}</button></> : <button className={styles.outlineButton} type="button" onClick={() => open("enroll")}>{pending ? t("Mulai ulang penyiapan") : t("Aktifkan verifikasi dua langkah")}</button>}</div>}
    {action && <Modal title={action === "enroll" ? t("Aktifkan verifikasi dua langkah") : action === "regenerate" ? t("Buat kode pemulihan baru") : t("Nonaktifkan verifikasi dua langkah")} description={step === "password" ? t("Masukkan kata sandi untuk memastikan ini memang Anda.") : enrollment ? t("Pindai QR menggunakan aplikasi autentikator, lalu masukkan kode 6 digit.") : t("Masukkan kode 6 digit dari aplikasi autentikator Anda.")} onClose={close} busy={busy || copying}><form className={styles.modalForm} onSubmit={submit}>{step === "password" ? <PasswordField label={t("Kata sandi saat ini")} value={password} onChange={setPassword} current /> : <>{enrollment && <div className={styles.enrollment}>{qr && <Image src={qr} alt={t("QR penyiapan aplikasi autentikator SAP")} width={216} height={216} unoptimized />}<a href={enrollment.provisioningUri}>{t("Buka di aplikasi autentikator")}</a><p>{t("Penyiapan berlaku selama 10 menit. Jangan bagikan QR ini.")}</p>{manualSecret && <details className={styles.manualEntry}><summary>{t("Masukkan kode secara manual")}</summary><div className={styles.manualCode}><code>{manualSecret}</code><button className={styles.outlineButton} type="button" onClick={() => void copyManualSecret()} disabled={copying} aria-label={t("Salin kode manual")} title={t("Salin kode manual")}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div><Feedback error={t(copyError)} success={copied ? t("Kode manual disalin.") : undefined} /></details>}</div>}<label className={styles.field} htmlFor="settings-mfa-code">{t("Kode autentikator")}<input id="settings-mfa-code" className={styles.codeInput} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required /></label></>}<Feedback error={t(error)} /><div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={close} disabled={busy}>{t("Batal")}</button><button className={action === "disable" && step === "code" ? styles.dangerButton : styles.primaryButton} type="submit" disabled={busy}>{busy ? <LoaderCircle className={styles.spinner} size={18} /> : null}{busy ? t("Memverifikasi…") : step === "password" ? t("Lanjutkan") : action === "enroll" ? t("Konfirmasi & aktifkan") : action === "disable" ? t("Nonaktifkan") : t("Buat kode baru")}</button></div></form></Modal>}
    {recoveryCodes && <Modal title={t("Simpan kode pemulihan")} description={t("Kode ini hanya ditampilkan sekali. Simpan di tempat aman di luar SAP; setiap kode hanya dapat digunakan sekali.")} onClose={returnToLogin} busy={!recoverySaved}><p className={styles.recoveryWarning}><Info size={18} />{t("Tanpa aplikasi autentikator atau kode pemulihan, Anda tidak dapat masuk ke akun.")}</p><ul className={styles.recoveryCodes}>{recoveryCodes.map(item => <li key={item}>{item}</li>)}</ul><p className={styles.notice}><Info size={18} />{t("Demi keamanan, sesi telah diakhiri. Masuk kembali setelah menyimpan kode.")}</p><label className={styles.recoveryConfirm}><input type="checkbox" checked={recoverySaved} onChange={event => setRecoverySaved(event.target.checked)} />{t("Saya sudah menyimpan kode di tempat aman.")}</label><div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={downloadRecovery}><Download size={18} />{t("Unduh kode")}</button><button className={styles.primaryButton} type="button" onClick={returnToLogin} disabled={!recoverySaved}>{t("Sudah disimpan, masuk kembali")}</button></div></Modal>}
    {disabled && <Modal title={t("Verifikasi dua langkah dinonaktifkan")} description={t("Perubahan berhasil. Silakan masuk kembali untuk melanjutkan.")} onClose={returnToLogin}><button className={styles.primaryButton} type="button" onClick={returnToLogin}>{t("Masuk kembali")}</button></Modal>}
  </section>;
}

export default function SettingsView(props: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(props.displayName);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarRetry, setAvatarRetry] = useState(0);
  const avatarAttempts = useRef(0);
  const avatarRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarSuccess, setAvatarSuccess] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [queued, setQueued] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => setName(props.displayName), [props.displayName]);
  useEffect(() => {
    avatarAttempts.current = 0;
    setAvatarUrl(null);
    setAvatarFailed(false);
    if (avatarRetryTimer.current) clearTimeout(avatarRetryTimer.current);
  }, [props.avatarMediaId]);
  useEffect(() => {
    if (!props.avatarMediaId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function resolveAvatar() {
      try {
        const result = await mediaUrl(props.avatarMediaId!, abort.signal);
        if (abort.signal.aborted) return;
        setAvatarUrl(result.url);
        setAvatarFailed(false);
        timer = setTimeout(() => void resolveAvatar(), Math.max(15000, new Date(result.expiresAt).getTime() - Date.now() - 30000));
      } catch {
        if (abort.signal.aborted) return;
        setAvatarUrl(null);
        if (avatarAttempts.current < 3) {
          const delay = 1000 * 2 ** avatarAttempts.current++;
          timer = setTimeout(() => void resolveAvatar(), delay);
        } else setAvatarFailed(true);
      }
    }
    void resolveAvatar();
    return () => { abort.abort(); if (timer) clearTimeout(timer); if (avatarRetryTimer.current) clearTimeout(avatarRetryTimer.current); };
  }, [props.avatarMediaId, avatarRetry]);
  function retryAvatar() {
    if (!props.avatarMediaId) return;
    avatarAttempts.current = 0;
    if (avatarRetryTimer.current) clearTimeout(avatarRetryTimer.current);
    setAvatarFailed(false);
    setAvatarUrl(null);
    setAvatarRetry(value => value + 1);
  }
  function avatarImageError() {
    if (avatarRetryTimer.current) clearTimeout(avatarRetryTimer.current);
    if (avatarAttempts.current >= 3) { setAvatarUrl(null); setAvatarFailed(true); return; }
    avatarAttempts.current += 1;
    const delay = 1000 * 2 ** (avatarAttempts.current - 1);
    avatarRetryTimer.current = setTimeout(() => {
      setAvatarUrl(null);
      setAvatarFailed(false);
      setAvatarRetry(value => value + 1);
    }, delay);
  }
  const avatarImage = avatarUrl && !avatarFailed
    ? <Image className={styles.userPhoto} src={avatarUrl} alt={t("Foto profil Anda")} width={160} height={160} unoptimized onError={avatarImageError} />
    : <Image className={styles.defaultAvatar} src="/images/settings/profile-botanical.webp" alt={t("Foto profil Anda")} width={160} height={160} />;
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    if (name.trim().length < 2) { setProfileError("Nama lengkap minimal 2 karakter."); return; }
    setSaving(true); setProfileError(""); setProfileSaved(false);
    try { await props.onSaveProfile(name.trim()); setProfileSaved(true); }
    catch (cause) { setProfileError(messageOf(cause, "Profil belum berhasil disimpan.")); }
    finally { setSaving(false); }
  }
  async function changeAvatar(file: File | null) {
    if (avatarBusy) return;
    setAvatarError(""); setAvatarSuccess("");
    if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setAvatarError("Pilih foto JPEG, PNG, atau WebP."); return; }
    if (file && file.size > 10 * 1024 * 1024) { setAvatarError("Ukuran foto maksimal 10 MB."); return; }
    setAvatarBusy(true);
    try {
      const media = file ? await uploadMedia(file, "avatar") : null;
      const user = await setAvatar(media?.id ?? null);
      props.onAvatarChanged(user); setAvatarSuccess(file ? "Foto profil diperbarui." : "Foto profil dihapus.");
    } catch (cause) { setAvatarError(messageOf(cause, "Foto profil belum berhasil diperbarui.")); }
    finally { setAvatarBusy(false); }
  }
  function closeDelete() { if (deleteBusy) return; if (queued) { props.onAccountDeleted(); return; } setDeleteOpen(false); setDeletePassword(""); setConfirmation(""); setDeleteError(""); }
  async function deleteUser(event: FormEvent) {
    event.preventDefault(); if (deleteBusy || confirmation !== "HAPUS AKUN") return;
    setDeleteBusy(true); setDeleteError("");
    try { await reauthenticate(deletePassword); await deleteAccount(); setQueued(true); setDeletePassword(""); setConfirmation(""); }
    catch (cause) { setDeleteError(messageOf(cause, "Permintaan penghapusan belum berhasil.")); }
    finally { setDeleteBusy(false); }
  }
  async function signOut() { if (signingOut) return; setSigningOut(true); try { await props.onSignOut(); } finally { setSigningOut(false); } }
  return <div className={styles.page}><header data-motion="heading" className={styles.pageHeading}><h1>{t("Pengaturan")}</h1><p>{t("Kelola profil, keamanan, dan preferensi akun SAP.")}</p></header><div className={styles.grid}><LanguageSettings />
    <section className={styles.card}><CardHeading icon={<UserRound size={28} />} title={t("Profil")} description={t("Kelola informasi akun Anda.")} /><h3 className={styles.avatarLabel}>{t("Foto profil")}</h3><div className={styles.avatarRow}><button className={styles.avatarButton} type="button" onClick={() => avatarInput.current?.click()} disabled={avatarBusy} aria-label={t("Ganti foto profil")}>{avatarImage}<span><Camera size={21} /></span></button><div className={styles.avatarInfo}><p>{t("Gunakan foto yang jelas untuk memudahkan identifikasi.")}</p><div className={styles.avatarActions}><button className={styles.outlineButton} type="button" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}>{avatarBusy ? <LoaderCircle className={styles.spinner} size={18} /> : <Camera size={18} />}{avatarBusy ? t("Memproses…") : t("Ganti foto")}</button>{props.avatarMediaId && <button className={styles.textButton} type="button" onClick={() => void changeAvatar(null)} disabled={avatarBusy}>{t("Hapus foto")}</button>}</div><small>{t("JPEG, PNG, WebP · maks. 10 MB")}</small></div></div><input ref={avatarInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void changeAvatar(file); }} /><Feedback error={t(avatarError)} success={t(avatarSuccess)} /><form className={styles.profileForm} onSubmit={saveProfile}><label className={styles.field} htmlFor="settings-name">{t("Nama lengkap")}<span className={styles.inputWrap}><UserRound size={19} /><input id="settings-name" value={name} onChange={event => { setName(event.target.value); setProfileSaved(false); }} minLength={2} maxLength={80} autoComplete="name" required /></span></label><label className={styles.field} htmlFor="settings-email">Email<span className={`${styles.inputWrap} ${styles.readOnly}`}><Mail size={19} /><input id="settings-email" type="email" value={props.email} readOnly aria-readonly="true" /></span><small>{t("Email belum dapat diubah.")}</small></label><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? <LoaderCircle className={styles.spinner} size={18} /> : <Save size={18} />}{saving ? t("Menyimpan…") : t("Simpan perubahan")}</button><Feedback error={t(profileError)} success={profileSaved ? t("Profil berhasil disimpan.") : undefined} /></form></section>
    <section className={styles.card}><CardHeading icon={<ShieldCheck size={28} />} title={t("Keamanan akun")} description={t("Lindungi akun Anda dengan pengaturan keamanan yang tepat.")} /><PasswordChange /><MfaSettings /></section>
    <section className={styles.card}><CardHeading icon={<Bell size={28} />} title={t("Notifikasi laporan")} description={t("Terima pembaruan status dan permintaan bukti tambahan.")} /><p className={styles.statusHint}>{t("Permintaan bukti tambahan dari admin tersedia di Notifikasi. Buka laporan dari notifikasi untuk menambahkan bukti.")}</p><div className={styles.mfaActions}><a className={styles.outlineButton} href="/dashboard?view=notifications">{t("Kelola notifikasi")}<ArrowUpRight size={18} /></a></div></section>
    <section className={styles.card}><CardHeading icon={<LockKeyhole size={26} />} title={t("Privasi laporan")} description={t("Pelajari perlindungan data laporan Anda.")} /><div className={styles.privacyInset}><div><h3>{t("Foto dan koordinat laporan tidak langsung ditampilkan ke publik.")}</h3><p>{t("Peta publik menampilkan ringkasan data terverifikasi.")}</p></div><Image src="/images/settings/privacy-report.webp" alt="" width={210} height={210} sizes="(max-width: 600px) 135px, 200px" /></div></section>
    <section className={styles.card}><CardHeading icon={<Image src="/images/sapa/SAPA_Chat_Avatar.png" alt="" width={44} height={44} />} title={t("Pet SAPA")} description={t("Tampilkan asisten kecil di dashboard.")} /><div className={styles.sapaInset}><Image className={styles.sapaArtwork} src="/images/settings/sapa-welcome.webp" alt="" width={190} height={190} sizes="(max-width: 600px) 135px, 185px" /><div><p>{t("Pet SAPA membantu Anda menemukan informasi, panduan, dan tips selama menggunakan SAP.")}</p><label className={styles.toggleRow}><button className={`${styles.toggle} ${props.sapaEnabled ? styles.toggleOn : ""}`} type="button" role="switch" aria-checked={props.sapaEnabled} aria-label={t("Tampilkan Pet SAPA")} disabled={props.sapaSaving} onClick={props.onToggleSapa}><span /></button><span role="status">{props.sapaSaving ? t("Menyimpan…") : props.sapaEnabled ? t("Aktif") : t("Nonaktif")}</span></label><small>{t("Preferensi tersimpan pada akun Anda.")}</small></div></div></section>
    <section className={`${styles.card} ${styles.accountCard}`}><CardHeading icon={<Settings size={28} />} title={t("Akun")} description={t("Kelola akses akun Anda.")} /><div className={styles.accountRow}><LogOut size={29} /><div><h3>{t("Keluar")}</h3><p>{t("Akhiri sesi pada perangkat ini.")}</p></div><button className={styles.outlineButton} type="button" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? t("Keluar…") : t("Keluar")}</button></div><div className={`${styles.accountRow} ${styles.deleteRow}`}><Trash2 size={28} /><div><h3>{t("Hapus akun")}</h3><p>{t("Penghapusan akun dan data diproses secara permanen.")}</p><small>{t("Memerlukan konfirmasi dan kata sandi.")}</small></div><button className={styles.dangerButton} type="button" onClick={() => setDeleteOpen(true)}>{t("Hapus akun")}</button></div></section>
  </div>{deleteOpen && <Modal title={queued ? t("Permintaan diterima") : t("Hapus akun SAP?")} description={queued ? t("Permintaan penghapusan akun telah diterima dan sedang diproses.") : t("Tindakan ini akan menghapus akun dan data secara permanen. Masukkan kata sandi dan ketik HAPUS AKUN untuk melanjutkan.")} onClose={closeDelete} busy={deleteBusy}>{queued ? <button className={styles.primaryButton} type="button" onClick={props.onAccountDeleted}>{t("Selesai")}</button> : <form className={styles.modalForm} onSubmit={deleteUser}><PasswordField label={t("Kata sandi saat ini")} value={deletePassword} onChange={setDeletePassword} current /><label className={styles.field} htmlFor="settings-delete-confirm">{t("Ketik HAPUS AKUN")}<span className={styles.inputWrap}><input id="settings-delete-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" required /></span></label><Feedback error={t(deleteError)} /><div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={closeDelete} disabled={deleteBusy}>{t("Batal")}</button><button className={styles.dangerButton} type="submit" disabled={deleteBusy || confirmation !== "HAPUS AKUN"}>{deleteBusy ? t("Memproses…") : t("Hapus akun permanen")}</button></div></form>}</Modal>}</div>;
}
