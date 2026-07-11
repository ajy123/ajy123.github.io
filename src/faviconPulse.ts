import { getLlmBusy, subscribeLlmBusy } from "./llmActivity";
import { CELLS, COLS, FALLBACK_LEVELS, subscribePulse } from "./logoPulse";

/**
 * Animated favicon — the second renderer of the shared cluster pulse. One
 * engine (src/logoPulse), two surfaces: the header DOM (GridLogo) and this
 * 32×32 canvas painted into the browser-tab icon. While the LLM is busy the
 * tab breathes the same roaming blobs the logo does; when it stops we swap the
 * static /favicon.svg back in.
 *
 * Honest + cheap: no standalone loop. We piggyback on logoPulse's rAF (which
 * itself only runs while busy) and throttle favicon swaps to ~10fps — repaint-
 * ing the tab icon is not free, and 10fps reads as smooth breathing at 16px.
 * Reduced motion: never animate; the static favicon stays.
 *
 * Cell geometry is a 3×3 grid (rendered @2x = 64px) on a transparent
 * background (no tile) — recolored to a favicon-only orange ramp so the busy
 * tab icon reads as an extension of the static cube glyph, not the neutral
 * rail/logo palette. The base levels are read from the logo's own DOM, so the
 * two marks literally cannot drift — the favicon shows whatever the logo
 * resolved (live window or fallback).
 */

// 32px favicon rendered at 2× for crisp retina tabs. All draw coords below are
// scaled-up units for a 3×3 grid filling the 32-unit canvas (cell ~9u, gap
// ~2.5u) × 2, matching the busy-state's smaller, chunkier cell count.
const SIZE = 64;
const CELL_XS = [0, 23, 46]; // svg 0/11.5/23 × 2 (cell 9 + gap 2.5)
const CELL = 18; // svg 9 × 2
const CELL_R = 5; // svg 2.5 × 2

// Favicon swaps throttled to 10fps (100ms). The pulse emits at ~60fps; we
// coalesce to every ~6th frame.
const FRAME_MS = 100;

// Favicon-only orange ramp — recolored off the shared grey contrib ramp so the
// busy tab icon reads as an extension of the cube glyph (same accent family),
// not the neutral rail/logo palette. Levels run pale peach → hot ember.
const RAMP: [string, string, string, string, string] = [
  "#ffe3d5", // level 0 — palest peach
  "#ffc4a3",
  "#ff9866",
  "#f96a24",
  "#d63e00", // level 4 — hot ember
];
const GLOW = "#d63e00"; // ember glow — coherent with the cube's accent family

let initialized = false;
let busy = false;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let levels: ReadonlyArray<number> = FALLBACK_LEVELS;
let latestGlow: Float32Array | null = null;
let lastRenderTs = 0;
let pulseUnsub: (() => void) | null = null;

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  ctx = canvas.getContext("2d");
  return ctx;
}

// Mirror the logo's resolved levels straight off its DOM — the single source of
// truth already picked live-vs-fallback (logoPulse.selectGridLevels), so the
// favicon can't diverge. Fallback design if the logo isn't mounted yet.
function readLevels(): ReadonlyArray<number> {
  const grid = document.querySelector(".gridlogo");
  const cells = grid?.querySelectorAll(".gridlogo-cell");
  if (cells && cells.length === CELLS) {
    const out: number[] = [];
    cells.forEach((c) => out.push(Number(c.getAttribute("data-level")) || 0));
    return out;
  }
  return FALLBACK_LEVELS;
}

function roundRectPath(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof c.roundRect === "function") {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    return;
  }
  // Fallback for older engines without CanvasRenderingContext2D.roundRect.
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function render(): void {
  const c = ctx;
  if (!c) return;

  // Transparent tab icon — no tile, just the bare grid over whatever the tab
  // strip paints behind it.
  c.clearRect(0, 0, SIZE, SIZE);

  // Cells: dimmed idle ramp (0.45, the thinking field) + glow overlay on top —
  // the same "bright blob on a dark field" the logo shows.
  for (let i = 0; i < CELLS; i++) {
    const x = CELL_XS[i % COLS];
    const y = CELL_XS[Math.floor(i / COLS)];
    const level = levels[i] ?? 0;

    c.globalAlpha = 0.45;
    c.fillStyle = RAMP[level] ?? RAMP[0];
    roundRectPath(c, x, y, CELL, CELL, CELL_R);
    c.fill();

    const g = latestGlow ? latestGlow[i] : 0;
    if (g > 0) {
      c.globalAlpha = g > 1 ? 1 : g;
      c.fillStyle = GLOW;
      roundRectPath(c, x, y, CELL, CELL, CELL_R);
      c.fill();
    }
  }
  c.globalAlpha = 1;

  swapFavicon(c.canvas.toDataURL("image/png"));
}

function swapFavicon(dataUrl: string): void {
  const existing = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"]',
  );
  // Replace the node (not mutate href) — Chromium caches the icon against the
  // original <link> element, so mutating href can be ignored. We keep
  // type="image/svg+xml" so restoreStaticFavicon's selector finds and round-
  // trips this exact node; the attribute is advisory and the browser sniffs the
  // (PNG) data URL regardless.
  const next = document.createElement("link");
  next.rel = "icon";
  next.type = "image/svg+xml";
  next.href = dataUrl;
  if (existing) {
    existing.replaceWith(next);
  } else {
    document.head.appendChild(next);
  }
}

// Hand the tab back to the static /favicon.svg. Single owner of the restore
// swap — the animated favicon must round-trip back to exactly one node, not a
// duplicate. Same Chromium caveat as swapFavicon: replace the node, don't
// mutate href.
function restoreStaticFavicon(): void {
  const existing = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"]',
  );
  const next = document.createElement("link");
  next.rel = "icon";
  next.type = "image/svg+xml";
  next.href = "/favicon.svg";
  if (existing) {
    existing.replaceWith(next);
  } else {
    document.head.appendChild(next);
  }
}

function onPulse(glow: Float32Array): void {
  if (!busy) return; // ignore the engine's trailing zero frame after stop
  latestGlow = glow;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastRenderTs < FRAME_MS) return;
  lastRenderTs = now;
  render();
}

function startAnimating(): void {
  if (prefersReducedMotion()) return; // never animate the tab under reduced motion
  if (!ensureCanvas()) return;
  levels = readLevels();
  latestGlow = null;
  lastRenderTs = 0;
  render(); // paint the dimmed "thinking" grid at once, before the first blob
  pulseUnsub = subscribePulse(onPulse);
}

function stopAnimating(): void {
  pulseUnsub?.();
  pulseUnsub = null;
  latestGlow = null;
}

function onBusyChange(): void {
  const next = getLlmBusy();
  if (next === busy) return;
  busy = next;
  if (busy) {
    startAnimating();
  } else {
    // Stop the animation and hand the tab back to the static favicon.
    stopAnimating();
    restoreStaticFavicon();
  }
}

/**
 * Side-effect init, called once from main.tsx (DEV + PROD). Wires the tab icon
 * to the LLM-busy signal; everything else is lazy and torn down at rest.
 */
export function initFaviconPulse(): void {
  if (initialized || typeof document === "undefined") return;
  initialized = true;
  subscribeLlmBusy(onBusyChange);
  if (getLlmBusy()) onBusyChange(); // already busy at init (unlikely, but honest)
}
