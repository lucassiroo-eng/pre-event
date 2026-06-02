import { useSyncExternalStore } from "react";

// Global, persistent "hide MRR" toggle.
// Backed by localStorage so the choice survives reloads, and shared across all
// components via a module-level subscribe pattern (no context provider needed).

const KEY = "pre-event-hide-mrr";

let value: boolean = (() => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getHideMrr(): boolean {
  return value;
}

export function setHideMrr(next: boolean) {
  if (next === value) return;
  value = next;
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
  } catch { /* quota */ }
  emit();
}

export function toggleHideMrr() {
  setHideMrr(!value);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Keep tabs in sync if the user opens the dashboard in several windows.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      value = e.newValue === "1";
      emit();
    }
  });
}

export function useHideMrr(): boolean {
  return useSyncExternalStore(subscribe, getHideMrr, getHideMrr);
}
