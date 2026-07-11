import {
  StrictMode,
  Suspense,
  createElement,
  lazy,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Agentation } from "agentation";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { CursorChat } from "./CursorChat";
import {
  isCoarsePointer,
  requestCursorChatOpen,
  toSuggestedPrompts,
} from "./chatEvents";
import {
  ContextualAskHint,
  type AskableKind,
  type AskAnchorPreference,
} from "./components/ContextualAskHint";
import { CursorTrail } from "./components/CursorTrail";
import { SelectionAskPill } from "./components/SelectionAskPill";
import { EssayEvalThumbnail } from "./components/EssayEvalThumbnail";
import { SiteLogo } from "./components/SiteLogo";
import { PhysicsFooter } from "./components/PhysicsFooter";
import { FooterDialsContext, footerVars } from "./footerDials";
import { ScrollIntro } from "./components/ScrollIntro";
import { isWebGPUAvailable, preloadEngine } from "./llmEngine";
import { initFaviconPulse } from "./faviconPulse";
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
  askFollowUpPromptChips?: string[];
  askContextText?: string;
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
  askFollowUpPromptChips: string[];
  media?: {
    type: "video";
    src: string;
    mimeType: string;
    poster?: string;
  };
};

type EssaySection = {
  heading: string;
  body: string[];
};

