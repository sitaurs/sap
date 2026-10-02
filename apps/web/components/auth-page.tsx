"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, RotateCw, UserRound } from "lucide-react";
import { ApiError, completeMfaLogin, forgotPassword, isMfaLoginRequired, login, register, resendVerification, resetPassword, verifyEmail } from "../lib/api/client";
import styles from "./auth-page.module.css";
import BrandLogo from "./brand-logo";

type Mode = "login" | "signup";
type Stage = "form" | "verify" | "forgot" | "reset" | "mfa";

function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label="SAP, kembali ke beranda">
      <BrandLogo width={250} />
    </Link>
  );
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [stage, setStage] = useState<Stage>("form");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [mfaPreauthToken, setMfaPreauthToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRecoveryMode, setMfaRecoveryMode] = useState(false);

  useEffect(() => {
    if (!isSignup) {
      const savedEmail = window.localStorage.getItem("sap-remembered-email");
      if (savedEmail) {
        setEmail(savedEmail);
        setRemember(true);
      }
    }
  }, [isSignup]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      if (stage === "mfa") {
        await completeMfaLogin(mfaPreauthToken, mfaCode.trim());
        setMfaPreauthToken(""); setMfaCode(""); setMfaRecoveryMode(false);
        if (remember) window.localStorage.setItem("sap-remembered-email", email.trim());
        else window.localStorage.removeItem("sap-remembered-email");
        router.replace("/dashboard"); router.refresh();
      } else if (stage === "verify") {
        await verifyEmail(challengeId, code);
        router.replace("/dashboard"); router.refresh();
      } else if (stage === "forgot") {
        const challenge = await forgotPassword(email.trim());
        setChallengeId(challenge.challengeId); setStage("reset");
        setNotice("Jika email terdaftar, kode pemulihan telah dikirim. Periksa kotak masuk Anda.");
      } else if (stage === "reset") {
        await resetPassword(challengeId, code, password);
        setStage("form"); setCode(""); setPassword("");
        setNotice("Kata sandi diperbarui. Silakan masuk.");
      } else if (isSignup) {
        const challenge = await register(name.trim(), email.trim(), password);
        setChallengeId(challenge.challengeId); setStage("verify"); setPassword("");
        setNotice("Kode verifikasi telah dikirim ke email Anda.");
      } else {
        const result = await login(email.trim(), password);
        if (isMfaLoginRequired(result)) {
          setMfaPreauthToken(result.preauthToken);
          setMfaCode(""); setMfaRecoveryMode(false); setStage("mfa");
          setPassword("");
          setNotice("Masukkan kode dari aplikasi autentikator atau gunakan kode pemulihan.");
        } else {
          if (remember) window.localStorage.setItem("sap-remembered-email", email.trim());
          else window.localStorage.removeItem("sap-remembered-email");
          router.replace("/dashboard"); router.refresh();
        }
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "EMAIL_UNVERIFIED" && stage === "form" && !isSignup) {
        try {
          const challenge = await resendVerification(email.trim());
          setChallengeId(challenge.challengeId); setStage("verify");
          setNotice("Email belum diverifikasi. Kode telah dikirim kembali.");
        } catch (retryCause) { setError(retryCause instanceof Error ? retryCause.message : "Kode belum dapat dikirim."); }
      } else setError(cause instanceof Error ? cause.message : "Permintaan belum berhasil. Coba lagi.");
    } finally { setBusy(false); }
  }

  async function resendCode() {
    if (busy) return;
    setBusy(true); setResendingCode(true); setError(""); setNotice("");
    try { const challenge = stage === "reset" ? await forgotPassword(email.trim()) : await resendVerification(email.trim()); setChallengeId(challenge.challengeId); setCode(""); setNotice("Jika akun memenuhi syarat, kode baru telah dikirim."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Kode belum dapat dikirim."); }
    finally { setBusy(false); setResendingCode(false); }
  }

  const title = stage === "mfa" ? "Verifikasi masuk" : stage === "verify" ? "Verifikasi email" : stage === "forgot" ? "Lupa kata sandi?" : stage === "reset" ? "Atur kata sandi baru" : isSignup ? "Buat akun SAP" : "Selamat datang kembali";
  const intro = stage === "mfa" ? mfaRecoveryMode ? "Masukkan salah satu kode pemulihan yang Anda simpan." : "Masukkan kode 6 digit dari aplikasi autentikator Anda." : stage === "verify" ? `Masukkan enam digit kode yang dikirim ke ${email}.` : stage === "forgot" ? "Masukkan email akun untuk menerima kode pemulihan." : stage === "reset" ? "Masukkan kode dari email dan kata sandi baru." : isSignup ? "Mulai kenali sampah, laporkan penumpukan, dan pantau area." : "Masuk untuk melanjutkan aksi peduli lingkungan.";

  return (
    <main className={`${styles.stage} ${isSignup ? styles.signup : styles.login}`}>
      <div className={styles.browser}>
        <section className={styles.paper} aria-label={title}>
          <div className={styles.formSide}>
            <Brand />
            <div className={styles.formContent}>
              <h1>{title}</h1>
              <p className={styles.intro}>{intro}</p>

              <form className={styles.form} onSubmit={submit}>
                {stage === "form" && isSignup && <div className={styles.fieldGroup}>
                  <label htmlFor="auth-name">Nama lengkap</label>
                  <div className={styles.field}><UserRound size={23} /><input id="auth-name" type="text" autoComplete="name" placeholder="Nama lengkap" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={80} required /></div>
                </div>}

                {(stage === "form" || stage === "forgot") && <div className={styles.fieldGroup}>
                  <label htmlFor="auth-email">Email</label>
                  <div className={styles.field}><Mail size={22} /><input id="auth-email" type="email" autoComplete="email" placeholder="nama@email.com" value={email} onChange={event => setEmail(event.target.value)} required /></div>
                </div>}

                {(stage === "verify" || stage === "reset") && <div className={styles.fieldGroup}>
                  <label htmlFor="auth-code">Kode 6 digit</label>
                  <div className={styles.field}><Mail size={22} /><input id="auth-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required /></div>
                </div>}

                {stage === "mfa" && <div className={styles.fieldGroup}>
                  <label htmlFor="mfa-code">{mfaRecoveryMode ? "Kode pemulihan" : "Kode autentikator 6 digit"}</label>
                  <div className={styles.field}><LockKeyhole size={22} /><input id="mfa-code" type="text" inputMode={mfaRecoveryMode ? "text" : "numeric"} autoComplete="one-time-code" pattern={mfaRecoveryMode ? "[A-Za-z2-7]{5}-?[A-Za-z2-7]{5}" : "[0-9]{6}"} maxLength={mfaRecoveryMode ? 11 : 6} placeholder={mfaRecoveryMode ? "ABCDE-FG234" : "000000"} value={mfaCode} onChange={event => setMfaCode(mfaRecoveryMode ? event.target.value.replace(/[^a-zA-Z2-7-]/g, "").slice(0, 11) : event.target.value.replace(/\D/g, "").slice(0, 6))} required /></div>
                  <button className={styles.textButton} type="button" onClick={() => { setMfaRecoveryMode(value => !value); setMfaCode(""); setError(""); setNotice(""); }}>{mfaRecoveryMode ? "Gunakan kode autentikator" : "Gunakan kode pemulihan"}</button>
                </div>}

                {(stage === "form" || stage === "reset") && <div className={styles.fieldGroup}>
                  <label htmlFor="auth-password">{stage === "reset" ? "Kata sandi baru" : "Kata sandi"}</label>
                  <div className={styles.field}><LockKeyhole size={22} /><input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={stage === "reset" || isSignup ? "new-password" : "current-password"} placeholder={stage === "reset" || isSignup ? "Minimal 12 karakter" : "Kata sandi"} value={password} onChange={event => setPassword(event.target.value)} minLength={stage === "reset" || isSignup ? 12 : 1} maxLength={128} required /><button className={styles.reveal} type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={23} /> : <Eye size={23} />}</button></div>
                </div>}

                {stage === "form" && !isSignup && <div className={styles.options}><label className={styles.remember}><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><span className={styles.customCheck} aria-hidden="true" />Ingat email saya</label><button type="button" className={styles.textButton} onClick={() => { setStage("forgot"); setError(""); setNotice(""); }}>Lupa kata sandi?</button></div>}

                <button className={styles.submit} type="submit" disabled={busy} aria-busy={busy && !resendingCode}>{busy && !resendingCode ? "Memproses…" : stage === "mfa" ? "Verifikasi & masuk" : stage === "verify" ? "Verifikasi & masuk" : stage === "forgot" ? "Kirim kode" : stage === "reset" ? "Simpan kata sandi" : isSignup ? "Daftar" : "Masuk"}</button>
                {stage === "mfa" && <p className={styles.securityNote}>Kunci sementara login ini hanya berlaku untuk menyelesaikan verifikasi.</p>}
                {stage !== "form" && <div className={styles.secondaryActions}>
                  <button className={styles.backAction} type="button" disabled={busy} onClick={() => { const leavingMfa = stage === "mfa"; setStage("form"); setCode(""); setError(""); setNotice(""); if (leavingMfa) { setMfaCode(""); setMfaPreauthToken(""); setMfaRecoveryMode(false); } }}>
                    <ArrowLeft size={20} aria-hidden="true" />
                    <span>{stage === "mfa" ? "Batal dan kembali ke login" : "Kembali"}</span>
                  </button>
                  {stage === "verify" && <button className={styles.resendAction} type="button" disabled={busy} aria-busy={resendingCode} onClick={resendCode}>
                    <RotateCw size={21} className={resendingCode ? styles.resendIconBusy : undefined} aria-hidden="true" />
                    <span>{resendingCode ? "Mengirim…" : "Kirim ulang kode"}</span>
                  </button>}
                </div>}
                {notice && <p className={styles.notice} role="status">{notice}</p>}
                {error && <p className={styles.notice} role="alert">{error}</p>}
              </form>

              {stage === "form" && <p className={styles.switch}>{isSignup ? "Sudah punya akun?" : "Belum punya akun?"} <Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Masuk" : "Daftar"}</Link></p>}
            </div>
          </div>

          <div className={styles.sceneSide}>
            <Image className={styles.scene} src={isSignup ? "/images/auth/signup-scene.webp" : "/images/auth/login-scene.webp"} alt={isSignup ? "Taman kota hijau dengan fasilitas pemilahan sampah dan ponsel pemindai" : "Taman kota hijau dengan ponsel pemindai botol dan tempat sampah terpilah"} fill priority sizes="(max-width: 800px) 100vw, 54vw" />
          </div>
        </section>

      </div>
    </main>
  );
}
