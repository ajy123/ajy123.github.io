import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ScrollIntroPrint } from "./ScrollIntroPrint";

export type IntroVariant = "print" | "off";

export type IntroDials = {
  variant: IntroVariant;
  trackVh: number;
  beat1End: number;
  beat2End: number;
  beat3End: number;
  ctaReveal: number;
  cellPx: number;
  speed: number;
  developFloor: number;
  developGamma: number;
  swellAmp: number;
  grainGain: number;
  wellDrainMs: number;
};

export type IntroWordGroup = {
  text: string;
};

export type IntroSentenceModel = {
  final: string;
  lead: string;
  groups: readonly IntroWordGroup[];
  scaffolds: readonly [string, string, string];
};

export type IntroFill = number | MotionValue<number>;

export const DEFAULT_INTRO_DIALS: IntroDials = {
  variant: "print",
  trackVh: 350,
  beat1End: 0.3,
  beat2End: 0.55,
  beat3End: 0.78,
  ctaReveal: 0.82,
  cellPx: 8,
  speed: 0.8,
  developFloor: 0.35,
  developGamma: 1,
  swellAmp: 0.6,
  grainGain: 2.5,
  wellDrainMs: 600,
};

export const INTRO_FINAL_SENTENCE =
  "I build AI-native products end to end — systems thinking down to the pixels.";

const INTRO_SENTENCE: IntroSentenceModel = {
  final: INTRO_FINAL_SENTENCE,
  lead: "I build ",
  groups: [
    { text: "AI-native products" },
    { text: "systems thinking" },
    { text: "the pixels" },
  ],
  scaffolds: [" end to end — ", " down to ", "."],
};

type ScrollIntroProps = {
  dials?: Partial<IntroDials>;
  isLeaving: boolean;
  onDismiss: () => void;
};

type ResolvedBeats = {
  beat1End: number;
  beat2End: number;
  beat3End: number;
  ctaReveal: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function resolveDials(dials?: Partial<IntroDials>): IntroDials {
  const resolved = { ...DEFAULT_INTRO_DIALS, ...dials };
  const variant = import.meta.env.DEV ? readDevVariantOverride() : null;
  return { ...resolved, variant: variant ?? resolved.variant };
}

function readDevVariantOverride(): IntroVariant | null {
  try {
    const value = new URLSearchParams(window.location.search).get("introVariant");
    return value === "print" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

function resolveBeats(dials: IntroDials): ResolvedBeats {
  const beat1End = clamp(dials.beat1End, 0.08, 0.9);
  const beat2End = clamp(Math.max(dials.beat2End, beat1End + 0.04), 0.12, 0.94);
  const beat3End = clamp(Math.max(dials.beat3End, beat2End + 0.04), 0.16, 0.97);
  const ctaReveal = clamp(Math.max(dials.ctaReveal, beat3End + 0.02), 0.2, 0.99);
  return { beat1End, beat2End, beat3End, ctaReveal };
}

export function ScrollIntro({
  dials: dialsOverride,
  isLeaving,
  onDismiss,
}: ScrollIntroProps) {
  const reduceMotion = useReducedMotion();
  const dials = useMemo(() => resolveDials(dialsOverride), [dialsOverride]);

  useEffect(() => {
    if (dials.variant === "off") onDismiss();
  }, [dials.variant, onDismiss]);

  if (dials.variant === "off") return null;
  if (reduceMotion) {
    return (
      <ReducedIntroFrame
        dials={dials}
        isLeaving={isLeaving}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <ScrollableIntroFrame
      dials={dials}
      isLeaving={isLeaving}
      onDismiss={onDismiss}
    />
  );
}

function ReducedIntroFrame({
  dials,
  isLeaving,
  onDismiss,
}: {
  dials: IntroDials;
  isLeaving: boolean;
  onDismiss: () => void;
}) {
  const progress = useMotionValue(1);
  const fills: IntroFill[] = [1, 1, 1];

  return (
    <div
      className={`intro intro--reduced ${isLeaving ? "is-leaving" : ""}`}
      role="dialog"
      aria-label="Welcome"
      aria-modal="true"
      data-variant={dials.variant}
    >
      <div className="intro-stage">
        <IntroBody
          ctaVisible
          dials={dials}
          fills={fills}
          onDismiss={onDismiss}
          progress={progress}
          reducedMotion
          scaffoldFills={[1, 1, 1]}
        />
      </div>
    </div>
  );
}

function ScrollableIntroFrame({
  dials,
  isLeaving,
  onDismiss,
}: {
  dials: IntroDials;
  isLeaving: boolean;
  onDismiss: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  const beats = useMemo(() => resolveBeats(dials), [dials]);
  const fills: IntroFill[] = [
    useTransform(scrollYProgress, [0.04, beats.beat1End], [0, 1]),
    useTransform(scrollYProgress, [beats.beat1End, beats.beat2End], [0, 1]),
    useTransform(scrollYProgress, [beats.beat2End, beats.beat3End], [0, 1]),
  ];
  // Connective text inks in reading order: each scaffold span sweeps in a
  // short window straddling the beat boundary it follows. A single shared
  // fill made every span ink its left edge simultaneously — orphan solid
  // fragments floating mid-ghost-sentence.
  const scaffoldFills: IntroFill[] = [
    useTransform(scrollYProgress, [beats.beat1End - 0.04, beats.beat1End + 0.06], [0, 1]),
    useTransform(scrollYProgress, [beats.beat2End - 0.04, beats.beat2End + 0.06], [0, 1]),
    useTransform(scrollYProgress, [beats.beat3End - 0.02, beats.ctaReveal], [0, 1]),
  ];
  const [ctaVisible, setCtaVisible] = useState(false);

  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    setCtaVisible((visible) => {
      const next = latest >= beats.ctaReveal;
      return visible === next ? visible : next;
    });
  });

  const style = {
    "--intro-track": `${dials.trackVh}vh`,
  } as CSSProperties;

  return (
    <div
      className={`intro ${isLeaving ? "is-leaving" : ""}`}
      role="dialog"
      aria-label="Welcome"
      aria-modal="true"
      tabIndex={-1}
      ref={containerRef}
      data-variant={dials.variant}
    >
      <div className="intro-track" style={style}>
        <div className="intro-stage">
          <IntroBody
            ctaVisible={ctaVisible}
            dials={dials}
            fills={fills}
            onDismiss={onDismiss}
            progress={scrollYProgress}
            reducedMotion={false}
            scaffoldFills={scaffoldFills}
          />
        </div>
      </div>
    </div>
  );
}

function IntroBody({
  ctaVisible,
  dials,
  fills,
  onDismiss,
  progress,
  reducedMotion,
  scaffoldFills,
}: {
  ctaVisible: boolean;
  dials: IntroDials;
  fills: IntroFill[];
  onDismiss: () => void;
  progress: MotionValue<number>;
  reducedMotion: boolean;
  scaffoldFills: IntroFill[];
}) {
  return (
    <ScrollIntroPrint
      ctaVisible={ctaVisible}
      dials={dials}
      fills={fills}
      onDismiss={onDismiss}
      progress={progress}
      reducedMotion={reducedMotion}
      scaffoldFills={scaffoldFills}
      sentence={INTRO_SENTENCE}
    />
  );
}