type EssayItem = WorkItem & {
  id: string;
  dek: string;
  sections: EssaySection[];
  takeaway: string;
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
      "does the page title say from keyword search to a research chat?",
      "does the page say time-to-report was cut 50%+?",
      "does it pin down intent before answering?",
    ],
    askFollowUpPromptChips: [
      "does the page say the chat shows its work as it builds?",
      "does the page use the phrase consult-grade reports?",
      "does the page list Joanna's role as led design + part PM, team of 5?",
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
      "did the identity include a brand site and sales kit?",
      "were Deeli's brand site and sales kit built in a week?",
      "does the page say the Deeli work was built for the Computex debut?",
    ],
    askFollowUpPromptChips: [
      "was Joanna's role solo design and build?",
      "does the page say the work opened enterprise pilots across semiconductors, aerospace, and industrial research?",
      "is the live site deeli.ai?",
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

const aiPracticeItems: EssayItem[] = [
  {
    id: "eval-is-the-spec",
    eyebrow: "Essay",
    title: "The eval is the spec",
    role: "Applied AI",
    year: "2026",
    askHint: "Ask why evals became the spec",
    askKind: "essay",
    askAnchorPreference: "edge",
    askPromptChips: [
      "does the essay argue that the eval becomes the spec?",
      "does the essay say generated paragraphs are behavior, not static components?",
      "does an eval define product quality?",
    ],
    askFollowUpPromptChips: [
      "is the interface only half the AI product spec?",
      "does a test tell the model what good work means?",
      "does the essay say exact states in a conventional product spec still matter?",
    ],
    summary:
      "You can design a report's layout and citations — but not the sentences a model writes fresh every time. So the eval becomes the spec — it's how I define product quality.",
    dek:
      "In AI products, the interface is only half the spec. The other half is the test that tells the model what good work means.",
    sections: [
      {
        heading: "The hard part is the part that changes",
        body: [
          "A conventional product spec can describe a report screen with exact states: what loads, what fails, what the citation chip looks like, what the empty state says. That still matters.",
          "But the most important surface in an AI product is often generated fresh every run. The paragraph, recommendation, synthesis, or follow-up question is not a static component. It is behavior.",
        ],
      },
      {
        heading: "So the eval becomes the design artifact",
        body: [
          "An eval names the quality bar in a way the team can actually inspect. It turns fuzzy taste into repeatable checks: did the answer cite the right source, preserve uncertainty, avoid overclaiming, and help the user decide what to do next?",
          "That makes the eval closer to a spec than a QA afterthought. It is where product judgment, content strategy, and system behavior meet.",
        ],
      },
      {
        heading: "Designing with evals changes the conversation",
        body: [
          "Instead of arguing whether an answer feels smart, the team can ask what failure mode it triggered. Instead of polishing one golden demo, the team can test the shape of quality across messy inputs.",
          "For me, that is the practical bridge between design and AI systems: define the experience, then define the evidence that the experience is actually happening.",
        ],
      },
    ],
    takeaway:
      "The UI shows the promise. The eval proves whether the product can keep it.",
  },
];

const INTRO_EXIT_MS = 280;
// DEV: the logo's dial panel wraps SiteLogo; prod mounts the bare mark. The
// wrapper is lazy + DEV-gated so neither dialkit JS nor its CSS reaches prod.
const SiteLogoWithDials = import.meta.env.DEV
  ? lazy(() =>
      import("./components/LogoDials").then((module) => ({
        default: module.SiteLogoWithDials,
      })),
    )
  : null;
const ContextualAskHintWithDials = import.meta.env.DEV
  ? lazy(() =>
      import("./components/ContextualAskHintDials").then((module) => ({
        default: module.ContextualAskHintWithDials,
      })),
    )
  : null;

// Touch entry point #2 of three: on a coarse pointer, tapping an askable zone
// opens the chat the same way the hover badge does on desktop. Ignores taps
// that land on real controls (links, buttons, the video toggle).
function handleAskableTap(
  event: ReactMouseEvent<HTMLElement>,
  {
    hint,
    kind,
    chips,
    followUpChips,
    contextText,
  }: {
    hint: string;
    kind: AskableKind;
    chips: string[];
    followUpChips: string[];
    contextText?: string;
  },
) {
  if (!isCoarsePointer()) return;
  if (
    event.target instanceof Element &&
    event.target.closest(
      "a, button, input, textarea, select, option, label, video, audio, [role='button'], [role='link'], [role='switch'], [contenteditable='true']",
    )
  ) {
    return;
  }

  requestCursorChatOpen({
    clientX: event.clientX,
    clientY: event.clientY,
    suggestedPrompts: toSuggestedPrompts(chips.length ? chips : [hint]),
    followUpPrompts: toSuggestedPrompts(followUpChips),
    zoneContext: {
      hint,
      kind,
      contextText: (() => {
        const element = event.currentTarget;
        const text =
          contextText ??
          element.textContent?.replace(/\s+/g, " ").trim() ??
          "";
        const links = Array.from(
          element.querySelectorAll<HTMLAnchorElement>("a[href]"),
        )
          .slice(0, 4)
          .map((link) => `${link.textContent?.trim() || "link"}: ${link.href}`)
          .join("; ");
        return `${text}${links ? ` Links: ${links}` : ""}`.slice(0, 2200);
      })(),
    },
  });
}

// Slash is a keyboard affordance; on touch the same zones respond to a tap.
function askActionSuffix() {
  return isCoarsePointer() ? "Tap to ask." : "Press slash to ask.";
}

function Reveal({
  children,
  className = "",
  delay = 0,
  as: Component = "section",
  askHint,
  askKind,
  askAnchorPreference,
  askPromptChips,
  askFollowUpPromptChips,
  askContextText,
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
            "data-ask-follow-up-prompts": JSON.stringify(
              askFollowUpPromptChips ?? [],
            ),
            "data-ask-context": askContextText,
            tabIndex: 0,
            "aria-label": `${askHint}. ${askActionSuffix()}`,
            onClick: (event: ReactMouseEvent<HTMLElement>) =>
              handleAskableTap(event, {
                hint: askHint,
                kind: askKind ?? "profile",
                chips: askPromptChips ?? [askHint],
                followUpChips: askFollowUpPromptChips ?? [],
                contextText: askContextText,
              }),
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
  followUpPromptChips,
  contextText,
}: {
  children: ReactNode;
  className?: string;
  hint: string;
  kind: AskableKind;
  anchorPreference?: AskAnchorPreference;
  promptChips?: string[];
  followUpPromptChips?: string[];
  contextText?: string;
}) {
  return (
    <div
      className={`askable-region ${className}`}
      data-ask-hint={hint}
      data-ask-kind={kind}
      data-ask-anchor={anchorPreference}
      data-ask-prompts={JSON.stringify(promptChips ?? [hint])}
      data-ask-follow-up-prompts={JSON.stringify(followUpPromptChips ?? [])}
      data-ask-context={contextText}
      tabIndex={0}
      aria-label={`${hint}. ${askActionSuffix()}`}
      onClick={(event) =>
        handleAskableTap(event, {
          hint,
          kind,
          chips: promptChips ?? [hint],
          followUpChips: followUpPromptChips ?? [],
          contextText,
        })
      }
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

function SiteLogoMount() {
  if (SiteLogoWithDials) {
    return (
      <Suspense fallback={<SiteLogo />}>
        <SiteLogoWithDials />
      </Suspense>
    );
  }
  return <SiteLogo />;
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
            "what is Joanna's role?",
            "what kind of products does she build?",
            "does Joanna work across Figma and code?",
          ]}
          askFollowUpPromptChips={[
            "what is her product focus?",
            "did Joanna build Deeli's site in a week?",
            "what is Joanna's email?",
          ]}
          askContextText="Joanna Yen is a designer and engineer who builds AI-native products end to end, from systems thinking down to pixels. She is an avid long-distance runner working remotely in APAC. Her product focus includes data rigor, design quality, research, product systems, interface prototypes, and data workflows. She works across Figma and code. Contact: joannayen24@gmail.com."
        >
          <div className="profile-identity">
            <SiteLogoMount />

            <h1>
              <span>Joanna Yen</span>
            </h1>
          </div>

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

function CloseGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => !node.hasAttribute("disabled"));
}

