import { useSyncExternalStore } from "react";

/**
 * Theme store for the lamp-logo light/dark switch.
 *
 * Logical state (current theme, persistence, listener notification) is
 * synchronous. DOM application (data-theme attribute, favicon swap,
 * theme-color meta) can be deferred a few ms so the lamp storyboard's
 * "light comes from the lamp" causality reads correctly — see spec §2/§3.
 */

export type Theme = "light" | "dark";
export type ThemeSource = "user" | "ambient";

export interface SetThemeOptions {
  source?: ThemeSource;
  deferMs?: number;
}

const STORAGE_KEY = "theme";
const CANVAS_LIGHT = "#ffffff";
const CANVAS_DARK = "#0F0E0D";

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // storage denied (private mode, sandboxed iframe) — fall back to ambient.
  }
  return null;
}

function prefersDark(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
  );
}

const storedTheme = readStoredTheme();

let currentTheme: Theme = storedTheme ?? (prefersDark() ? "dark" : "light");
// No stored value → theme follows the OS preference live until the first
// explicit user toggle (tri-state collapse; no reset-to-system UI beyond
// documenting `localStorage.removeItem("theme")`).
let hasExplicitChoice = storedTheme !== null;

const listeners = new Set<() => void>();
let pendingDomTimer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  listeners.forEach((listener) => listener());
}

function applyFavicon(theme: Theme): void {
  const href = theme === "dark" ? "/favicon-dark.svg" : "/favicon-light.svg";
  const existing = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"]',
  );
  // Replace (not mutate href on) the node — more reliable in Chromium, which
  // caches the media-query auto variant against the original element.
  const next = document.createElement("link");
  next.rel = "icon";
  next.type = "image/svg+xml";
  next.href = href;
  if (existing) {
    existing.replaceWith(next);
  } else {
    document.head.appendChild(next);
  }
}

function applyThemeColorMeta(theme: Theme): void {
  const content = theme === "dark" ? CANVAS_DARK : CANVAS_LIGHT;
  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = content;
    document.head.appendChild(meta);
    return;
  }
  metas.forEach((meta) => {
    meta.content = content;
  });
}

function applyDomTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  applyFavicon(theme);
  applyThemeColorMeta(theme);
}

function scheduleDomApply(deferMs: number): void {
  if (pendingDomTimer !== null) {
    clearTimeout(pendingDomTimer);
    pendingDomTimer = null;
  }
  if (deferMs <= 0) {
    applyDomTheme(currentTheme);
    return;
  }
  // Max one pending write: the timer above already cleared any prior one.
  pendingDomTimer = setTimeout(() => {
    pendingDomTimer = null;
    applyDomTheme(currentTheme);
  }, deferMs);
}

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme, opts: SetThemeOptions = {}): void {
  const source = opts.source ?? "user";
  // Ambient changes never carry the causality delay — flicker/warm-up
  // choreography is feedback for a press, not for an unprompted OS/tab flip.
  const deferMs = source === "ambient" ? 0 : (opts.deferMs ?? 0);

  currentTheme = theme;
  if (source === "user") {
    hasExplicitChoice = true;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage denied — logical state still updates, just isn't persisted.
    }
  }
  notify();
  scheduleDomApply(deferMs);
}

export function toggleTheme(opts: SetThemeOptions = {}): void {
  setTheme(currentTheme === "dark" ? "light" : "dark", opts);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "light");
}

// Module init: paint the DOM with whatever theme was resolved above, without
// going through setTheme — no localStorage write, no listener notification.
// (The inline boot script in index.html already applied data-theme before
// this module ever loads; this just brings favicon/theme-color in sync.)
applyDomTheme(currentTheme);

if (typeof window !== "undefined") {
  if (typeof matchMedia === "function") {
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", (event) => {
      if (hasExplicitChoice) return;
      setTheme(event.matches ? "dark" : "light", { source: "ambient" });
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    // Sync hasExplicitChoice from the raw event value rather than
    // re-deriving it — the other tab is the source of truth here, and this
    // path must never re-write localStorage (it's already written there).
    if (event.newValue === "light" || event.newValue === "dark") {
      hasExplicitChoice = true;
      setTheme(event.newValue, { source: "ambient" });
    } else {
      // Cleared in another tab (documented reset-to-system escape hatch).
      hasExplicitChoice = false;
      setTheme(prefersDark() ? "dark" : "light", { source: "ambient" });
    }
  });
}
