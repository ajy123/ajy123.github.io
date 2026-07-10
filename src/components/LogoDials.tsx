import { useEffect } from "react";
import { useDialKit } from "dialkit";
// Dev-only side effect: this module is ONLY ever reached through a DEV-gated
// dynamic import (main.tsx), so dialkit's stylesheet never leaks into the
// production bundle (memory lesson: gate the CSS, not just the JS).
import "dialkit/styles.css";
import {
  DEFAULT_LOGO_DIALS,
  SiteLogo,
  type LogoDialsValues,
  type LogoVariant,
} from "./SiteLogo";

/**
 * Dev-only tuner for SiteLogo: a variant switch (key | grid) plus per-variant
 * craft dials. It does NOT render its own <DialRoot> — dialkit shows every
 * registered panel in the single app-wide root (mounted by
 * ContextualAskHintDials), so a second root would duplicate all panels.
 *
 * On variant change it mirrors the choice to localStorage (so a plain reload
 * keeps the previewed mark) and swaps the favicon <link> to the matching
 * preview asset set.
 */
function swapFavicon(variant: LogoVariant) {
  const href = variant === "key" ? "/favicon-key.svg" : "/favicon.svg";
  const head = document.head;
  let link = head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    head.appendChild(link);
  }
  // Remove + re-insert rather than mutate href in place — more reliable across
  // engines (spec §4).
  link.remove();
  link.setAttribute("href", href);
  head.appendChild(link);
}

// Panel default honors a variant already chosen (dial UI or a test driver
// writing localStorage) so reloads and CDP runs land on the stored variant.
function storedVariant(): LogoVariant {
  try {
    return localStorage.getItem("logo-variant") === "key" ? "key" : "grid";
  } catch {
    return "grid";
  }
}

export function SiteLogoWithDials() {
  const d = DEFAULT_LOGO_DIALS;
  const params = useDialKit(
    "Logo",
    {
      variant: { type: "select", options: ["grid", "key"], default: storedVariant() },
      key: {
        travel: [d.key.travel, 0, 10, 0.5],
        pressMs: [d.key.pressMs, 0, 120, 2],
        releaseMs: [d.key.releaseMs, 120, 700, 10],
        radius: [d.key.radius, 2, 14, 0.5],
        legend: [d.key.legend, 8, 20, 0.5],
      },
      grid: {
        cellGap: [d.grid.cellGap, 1, 8, 0.5],
        sweepPerCell: [d.grid.sweepPerCell, 0, 50, 1],
        forceFallback: d.grid.forceFallback,
        shimmerMs: [d.grid.shimmerMs, 400, 2400, 50],
        shimmerMin: [d.grid.shimmerMin, 0.1, 0.9, 0.05],
        shimmerPerCell: [d.grid.shimmerPerCell, 0, 160, 5],
        forceThinking: d.grid.forceThinking,
      },
    },
    { id: "site-logo", persist: { key: "joanna-logo-dials" } },
  );

  const variant = params.variant as LogoVariant;

  useEffect(() => {
    try {
      localStorage.setItem("logo-variant", variant);
    } catch {
      // storage denied — preview still works for this session.
    }
    swapFavicon(variant);
  }, [variant]);

  const dials: LogoDialsValues = {
    key: {
      travel: params.key.travel,
      pressMs: params.key.pressMs,
      releaseMs: params.key.releaseMs,
      radius: params.key.radius,
      legend: params.key.legend,
    },
    grid: {
      cellGap: params.grid.cellGap,
      sweepPerCell: params.grid.sweepPerCell,
      forceFallback: params.grid.forceFallback,
      shimmerMs: params.grid.shimmerMs,
      shimmerMin: params.grid.shimmerMin,
      shimmerPerCell: params.grid.shimmerPerCell,
      forceThinking: params.grid.forceThinking,
    },
  };

  return <SiteLogo variant={variant} dials={dials} />;
}
