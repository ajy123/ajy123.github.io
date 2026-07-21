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
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
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
import { EssayDialog } from "./components/EssayDialog";
import { SiteLogo } from "./components/SiteLogo";
import { TextScramble } from "./components/TextScramble";
import { PhysicsFooter } from "./components/PhysicsFooter";
import { FooterDialsContext, footerVars } from "./footerDials";
import { ScrollIntro } from "./components/ScrollIntro";
import { initAnalytics } from "./analytics";
import { initFaviconPulse } from "./faviconPulse";
import { aiPracticeItems } from "./essays";
import type { EssayItem, WorkItem } from "./essays/types";
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

/* Shared verb-register default: the cursor pill and the touch flag must never
 * drift apart, so both fall back to this. */
const DEFAULT_LINK_LABEL = "See it live";

const workItems: WorkItem[] = [
  {
    eyebrow: "Product design",
    title: "From keyword search to a research chat",
    role: "Led design + part PM, team of 5",
    year: "2026",
    liveHref: "/deeli/",
    linkLabel: "Read the case study",
    flagLabel: "Case study",
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
    eyebrow: "Brand",
    title: "Brand Identity",
    role: "Solo design + build",
    year: "2026",
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
    flagLabel: "deeli.ai",
    media: {
      type: "video",
      src: caseStudyVideoUrl,
      mimeType: "video/mp4",
      poster: caseStudyPosterUrl,
    },
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

function ProfileRail({ suspended }: { suspended: boolean }) {
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
            <h1>
              <span>Joanna Yen</span>
            </h1>
          </div>

          {/*
            Persistent chat entry affordance: the only always-visible way to
            discover the "/" composer on a fine-pointer desktop (the FAB below
            only shows on touch / narrow viewports). Hidden while the intro
            overlay is up so it can't be reached before the shell is dismissed.
          */}
          {!suspended ? (
            <button
              className="rail-ask"
              type="button"
              aria-keyshortcuts="/"
              onClick={() => requestCursorChatOpen()}
            >
              <span className="rail-ask-key" aria-hidden="true">
                /
              </span>
              <span className="rail-ask-label">
                <TextScramble text="Ask about my work" durationMs={800} />
              </span>
            </button>
          ) : null}

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
        data-ask-ignore="true"
        onClick={(event) => {
          // Keep playback toggling from bubbling into the card's askable
          // region (and the "See it live" overlay on live projects).
          event.stopPropagation();
          void togglePlayback();
        }}
      >
        {isPlaying ? <PauseGlyph /> : <PlayGlyph />}
      </button>
    </div>
  );
}

function EssayPracticeCard({ item, index }: { item: EssayItem; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const dialogId = `essay-dialog-${item.id}`;

  const openDialog = () => {
    setIsOpen(true);
  };
  const closeDialog = () => {
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

  // Cards past the first pair start clipped by the carousel, so their
  // IntersectionObserver only fires mid-swipe — reveal those instantly
  // instead of staggering into an empty snap slot.
  const revealDelay = index < 2 ? 120 + index * 90 : 0;

  return (
    <Reveal
      as="article"
      className="work-card case-card"
      delay={revealDelay}
    >
      <LayoutGroup id={`essay-dialog-${item.id}`}>
        <p className="card-eyebrow">
          {item.year} · {item.eyebrow}
        </p>
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
          onHoverStart={() => setIsCardHovered(true)}
          onHoverEnd={() => setIsCardHovered(false)}
          role="button"
          tabIndex={0}
          transition={isOpen ? modalEnterTransition : modalExitTransition}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
        >
          <h2 className="card-title">
            {item.title}
          </h2>
          <div className="card-role-row">
            <p className="card-role">{item.role}</p>
            {/* Parity with the work card's flag, minus the anchor: this card is
                already the button, so a second control would split the target.
                A span keeps the affordance visible — the only one touch users
                get, since the cursor pill can't render there. */}
            <span className="card-eyebrow-flag essay-flag" aria-hidden="true">
              Read essay →
            </span>
          </div>
          <motion.div
            className="essay-dialog-visual"
            layoutId={`essay-dialog-visual-${item.id}`}
            transition={isOpen ? modalEnterTransition : modalExitTransition}
          >
            {/* Rest state while open so both ends of the layoutId morph
                render identical artwork. */}
            <item.thumbnail active={isCardHovered && !isOpen} interactive={false} />
          </motion.div>
          <p className="card-summary">{item.summary}</p>
        </motion.div>

        <EssayDialog
          item={item}
          open={isOpen}
          onClose={closeDialog}
          layoutIdPrefix="essay-dialog"
        />
      </LayoutGroup>
    </Reveal>
  );
}

function WorkCardMedia({ item }: { item: WorkItem }) {
  if (!item.liveHref) return <WorkMedia item={item} />;

  // Internal links (e.g. the case-study page) navigate in the same tab;
  // external product sites keep opening in a new one.
  const isExternal = /^https?:\/\//.test(item.liveHref);
  const linkLabel = item.linkLabel ?? DEFAULT_LINK_LABEL;

  // Action zone: the media of a live project navigates to it. The cursor hint
  // becomes an accent "See it live" pill (kind="action") instead of a chat ask
  // — media pill = go somewhere, text pill = ask something. The link is an
  // invisible overlay (a sibling of the media, never a wrapper) so the
  // play/pause button stays valid, independently reachable interactive
  // content instead of a button nested inside an anchor.
  return (
    <div
      className="work-media-frame"
      data-ask-hint={linkLabel}
      data-ask-kind="action"
      data-ask-anchor="cursor"
    >
      <WorkMedia item={item} />
      <a
        className="work-media-link"
        href={item.liveHref}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
        aria-label={`Open ${item.title} (video preview)`}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function WorkCard({ item, index }: { item: WorkItem; index: number }) {
  return (
    <Reveal
      as="article"
      className="work-card case-card"
      delay={120 + index * 90}
    >
      <p className="card-eyebrow">
        {item.year} · {item.eyebrow}
      </p>
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
        <div className="card-role-row">
          <p className="card-role">{item.role}</p>
          {item.liveHref ? (
            <a
              className="card-eyebrow-flag"
              href={item.liveHref}
              target={/^https?:\/\//.test(item.liveHref) ? "_blank" : undefined}
              rel={/^https?:\/\//.test(item.liveHref) ? "noreferrer" : undefined}
              onClick={(event) => event.stopPropagation()}
            >
              <span className="flag-noun">{item.flagLabel ?? "Live site"}</span>
              <span className="flag-verb">{item.linkLabel ?? DEFAULT_LINK_LABEL}</span> ↗
            </a>
          ) : item.status ? (
            <p className="card-eyebrow-flag">{item.status}</p>
          ) : null}
        </div>
        <WorkCardMedia item={item} />
        {item.summary ? <p className="card-summary">{item.summary}</p> : null}
      </AskableRegion>
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
          <WorkCard item={item} index={index} key={item.title} />
        ))}
      </div>

      <Reveal as="div" className="work-heading">
        <span className="section-heading" id="ai-practice" aria-hidden="true">
          AI Practice
        </span>
      </Reveal>

      <div aria-label="AI practice essays" className="essay-carousel" role="region">
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
      <ProfileRail suspended={showIntro} />
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

initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
