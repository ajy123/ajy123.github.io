import { memo, useMemo, type CSSProperties, type ReactNode } from "react";
import {
  motion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

// Scroll-scrubbed positional scramble (ref: Framer "Scramble Text Reveal").
// Each letter starts displaced to a seeded-random offset within a radius and
// tilted up to ±MAX_ROTATION_DEG, then springs home one by one as its beat
// scrubs — real glyphs throughout, no charset swapping. Transforms never touch
// layout, so line-breaking and the shader's word-center measurement stay
// stable at every scroll position.

const SCRAMBLE_RADIUS_PX = 90;
const SCRAMBLE_RADIUS_MOBILE_PX = 48;
const MAX_ROTATION_DEG = 28;
// Each char settles over this beat-local window; starts stagger left-to-right
// across the remainder so the last char lands exactly at beat end.
const SETTLE_WINDOW = 0.3;
const SCRAMBLE_SEED = 7;
const GHOST = "#e0e0e0";
const INK = "#111111";
const SETTLE_SPRING = { stiffness: 220, damping: 18 };

type CharScatter = {
  dx: number;
  dy: number;
  deg: number;
};

type ScrambleWordProps = {
  text: string;
  fill: MotionValue<number> | number;
  index: number;
  wordRefs: React.MutableRefObject<Array<HTMLSpanElement | null>>;
  staticResolved?: boolean;
  suffix?: ReactNode;
};

// Deterministic PRNG so the scatter pattern is identical across reloads and
// StrictMode remounts — the same letter always flies in from the same place.
function mulberry32(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatterFor(
  groupIndex: number,
  charIndex: number,
  radius: number,
): CharScatter {
  const rng = mulberry32(SCRAMBLE_SEED + groupIndex * 101 + charIndex);
  const angle = rng() * Math.PI * 2;
  const distance = (0.35 + 0.65 * rng()) * radius;
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    deg: (rng() * 2 - 1) * MAX_ROTATION_DEG,
  };
}

function scatterRadius(): number {
  if (typeof window === "undefined") return SCRAMBLE_RADIUS_PX;
  return window.matchMedia("(max-width: 640px)").matches
    ? SCRAMBLE_RADIUS_MOBILE_PX
    : SCRAMBLE_RADIUS_PX;
}

export const ScrambleWord = memo(function ScrambleWord({
  text,
  fill,
  index,
  wordRefs,
  staticResolved = false,
  suffix,
}: ScrambleWordProps) {
  const radius = useMemo(scatterRadius, []);

  // Reduced motion, or a numeric fill (the reduced frame passes 1): plain
  // settled text, no per-char machinery ever.
  if (staticResolved || typeof fill === "number") {
    return (
      <span
        className="intro-word intro-word--hot"
        ref={(node) => {
          wordRefs.current[index] = node;
        }}
        style={{ "--fill": 1 } as CSSProperties}
      >
        {text}
        {suffix}
      </span>
    );
  }

  const totalChars = Array.from(text).filter(
    (character) => character !== " ",
  ).length;
  let charIndex = -1;

  return (
    <span
      className="intro-word--scramble intro-word--hot"
      ref={(node) => {
        wordRefs.current[index] = node;
      }}
    >
      {text.split(" ").map((word, wordIndex) => (
        <TokenWithSpace key={`${word}-${wordIndex}`} needsSpace={wordIndex > 0}>
          <span className="intro-scramble-token">
            {Array.from(word).map((character, characterIndexInWord) => {
              charIndex += 1;
              const start =
                (charIndex / Math.max(1, totalChars)) * (1 - SETTLE_WINDOW);

              return (
                <ScrambleChar
                  char={character}
                  fill={fill}
                  key={`${character}-${characterIndexInWord}`}
                  scatter={scatterFor(index, charIndex, radius)}
                  settleWindow={[start, start + SETTLE_WINDOW]}
                />
              );
            })}
          </span>
        </TokenWithSpace>
      ))}
      {suffix}
    </span>
  );
});

function ScrambleChar({
  char,
  fill,
  scatter,
  settleWindow,
}: {
  char: string;
  fill: MotionValue<number>;
  scatter: CharScatter;
  settleWindow: [number, number];
}) {
  // 0 = scattered, 1 = home. The spring between the scrub and the transform
  // is the physics: letters chase the scroll with mass, overshoot slightly,
  // settle — and fling back out through the same spring on scroll-up.
  const local = useTransform(fill, settleWindow, [0, 1], { clamp: true });
  const spring = useSpring(local, SETTLE_SPRING);
  const x = useTransform(spring, (value) => (1 - value) * scatter.dx);
  const y = useTransform(spring, (value) => (1 - value) * scatter.dy);
  const rotate = useTransform(spring, (value) => (1 - value) * scatter.deg);
  const color = useTransform(spring, [0.85, 1], [GHOST, INK]);

  return (
    <motion.span
      className="intro-scramble-char"
      style={{ x, y, rotate, color }}
    >
      {char}
    </motion.span>
  );
}

function TokenWithSpace({
  children,
  needsSpace,
}: {
  children: ReactNode;
  needsSpace: boolean;
}) {
  return (
    <>
      {needsSpace ? " " : null}
      {children}
    </>
  );
}
