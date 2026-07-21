import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { motion, useMotionValueEvent, type MotionValue } from "motion/react";
import {
  SplashShader,
  type SplashShaderDrive,
} from "./SplashShader";
import { ScrambleWord } from "./IntroScrambleWord";
import { buildSentenceMask } from "./introShaderMask";
import type {
  IntroDials,
  IntroFill,
  IntroSentenceModel,
} from "./ScrollIntro";

type ScrollIntroPrintProps = {
  ctaVisible: boolean;
  dials: IntroDials;
  fills: IntroFill[];
  onDismiss: () => void;
  progress: MotionValue<number>;
  reducedMotion: boolean;
  scaffoldFills: IntroFill[];
  sentence: IntroSentenceModel;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function getCenter(node: HTMLElement | null): [number, number] | null {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

export function ScrollIntroPrint({
  ctaVisible,
  dials,
  fills,
  onDismiss,
  progress,
  reducedMotion,
  scaffoldFills,
  sentence,
}: ScrollIntroPrintProps) {
  const sentenceRef = useRef<HTMLHeadingElement | null>(null);
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const wordCentersRef = useRef<Array<[number, number] | null>>([]);
  const ctaCenterRef = useRef<[number, number] | null>(null);
  const dialsRef = useRef(dials);
  const driveRef = useRef<SplashShaderDrive>({
    originPx: null,
    originAmp: 0,
    develop: 1,
    grain: 0,
    wellStrength: reducedMotion ? 1 : 0,
  });
  // Set on press so the scroll-driven writeDrive stops overwriting the shader
  // well the moment the exit begins — otherwise touch/trackpad momentum still
  // firing `progress` during the 280ms exit clobbers the press spike.
  const dismissingRef = useRef(false);
  // Dev-only: timestamp the press so we can confirm the drain envelope
  // (underline commit + shader well) stays within INTRO_EXIT_MS on unmount.
  const pressAtRef = useRef<number | null>(null);
  // Drives the underline-commit class through React (not an imperative
  // classList.add) so it can't be reconciled away by a re-render mid-exit.
  const [committing, setCommitting] = useState(false);

  dialsRef.current = dials;

  const shaderWrapRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    wordCentersRef.current = wordRefs.current.map((node) => getCenter(node));
    ctaCenterRef.current = getCenter(ctaRef.current);

    // Sentence-shaped mask on the shader: dots vanish in soft letterform
    // pockets so ink text never fights the dense field. Same triggers as the
    // origin measurement (mount / resize / fonts.ready) — never per frame.
    const wrap = shaderWrapRef.current;
    const sentence = sentenceRef.current;
    const stage = wrap?.parentElement;
    if (!wrap || !sentence || !stage) return;
    const mask = buildSentenceMask(sentence, stage);
    if (!mask) return;
    const maskImage = `url(${mask})`;
    wrap.style.maskImage = maskImage;
    wrap.style.webkitMaskImage = maskImage;
  }, []);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (sentenceRef.current) observer.observe(sentenceRef.current);
    if (ctaRef.current) observer.observe(ctaRef.current);

    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const writeDrive = useCallback(
    (latest: number) => {
      // Frozen once the press starts so the manual well spike survives the exit.
      if (dismissingRef.current) return;
      const next = clamp01(latest);
      const activeIndex =
        next < dialsRef.current.beat1End
          ? 0
          : next < dialsRef.current.beat2End
            ? 1
            : next < dialsRef.current.ctaReveal
              ? 2
              : 3;
      const originPx =
        activeIndex === 3
          ? ctaCenterRef.current
          : wordCentersRef.current[activeIndex] ?? null;
      const beatStart =
        activeIndex === 0
          ? 0
          : activeIndex === 1
            ? dialsRef.current.beat1End
            : activeIndex === 2
              ? dialsRef.current.beat2End
              : dialsRef.current.ctaReveal;
      const beatEnd =
        activeIndex === 0
          ? dialsRef.current.beat1End
          : activeIndex === 1
            ? dialsRef.current.beat2End
            : activeIndex === 2
              ? dialsRef.current.beat3End
              : 1;
      const local = clamp01((next - beatStart) / Math.max(0.001, beatEnd - beatStart));
      const drainWindow = Math.max(
        0.04,
        dialsRef.current.wellDrainMs / 1000 / 4,
      );
      const drain = clamp01((next - dialsRef.current.ctaReveal) / drainWindow);
      const develop =
        dialsRef.current.developFloor +
        (1 - dialsRef.current.developFloor) *
          Math.pow(next, dialsRef.current.developGamma);
      const pulse = Math.sin(local * Math.PI);

      driveRef.current = {
        originPx,
        originAmp: activeIndex === 3 ? dialsRef.current.swellAmp * 0.32 : dialsRef.current.swellAmp * pulse,
        develop,
        grain: 0,
        wellStrength: reducedMotion ? 1 : drain,
      };
    },
    [reducedMotion],
  );

  useMotionValueEvent(progress, "change", writeDrive);

  useEffect(() => {
    writeDrive(progress.get());
  }, [progress, writeDrive]);

  useEffect(() => {
    return () => {
      // SC3: the press-drain is bounded by the loader's unmount, so press→exit
      // is the envelope's upper bound. Should sit at ~INTRO_EXIT_MS (280ms).
      if (import.meta.env.DEV && pressAtRef.current != null) {
        // eslint-disable-next-line no-console
        console.info(
          `[intro] press→exit ${Math.round(performance.now() - pressAtRef.current)}ms`,
        );
      }
    };
  }, []);

  const handleActivate = useCallback(() => {
    // The strike: freeze the scroll drive, then open the shader well hard at the
    // CTA's center so the halftone drains *through* the button as the loader
    // exits. Reduced motion has no live shader (drive is undefined), so skip the
    // spike and just dismiss.
    dismissingRef.current = true;
    const origin = ctaCenterRef.current;
    if (!reducedMotion && origin) {
      driveRef.current = {
        ...driveRef.current,
        originPx: origin,
        originAmp: dialsRef.current.swellAmp,
        wellStrength: 1,
      };
    }
    setCommitting(true);
    if (import.meta.env.DEV) pressAtRef.current = performance.now();
    onDismiss();
  }, [onDismiss, reducedMotion]);

  return (
    <>
      <div className="intro-shader-wrap" ref={shaderWrapRef} aria-hidden="true">
        <SplashShader
          paper="cream"
          enabled
          cellPx={dials.cellPx}
          speed={dials.speed}
          drive={reducedMotion ? undefined : driveRef}
        />
      </div>
      <div className="intro-copy intro-copy--print">
        <IntroSentence
          fills={fills}
          scaffoldFills={scaffoldFills}
          sentence={sentence}
          sentenceRef={sentenceRef}
          wordRefs={wordRefs}
          staticResolved={reducedMotion}
        />
        <button
          className={`intro-cta intro-cta--print ${ctaVisible ? "is-visible" : ""} ${committing ? "is-committing" : ""}`}
          type="button"
          onClick={handleActivate}
          ref={ctaRef}
        >
          {/* The CTA lands with the same spring family as the letters —
              furniture in the same material, not a fading UI chip. */}
          <motion.span
            className="intro-cta-inner"
            initial={false}
            animate={{ y: ctaVisible ? 0 : 16 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
          >
            <span className="intro-cta-line">
              {/* Both copies render; CSS's pointer:coarse gate picks one, the
                  same mechanism as .rail-ask-key. Coarse has no Enter key, so it
                  drops the ↵ and shows "Read on" as a tappable plate. */}
              <span className="intro-cta-copy--fine">
                <span className="intro-cta-word">Read on</span>
                <span className="intro-key--paper">↵</span>
              </span>
              <span className="intro-cta-copy--coarse">Read on</span>
            </span>
          </motion.span>
        </button>
      </div>
      <div
        className={`intro-scrollhint ${ctaVisible ? "is-hidden" : ""}`}
        aria-hidden="true"
      >
        scroll
      </div>
    </>
  );
}

const IntroSentence = memo(function IntroSentence({
  fills,
  scaffoldFills,
  sentence,
  sentenceRef,
  wordRefs,
  staticResolved,
}: {
  fills: IntroFill[];
  scaffoldFills: IntroFill[];
  sentence: IntroSentenceModel;
  sentenceRef: React.RefObject<HTMLHeadingElement | null>;
  wordRefs: React.MutableRefObject<Array<HTMLSpanElement | null>>;
  staticResolved: boolean;
}) {
  return (
    <h1
      aria-label={sentence.final}
      className="intro-sentence"
      ref={sentenceRef}
    >
      <span aria-hidden="true">
        <span className="intro-lead">{sentence.lead}</span>
        <ScrambleWord
          fill={fills[0]}
          index={0}
          staticResolved={staticResolved}
          text={sentence.groups[0].text}
          wordRefs={wordRefs}
        />
        <IntroScaffold fill={scaffoldFills[0]}>{sentence.scaffolds[0]}</IntroScaffold>
        <ScrambleWord
          fill={fills[1]}
          index={1}
          staticResolved={staticResolved}
          text={sentence.groups[1].text}
          wordRefs={wordRefs}
        />
        <IntroScaffold fill={scaffoldFills[1]}>{sentence.scaffolds[1]}</IntroScaffold>
        <ScrambleWord
          fill={fills[2]}
          index={2}
          staticResolved={staticResolved}
          suffix={
            <IntroScaffold fill={scaffoldFills[2]}>{sentence.scaffolds[2]}</IntroScaffold>
          }
          text={sentence.groups[2].text}
          wordRefs={wordRefs}
        />
      </span>
    </h1>
  );
});

function IntroScaffold({
  children,
  fill,
}: {
  children: string;
  fill: IntroFill;
}) {
  return (
    <motion.span
      className="intro-word"
      style={{ "--fill": fill } as CSSProperties}
    >
      {children}
    </motion.span>
  );
}
