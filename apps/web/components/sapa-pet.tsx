"use client";

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { ArrowRight, FilePlus2, Map, Recycle, Send, X } from "lucide-react";
import { sendSapaMessage, type SapaPageContext, type SapaSuggestedAction } from "./sapa-client";
import styles from "./sapa-pet.module.css";

export type SapaDashboardTab = "dashboard" | "scan" | "reports" | "map" | "history" | "achievements" | "settings" | "help";

const contextByTab: Record<SapaDashboardTab, SapaPageContext> = {
  dashboard: "dashboard", scan: "scan", reports: "my_reports", map: "areas",
  history: "scan_history", achievements: "achievements", settings: "settings", help: "help",
};
const tabByTarget: Record<SapaPageContext, SapaDashboardTab> = {
  dashboard: "dashboard", scan: "scan", my_reports: "reports", areas: "map",
  scan_history: "history", achievements: "achievements", settings: "settings", help: "help",
};

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type Position = { x: number; y: number };

const edgeGap = 12;
const launcherSize = (width: number) => width <= 600 ? 67 : 76;
const clampPosition = (position: Position, width: number, height: number): Position => ({
  x: Math.min(Math.max(position.x, edgeGap), Math.max(edgeGap, width - launcherSize(width) - edgeGap)),
  y: Math.min(Math.max(position.y, edgeGap), Math.max(edgeGap, height - launcherSize(width) - edgeGap)),
});

