import { useEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import { useContribDays } from "../contribData";
import { useLlmBusy } from "../llmActivity";
import type { GridDials } from "./SiteLogo";

/**
 * Direction B — "The Living Grid". A 4×4 activity grid in the exact cell
 * language of the rail's ContribGraph (same --contrib-0..4 ramp, same radius
 * token) — the logo and the rail graph are the same species by construction.
 *
 * Live: the trailing GitHub window the rail already fetches (shared via
 * src/contribData — never a second request); the mark is literally "Joanna,
 * lately." Fallback: a deterministic designed density study (corners quiet, a
 * diagonal ridge through the centre) — intentional, not random.
 *
 * Toggle sweep is CSS-only: cells carry per-cell transition-delay so the theme
 * token flip (--contrib-* swapping) animates itself as a top-left→bottom-right
 * wave. When `sweep` is off (ambient change, reduced motion, spam) the delays
 * drop to 0 and every cell crossfades uniformly.
 *
 * Thinking shimmer: while the in-page model is generating (CursorChat
 * publishes via src/llmActivity), cells breathe along the same diagonal —
 * contributions at rest, computation at work. Opacity only
 * (compositor-friendly, stays inside the ramp, no layout shift), and the loop
 * is honest: it runs ONLY while work is actually happening — the "no ambient
 * animation loops" rule still holds at rest. Driven by WAAPI, not CSS
 * keyframes, for the exit: Blink does not start a transition from an animated
 * value when an animation is removed (it snaps), so on stop we read the live
 * animated opacity, cancel, freeze it inline, and release it a frame later —
 * the cell's 260ms opacity transition then settles it to full. That settle is
 * the "answer landed" beat. Reduced motion: no shimmer at all (ambient +
 * redundant with the chat panel's own indicator).
 *
 * Art only; the wrapping <button> in SiteLogo carries all switch semantics.
 */

// Designed fallback: corners quiet (0/1), a bright diagonal ridge (4s at the
// centre with a 3-halo) reading top-left→bottom-right. Row-major, 16 cells.
const FALLBACK_LEVELS: ReadonlyArray<0 | 1 | 2 | 3 | 4> = [
  1, 3, 2, 0,
  2, 4, 3, 1,
  1, 3, 4, 2,
  0, 2, 3, 1,
];

const CELLS = 16;
const COLS = 4;
const GRID_SIZE = 32;

export function GridLogo({
  user,
  dials,
  sweep,
}: {
  user: string;
  dials: GridDials;
  sweep: boolean;
}) {
  const days = useContribDays(user);
  const busy = useLlmBusy();
  const reduced = useReducedMotion() ?? false;
  const thinking = (busy || dials.forceThinking) && !reduced;
  const rootRef = useRef<HTMLSpanElement>(null);

  // Shimmer lifecycle. Start: one infinite WAAPI breath per cell, staggered
  // along the row+col diagonal. Stop (effect cleanup): freeze each cell at its
  // current animated opacity, cancel, then clear the inline value next frame
  // so the cell's opacity transition (index.css) eases it back to 1.
  const { shimmerMs, shimmerMin, shimmerPerCell } = dials;
  useEffect(() => {
    const root = rootRef.current;
    if (!thinking || !root || typeof root.animate !== "function") return;
    const cells = Array.from(
      root.querySelectorAll<HTMLElement>(".gridlogo-cell"),
    );
    const animations = cells.map((cell, i) => {
      const diagonal = Math.floor(i / COLS) + (i % COLS);
      return cell.animate(
        [{ opacity: 1 }, { opacity: shimmerMin }, { opacity: 1 }],
        {
          duration: shimmerMs,
          delay: diagonal * shimmerPerCell,
          iterations: Infinity,
          easing: "ease-in-out",
        },
      );
    });
    return () => {
      animations.forEach((animation, i) => {
        const cell = cells[i];
        // Computed opacity still reflects the running animation here.
        const current = getComputedStyle(cell).opacity;
        animation.cancel();
        cell.style.opacity = current;
        requestAnimationFrame(() => {
          cell.style.opacity = "";
        });
      });
    };
  }, [thinking, shimmerMs, shimmerMin, shimmerPerCell]);

  // Live last-16-days levels when the shared data is present and long enough;
  // the designed fallback otherwise (force-toggle overrides for dev preview).
  const liveLevels =
    !dials.forceFallback && days && days.length >= CELLS
      ? days.slice(-CELLS).map((d) => d.level)
      : null;
  // Identity floor — live only when the week can carry the mark. A sparse week
  // (fewer than 6 active cells) collapses the 4×4 identity, so fall back to the
  // designed density instead of rendering a near-empty grid.
  const activeCount = liveLevels
    ? liveLevels.filter((level) => level >= 1).length
    : 0;
  const live = liveLevels && activeCount >= 6 ? liveLevels : null;
  const levels = live ?? FALLBACK_LEVELS;

  const gridGap = dials.cellGap * 0.8;
  const style = {
    "--gridlogo-size": `${GRID_SIZE}px`,
    "--gridlogo-gap": `${gridGap}px`,
  } as CSSProperties;

  return (
    <span
      ref={rootRef}
      className="gridlogo"
      style={style}
      data-sweep={sweep ? "on" : undefined}
      data-thinking={thinking ? "on" : undefined}
      data-source={live ? "live" : "fallback"}
      aria-hidden="true"
    >
      {levels.map((level, i) => {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        // Sweep staggers the theme-flip transition; the shimmer (WAAPI, see
        // effect above) staggers opacity — separate properties, so both can
        // run at once.
        const cellStyle = sweep
          ? ({
              transitionDelay: `${(row + col) * dials.sweepPerCell}ms`,
            } as CSSProperties)
          : undefined;
        return (
          <span
            key={i}
            className="gridlogo-cell"
            data-level={level}
            style={cellStyle}
          />
        );
      })}
    </span>
  );
}
