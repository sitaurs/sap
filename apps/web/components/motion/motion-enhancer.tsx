"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const candidates = '[data-motion], [data-motion-scope] section, [data-motion-scope] article, [data-motion-scope] > header';
const overlays = 'dialog, [aria-modal="true"], [data-motion="backdrop"], [data-motion="overlay"]';
const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Progressive enhancement only: no wrappers, hidden content, navigation or API effects. */
export default function MotionEnhancer() {
  const pathname = usePathname();
  useEffect(() => {
    if (!window.IntersectionObserver || !HTMLElement.prototype.animate) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new WeakSet<Element>();
    const observed = new Set<HTMLElement>();
    const active = new Map<HTMLElement, Animation>();
    let disposed = false;

    function settle() {
      for (const animation of active.values()) animation.cancel();
      active.clear();
    }

    const intersection = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting);
      visible.forEach((entry, index) => {
        const element = entry.target as HTMLElement;
        intersection.unobserve(element);
        observed.delete(element);
        if (seen.has(element)) return;
        seen.add(element);
        if (preference.matches || document.hidden || !element.isConnected) return;
        const chart = element.dataset.motion === "chart";
        // Keep form controls in exactly the same place, including during pointer-down/up.
        const form = element.matches("form") || !!element.querySelector("input, textarea, select, [contenteditable]");
        // Individual translate/scale preserve existing CSS transforms (e.g. rotated hero cards).
        const animation = element.animate(chart ? [
          { scale: "0.2 1", opacity: 0.5 }, { scale: "1 1", opacity: 1 },
        ] : form ? [{ opacity: 0.5 }, { opacity: 1 }] : [
          { translate: "0 12px", opacity: 0.5 }, { translate: "0 0", opacity: 1 },
        ], { duration: chart ? 480 : 340, delay: Math.min(index * 35, 175), easing: ease, fill: "backwards" });
        animation.id = "sap-entry";
        active.set(element, animation);
        void animation.finished.then(() => {
          if (active.get(element) === animation) active.delete(element);
          animation.cancel();
        }).catch(() => { /* Navigation, removal or reduced motion cancels safely. */ });
      });
    }, { threshold: 0.08 });

    function register(root: Element) {
      if (disposed) return;
      const elements = [root, ...root.querySelectorAll(candidates)];
      for (const candidate of elements) {
        if (!(candidate instanceof HTMLElement) || !candidate.matches(candidates)) continue;
        if (seen.has(candidate) || observed.has(candidate)) continue;
        if (candidate.closest('[data-motion="off"], [data-motion-ignore], dialog, [aria-modal="true"]')) continue;
        if (["backdrop", "overlay", "dialog", "drawer"].includes(candidate.dataset.motion ?? "")) continue;
        // Animate leaf surfaces, never both a card and its containing panel.
        if (!candidate.dataset.motion && candidate.querySelector("section, article, [data-motion]")) continue;
        // Fixed dialogs must keep their viewport positioning while panels arrive.
        if (candidate.querySelector(overlays)) continue;
        observed.add(candidate);
        intersection.observe(candidate);
      }
    }

    register(document.body);
    const mutations = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes") {
          const scope = record.target as Element;
          // Same DOM may be reused between admin views. Replay only on an actual view change.
          for (const element of [scope, ...scope.querySelectorAll(candidates)]) {
            seen.delete(element);
            const animation = active.get(element as HTMLElement);
            animation?.cancel();
            active.delete(element as HTMLElement);
          }
          register(scope);
        } else {
          for (const node of record.addedNodes) if (node instanceof Element) register(node);
        }
      }
      for (const element of observed) if (!element.isConnected) {
        intersection.unobserve(element);
        observed.delete(element);
      }
      for (const [element, animation] of active) if (!element.isConnected) {
        animation.cancel();
        active.delete(element);
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-motion-view"] });
    const preferenceChanged = () => { if (preference.matches) settle(); };
    const visibilityChanged = () => { if (document.hidden) settle(); };
    preference.addEventListener("change", preferenceChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      disposed = true;
      mutations.disconnect();
      intersection.disconnect();
      observed.clear();
      settle();
      preference.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [pathname]);
  return null;
}
