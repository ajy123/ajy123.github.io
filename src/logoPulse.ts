import { getLlmBusy, subscribeLlmBusy } from "./llmActivity";
import type { ContribDay } from "./contribData";

/**
 * Shared "cluster pulse" engine — the living-grid's thinking animation, one
 * scheduler feeding two renderers (GridLogo's DOM cells + faviconPulse's
 * canvas). Same architectural species as theme.ts / llmActivity.ts: a
 * module-level store, no React, no framework.
 *
 * What it models (from the reference video): lit cells arrive as ROAMING
 * CLUSTERS. A seed ignites at a random cell → 1–3 neighbours join into a
 * compact blob (2–4 cells — a small field, so a bigger blob would flood it)
 * → the blob holds → it dissolves → a dark gap → a new seed elsewhere.
 * "Constellation breathing", ~0.8–1.2s per cycle, with the centre brightest
 * and edge cells slightly uneven.
 *
 * Honest loop: the rAF runs ONLY while (there is a subscriber) AND (the LLM is
 * really busy). No subscriber, or busy=false → the loop is cancelled and the
 * engine holds zero timers (the "no ambient animation loops" rule). On stop it
 * emits one final all-zero frame so every renderer clears in lockstep.
 *
 * Output: a Float32Array of CELLS glow values (row-major, 0..1). The array
 * instance is reused and mutated per frame — subscribers must READ it
 * synchronously (write to the DOM / stash the numbers), never retain it as a
 * snapshot.
 */

// Exported: GridLogo (and, transitively, faviconPulse) import these rather
// than hardcoding 3/9 — one source of truth for the mark's grid shape.
export const CELLS = 9;
export const COLS = 3;

// Per-cell ignition stagger inside the grow phase — cells light center-out, a
// few ms apart, so the blob blooms rather than snapping on. Kept small; the
// grow phase clamps late cells so they still finish on time (see computeGlow).
const STAGGER_MS = 30;

// Emit epsilon: skip a frame when no cell moved by at least this much (≈1/256).
// Naturally coalesces the flat gap phase to a single zero emit, not 9/frame.
const EMIT_EPSILON = 1 / 256;

export interface PulseParams {
  /** Blob bloom-in duration (seed→full, center-out stagger). */
  growMs: number;
  /** Full-brightness dwell. */
  holdMs: number;
  /** Blob dissolve duration. */
  fadeMs: number;
  /** Dark beat between one blob dying and the next seeding. */
  gapMs: number;
  /** Smallest blob (cells). Fixed by design at 2 — no dial exposes it. */
  minCells: number;
  /** Largest blob (cells). */
  maxCells: number;
}

// Live tunables — the dev dials mutate these in place (see LogoDials/GridLogo);
// the loop re-reads them every frame, so a dial drag retimes the next phase
// mid-flight. Defaults are the video's measured cadence (~850ms cycle).
// minCells 2 / maxCells 4 are retuned for the 3×3 (9-cell) field — the old
// 4–8 range was sized for 16 cells; an 8-cell blob on 9 cells is a flood, not
// a roaming blob.
export const pulseParams: PulseParams = {
  growMs: 200,
  holdMs: 250,
  fadeMs: 250,
  gapMs: 150,
  minCells: 2,
  maxCells: 4,
};

type PulseCallback = (glow: Float32Array) => void;

interface ClusterMember {
  index: number;
  /** Peak glow for this cell — seed 1.0, edges 0.55–0.85 (video's unevenness). */
  target: number;
  /** Ignition offset inside the grow phase (center-out order × STAGGER_MS). */
  delay: number;
}

interface Cluster {
  seed: number;
  members: ClusterMember[];
}

const subscribers = new Set<PulseCallback>();
const glow = new Float32Array(CELLS);
const lastEmitted = new Float32Array(CELLS);

let busy = getLlmBusy();
let unsubBusy: (() => void) | null = null;
let rafId: number | null = null;
let cluster: Cluster | null = null;
let clusterStart = 0;
let prevSeed = -1;

function rowOf(i: number): number {
  return Math.floor(i / COLS);
}
function colOf(i: number): number {
  return i % COLS;
}
function manhattan(a: number, b: number): number {
  return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));
}

// Smootherstep — zero slope at both ends, so bloom and dissolve ease without a
// visible linear ramp. Cheap, no easing lib needed.
function ease(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// Pick a seed at least 2 Manhattan steps from the last one when we can, so the
// blob visibly RELOCATES rather than flickering in place. A few tries, then
// accept whatever — never spin.
function pickSeed(prev: number): number {
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = Math.floor(Math.random() * CELLS);
    if (prev < 0 || manhattan(s, prev) >= 2) return s;
  }
  return Math.floor(Math.random() * CELLS);
}

function makeCluster(prev: number): Cluster {
  const seed = pickSeed(prev);
  const sr = rowOf(seed);
  const sc = colOf(seed);

  // Seed's in-bounds 3×3 neighbourhood, seed excluded — the blob's candidates.
  const neighbours: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = sr + dr;
      const c = sc + dc;
      if (r < 0 || r >= COLS || c < 0 || c >= COLS) continue;
      neighbours.push(r * COLS + c);
    }
  }

  // How many cells this blob wants, clamped to what actually fits around the
  // seed (corners/edges have fewer neighbours → smaller blobs there, organic).
  const want =
    pulseParams.minCells +
    Math.floor(Math.random() * (pulseParams.maxCells - pulseParams.minCells + 1));
  const size = Math.min(want, 1 + neighbours.length);

  // Fisher–Yates shuffle, then take the first (size-1) neighbours + the seed.
  for (let i = neighbours.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [neighbours[i], neighbours[j]] = [neighbours[j], neighbours[i]];
  }
  const chosen = [seed, ...neighbours.slice(0, size - 1)];

  // Center-out ordering: seed first, then by distance from seed (orthogonal
  // before diagonal). That rank drives the ignition stagger so the blob blooms
  // from its middle. Frozen random tiebreak keeps a given blob stable.
  const ranked = chosen
    .map((index) => ({ index, d: manhattan(index, seed), r: Math.random() }))
    .sort((a, b) => a.d - b.d || a.r - b.r);

  const members: ClusterMember[] = ranked.map((m, rank) => ({
    index: m.index,
    // Seed is the bright center; edge members 0.55–0.85, varied per cell.
    target: m.index === seed ? 1 : 0.55 + Math.random() * 0.3,
    delay: rank * STAGGER_MS,
  }));

  return { seed, members };
}

