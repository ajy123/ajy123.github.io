import { useEffect } from "react";
import { useDialKit } from "dialkit";
// Dev-only side effect: this module is ONLY ever reached through a DEV-gated
// dynamic import (main.tsx), so dialkit's stylesheet never leaks into the
// production bundle (memory lesson: gate the CSS, not just the JS).
import "dialkit/styles.css";
import { DEFAULT_LOGO_DIALS, SiteLogo, type LogoDialsValues } from "./SiteLogo";

/**
 * Dev-only tuner for SiteLogo's GridLogo mark. Does NOT render its own
 * <DialRoot> — dialkit shows every registered panel in the single app-wide
 * root (mounted by ContextualAskHintDials), so a second root would duplicate
 * all panels.
 */
export function SiteLogoWithDials() {
  const d = DEFAULT_LOGO_DIALS;

  // One-time cleanup: the retired key/grid variant switch used to persist its
  // choice here; stale values would otherwise linger in users' browsers.
  useEffect(() => {
    try {
      localStorage.removeItem("logo-variant");
    } catch {
      // storage denied — nothing to clean up.
    }
  }, []);

  const params = useDialKit(
    "Logo",
    {
      size: [d.size, 20, 56, 2],
      cellGap: [d.cellGap, 0.5, 8, 0.1],
      cellRadius: [d.cellRadius, 0, 50, 1],
      scrimOpacity: [d.scrimOpacity, 0, 0.9, 0.05],
      forceFallback: d.forceFallback,
      pulseGrowMs: [d.pulseGrowMs, 60, 500, 10],
      pulseHoldMs: [d.pulseHoldMs, 0, 800, 10],
      pulseFadeMs: [d.pulseFadeMs, 60, 800, 10],
      pulseGapMs: [d.pulseGapMs, 0, 600, 10],
      // Retuned for the 3×3 (9-cell) field: max blob is 6 of 9 cells (was
      // 4–9 of 16) so a maxed-out dial still reads as a blob, not a flood.
      pulseMaxCells: [d.pulseMaxCells, 2, 6, 1],
      forceThinking: d.forceThinking,
    },
    // v2: bumped when the defaults were retuned (24px/2.6/16%/0.5) so stale
    // persisted panels don't silently mask the new defaults in dev.
    { id: "site-logo", persist: { key: "joanna-logo-dials-v2" } },
  );

  const dials: LogoDialsValues = {
    size: params.size,
    cellGap: params.cellGap,
    cellRadius: params.cellRadius,
    scrimOpacity: params.scrimOpacity,
    forceFallback: params.forceFallback,
    pulseGrowMs: params.pulseGrowMs,
    pulseHoldMs: params.pulseHoldMs,
    pulseFadeMs: params.pulseFadeMs,
    pulseGapMs: params.pulseGapMs,
    pulseMaxCells: params.pulseMaxCells,
    forceThinking: params.forceThinking,
  };

  return <SiteLogo dials={dials} />;
}
