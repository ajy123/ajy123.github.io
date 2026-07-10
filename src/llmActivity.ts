import { useSyncExternalStore } from "react";

/**
 * LLM activity store — one bit of "is the local model working right now?"
 * shared between CursorChat (the publisher) and ambient listeners (the
 * GridLogo thinking shimmer). Same shape as theme.ts: module store +
 * useSyncExternalStore, so the logo needs no prop path through main.tsx and
 * the contrib data fetch stays untouched.
 *
 * Deliberately a boolean, not a status enum: listeners are ambient signals,
 * and an ambient signal should say "working / not working", nothing finer.
 */

let busy = false;
const listeners = new Set<() => void>();

export function setLlmBusy(next: boolean): void {
  if (next === busy) return;
  busy = next;
  listeners.forEach((listener) => listener());
}

export function getLlmBusy(): boolean {
  return busy;
}

export function subscribeLlmBusy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLlmBusy(): boolean {
  return useSyncExternalStore(subscribeLlmBusy, getLlmBusy, () => false);
}

// DEV: let CDP drivers and the console flip the signal without loading the
// ~350MB model (window.__setLlmBusy(true) → logo shimmer on demand).
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __setLlmBusy?: typeof setLlmBusy }).__setLlmBusy =
    setLlmBusy;
}
