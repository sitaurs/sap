"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { Camera, Check, Download, Eye, EyeOff, Info, KeyRound, LoaderCircle, LockKeyhole, LogOut, Mail, Save, Settings, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import {
  beginMfaEnrollment, changePassword, clearApiSession, confirmMfaEnrollment,
  deleteAccount, disableMfa, getMfaStatus, mediaUrl, reauthenticate,
  regenerateMfaRecoveryCodes, setAvatar, uploadMedia,
  type SapMfaEnrollment, type SapMfaStatus, type SapUser,
} from "../lib/api/client";
import styles from "./settings-view.module.css";

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

function CardHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <header className={styles.cardHeading}><span className={styles.headingIcon}>{icon}</span><div><h2>{title}</h2><p>{description}</p></div></header>;
}

function Feedback({ error, success }: { error?: string; success?: string }) {
  return <>{error && <p className={styles.error} role="alert">{error}</p>}{success && <p className={styles.success} role="status"><Check size={17} />{success}</p>}</>;
}

function Modal({ title, description, children, onClose, busy = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
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
  return <dialog ref={dialog} className={styles.modal} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}><button className={styles.closeButton} type="button" aria-label="Tutup dialog" onClick={onClose} disabled={busy}><X size={21} /></button><span className={styles.headingIcon}><ShieldCheck size={28} /></span><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId} className={styles.modalDescription}>{description}</p>}{children}</dialog>;
}