function EssayPracticeCard({ item, index }: { item: EssayItem; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrollReady, setIsScrollReady] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const dialogId = `essay-dialog-${item.id}`;
  const dialogTitleId = `essay-dialog-title-${item.id}`;
  const dialogDescriptionId = `essay-dialog-description-${item.id}`;

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusDialog = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.setTimeout(() => {
        triggerRef.current?.focus();
      }, 0);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsScrollReady(false);
      // AnimatePresence freezes the exiting panel's props, so the
      // data-scroll-ready attribute never updates during the close morph;
      // hide overflow directly on the still-mounted node instead.
      if (dialogRef.current) dialogRef.current.style.overflow = "hidden";
      return;
    }

    if (dialogRef.current) dialogRef.current.style.overflow = "";

    if (prefersReducedMotion) {
      setIsScrollReady(true);
      return;
    }

    setIsScrollReady(false);
    const scrollGate = window.setTimeout(() => {
      setIsScrollReady(true);
    }, 360);

    return () => {
      window.clearTimeout(scrollGate);
    };
  }, [isOpen, prefersReducedMotion]);

  const openDialog = () => {
    setIsScrollReady(false);
    setIsOpen(true);
  };
  const closeDialog = () => {
    setIsScrollReady(false);
    setIsOpen(false);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openDialog();
  };

  const modalEnterTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const };
  const modalExitTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const };
  const backdropEnterTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const };
  const backdropExitTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.15, ease: [0.23, 1, 0.32, 1] as const };
  const contentInitial = prefersReducedMotion
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: 12 };
  const contentTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.24, delay: 0.08, ease: [0.23, 1, 0.32, 1] as const };
  const contentExitTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.12, ease: [0.23, 1, 0.32, 1] as const };

  return (
    <Reveal
      as="article"
      className="work-card case-card"
      delay={120 + index * 90}
    >
      <LayoutGroup id={`essay-dialog-${item.id}`}>
        <p className="card-eyebrow">{item.eyebrow}</p>
        <motion.div
          ref={triggerRef}
          aria-controls={dialogId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`${item.title}. Open essay.`}
          className="work-card-askable essay-dialog-trigger"
          data-ask-anchor={item.askAnchorPreference}
          data-ask-hint={item.askHint}
          data-ask-kind={item.askKind}
          data-ask-prompts={JSON.stringify(item.askPromptChips)}
          data-ask-follow-up-prompts={JSON.stringify(
            item.askFollowUpPromptChips,
          )}
          data-ask-context={[
            item.title,
            item.role,
            item.year,
            item.summary,
            item.dek,
            item.takeaway,
            ...item.sections.flatMap((section) => [
              section.heading,
              ...section.body,
            ]),
          ].join(" ")}
          layoutId={`essay-dialog-panel-${item.id}`}
          onClick={openDialog}
          onKeyDown={handleTriggerKeyDown}
          role="button"
          tabIndex={0}
          transition={isOpen ? modalEnterTransition : modalExitTransition}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
        >
          <h2 className="card-title">
            {item.title}
          </h2>
          <p className="card-role">{item.role}</p>
          <p className="card-meta">{item.year}</p>
          <motion.div
            className="essay-dialog-visual"
            layoutId={`essay-dialog-visual-${item.id}`}
            transition={isOpen ? modalEnterTransition : modalExitTransition}
          >
            <EssayEvalThumbnail interactive={false} />
          </motion.div>
          <p className="card-summary">{item.summary}</p>
        </motion.div>

        {createPortal(
          <AnimatePresence>
            {isOpen ? (
              <motion.div
                key={`${item.id}-backdrop`}
                aria-hidden="true"
                className="essay-dialog-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: backdropExitTransition,
                }}
                transition={backdropEnterTransition}
              />
            ) : null}
            {isOpen ? (
              <motion.div
                key={`${item.id}-stage`}
                className="essay-dialog-stage"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: backdropExitTransition,
                }}
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) closeDialog();
                }}
                transition={backdropEnterTransition}
              >
                <motion.article
                  ref={dialogRef}
                  aria-describedby={dialogDescriptionId}
                  aria-labelledby={dialogTitleId}
                  aria-modal="true"
                  className="essay-dialog-panel"
                  data-scroll-ready={isScrollReady}
                  id={dialogId}
                  layoutId={`essay-dialog-panel-${item.id}`}
                  role="dialog"
                  tabIndex={-1}
                  transition={modalEnterTransition}
                >
                  <button
                    ref={closeRef}
                    aria-label="Close essay"
                    className="essay-dialog-close"
                    onClick={closeDialog}
                    type="button"
                  >
                    <CloseGlyph />
                  </button>

                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="essay-dialog-header"
                    exit={{
                      opacity: prefersReducedMotion ? 1 : 0,
                      y: 0,
                      transition: contentExitTransition,
                    }}
                    initial={contentInitial}
                    transition={contentTransition}
                  >
                    <p className="card-eyebrow">{item.eyebrow}</p>
                    <h2
                      className="essay-dialog-title"
                      id={dialogTitleId}
                    >
                      {item.title}
                    </h2>
                    <p className="essay-dialog-meta">
                      {item.role} · {item.year}
                    </p>
                    <p className="essay-dialog-dek">{item.dek}</p>
                  </motion.div>

                  <motion.div
                    className="essay-dialog-hero"
                    layoutId={`essay-dialog-visual-${item.id}`}
                    transition={modalEnterTransition}
                  >
                    <EssayEvalThumbnail interactive={false} />
                  </motion.div>

                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="essay-dialog-body"
                    exit={{
                      opacity: prefersReducedMotion ? 1 : 0,
                      y: 0,
                      transition: contentExitTransition,
                    }}
                    id={dialogDescriptionId}
                    initial={contentInitial}
                    transition={contentTransition}
                  >
                    {item.sections.map((section) => (
                      <section
                        className="essay-dialog-section"
                        key={section.heading}
                      >
                        <h3>{section.heading}</h3>
                        {section.body.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </section>
                    ))}
                    <p className="essay-dialog-takeaway">{item.takeaway}</p>
                  </motion.div>
                </motion.article>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
      </LayoutGroup>
    </Reveal>
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
              followUpPromptChips={item.askFollowUpPromptChips}
              contextText={[
                item.title,
                item.role,
                item.year,
                item.status,
                item.summary,
                item.liveHref ? `Live site: ${item.liveHref}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
          <EssayPracticeCard item={item} index={index} key={item.title} />
        ))}
      </div>
    </main>
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

function IntroLayer({
  isLeaving,
  onDismiss,
}: {
  isLeaving: boolean;
  onDismiss: () => void;
}) {
  return <ScrollIntro isLeaving={isLeaving} onDismiss={onDismiss} />;
}

function hasSeenIntroThisSession() {
  try {
    return sessionStorage.getItem("joanna-intro-seen") === "1";
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    sessionStorage.setItem("joanna-intro-seen", "1");
  } catch {
    // Private browsing or storage denial should not block entry.
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

// DEV-only: an explicit valid ?introVariant= means "show me the intro" —
// bypass the seen-this-session skip for local critique runs.
function hasIntroVariantOverride() {
  if (!import.meta.env.DEV) return false;
  try {
    const value = new URLSearchParams(window.location.search).get("introVariant");
    return value === "print" || value === "off";
  } catch {
    return false;
  }
}

function App() {
  const [showIntro, setShowIntro] = useState(
    () => hasIntroVariantOverride() || !hasSeenIntroThisSession(),
  );
  const [introLeaving, setIntroLeaving] = useState(false);
  const exitTimerRef = useRef<number | null>(null);
  const dismissedIntroRef = useRef(false);
  const pendingChatOpenRef = useRef(false);

  const dismissIntro = () => {
    if (dismissedIntroRef.current) return;
    dismissedIntroRef.current = true;
    markIntroSeen();

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      setShowIntro(false);
      return;
    }

    setIntroLeaving(true);
    exitTimerRef.current = window.setTimeout(() => {
      setShowIntro(false);
    }, INTRO_EXIT_MS);
  };

  useEffect(() => {
    if (!isWebGPUAvailable()) return;
    // Consent gate: a first-time visitor has not agreed to the ~350MB model
    // download, so preload only for returning visitors who already loaded it
    // once. Everyone else waits for the in-chat consent prompt.
    let hasLoadedBefore = false;
    try {
      hasLoadedBefore = localStorage.getItem("joanna-llm-loaded") === "1";
    } catch {
      hasLoadedBefore = false;
    }
    if (hasLoadedBefore) {
      void preloadEngine().catch(() => {
        // Returning-user warmup is opportunistic. The chat's Retry path owns
        // surfacing a load failure if they open it after a failed preload.
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (showIntro || !pendingChatOpenRef.current) return;

    pendingChatOpenRef.current = false;
    window.setTimeout(() => requestCursorChatOpen(), 0);
  }, [showIntro]);

  // Intro keyboard affordances: Enter/Escape enter; slash enters then opens chat.
  // Space is intentionally left to the overlay's native scroll container.
  useEffect(() => {
    if (!showIntro) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        pendingChatOpenRef.current = true;
        dismissIntro();
        return;
      }

      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        dismissIntro();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showIntro]);

  const shell = (
    <div className="portfolio-shell">
      <ProfileRail />
      <WorkCanvas />
    </div>
  );

  return (
    <>
      {shell}
      <CursorTrail suspended={showIntro} />
      <ContextualAskHintLayer />
      <SelectionAskPill suspended={showIntro} />
      <CursorChat suspended={showIntro} />
      {import.meta.env.DEV ? <Agentation /> : null}
      {showIntro ? (
        <IntroLayer isLeaving={introLeaving} onDismiss={dismissIntro} />
      ) : null}
    </>
  );
}

// One-time cleanup: the site is light-only now (the theme switch is retired)
// and the send-keycap click sound is gone (with its mute preference), so drop
// any persisted choices left in returning visitors' browsers.
try {
  localStorage.removeItem("theme");
  localStorage.removeItem("chat-sound");
} catch {
  // storage denied — nothing to clean up.
}

// Animate the browser-tab favicon while the in-page LLM is busy (mirrors the
// logo's cluster pulse; restores the static favicon at rest).
initFaviconPulse();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
