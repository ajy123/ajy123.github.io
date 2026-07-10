import { type CSSProperties, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { toggleTheme, useTheme } from "../theme";
import { KeyLogo } from "./KeyLogo";
import { GridLogo } from "./GridLogo";

/**
 * SiteLogo — the logo IS the theme switch. One <button role="switch"> hosts the
 * whole affordance and all a11y semantics; the mark inside (KeyLogo or
 * GridLogo) is aria-hidden art. Variant is chosen once from localStorage
 * ("logo-variant", default "grid") for dev preview persistence, and can be
 * overridden live by LogoDials in development.
 *
 * Interaction rules (carried from the lamp spec §2):
 *  - state flips on every activation; N clicks = N flips (interruptibility).
 *  - first press gets the choreography; spam (<400ms since last) collapses to a
 *    plain retarget: deferMs 0, no spring on the key / no sweep on the grid.
 *  - the token flip is deferred ~60ms (deferMs) so the press reads as the cause
 *    of the theme change (lamp→room causality); reduced motion flips at t=0.
 *  - ambient changes never reach this handler, so they never animate the mark.
 */
export type LogoVariant = "key" | "grid";

export interface KeyDials {
  travel: number;
  pressMs: number;
  releaseMs: number;
  radius: number;
  legend: number;
}

export interface GridDials {
  cellGap: number;
  sweepPerCell: number;
  forceFallback: boolean;
  /** Thinking shimmer (LLM busy): breath period, floor opacity, wave stagger. */
  shimmerMs: number;
  shimmerMin: number;
  shimmerPerCell: number;
  forceThinking: boolean;
}

export interface LogoDialsValues {
  key: KeyDials;
  grid: GridDials;
}

export const DEFAULT_LOGO_DIALS: LogoDialsValues = {
  key: {
    travel: 4,
    pressMs: 34, // ≤40ms press-down (research: ~2 frames)
    releaseMs: 420, // springy release, 250–600ms
    radius: 8, // outer radius ≈ 1/5 of the 40px key
    legend: 10, // small upper-left legend; larger reads as a generic button
  },
  grid: {
    cellGap: 2.5,
    sweepPerCell: 22, // 6 max diagonal steps × 22 + flip ≈ ≤300ms total
    forceFallback: false,
    shimmerMs: 1500, // slow breath — status light, not spinner urgency
    shimmerMin: 0.55, // shallow dip: below ~0.5 the mark reads disabled/dead
    shimmerPerCell: 40, // 6 steps × 40 = 240ms lag — near-unison breath, not conveyor
    forceThinking: false,
  },
};

// GitHub handle powering the live grid — same account the rail's ContribGraph
// reads (repo is ajy123.github.io). Shared fetch dedupes to one request.
const CONTRIB_USER = "ajy123";

const SPAM_WINDOW_MS = 400;
const DEFER_MS = 60;
// Cover the deferred flip + the full diagonal wave before clearing sweep state.
const SWEEP_HOLD_MS = 460;
const SPAM_HOLD_MS = 220;

function readVariant(): LogoVariant {
  try {
    return localStorage.getItem("logo-variant") === "key" ? "key" : "grid";
  } catch {
    return "grid";
  }
}

export function SiteLogo({
  variant: variantProp,
  dials = DEFAULT_LOGO_DIALS,
}: {
  variant?: LogoVariant;
  dials?: LogoDialsValues;
}) {
  const dark = useTheme() === "dark";
  const reduced = useReducedMotion() ?? false;
  // Dev (LogoDials) drives variant via prop; prod reads localStorage once.
  const [storedVariant] = useState<LogoVariant>(readVariant);
  const variant = variantProp ?? storedVariant;

  const [sweep, setSweep] = useState(false);
  const [spam, setSpam] = useState(false);
  // Enter/touch press-visual parity: :active only fires for pointer+Space, so
  // Enter (and iOS touch) get no press unless we drive a data-pressed state.
  const [pressed, setPressed] = useState(false);
  const lastToggleRef = useRef(0);
  const sweepTimerRef = useRef<number | null>(null);
  const spamTimerRef = useRef<number | null>(null);

  const activate = () => {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const isSpam = now - lastToggleRef.current < SPAM_WINDOW_MS;
    lastToggleRef.current = now;

    // Choreography only on a fresh, full-motion press; spam/reduced/ambient get
    // the plain path (deferMs 0, uniform crossfade / no spring).
    const choreograph = !isSpam && !reduced;
    // The key has a press-down that carries the ~60ms causal beat; the grid has
    // no press, so a defer there is pure latency — flip immediately for it.
    const deferMs = choreograph ? (variant === "key" ? DEFER_MS : 0) : 0;
    toggleTheme({ source: "user", deferMs });

    if (variant === "grid") {
      if (sweepTimerRef.current !== null)
        window.clearTimeout(sweepTimerRef.current);
      setSweep(choreograph);
      if (choreograph) {
        sweepTimerRef.current = window.setTimeout(
          () => setSweep(false),
          SWEEP_HOLD_MS,
        );
      }
    } else if (isSpam) {
      // Key: mark the release as spring-less for the duration of the burst.
      if (spamTimerRef.current !== null)
        window.clearTimeout(spamTimerRef.current);
      setSpam(true);
      spamTimerRef.current = window.setTimeout(
        () => setSpam(false),
        SPAM_HOLD_MS,
      );
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title="Dark mode"
      className="site-logo"
      data-logo-variant={variant}
      data-motion={reduced ? "reduced" : "full"}
      data-spam={spam ? "1" : undefined}
      data-pressed={pressed ? "true" : undefined}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter") setPressed(true);
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter") setPressed(false);
      }}
      onBlur={() => setPressed(false)}
      // Empty touch handler unlocks CSS :active on iOS Safari.
      onTouchStart={() => {}}
      style={{ "--keylogo-travel": `${dials.key.travel}px` } as CSSProperties}
    >
      {variant === "key" ? (
        <KeyLogo dials={dials.key} />
      ) : (
        <GridLogo user={CONTRIB_USER} dials={dials.grid} sweep={sweep} />
      )}
    </button>
  );
}
