// Shared palette + cursor for the coded work-card thumbnails (SwiftlyThumbnail,
// NyuThumbnail). Single source so a token or cursor tweak lands in one place.
// Values are the site's ink + forest system, kept as literals because they are
// SVG fill attributes (same pattern as the essay thumbnails), not CSS vars.
export const ACCENT = "#174C3A";
export const STROKE = "#171717";
export const PAPER = "#FAF9F5";
export const HAIR = "rgba(23,23,23,0.14)";
export const FAINT = "rgba(23,23,23,0.28)";
export const WASH = "rgba(23,23,23,0.06)";

// The cursor renders at half size. NYU draws its inner UI inside a group scaled
// by GROUP_SCALE, so it divides by that to net the same on-screen CURSOR_SCALE.
export const CURSOR_SCALE = 0.5;
export const GROUP_SCALE = 0.8;

// Editorial pointer with its tip anchored at (0,0). Wrap it in the thumbnail's
// own animated <g> (.swt-cursor / .nyt-cursor) to position and animate it.
export function CursorArrow({ scale = CURSOR_SCALE }: { scale?: number }) {
  return (
    <path
      d="M0 0 L0 15 L4.2 10.8 L7 16.5 L9.4 15.4 L6.6 9.7 L12 9.4 Z"
      transform={`scale(${scale})`}
      fill={STROKE}
      stroke={PAPER}
      strokeWidth="1"
    />
  );
}
