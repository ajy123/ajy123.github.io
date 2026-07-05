import {
  StrictMode,
  Suspense,
  createElement,
  lazy,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Agentation } from "agentation";
import { createRoot } from "react-dom/client";
import { CursorChat } from "./CursorChat";
import { requestCursorChatOpen } from "./chatEvents";
import {
  ContextualAskHint,
  type AskableKind,
  type AskAnchorPreference,
} from "./components/ContextualAskHint";
import { ContribGraph } from "./components/ContribGraph";
import { EssayEvalThumbnail } from "./components/EssayEvalThumbnail";
import { PhysicsFooter } from "./components/PhysicsFooter";
import { FooterDialsContext, footerVars } from "./footerDials";
import { SplashShader } from "./components/SplashShader";
import { isWebGPUAvailable, onInitProgress, preloadEngine } from "./llmEngine";
import caseStudyPosterUrl from "../images/case-study-test-poster.jpg?url";
import caseStudyVideoUrl from "../images/case-study-test.mp4?url";
import deeliCaseStudyPosterUrl from "../images/deeli-casestudy-poster.jpg?url";
import deeliCaseStudyVideoUrl from "../images/deeli-casestudy.mp4?url";
import "./index.css";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "section" | "div" | "footer" | "article";
  askHint?: string;
  askKind?: AskableKind;
  askAnchorPreference?: AskAnchorPreference;
  askPromptChips?: string[];
};

type WorkItem = {
  eyebrow: string;
  title: string;
  role: string;
  year: string;
  status?: string;
  summary?: string;
  liveHref?: string;
  askHint: string;
  askKind: AskableKind;
  askAnchorPreference?: AskAnchorPreference;
  askPromptChips: string[];
  media?: {
    type: "video";
    src: string;
    mimeType: string;
    poster?: string;
  };
};

const workItems: WorkItem[] = [
  {
    eyebrow: "Case study",
    title: "From keyword search to a research chat",
    role: "Led design + part PM, team of 5",
    year: "2026",
    status: "Case study coming soon",
    askHint: "Ask how this became a chat",
    askKind: "project",
    askAnchorPreference: "cursor",
    askPromptChips: [
      "Ask how this became a chat",
      "What changed after launch?",
      "What was Joanna's role?",
    ],
    summary:
      "Designed a chat that pins down intent before it answers and shows its work as it builds — turning keyword search into consult-grade reports and cutting time-to-report 50%+.",
    media: {
      type: "video",
      src: deeliCaseStudyVideoUrl,
      mimeType: "video/mp4",
      poster: deeliCaseStudyPosterUrl,
    },
  },
  {
    eyebrow: "Case study",
    title: "Brand Identity",
    role: "Solo design + build",
    year: "2026",
    status: "Case study coming soon",
    askHint: "Ask what shipped for Computex",
    askKind: "project",
    askAnchorPreference: "cursor",
    askPromptChips: [
      "Ask what shipped for Computex",
      "What did the identity system include?",
      "What constraints shaped the work?",
    ],
    summary:
      "Built Deeli's brand site and sales kit in a week for our Computex debut, which opened enterprise pilots across semiconductors, aerospace, and industrial research.",
    liveHref: "https://deeli.ai",
    media: {
      type: "video",
      src: caseStudyVideoUrl,
      mimeType: "video/mp4",
      poster: caseStudyPosterUrl,
    },
  },
];

const aiPracticeItems: WorkItem[] = [
  {
    eyebrow: "Essay",
    title: "The eval is the spec",
    role: "Applied AI",
    year: "2026",
    askHint: "Ask why evals became the spec",
    askKind: "essay",
    askAnchorPreference: "edge",
    askPromptChips: [
      "Ask why evals became the spec",
      "What is the main argument?",
      "How does this apply to product design?",
    ],
    summary: "You can design a report's layout and citations — but not the sentences a model writes fresh every time. So the eval becomes the spec — it's how I define product quality."
  },
];

const MIN_SPLASH_MS = 2400;
const SPLASH_EXIT_MS = 280;
const ContextualAskHintWithDials = import.meta.env.DEV
  ? lazy(() =>
      import("./components/ContextualAskHintDials").then((module) => ({
        default: module.ContextualAskHintWithDials,
      })),
    )
  : null;

function Reveal({
  children,
  className = "",
  delay = 0,
  as: Component = "section",
  askHint,
  askKind,
  askAnchorPreference,
  askPromptChips,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.16 },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return createElement(
    Component,
    {
      ref,
      className: `reveal ${isVisible ? "is-visible" : ""} ${className}`,
      style: { transitionDelay: `${delay}ms` },
      ...(askHint
        ? {
            "data-ask-hint": askHint,
            "data-ask-kind": askKind,
            "data-ask-anchor": askAnchorPreference,
            "data-ask-prompts": JSON.stringify(askPromptChips ?? [askHint]),
            tabIndex: 0,
            "aria-label": `${askHint}. Press slash to ask.`,
          }
        : {}),
    },
    children,
  );
}

