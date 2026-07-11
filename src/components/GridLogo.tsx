import { useEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import { useContribDays } from "../contribData";
import { useLlmBusy } from "../llmActivity";
import { FALLBACK_LEVELS, pulseParams, selectGridLevels, subscribePulse } from "../logoPulse";
import type { GridDials } from "./SiteLogo";

/**
 * Direction B — "The Living Grid". A bare 3×3 activity grid, in the exact cell
 * language of the rail's ContribGraph (same --contrib-0..4 ramp, same radius
 * token) AND the borderless favicon (same grid) — the logo, the rail graph, and
 * the browser-tab mark are one design by construction.
 *
 * Live: the trailing GitHub window the rail already fetches (shared via
 * src/contribData — never a second request); the mark is literally "Joanna,
 * lately." Fallback: a deterministic designed density study (corners quiet, a
 * bright center ridge) — intentional, not random. The live-vs-fallback choice
 * lives in logoPulse.selectGridLevels so this component and the favicon
 * canvas resolve it identically.
 *
 * Thinking pulse: while the in-page model is generating (CursorChat publishes
 * via src/llmActivity), the grid runs the shared cluster pulse — roaming lit
 * blobs that seed, bloom, hold, dissolve, and relocate (src/logoPulse). We dim
 * the idle ramp (a paper-coloured scrim, ::before) so the bright blob (glow
 * overlay, ::after) reads as a constellation on a dark field, matching the
 * video. Both layers are opacity-only → compositor work, no repaint, no layout.
 * The glow is written to the DOM per frame via refs (no React re-render), and
 * the loop is honest: logoPulse runs ONLY while work is actually happening.
 *
 * Exit ("answer landed"): on thinking→false we clear each cell's --cell-glow;
 * the engine's final all-zero frame has already zeroed the glow overlay, and
 * the scrim's 260ms fade brings the idle ramp back — that settle is the beat.
 * (No WAAPI anymore, so Blink's animation-removal snap is a non-issue: plain
 * inline-value clears + CSS transitions suffice.) Reduced motion: no pulse, no
 * dimming — the idle rendering is untouched.
 *
 * Art only; the wrapping <span> in SiteLogo is an inert, aria-hidden mark.
 */

export function GridLogo({
  user,
  dials,
}: {
  user: string;
  dials: GridDials;
}) {
  const days = useContribDays(user);
  const busy = useLlmBusy();
  const reduced = useReducedMotion() ?? false;
  const thinking = (busy || dials.forceThinking) && !reduced;
  const rootRef = useRef<HTMLSpanElement>(null);

  // Keep the shared engine's tunables synced to the dials. The loop reads
  // pulseParams live every frame, so a dial drag retimes the animation in
  // place. minCells is fixed by design (2) — no dial exposes it.
  useEffect(() => {
    pulseParams.growMs = dials.pulseGrowMs;
    pulseParams.holdMs = dials.pulseHoldMs;
    pulseParams.fadeMs = dials.pulseFadeMs;
    pulseParams.gapMs = dials.pulseGapMs;
    pulseParams.maxCells = dials.pulseMaxCells;
  }, [
    dials.pulseGrowMs,
    dials.pulseHoldMs,
    dials.pulseFadeMs,
    dials.pulseGapMs,
    dials.pulseMaxCells,
  ]);

  // Pulse lifecycle. Subscribe while thinking; write each frame's glow straight
  // to the cells' --cell-glow (drives the ::after overlay's opacity) — no React
  // re-render per frame. On cleanup, clear the inline values so the scrim's
  // CSS transition settles the cells back. The engine only actually emits
  // frames while the LLM is busy (honest loop); forceThinking alone previews
  // the dimmed field — flip window.__setLlmBusy(true) to preview live blobs.
  useEffect(() => {
    const root = rootRef.current;
    if (!thinking || !root) return;
    const cells = Array.from(
      root.querySelectorAll<HTMLElement>(".gridlogo-cell"),
    );
    const unsubscribe = subscribePulse((glow) => {
      for (let i = 0; i < cells.length; i++) {
        cells[i].style.setProperty("--cell-glow", String(glow[i] ?? 0));
      }
    });
    return () => {
      unsubscribe();
      for (const cell of cells) cell.style.removeProperty("--cell-glow");
    };
  }, [thinking]);

  const levels = selectGridLevels(days, dials.forceFallback);
  // FALLBACK_LEVELS is the sentinel selectGridLevels returns when it declines
  // the live window — reuse identity to report the source for tests/dials.
  const live = levels !== FALLBACK_LEVELS;

  const gridGap = dials.cellGap * 0.8;
  const style = {
    "--gridlogo-size": `${dials.size}px`,
    "--gridlogo-gap": `${gridGap}px`,
    "--gridlogo-cell-radius": `${dials.cellRadius}%`,
    "--gridlogo-scrim": dials.scrimOpacity,
  } as CSSProperties;

  return (
    <span
      ref={rootRef}
      className="gridlogo"
      style={style}
      data-thinking={thinking ? "on" : undefined}
      data-source={live ? "live" : "fallback"}
      aria-hidden="true"
    >
      {levels.map((level, i) => (
        <span key={i} className="gridlogo-cell" data-level={level} />
      ))}
    </span>
  );
}
