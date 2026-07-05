import { type CSSProperties, createContext } from "react";

/**
 * Footer design knobs, carried via context so the rail footer can keep the
 * chosen baked layout while preserving the optional physics delight path.
 */
export type FooterVariant =
  | "current"
  | "divided"
  | "mono"
  | "dotleader"
  | "keycap"
  | "physics";

export type FooterDials = {
  variant: FooterVariant;
  layout: { gap: number; labelSize: number; iconSize: number; revealDelay: number };
  divided: { rowPadY: number; dividerOpacity: number };
  mono: { size: number; tracking: number; brackets: boolean };
  dotleader: { dotGap: number };
  keycap: { radius: number; depth: number };
  physics: { gravity: number; magnetRadius: number; stiffness: number; bounce: number };
  heatmap: { cell: number; cellGap: number; radius: number };
};

export const DEFAULT_FOOTER_DIALS: FooterDials = {
  variant: "dotleader",
  layout: { gap: 12, labelSize: 12, iconSize: 12, revealDelay: 80 },
  divided: { rowPadY: 10, dividerOpacity: 0.12 },
  mono: { size: 12, tracking: 0, brackets: true },
  dotleader: { dotGap: 6 },
  keycap: { radius: 8, depth: 3 },
  physics: { gravity: 1, magnetRadius: 260, stiffness: 0.04, bounce: 0.2 },
  heatmap: { cell: 12.285, cellGap: 3, radius: 2 },
};

export const FooterDialsContext = createContext<FooterDials>(DEFAULT_FOOTER_DIALS);

/** Flatten the dials into the CSS custom properties the footer CSS reads. */
export function footerVars(d: FooterDials): CSSProperties {
  return {
    "--rl-gap": `${d.layout.gap}px`,
    "--rl-label-size": `${d.layout.labelSize}px`,
    "--rl-icon-size": `${d.layout.iconSize}px`,
    "--rl-rowpad": `${d.divided.rowPadY}px`,
    "--rl-divider-opacity": `${d.divided.dividerOpacity}`,
    "--rl-mono-size": `${d.mono.size}px`,
    "--rl-mono-tracking": `${d.mono.tracking}px`,
    "--rl-leader-gap": `${d.dotleader.dotGap}px`,
    "--rl-key-radius": `${d.keycap.radius}px`,
    "--rl-key-depth": `${d.keycap.depth}px`,
    "--rl-cell": `${d.heatmap.cell}px`,
    "--rl-cell-gap": `${d.heatmap.cellGap}px`,
    "--rl-cell-radius": `${d.heatmap.radius}px`,
  } as CSSProperties;
}