function AskableRegion({
  children,
  className = "",
  hint,
  kind,
  anchorPreference,
  promptChips,
}: {
  children: ReactNode;
  className?: string;
  hint: string;
  kind: AskableKind;
  anchorPreference?: AskAnchorPreference;
  promptChips?: string[];
}) {
  return (
    <div
      className={`askable-region ${className}`}
      data-ask-hint={hint}
      data-ask-kind={kind}
      data-ask-anchor={anchorPreference}
      data-ask-prompts={JSON.stringify(promptChips ?? [hint])}
      tabIndex={0}
      aria-label={`${hint}. Press slash to ask.`}
    >
      {children}
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </svg>
  );
}

function ProfileRail() {
  const [copied, setCopied] = useState(false);
  const dials = useContext(FooterDialsContext);
  const footerBodyRef = useRef<HTMLDivElement | null>(null);

  const copyEmail = async () => {
    await navigator.clipboard.writeText("joannayen24@gmail.com");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <aside className="profile-rail">
      <div className="profile-sticky">
        <Reveal
          as="div"
          className="profile-content"
          askHint="Ask about Joanna's fit"
          askKind="profile"
          askAnchorPreference="margin"
          askPromptChips={[
            "Ask about Joanna's fit",
            "What roles would she be strong for?",
            "What should I ask her about?",
          ]}
        >
          <h1>
            <span>Joanna Yen</span>
          </h1>

          <p className="sidebar-bio">
            Designer and engineer who sweats the details and ships them. I build
            AI-native products end to end, from the systems thinking down to the
            pixels.
          </p>
          <p className="sidebar-bio">
            Avid long distance runner based in <s>NYC</s> remote in APAC.
          </p>
        </Reveal>

        <Reveal
          as="footer"
          className="rail-footer"
          delay={dials.layout.revealDelay}
        >
          <div
            ref={footerBodyRef}
            className="rail-footer-body"
            data-variant={dials.variant}
            data-brackets={dials.mono.brackets}
            style={footerVars(dials)}
          >
            <ContribGraph user="ajy123" />

            <div className="rail-contact">
              <a
                className="rail-link"
                href="/resume.pdf"
                download
                aria-label="Download resume"
              >
                <span className="rail-link-label">Resume</span>
                <span className="rail-link-leader" aria-hidden="true" />
                <DownloadIcon />
              </a>

              <a
                className="rail-link"
                href="https://www.linkedin.com/"
                target="_blank"
                rel="noreferrer"
                aria-label="Open LinkedIn"
              >
                <span className="rail-link-label">LinkedIn</span>
                <span className="rail-link-leader" aria-hidden="true" />
                <ArrowIcon />
              </a>

              <button
                className={`rail-link${copied ? " is-copied" : ""}`}
                type="button"
                aria-label={copied ? "Email copied" : "Copy email"}
                onClick={copyEmail}
              >
                <span className="rail-link-label">joannayen24@gmail.com</span>
                <span className="rail-link-leader" aria-hidden="true" />
                {copied ? <CheckGlyph /> : <CopyGlyph />}
              </button>
            </div>

            <p>© 2026 Joanna Yen</p>

            {dials.variant === "physics" ? (
              <PhysicsFooter bodyRef={footerBodyRef} dials={dials.physics} />
            ) : null}
          </div>
        </Reveal>
      </div>
    </aside>
  );
}

function WorkMedia({ item }: { item: WorkItem }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  if (!item.media) {
    return <div className="work-media" aria-hidden="true" />;
  }

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="work-media">
      <video
        ref={videoRef}
        aria-label={`${item.title} preview`}
        autoPlay
        loop
        muted
        playsInline
        poster={item.media.poster}
        preload="auto"
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      >
        <source src={item.media.src} type={item.media.mimeType} />
      </video>
      <button
        className="work-media-control"
        type="button"
        aria-label={isPlaying ? "Pause preview" : "Play preview"}
        title={isPlaying ? "Pause preview" : "Play preview"}
        onClick={togglePlayback}
      >
        {isPlaying ? <PauseGlyph /> : <PlayGlyph />}
      </button>
    </div>
  );
}

