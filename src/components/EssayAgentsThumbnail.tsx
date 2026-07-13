import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const GREEN = "#174C3A";
const STROKE = "#171717";

const TRIANGLE_D = "M208 126 H152 L180 76 Z";

const fillTransition = { duration: 0.35, ease: [0.23, 1, 0.32, 1] as const };
const demoteTransition = {
  duration: 0.35,
  delay: 0.15,
  ease: [0.23, 1, 0.32, 1] as const,
};

type EssayAgentsThumbnailProps = {
  className?: string;
  interactive?: boolean;
  active?: boolean;
};

// Thumbnail for "Designing with a team of agents": three generated
// candidates as plain outlines. Hover replays the decision — the triangle
// fills green (chosen) while the circle and square recede to dotted
// strokes: considered, mapped, not taken.
export function EssayAgentsThumbnail({
  className = "",
  interactive = true,
  active = false,
}: EssayAgentsThumbnailProps) {
  const [hovered, setHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const isActive = (hovered || active) && !prefersReducedMotion;

  return (
    <motion.div
      aria-label="Interactive thumbnail for Designing with a team of agents"
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
          <motion.circle
            animate={{ opacity: isActive ? 0 : 1 }}
            cx="105"
            cy="100"
            initial={false}
            r="26"
            stroke={STROKE}
            strokeWidth={1.5}
            transition={demoteTransition}
          />
          <motion.circle
            animate={{ opacity: isActive ? 1 : 0 }}
            cx="105"
            cy="100"
            initial={false}
            r="26"
            stroke={STROKE}
            strokeDasharray="4 5"
            strokeWidth={1.5}
            transition={demoteTransition}
          />
          <path d={TRIANGLE_D} stroke={STROKE} strokeWidth={1.5} />
          <motion.path
            animate={{ opacity: isActive ? 1 : 0 }}
            d={TRIANGLE_D}
            fill={GREEN}
            initial={false}
            transition={fillTransition}
          />
          <motion.rect
            animate={{ opacity: isActive ? 0 : 1 }}
            height="52"
            initial={false}
            stroke={STROKE}
            strokeWidth={1.5}
            transition={demoteTransition}
            width="52"
            x="230"
            y="74"
          />
          <motion.rect
            animate={{ opacity: isActive ? 1 : 0 }}
            height="52"
            initial={false}
            stroke={STROKE}
            strokeDasharray="4 5"
            strokeWidth={1.5}
            transition={demoteTransition}
            width="52"
            x="230"
            y="74"
          />
        </svg>
      </div>
    </motion.div>
  );
}
