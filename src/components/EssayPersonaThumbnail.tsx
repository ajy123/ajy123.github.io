import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const GREEN = "#174C3A";
const STROKE = "#171717";

const COLS = 8;
const ROWS = 4;
const PITCH = 38;
const ORIGIN_X = 48;
const ORIGIN_Y = 44;
const RADIUS = 7;

const LIVING_CELL = { x: 200, y: 82 };
const SPREAD_CELLS = [
  { x: 238, y: 44 },
  { x: 124, y: 120 },
  { x: 276, y: 82 },
  { x: 162, y: 158 },
];

const moveTransition = { type: "spring" as const, stiffness: 220, damping: 26 };

type EssayPersonaThumbnailProps = {
  className?: string;
  interactive?: boolean;
  active?: boolean;
};

// Thumbnail for "Use personas to build a golden dataset": a contact sheet
// of write-once personas — identical, outlined, still. One record is
// alive. On hover it advances a slot (leaving its husk behind) and the
// regeneration spreads: a few more records turn green, staggered, like the
// weekly pass moving through the archive.
export function EssayPersonaThumbnail({
  className = "",
  interactive = true,
  active = false,
}: EssayPersonaThumbnailProps) {
  const [hovered, setHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const isActive = (hovered || active) && !prefersReducedMotion;

  const gridCells: { x: number; y: number }[] = [];
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const x = ORIGIN_X + col * PITCH;
      const y = ORIGIN_Y + row * PITCH;
      if (x === LIVING_CELL.x && y === LIVING_CELL.y) continue;
      gridCells.push({ x, y });
    }
  }

  return (
    <motion.div
      aria-label="Interactive thumbnail for Use personas to build a golden dataset"
      className={`work-media${className ? ` ${className}` : ""}`}
      onHoverStart={interactive ? () => setHovered(true) : undefined}
      onHoverEnd={interactive ? () => setHovered(false) : undefined}
      onFocus={interactive ? () => setHovered(true) : undefined}
      onBlur={interactive ? () => setHovered(false) : undefined}
      role="img"
      style={{
        background: "var(--surface-subtle)",
        borderRadius: 0,
        containerType: "inline-size",
        cursor: interactive ? "pointer" : "default",
        display: "flex",
      }}
      tabIndex={interactive ? 0 : undefined}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 8%",
        }}
      >
        <svg
          viewBox="0 0 361 201"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: "min(78%, 330px)", height: "auto" }}
        >
          {gridCells.map((cell) => (
            <circle
              cx={cell.x}
              cy={cell.y}
              key={`${cell.x}-${cell.y}`}
              r={RADIUS}
              stroke={STROKE}
              strokeWidth={1.5}
            />
          ))}
          <circle
            cx={LIVING_CELL.x}
            cy={LIVING_CELL.y}
            r={RADIUS}
            stroke={STROKE}
            strokeWidth={1.5}
          />
          <motion.circle
            animate={{ x: isActive ? PITCH : 0 }}
            cx={LIVING_CELL.x}
            cy={LIVING_CELL.y}
            fill={GREEN}
            initial={false}
            r={RADIUS}
            transition={moveTransition}
          />
          {SPREAD_CELLS.map((cell, index) => (
            <motion.circle
              animate={{ opacity: isActive ? 1 : 0 }}
              cx={cell.x}
              cy={cell.y}
              fill={GREEN}
              initial={false}
              key={`${cell.x}-${cell.y}`}
              r={RADIUS}
              transition={{
                duration: 0.35,
                delay: isActive ? index * 0.09 : 0,
                ease: [0.23, 1, 0.32, 1],
              }}
            />
          ))}
        </svg>
      </div>
    </motion.div>
  );
}