function WorkCanvas() {
  return (
    <main className="work-canvas" aria-label="Selected work">
      <Reveal as="div" className="work-heading">
        <span className="section-heading" aria-hidden="true">
          Work
        </span>
      </Reveal>

      <div className="work-grid">
        {workItems.map((item, index) => (
          <Reveal
            as="article"
            className="work-card case-card"
            delay={120 + index * 90}
            key={item.title}
          >
            <p className="card-eyebrow">{item.eyebrow}</p>
            <AskableRegion
              className="work-card-askable"
              hint={item.askHint}
              kind={item.askKind}
              anchorPreference={item.askAnchorPreference}
              promptChips={item.askPromptChips}
            >
              <h2 className="card-title">{item.title}</h2>
              <p className="card-role">{item.role}</p>
              <p className="card-meta">
                <span className="card-meta-copy">
                  {item.year}
                  {item.status ? ` · ${item.status}` : ""}
                </span>
                {item.liveHref ? (
                  <a
                    href={item.liveHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${item.title} live site`}
                  >
                    See it live ↗
                  </a>
                ) : null}
              </p>
              <WorkMedia item={item} />
              {item.summary ? (
                <p className="card-summary">{item.summary}</p>
              ) : null}
            </AskableRegion>
          </Reveal>
        ))}
      </div>

      <Reveal as="div" className="work-heading">
        <span className="section-heading" aria-hidden="true">
          AI Practice
        </span>
      </Reveal>

      <div className="work-grid">
        {aiPracticeItems.map((item, index) => (
          <Reveal
            as="article"
            className="work-card case-card"
            delay={120 + index * 90}
            key={item.title}
          >
            <p className="card-eyebrow">{item.eyebrow}</p>
            <AskableRegion
              className="work-card-askable"
              hint={item.askHint}
              kind={item.askKind}
              anchorPreference={item.askAnchorPreference}
              promptChips={item.askPromptChips}
            >
              <h2 className="card-title">{item.title}</h2>
              <p className="card-role">{item.role}</p>
              <p className="card-meta">{item.year}</p>
              <EssayEvalThumbnail />
              {item.summary ? (
                <p className="card-summary">{item.summary}</p>
              ) : null}
            </AskableRegion>
          </Reveal>
        ))}
      </div>
    </main>
  );
}

type SplashProps = {
  progress: number;
  isLeaving: boolean;
  onSkip: () => void;
};

function Splash({
  progress,
  isLeaving,
  onSkip,
}: SplashProps) {
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));

  return (
    <button
      className={`splash splash--cream ${isLeaving ? "is-leaving" : ""}`}
      type="button"
      aria-busy={!isLeaving}
      aria-live="polite"
      aria-label="Enter portfolio"
      onClick={onSkip}
    >
      <SplashShader paper="cream" enabled cellPx={8} speed={0.8} />
      <span className="splash-inner">
        <span className="splash-title">Welcome</span>
        <span className="splash-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${percent / 100})` }} />
        </span>
        <span className="splash-hint">
          <span>Enter to enter</span>
          <span className="splash-hint-dot" aria-hidden="true">
            ·
          </span>
          <span>
            <span className="splash-key">/</span> to ask
          </span>
        </span>
      </span>
    </button>
  );
}

function ContextualAskHintLayer() {
  if (ContextualAskHintWithDials) {
    return (
      <Suspense fallback={null}>
        <ContextualAskHintWithDials />
      </Suspense>
    );
  }

  return <ContextualAskHint />;
}

function App() {
  const [showSplash, setShowSplash] = useState(() => isWebGPUAvailable());
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const exitTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const unsubscribeProgressRef = useRef<(() => void) | null>(null);
  const dismissedSplashRef = useRef(false);
  const pendingChatOpenRef = useRef(false);

  const stopSplashListeners = () => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    unsubscribeProgressRef.current?.();
    unsubscribeProgressRef.current = null;
  };

  const dismissSplash = () => {
    if (dismissedSplashRef.current) return;
    dismissedSplashRef.current = true;
    stopSplashListeners();

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      setShowSplash(false);
      return;
    }

    setSplashLeaving(true);
    exitTimerRef.current = window.setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_EXIT_MS);
  };

  useEffect(() => {
    if (!isWebGPUAvailable()) return;

    preloadEngine();

    unsubscribeProgressRef.current = onInitProgress((report) => {
      setProgress(report.progress);
    });
    revealTimerRef.current = window.setTimeout(dismissSplash, MIN_SPLASH_MS);

    return () => {
      stopSplashListeners();
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (showSplash || !pendingChatOpenRef.current) return;

    pendingChatOpenRef.current = false;
    window.setTimeout(() => requestCursorChatOpen(), 0);
  }, [showSplash]);

  // Splash keyboard affordances: Enter/Space enters; slash enters then opens chat.
  // Pure UI — routes through dismissSplash, so freeze + reduced-motion apply.
  useEffect(() => {
    if (!showSplash) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        pendingChatOpenRef.current = true;
        dismissSplash();
        return;
      }

      if (event.key === "Enter" || event.key === " " || event.code === "Space") {
        event.preventDefault();
        dismissSplash();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSplash]);

  const shell = (
    <div className="portfolio-shell">
      <ProfileRail />
      <WorkCanvas />
    </div>
  );

  return (
    <>
      {shell}
      <ContextualAskHintLayer />
      <CursorChat suspended={showSplash} />
      {import.meta.env.DEV ? <Agentation /> : null}
      {showSplash ? (
        <Splash
          progress={progress}
          isLeaving={splashLeaving}
          onSkip={dismissSplash}
        />
      ) : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
