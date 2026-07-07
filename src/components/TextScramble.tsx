import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const SCRAMBLE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/[]{}<>_-=+#";

function randomCharacter() {
  return SCRAMBLE_CHARACTERS[
    Math.floor(Math.random() * SCRAMBLE_CHARACTERS.length)
  ];
}

function scrambleText(text: string, progress: number) {
  const revealCount = Math.floor(text.length * progress);

  return Array.from(text, (character, index) => {
    if (character === " ") return " ";
    if (index < revealCount) return character;
    return randomCharacter();
  }).join("");
}

export function TextScramble({
  text,
  active = true,
  durationMs = 800,
  speed = 0.04,
}: {
  text: string;
  active?: boolean;
  durationMs?: number;
  speed?: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [displayText, setDisplayText] = useState(text);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (shouldReduceMotion || !active || durationMs <= 0) {
      setDisplayText(text);
      return () => undefined;
    }

    const start = performance.now();
    const tickMs = Math.max(16, speed * 1000);
    let lastTick = 0;

    const update = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);

      if (now - lastTick >= tickMs || progress === 1) {
        setDisplayText(progress === 1 ? text : scrambleText(text, progress));
        lastTick = now;
      }

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(update);
      } else {
        frameRef.current = null;
      }
    };

    setDisplayText(scrambleText(text, 0));
    frameRef.current = window.requestAnimationFrame(update);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [active, durationMs, shouldReduceMotion, speed, text]);

  return <>{displayText}</>;
}