export default function SapaPet({ tab, backendLinked, onNavigate }: {
  tab: SapaDashboardTab;
  backendLinked: boolean;
  onNavigate: (tab: SapaDashboardTab) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<SapaSuggestedAction[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const launchRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStart = useRef<{ pointerId: number; pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
  const latestPosition = useRef<Position | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport({ width, height });
      setPosition(current => current ? clampPosition(current, width, height) : null);
    };
    updateViewport();
    try {
      const saved = JSON.parse(window.localStorage.getItem("sap-pet-position") || "null") as Position | null;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setPosition(clampPosition(saved, window.innerWidth, window.innerHeight));
      }
    } catch { /* Default corner is used when storage is unavailable. */ }
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => () => { if (animationTimer.current) clearTimeout(animationTimer.current); }, []);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { if (open) logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages, open]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function closePanel() {
    setOpen(false);
    launchRef.current?.focus();
  }

  function activate() {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (open) { closePanel(); return; }
    if (activating) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOpen(true); return; }
    setActivating(true);
    animationTimer.current = setTimeout(() => { setActivating(false); setOpen(true); }, 410);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragStart.current = { pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, x: bounds.left, y: bounds.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.pointerX;
    const dy = event.clientY - start.pointerY;
    if (!start.moved && Math.hypot(dx, dy) < 5) return;
    start.moved = true;
    setDragging(true);
    const next = clampPosition({ x: start.x + dx, y: start.y + dy }, window.innerWidth, window.innerHeight);
    latestPosition.current = next;
    setPosition(next);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragStart.current = null;
    setDragging(false);
    if (start.moved && latestPosition.current) {
      suppressClick.current = true;
      try { window.localStorage.setItem("sap-pet-position", JSON.stringify(latestPosition.current)); } catch { /* Drag still works for this visit. */ }
      window.setTimeout(() => { suppressClick.current = false; }, 120);
    }
  }

  function navigate(next: SapaDashboardTab) {
    onNavigate(next);
    closePanel();
  }

  async function sendMessage(value: string) {
    const message = value.trim();
    if (!message || sending) return;
    const id = crypto.randomUUID();
    setError("");
    setDraft("");
    setSuggestedActions([]);
    setMessages(current => [...current, { id, role: "user", content: message }]);
    setSending(true);
    try {
      const result = await sendSapaMessage(message, contextByTab[tab], conversationId);
      setConversationId(result.conversationId);
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.reply }]);
      setSuggestedActions(result.suggestedActions);
    } catch (cause) {
      setMessages(current => current.filter(item => item.id !== id));
      setDraft(message);
      setError(cause instanceof Error ? cause.message : "Pesan belum dapat dikirim.");
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  const size = launcherSize(viewport.width || 1200);
  const petX = position?.x ?? viewport.width - size - (viewport.width <= 600 ? 13 : 24);
  const petY = position?.y ?? viewport.height - size - (viewport.width <= 600 ? 13 : 32);
  const panelWidth = Math.min(viewport.width <= 600 ? 354 : 366, Math.max(0, viewport.width - (viewport.width <= 600 ? 26 : 30)));
  const panelLeft = Math.min(Math.max(petX + size - panelWidth, edgeGap), Math.max(edgeGap, viewport.width - panelWidth - edgeGap));
  const spaceAbove = petY - 13 - edgeGap;
  const spaceBelow = viewport.height - petY - size - 13 - edgeGap;
  const panelBelow = spaceBelow > spaceAbove;
  const panelMaxHeight = Math.max(0, Math.min(viewport.width <= 600 ? 460 : 514, panelBelow ? spaceBelow : spaceAbove));

  return <div className={styles.root} style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}>
    {open && <section className={`${styles.panel} ${panelBelow ? styles.panelBelow : ""}`} style={{ left: panelLeft - petX, right: "auto", maxHeight: panelMaxHeight }} id="sapa-chat-panel" role="dialog" aria-modal="false" aria-labelledby="sapa-chat-title">
      <header className={styles.header}>
        <span className={styles.headerAvatar}><Image src="/images/sapa/SAPA_Chat_Avatar.png" alt="" width={42} height={42} /></span>
        <span className={styles.heading}><strong id="sapa-chat-title">SAPA</strong><small>Asisten SAP</small></span>
        <button className={styles.close} type="button" onClick={closePanel} aria-label="Minimalkan chat SAPA"><X size={19} /></button>
      </header>

      <div className={styles.body} ref={logRef}>
        {messages.length === 0 && <>
          <div className={styles.welcome}>
            <Image src="/images/sapa/SAPA_Welcome_Sticker.png" alt="SAPA melambaikan tangan" width={86} height={83} />
            <p>Hai! Aku SAPA.<br /><strong>Mau bantu apa hari ini?</strong></p>
          </div>
          <div className={styles.quickActions} aria-label="Bantuan cepat SAPA">
            <button type="button" onClick={() => void sendMessage("Bagaimana cara pilah sampah?")}><Recycle size={18} /><span>Cara pilah sampah</span><ArrowRight size={16} /></button>
            <button type="button" onClick={() => navigate("reports")}><FilePlus2 size={18} /><span>Buat laporan</span><ArrowRight size={16} /></button>
            <button type="button" onClick={() => navigate("map")}><Map size={18} /><span>Lihat peta area</span><ArrowRight size={16} /></button>
          </div>
        </>}

        {messages.length > 0 && <div className={styles.messages} role="log" aria-label="Percakapan SAPA" aria-live="polite">
          {messages.map(item => <p className={item.role === "user" ? styles.userMessage : styles.assistantMessage} key={item.id}>{item.content}</p>)}
          {sending && <p className={styles.pendingMessage}>SAPA sedang menyiapkan jawaban…</p>}
          {suggestedActions.length > 0 && <div className={styles.suggestions}>{suggestedActions.filter(action => action.target in tabByTarget).map(action => <button type="button" key={`${action.target}-${action.label}`} onClick={() => navigate(tabByTarget[action.target])}>{action.label}<ArrowRight size={14} /></button>)}</div>}
        </div>}
      </div>

      <div className={styles.composerArea}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <form className={styles.composer} onSubmit={submit}>
          <input ref={inputRef} value={draft} maxLength={2000} onChange={event => { setDraft(event.target.value); if (error) setError(""); }} placeholder="Tulis pesan untuk SAPA…" aria-label="Pesan untuk SAPA" />
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Kirim pesan ke SAPA"><Send size={19} /></button>
        </form>
        {!backendLinked && <p className={styles.connectionNote}>Chat AI memerlukan akun backend yang terhubung.</p>}
      </div>
    </section>}

    <button ref={launchRef} className={`${styles.launcher} ${!open && !activating && !dragging ? styles.idle : ""} ${activating ? styles.pressed : ""} ${dragging ? styles.dragging : ""}`} type="button" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onClick={activate} aria-label={open ? "Tutup chat SAPA" : "Buka chat SAPA"} aria-expanded={open} aria-controls="sapa-chat-panel" title="Seret untuk memindahkan SAPA">
      <Image src="/images/sapa/SAPA_Chat_Avatar.png" alt="" width={65} height={65} priority />
    </button>
  </div>;
}
