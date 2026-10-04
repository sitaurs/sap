import { useSyncExternalStore } from "react";

const query = "(max-width: 760px)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;
export function useMobileNavigation() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
