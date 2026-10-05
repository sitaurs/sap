"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { ArrowRight, Brain, ChevronRight, FilePlus2, Map, Recycle, Search, Send, Sparkles, X } from "lucide-react";
import { sendSapaMessage, type SapaCitation, type SapaPageContext, type SapaSuggestedAction } from "./sapa-client";
import SapaSprite from "./sapa-sprite";
import type { SapaActivity, SapaMotion } from "./sapa-motion-data";
import styles from "./sapa-pet.module.css";
import { useI18n } from "../lib/i18n/provider";


export type SapaDashboardTab = "dashboard" | "scan" | "reports" | "map" | "history" | "achievements" | "settings" | "help";

const contextByTab: Record<SapaDashboardTab, SapaPageContext> = {
  dashboard: "dashboard", scan: "scan", reports: "my_reports", map: "areas",
  history: "scan_history", achievements: "achievements", settings: "settings", help: "help",
};
const tabByTarget: Record<SapaPageContext, SapaDashboardTab> = {
  dashboard: "dashboard", scan: "scan", my_reports: "reports", areas: "map",
  scan_history: "history", achievements: "achievements", settings: "settings", help: "help",
};

/**
 * Honest progress labels for the single chat request. These describe the real
 * pipeline the backend runs — read the question, search the knowledge base,
 * then compose the answer — so the copy never claims a step that does not
 * happen. Timing is an estimate: the labels advance forward and hold on the
 * last one until the real reply lands; none of them signals "done".
 */
const SAPA_PHASES = [
  { icon: Brain, label: "Memahami pertanyaan" },
  { icon: Search, label: "Mencari info" },
  { icon: Sparkles, label: "Menyusun jawaban" },
] as const;

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; citations?: SapaCitation[] };
type Position = { x: number; y: number };