function PasswordField({ label, value, onChange, current = false }: { label: string; value: string; onChange: (value: string) => void; current?: boolean }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <label className={styles.field} htmlFor={id}>{label}<span className={styles.inputWrap}><LockKeyhole size={19} /><input id={id} type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} autoComplete={current ? "current-password" : "new-password"} minLength={current ? undefined : 12} maxLength={128} required /><button className={styles.eyeButton} type="button" onClick={() => setVisible(!visible)} aria-label={`${visible ? "Sembunyikan" : "Tampilkan"} ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>;
}

function PasswordChange() {
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
  return <><div className={styles.passwordRow}><span className={styles.smallIcon}><LockKeyhole size={24} /></span><div><h3>Kata sandi</h3><p>Gunakan kata sandi yang kuat dan unik.</p></div><button className={styles.outlineButton} type="button" onClick={() => { setSaved(false); setOpen(true); }}><KeyRound size={18} />Ganti kata sandi</button></div><p className={styles.passwordNote}><Info size={17} />Perangkat lain akan keluar setelah kata sandi diubah.</p><Feedback success={saved ? "Kata sandi diperbarui. Sesi pada perangkat lain telah keluar." : undefined} />{open && <Modal title="Ganti kata sandi" description="Masukkan kata sandi sekarang dan pilih kata sandi baru, minimal 12 karakter." onClose={close} busy={busy}><form className={styles.modalForm} onSubmit={submit}><PasswordField label="Kata sandi saat ini" value={current} onChange={setCurrent} current /><PasswordField label="Kata sandi baru" value={next} onChange={setNext} /><PasswordField label="Konfirmasi kata sandi baru" value={confirmation} onChange={setConfirmation} /><Feedback error={error} /><div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={close} disabled={busy}>Batal</button><button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? <LoaderCircle className={styles.spinner} size={18} /> : <Save size={18} />}{busy ? "Memperbarui…" : "Perbarui kata sandi"}</button></div></form></Modal>}</>;
}

type MfaAction = "enroll" | "regenerate" | "disable";
function MfaSettings() {
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
  const label = loading ? "Memuat status…" : statusError ? "Status tidak tersedia" : unavailable ? "Belum tersedia" : active ? "Aktif" : pending ? "Penyiapan tertunda" : "Belum aktif";
  function close() { if (busy) return; setAction(null); setStep("password"); setPassword(""); setCode(""); setEnrollment(null); setQr(null); setError(""); }
  function open(next: MfaAction) { close(); setAction(next); }
  function returnToLogin() { setRecoveryCodes(null); clearApiSession(); window.location.assign("/login"); }
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
    const url = URL.createObjectURL(new Blob(["SAP — Kode pemulihan\nSimpan di tempat aman. Setiap kode hanya dapat digunakan sekali.\n\n" + recoveryCodes.join("\n")], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "sap-kode-pemulihan.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={styles.mfaSection} aria-label="Verifikasi dua langkah"><div className={styles.sectionHeading}><span className={styles.smallIcon}><KeyRound size={24} /></span><h3>Verifikasi dua langkah</h3></div><div className={styles.securityInset}><Image src="/images/settings/security-shield.webp" alt="" width={235} height={235} sizes="(max-width: 600px) 150px, 220px" /><div><h4>Aplikasi autentikator</h4><p>Tambahkan kode verifikasi saat masuk.</p><span className={`${styles.statusBadge} ${active ? styles.statusActive : ""}`} role="status"><span />{label}</span><p className={styles.statusHint}>{unavailable ? "Fitur ini belum diaktifkan oleh pengelola SAP." : active ? "Kode pemulihan hanya ditampilkan saat dibuat." : pending ? "Selesaikan atau mulai ulang penyiapan akun Anda." : "Saat aktif, gunakan kode autentikator atau kode pemulihan untuk masuk."}</p></div></div><Feedback error={statusError} />{!loading && !statusError && !unavailable && available !== null && <div className={styles.mfaActions}>{active ? <><button className={styles.outlineButton} type="button" onClick={() => open("regenerate")}>Buat kode pemulihan baru</button><button className={styles.dangerLink} type="button" onClick={() => open("disable")}>Nonaktifkan verifikasi dua langkah</button></> : <button className={styles.outlineButton} type="button" onClick={() => open("enroll")}>{pending ? "Mulai ulang penyiapan" : "Aktifkan verifikasi dua langkah"}</button>}</div>}
    {action && <Modal title={action === "enroll" ? "Aktifkan verifikasi dua langkah" : action === "regenerate" ? "Buat kode pemulihan baru" : "Nonaktifkan verifikasi dua langkah"} description={step === "password" ? "Masukkan kata sandi untuk memastikan ini memang Anda." : enrollment ? "Pindai QR menggunakan aplikasi autentikator, lalu masukkan kode 6 digit." : "Masukkan kode 6 digit dari aplikasi autentikator Anda."} onClose={close} busy={busy}><form className={styles.modalForm} onSubmit={submit}>{step === "password" ? <PasswordField label="Kata sandi saat ini" value={password} onChange={setPassword} current /> : <>{enrollment && <div className={styles.enrollment}>{qr && <Image src={qr} alt="QR penyiapan aplikasi autentikator SAP" width={216} height={216} unoptimized />}<a href={enrollment.provisioningUri}>Buka di aplikasi autentikator</a><p>Penyiapan berlaku selama 10 menit. Jangan bagikan QR ini.</p></div>}<label className={styles.field} htmlFor="settings-mfa-code">Kode autentikator<input id="settings-mfa-code" className={styles.codeInput} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required /></label></>}<Feedback error={error} /><div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={close} disabled={busy}>Batal</button><button className={action === "disable" && step === "code" ? styles.dangerButton : styles.primaryButton} type="submit" disabled={busy}>{busy ? <LoaderCircle className={styles.spinner} size={18} /> : null}{busy ? "Memverifikasi…" : step === "password" ? "Lanjutkan" : action === "enroll" ? "Konfirmasi & aktifkan" : action === "disable" ? "Nonaktifkan" : "Buat kode baru"}</button></div></form></Modal>}
    {recoveryCodes && <Modal title="Simpan kode pemulihan" description="Kode ini hanya ditampilkan sekali. Simpan di tempat aman di luar SAP; setiap kode hanya dapat digunakan sekali." onClose={returnToLogin} busy={!recoverySaved}><ul className={styles.recoveryCodes}>{recoveryCodes.map(item => <li key={item}>{item}</li>)}</ul><p className={styles.notice}><Info size={18} />Demi keamanan, sesi telah diakhiri. Masuk kembali setelah menyimpan kode.</p><label className={styles.recoveryConfirm}><input type="checkbox" checked={recoverySaved} onChange={event => setRecoverySaved(event.target.checked)} />Saya sudah menyimpan kode di tempat aman.</label><div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={downloadRecovery}><Download size={18} />Unduh kode</button><button className={styles.primaryButton} type="button" onClick={returnToLogin} disabled={!recoverySaved}>Sudah disimpan, masuk kembali</button></div></Modal>}
    {disabled && <Modal title="Verifikasi dua langkah dinonaktifkan" description="Perubahan berhasil. Silakan masuk kembali untuk melanjutkan." onClose={returnToLogin}><button className={styles.primaryButton} type="button" onClick={returnToLogin}>Masuk kembali</button></Modal>}
  </section>;
}

export default function SettingsView(props: Props) {
  const [name, setName] = useState(props.displayName);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
    if (!props.avatarMediaId) { setAvatarUrl(null); return; }
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function resolveAvatar() {
      try {
        const result = await mediaUrl(props.avatarMediaId!, abort.signal);
        if (abort.signal.aborted) return;
        setAvatarUrl(result.url);
        timer = setTimeout(() => void resolveAvatar(), Math.max(30000, new Date(result.expiresAt).getTime() - Date.now() - 30000));
      } catch { if (!abort.signal.aborted) setAvatarUrl(null); }
    }
    void resolveAvatar(); return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [props.avatarMediaId]);
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
  return <div className={styles.page}><header className={styles.pageHeading}><h1>Pengaturan</h1><p>Kelola profil, keamanan, dan preferensi akun SAP.</p></header><div className={styles.grid}>
    <section className={styles.card}><CardHeading icon={<UserRound size={28} />} title="Profil" description="Kelola informasi akun Anda." /><h3 className={styles.avatarLabel}>Foto profil</h3><div className={styles.avatarRow}><button className={styles.avatarButton} type="button" onClick={() => avatarInput.current?.click()} disabled={avatarBusy} aria-label="Ganti foto profil"><Image className={avatarUrl ? styles.userPhoto : styles.defaultAvatar} src={avatarUrl || "/images/settings/profile-botanical.webp"} alt="Foto profil Anda" width={160} height={160} unoptimized={Boolean(avatarUrl)} /><span><Camera size={21} /></span></button><div className={styles.avatarInfo}><h4>Foto profil</h4><p>Gunakan foto yang jelas untuk memudahkan identifikasi.</p><div className={styles.avatarActions}><button className={styles.outlineButton} type="button" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}>{avatarBusy ? <LoaderCircle className={styles.spinner} size={18} /> : <Camera size={18} />}{avatarBusy ? "Memproses…" : "Ganti foto"}</button>{props.avatarMediaId && <button className={styles.textButton} type="button" onClick={() => void changeAvatar(null)} disabled={avatarBusy}>Hapus foto</button>}</div><small>JPEG, PNG, WebP · maks. 10 MB</small></div></div><input ref={avatarInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void changeAvatar(file); }} /><Feedback error={avatarError} success={avatarSuccess} /><form className={styles.profileForm} onSubmit={saveProfile}><label className={styles.field} htmlFor="settings-name">Nama lengkap<span className={styles.inputWrap}><UserRound size={19} /><input id="settings-name" value={name} onChange={event => { setName(event.target.value); setProfileSaved(false); }} minLength={2} maxLength={80} autoComplete="name" required /></span></label><label className={styles.field} htmlFor="settings-email">Email<span className={`${styles.inputWrap} ${styles.readOnly}`}><Mail size={19} /><input id="settings-email" type="email" value={props.email} readOnly aria-readonly="true" /></span><small>Email belum dapat diubah.</small></label><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? <LoaderCircle className={styles.spinner} size={18} /> : <Save size={18} />}{saving ? "Menyimpan…" : "Simpan perubahan"}</button><Feedback error={profileError} success={profileSaved ? "Profil berhasil disimpan." : undefined} /></form></section>
    <section className={styles.card}><CardHeading icon={<ShieldCheck size={28} />} title="Keamanan akun" description="Lindungi akun Anda dengan pengaturan keamanan yang tepat." /><PasswordChange /><MfaSettings /></section>
    <section className={styles.card}><CardHeading icon={<LockKeyhole size={26} />} title="Privasi laporan" description="Pelajari perlindungan data laporan Anda." /><div className={styles.privacyInset}><div><h3>Foto dan koordinat laporan tidak langsung ditampilkan ke publik.</h3><p>Peta publik menampilkan ringkasan data terverifikasi.</p></div><Image src="/images/settings/privacy-report.webp" alt="" width={210} height={210} sizes="(max-width: 600px) 135px, 200px" /></div></section>
    <section className={styles.card}><CardHeading icon={<Image src="/images/sapa/SAPA_Chat_Avatar.png" alt="" width={44} height={44} />} title="Pet SAPA" description="Tampilkan asisten kecil di dashboard." /><div className={styles.sapaInset}><Image className={styles.sapaArtwork} src="/images/settings/sapa-welcome.webp" alt="" width={190} height={190} sizes="(max-width: 600px) 135px, 185px" /><div><p>Pet SAPA membantu Anda menemukan informasi, panduan, dan tips selama menggunakan SAP.</p><label className={styles.toggleRow}><button className={`${styles.toggle} ${props.sapaEnabled ? styles.toggleOn : ""}`} type="button" role="switch" aria-checked={props.sapaEnabled} aria-label="Tampilkan Pet SAPA" disabled={props.sapaSaving} onClick={props.onToggleSapa}><span /></button><span role="status">{props.sapaSaving ? "Menyimpan…" : props.sapaEnabled ? "Aktif" : "Nonaktif"}</span></label><small>Preferensi tersimpan pada akun Anda.</small></div></div></section>
    <section className={`${styles.card} ${styles.accountCard}`}><CardHeading icon={<Settings size={28} />} title="Akun" description="Kelola akses akun Anda." /><div className={styles.accountRow}><LogOut size={29} /><div><h3>Keluar</h3><p>Akhiri sesi pada perangkat ini.</p></div><button className={styles.outlineButton} type="button" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Keluar…" : "Keluar"}</button></div><div className={`${styles.accountRow} ${styles.deleteRow}`}><Trash2 size={28} /><div><h3>Hapus akun</h3><p>Penghapusan akun dan data diproses secara permanen.</p><small>Memerlukan konfirmasi dan kata sandi.</small></div><button className={styles.dangerButton} type="button" onClick={() => setDeleteOpen(true)}>Hapus akun</button></div></section>
  </div>{deleteOpen && <Modal title={queued ? "Permintaan diterima" : "Hapus akun SAP?"} description={queued ? "Permintaan penghapusan akun telah diterima dan sedang diproses." : "Tindakan ini akan menghapus akun dan data secara permanen. Masukkan kata sandi dan ketik HAPUS AKUN untuk melanjutkan."} onClose={closeDelete} busy={deleteBusy}>{queued ? <button className={styles.primaryButton} type="button" onClick={props.onAccountDeleted}>Selesai</button> : <form className={styles.modalForm} onSubmit={deleteUser}><PasswordField label="Kata sandi saat ini" value={deletePassword} onChange={setDeletePassword} current /><label className={styles.field} htmlFor="settings-delete-confirm">Ketik HAPUS AKUN<span className={styles.inputWrap}><input id="settings-delete-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" required /></span></label><Feedback error={deleteError} /><div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={closeDelete} disabled={deleteBusy}>Batal</button><button className={styles.dangerButton} type="submit" disabled={deleteBusy || confirmation !== "HAPUS AKUN"}>{deleteBusy ? "Memproses…" : "Hapus akun permanen"}</button></div></form>}</Modal>}</div>;
}
