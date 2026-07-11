import { GridLogo } from "./GridLogo";

/**
 * SiteLogo — an inert decorative mark. The site is light-only, so the logo no
 * longer switches anything; it renders a plain aria-hidden <span> wrapping the
 * GridLogo art. Identity is carried by the "Joanna Yen" heading beside it, so
 * the mark needs no role, label, or affordance.
 *
 * The GridLogo still runs the LLM cluster pulse (it subscribes to logoPulse and
 * reads useReducedMotion internally) — that lives on entirely, decoupled from
 * the retired theme switch.
 */
export interface GridDials {
  /** Overall mark size in px (the grid is square). */
  size: number;
  cellGap: number;
  /** Cell corner rounding as % of the cell (50 = circle, 0 = square). */
  cellRadius: number;
  /** How hard the idle ramp dims behind the thinking blob (0..1). */
  scrimOpacity: number;
  forceFallback: boolean;
  /** Cluster pulse (LLM busy): per-phase timing + blob ceiling. See logoPulse. */
  pulseGrowMs: number;
  pulseHoldMs: number;
  pulseFadeMs: number;
  pulseGapMs: number;
  pulseMaxCells: number;
  forceThinking: boolean;
}

export type LogoDialsValues = GridDials;

export const DEFAULT_LOGO_DIALS: LogoDialsValues = {
  size: 32,
  // 3×3 cells are bigger than the old 4×4's, so the gap shrinks to match —
  // 2.5 read as a wide moat once cells grew; 1.6 keeps them close-packed.
  cellGap: 1.6,
  // ≈ the cube favicon's chunky rounding, carried into the mark.
  cellRadius: 34,
  scrimOpacity: 0.55,
  forceFallback: false,
  // Cluster pulse cadence — the video's measured ~850ms cycle (grow+hold+
  // fade+gap). minCells is fixed at 2 by design, so it has no dial.
  pulseGrowMs: 200,
  pulseHoldMs: 250,
  pulseFadeMs: 250,
  pulseGapMs: 150,
  pulseMaxCells: 4,
  forceThinking: false,
};

// GitHub handle powering the live grid — same account the rail's ContribGraph
// reads (repo is ajy123.github.io). Shared fetch dedupes to one request.
const CONTRIB_USER = "ajy123";

export function SiteLogo({
  dials = DEFAULT_LOGO_DIALS,
}: {
  dials?: LogoDialsValues;
}) {
  return (
    <span className="site-logo" aria-hidden="true">
      <GridLogo user={CONTRIB_USER} dials={dials} />
    </span>
  );
}