const edgeGap = 12;
const launcherSize = (width: number, mobileDock = false) => width <= (mobileDock ? 760 : 600) ? { width: 90, height: 106 } : { width: 112, height: 130 };
const positionKey = (width: number, mobileDock: boolean) => mobileDock && width <= 760 ? "sap-pet-position-mobile" : "sap-pet-position";
function clampPosition(position: Position, width: number, height: number, mobileDock = false): Position {
  const size = launcherSize(width, mobileDock);
  const mobile = mobileDock && width <= 760;
  const dock = mobile ? document.querySelector<HTMLElement>("[data-sap-mobile-dock]") : null;
  const bottomInset = mobile ? (dock ? Math.max(0, height - dock.getBoundingClientRect().top) + 14 : 140) : edgeGap;
  const maxY = Math.max(edgeGap, height - size.height - bottomInset);
  const minY = mobile ? Math.min(84, maxY) : edgeGap;
  return {
    x: Math.min(Math.max(position.x, edgeGap), Math.max(edgeGap, width - size.width - edgeGap)),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

export default function SapaPet({ tab, backendLinked, activity, onNavigate, mobileDock = false }: {
  tab: SapaDashboardTab;
  backendLinked: boolean;
  activity: SapaActivity;
  onNavigate: (tab: SapaDashboardTab) => void;
  mobileDock?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reaction, setReaction] = useState<{ motion: SapaMotion; id: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<SapaSuggestedAction[]>([]);
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const launchRef = useRef<HTMLButtonElement>(null);
  const dockLaunchRef = useRef<HTMLButtonElement>(null);
  const lastLauncher = useRef<"pet" | "dock">("pet");
  const restoreFocus = useRef(false);
  const positionMode = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const reactionSequence = useRef(0);
  const lastAttention = useRef(0);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatController = useRef<AbortController | null>(null);
  const dragStart = useRef<{ pointerId: number; pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
  const latestPosition = useRef<Position | null>(null);
  const suppressClick = useRef(false);
  const docked = mobileDock && viewport.width > 0 && viewport.width <= 760;
  const dragCleanup = useRef<(() => void) | null>(null);

  const react = useCallback((motion: SapaMotion) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setReaction({ motion, id: ++reactionSequence.current });
  }, []);
  const finishReaction = useCallback((id: number) => {
    setReaction(current => current?.id === id ? null : current);
  }, []);
  useEffect(() => {
    if (activity.phase === "success" || activity.phase === "error") react(activity.phase);
    else if (activity.phase === "thinking") setReaction(null);
  }, [activity.id, activity.phase, react]);

  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport({ width, height });
      const key = positionKey(width, mobileDock);
      if (positionMode.current !== key) {
        positionMode.current = key;
        let saved: Position | null = null;
        try {
          const value = JSON.parse(window.localStorage.getItem(key) || "null") as Position | null;
          if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) saved = clampPosition(value, width, height, mobileDock);
        } catch { /* Default corner is used when storage is unavailable. */ }
        setPosition(saved);
      } else {
        setPosition(current => current ? clampPosition(current, width, height, mobileDock) : null);
      }
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, [mobileDock]);

  useEffect(() => () => {
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    dragCleanup.current?.();
    chatController.current?.abort();
  }, []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      (lastLauncher.current === "dock" ? dockLaunchRef : launchRef).current?.focus();
    }
  }, [open]);
  useEffect(() => { if (open) logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages, open, sending, phase]);
  // Advance the progress labels forward while a reply is in flight, then hold on
  // the last one. Estimated timing only — the request itself is a single call.
  useEffect(() => {
    if (!sending) { setPhase(0); return; }
    setPhase(0);
    const toSearch = setTimeout(() => setPhase(1), 500);
    const toCompose = setTimeout(() => setPhase(2), 1400);
    return () => { clearTimeout(toSearch); clearTimeout(toCompose); };
  }, [sending]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function closePanel() {
    restoreFocus.current = true;
    setOpen(false);
  }

  function activate(source: "pet" | "dock" = "pet") {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (open) { closePanel(); return; }
    lastLauncher.current = source;
    setOpen(true);
    react("wave");
  }

  function attention() {
    if (open || dragging || sending || reaction || activity.phase === "thinking") return;
    const now = Date.now();
    if (now - lastAttention.current < 5000) return;
    lastAttention.current = now;
    react("curious");
  }

  // Drag is tracked on `window`, not the button, so movement keeps flowing even
  // when the pointer leaves the small launcher or an idle animation is running —
  // relying on setPointerCapture alone let a single press-and-hold stall after a
  // few pixels. Listeners are added on pointer-down and torn down on release.
  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragCleanup.current?.();
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressClick.current = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerId = event.pointerId;
    dragStart.current = { pointerId, pointerX: event.clientX, pointerY: event.clientY, x: bounds.left, y: bounds.top, moved: false };
    try { event.currentTarget.setPointerCapture(pointerId); } catch { /* Capture is best-effort; window listeners drive the drag. */ }

    const move = (e: PointerEvent) => {
      const start = dragStart.current;
      if (!start || start.pointerId !== e.pointerId) return;
      const dx = e.clientX - start.pointerX;
      const dy = e.clientY - start.pointerY;
      if (!start.moved && Math.hypot(dx, dy) < 5) return;
      start.moved = true;
      setDragging(true);
      const next = clampPosition({ x: start.x + dx, y: start.y + dy }, window.innerWidth, window.innerHeight, mobileDock);
      latestPosition.current = next;
      setPosition(next);
    };
    const end = (e: PointerEvent) => {
      const start = dragStart.current;
      if (!start || start.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      dragCleanup.current = null;
      dragStart.current = null;
      setDragging(false);
      if (e.type === "pointercancel") suppressClick.current = true;
      if (start.moved && latestPosition.current) {
        suppressClick.current = true;
        try { window.localStorage.setItem(positionKey(window.innerWidth, mobileDock), JSON.stringify(latestPosition.current)); } catch { /* Drag still works for this visit. */ }
        suppressTimer.current = setTimeout(() => { suppressClick.current = false; }, 120);
      }
    };
    dragCleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function navigate(next: SapaDashboardTab) {
    onNavigate(next);
    closePanel();
  }

  async function sendMessage(value: string) {
    const message = value.trim();
    if (!message || sending) return;
    const id = crypto.randomUUID();
    const controller = new AbortController();
    chatController.current = controller;
    setError("");
    setDraft("");
    setSuggestedActions([]);
    setMessages(current => [...current, { id, role: "user", content: message }]);
    setSending(true);
    try {
      const result = await sendSapaMessage(message, contextByTab[tab], conversationId, controller.signal);
      if (controller.signal.aborted) return;
      setConversationId(result.conversationId);
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.reply, citations: result.citations }]);
      setSuggestedActions(result.suggestedActions);
      react("success");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setMessages(current => current.filter(item => item.id !== id));
      setDraft(message);
      setError(cause instanceof Error ? cause.message : "Pesan belum dapat dikirim.");
      react("error");
    } finally {
      if (!controller.signal.aborted) setSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  const size = launcherSize(viewport.width || 1200, mobileDock);
  const petX = position?.x ?? viewport.width - size.width - (viewport.width <= 600 ? 13 : 24);
  const petY = position?.y ?? viewport.height - size.height - (viewport.width <= 600 ? 13 : 24);
  const panelWidth = Math.min(viewport.width <= 600 ? 354 : 366, Math.max(0, viewport.width - (viewport.width <= 600 ? 26 : 30)));
  const panelLeft = Math.min(Math.max(petX + size.width - panelWidth, edgeGap), Math.max(edgeGap, viewport.width - panelWidth - edgeGap));
  const spaceAbove = petY - 13 - edgeGap;
  const spaceBelow = viewport.height - petY - size.height - 13 - edgeGap;
  const panelBelow = spaceBelow > spaceAbove;
  const panelMaxHeight = Math.max(0, Math.min(viewport.width <= 600 ? 460 : 514, panelBelow ? spaceBelow : spaceAbove));
  const working = sending || activity.phase === "thinking";
  const motion = dragging ? "idle" : working ? "thinking" : reaction?.motion ?? "idle";

  return <><div className={`${styles.root} ${mobileDock ? styles.mobilePetRoot : ""}`} data-sap-mobile-chat={mobileDock || undefined} style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}>
    {open && <section className={`${styles.panel} ${!docked && panelBelow ? styles.panelBelow : ""}`} style={docked ? undefined : { left: panelLeft - petX, right: "auto", maxHeight: panelMaxHeight }} id="sapa-chat-panel" role="dialog" aria-modal="false" aria-labelledby="sapa-chat-title">
      <header className={styles.header}>
        <span className={styles.headerAvatar}><Image src="/images/sapa/SAPA_Chat_Avatar.png" alt="" width={42} height={42} /></span>
        <span className={styles.heading}><strong id="sapa-chat-title">SAPA</strong><small>{t("Asisten SAP")}</small></span>
        <button className={styles.close} type="button" onClick={closePanel} aria-label={t("Minimalkan chat SAPA")}><X size={19} /></button>
      </header>

      <div className={styles.body} ref={logRef}>
        {messages.length === 0 && <>
          <div className={styles.welcome}>
            <Image src="/images/sapa/SAPA_Welcome_Sticker.png" alt={t("SAPA melambaikan tangan")} width={86} height={83} />
            <p>{t("Hai! Aku SAPA.")}<br /><strong>{t("Mau bantu apa hari ini?")}</strong></p>
          </div>
          <div className={styles.quickActions} aria-label={t("Bantuan cepat SAPA")}>
            <button type="button" disabled={sending} onClick={() => void sendMessage(t("Bagaimana cara pilah sampah?"))}><Recycle size={18} /><span>{t("Cara pilah sampah")}</span><ArrowRight size={16} /></button>
            <button type="button" onClick={() => navigate("reports")}><FilePlus2 size={18} /><span>{t("Buat laporan")}</span><ArrowRight size={16} /></button>
            <button type="button" onClick={() => navigate("map")}><Map size={18} /><span>{t("Lihat peta area")}</span><ArrowRight size={16} /></button>
          </div>
        </>}

        {messages.length > 0 && <div className={styles.messages} role="log" aria-label={t("Percakapan SAPA")} aria-live="polite">
          {messages.map(item => item.role === "assistant"
            ? <div className={styles.assistantTurn} key={item.id}>
                <p className={styles.assistantMessage}>{item.content}</p>
                {item.citations && item.citations.length > 0 && <ul className={styles.citations} aria-label={t("Sumber jawaban SAPA")}>
                  {item.citations.map(citation => <li className={styles.citation} key={citation.id}>
                    <span className={styles.citationSource}>{citation.source}</span>
                    <span className={styles.citationTitle}>
                      {citation.url
                        ? <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a>
                        : citation.title}
                    </span>
                    <span className={styles.citationSnippet}>{citation.snippet}</span>
                  </li>)}
                </ul>}
              </div>
            : <p className={styles.userMessage} key={item.id}>{item.content}</p>)}
          {sending && (() => {
            const step = SAPA_PHASES[Math.min(phase, SAPA_PHASES.length - 1)]!;
            const PhaseIcon = step.icon;
            return <p className={styles.pendingMessage} aria-live="polite">
              <PhaseIcon size={15} className={styles.pendingIcon} aria-hidden="true" />
              <span>{t(step.label)}</span>
              <span className={styles.pendingDots} aria-hidden="true"><i /><i /><i /></span>
            </p>;
          })()}
          {suggestedActions.length > 0 && <div className={styles.suggestions}>{suggestedActions.filter(action => action.target in tabByTarget).map(action => <button type="button" key={`${action.target}-${action.label}`} onClick={() => navigate(tabByTarget[action.target])}>{t(action.label)}<ArrowRight size={14} /></button>)}</div>}
        </div>}
      </div>

      <div className={styles.composerArea}>
        {error && <p className={styles.error} role="alert">{t(error)}</p>}
        <form className={styles.composer} onSubmit={submit}>
          <input ref={inputRef} value={draft} maxLength={2000} onChange={event => { setDraft(event.target.value); if (error) setError(""); }} placeholder={t("Tulis pesan untuk SAPA…")} aria-label={t("Pesan untuk SAPA")} />
          <button type="submit" disabled={!draft.trim() || sending} aria-label={t("Kirim pesan ke SAPA")}><Send size={19} /></button>
        </form>
        {!backendLinked && <p className={styles.connectionNote}>{t("Chat AI memerlukan akun backend yang terhubung.")}</p>}
      </div>
    </section>}

    <button ref={launchRef} className={`${styles.launcher} ${dragging ? styles.dragging : ""}`} type="button" onPointerDown={onPointerDown} onPointerEnter={event => { if (event.pointerType === "mouse") attention(); }} onFocus={attention} onClick={() => activate()} onDragStart={event => event.preventDefault()} aria-label={open ? t("Tutup chat SAPA") : t("Buka chat SAPA")} aria-expanded={open} aria-controls="sapa-chat-panel" title={t("{0} chat SAPA · Seret untuk memindahkan", { "0": open ? t("Tutup") : t("Buka") })}>
      <span className={styles.character}><SapaSprite motion={motion} playId={reaction?.id ?? 0} paused={dragging} calm={open} onComplete={finishReaction} /></span>
      <span className={`${styles.petLabel} ${working ? styles.workingLabel : ""}`} aria-hidden="true">{working ? t("AI bekerja") : "SAPA"}</span>
    </button>
  </div>
    {mobileDock && <button ref={dockLaunchRef} type="button" className={styles.mobileDockLauncher} onClick={() => activate("dock")} aria-label={open ? t("Tutup chat SAPA dari navbar") : t("Buka chat SAPA dari navbar")} aria-expanded={open} aria-controls="sapa-chat-panel">
      <Sparkles size={19} aria-hidden="true" />
      <span>{working ? t("SAPA sedang memproses…") : t("SAPA siap membantu")}</span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>}
  </>;
}