// Fill `out` with this cluster's glow at time `t` (ms into its cycle).
function computeGlow(c: Cluster, t: number, out: Float32Array): void {
  out.fill(0);
  const { growMs, holdMs, fadeMs } = pulseParams;
  const holdEnd = growMs + holdMs;
  const fadeEnd = holdEnd + fadeMs;

  for (const m of c.members) {
    let g: number;
    if (t < growMs) {
      // Bloom: each cell ignites at its stagger, then ramps to target by the
      // end of the grow window. Clamp late igniters to 70% so even the last
      // ring still has a real (not near-zero) ramp.
      const igniteAt = Math.min(m.delay, growMs * 0.7);
      const ramp = Math.max(growMs - igniteAt, 1);
      g = m.target * ease((t - igniteAt) / ramp);
    } else if (t < holdEnd) {
      g = m.target;
    } else if (t < fadeEnd) {
      g = m.target * (1 - ease((t - holdEnd) / fadeMs));
    } else {
      g = 0; // gap beat
    }
    out[m.index] = g;
  }
}

function emitIfChanged(): void {
  let changed = false;
  for (let i = 0; i < CELLS; i++) {
    if (Math.abs(glow[i] - lastEmitted[i]) >= EMIT_EPSILON) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  lastEmitted.set(glow);
  subscribers.forEach((cb) => cb(glow));
}

function frame(now: number): void {
  if (!cluster) {
    cluster = makeCluster(prevSeed);
    prevSeed = cluster.seed;
    clusterStart = now;
  }

  const t = now - clusterStart;
  computeGlow(cluster, t, glow);
  emitIfChanged();

  const cycle =
    pulseParams.growMs +
    pulseParams.holdMs +
    pulseParams.fadeMs +
    pulseParams.gapMs;
  if (t >= cycle) cluster = null; // next frame reseeds elsewhere

  rafId = requestAnimationFrame(frame);
}

function startLoop(): void {
  if (rafId !== null) return; // already running
  cluster = null; // fresh blob on (re)start
  rafId = requestAnimationFrame(frame);
}

function stopLoop(emitZero: boolean): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  cluster = null;
  if (emitZero) {
    // One honest final frame: everything off, so both renderers settle from
    // the same zero. Skip the change-guard — clearing must always land.
    glow.fill(0);
    lastEmitted.fill(0);
    subscribers.forEach((cb) => cb(glow));
  }
}

function onBusyChange(): void {
  busy = getLlmBusy();
  if (busy && subscribers.size > 0) {
    startLoop();
  } else {
    stopLoop(true);
  }
}

/**
 * Subscribe to the cluster pulse. The engine's loop is live only while at
 * least one subscriber is attached AND the LLM is busy; it self-starts/-stops
 * as either condition flips. Returns an unsubscribe that tears the loop down
 * (and the internal busy listener) once the last subscriber leaves.
 */
export function subscribePulse(cb: PulseCallback): () => void {
  subscribers.add(cb);
  if (subscribers.size === 1) {
    // First subscriber: start watching busy, and start now if already busy.
    busy = getLlmBusy();
    unsubBusy = subscribeLlmBusy(onBusyChange);
    if (busy) startLoop();
  }
  return () => {
    if (!subscribers.delete(cb)) return;
    if (subscribers.size === 0) {
      // Last one out: kill the loop and the busy listener — zero residue at
      // rest. No final zero emit needed; there is no one left to hear it.
      stopLoop(false);
      unsubBusy?.();
      unsubBusy = null;
    }
  };
}

/**
 * Levels-selection helper — the single source of truth for WHICH CELLS levels
 * the mark shows, shared so GridLogo (and, by mirroring its DOM, the favicon)
 * can never drift. Live trailing GitHub window when it's present and carries
 * the identity; the designed fallback otherwise.
 *
 * Density study for the 3×3 field: corners quiet (levels 1–2), a bright
 * center ridge through the middle row/cell (peaking at 4) — designed, not
 * random.
 */
export const FALLBACK_LEVELS: ReadonlyArray<0 | 1 | 2 | 3 | 4> = [
  1, 3, 2, 2, 4, 3, 1, 3, 2,
];

export function selectGridLevels(
  days: ContribDay[] | null,
  forceFallback: boolean,
): ReadonlyArray<0 | 1 | 2 | 3 | 4> {
  const liveLevels =
    !forceFallback && days && days.length >= CELLS
      ? days.slice(-CELLS).map((d) => d.level)
      : null;
  // Identity floor — a sparse window (<4 of 9 active cells) collapses the 3×3
  // mark, so fall back to the designed density rather than render a
  // near-empty grid.
  const activeCount = liveLevels
    ? liveLevels.filter((level) => level >= 1).length
    : 0;
  return liveLevels && activeCount >= 4 ? liveLevels : FALLBACK_LEVELS;
}
