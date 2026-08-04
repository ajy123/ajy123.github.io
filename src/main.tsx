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
import { SwiftlyThumbnail } from "./components/SwiftlyThumbnail";
import { NyuThumbnail } from "./components/NyuThumbnail";
import { SelectionAskPill } from "./components/SelectionAskPill";
import { EssayDialog } from "./components/EssayDialog";
import { SiteLogo } from "./components/SiteLogo";
import { PhysicsFooter } from "./components/PhysicsFooter";
import { FooterDialsContext, footerVars } from "./footerDials";
import { ScrollIntro } from "./components/ScrollIntro";
import { initAnalytics } from "./analytics";
import { initFaviconPulse } from "./faviconPulse";
import { aiPracticeItems } from "./essays";
import type { EssayItem, WorkItem } from "./essays/types";
import { useEssayHashRoute } from "./essays/useEssayHashRoute";
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
    title: "From search box to research assistant",
    role: "Design + PM",
    year: "2026",
    liveHref: "/deeli/",
    linkLabel: "Read",
    flagLabel: "Case study",
    askHint: "How does she design what AI says?",
    askKind: "project",
    askAnchorPreference: "cursor",
    askPromptChips: [
      "did queries per active day rise 220% after launch?",
      "did 70% of queries become real questions instead of keywords?",
      "why make it ask a question back before researching?",
    ],
    // Follow-ups press on a published claim from each of the case study's three
    // evidence areas: the eval miss (research), the re-ask rate (post-launch),
    // and the headline growth number's baseline (outcome). The third slot used
    // to ask what "the PM half" of Design + PM covered, on a 5-engineer build.
    // Neither the team size nor a design/PM split is in SITE_CONTEXT or in this
    // card's zone text, and DEELI_CASE_CONTEXT only loads on /deeli/, so on the
    // homepage that chip could only be answered "I don't know". The baseline
    // question replaces it: it escalates the 220% chip above the way Swiftly's
    // follow-up escalates its own goal chip, and the page publishes the answer
    // ("Internal pilot vs. launch week 2, same denominator.").
    askFollowUpPromptChips: [
      "The model got six of seven right. What happened to the seventh?",
      "How is 28% of queries coming back as re-asks not a failure?",
      "The 220% compares an internal pilot to launch week 2. What makes that comparable?",
    ],
    summary:
      "A search redesign that narrows what someone means by a word like 'market' before it answers. Queries per active day rose 220%, and 70% arrived as real questions instead of keywords.",
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
  // Case-study page still to be built; card carries the coded thumbnail + status
  // flag until it ships. Copy locked against the deck (deck numbers only) + résumé.
  {
    eyebrow: "Product design",
    title: "From paper reports to live monitoring",
    role: "Data Monitor Team",
    year: "2022",
    liveHref: "/swiftly/",
    linkLabel: "Read",
    flagLabel: "Case study",
    askHint: "What was the Swiftly work?",
    askKind: "project",
    askAnchorPreference: "cursor",
    askPromptChips: [
      "did investigation time drop from 30+ hrs to 12–24 hrs?",
      "did the tool hit its under-12-hour goal?",
      "why did you choose a color legend over icons?",
    ],
    askFollowUpPromptChips: [
      "You missed your own <12-hour goal — what did that teach you?",
      "Why hover instead of click for the device status view?",
      "How did this project shift the team from engineering-led to design-led?",
    ],
    summary:
      "A 0-to-1 dashboard that let transit IT spot failing in-vehicle devices themselves instead of waiting on daily reports. Investigation time fell from 30+ hours to 12–24, and requests to the internal team dropped 20%.",
    thumbnail: SwiftlyThumbnail,
  },
  // Case-study page still to be built; card carries the coded thumbnail + status
  // flag until it ships. Copy locked against the résumé (real project facts).
  {
    eyebrow: "Service design",
    title: "Unifying campus maintenance",
    role: "Maintenance Team",
    year: "2018",
    liveHref: "/nyu/",
    linkLabel: "Read",
    flagLabel: "Case study",
    askHint: "What was the NYU work?",
    askKind: "project",
    askAnchorPreference: "cursor",
    askPromptChips: [
      "what did staff use before the unified platform?",
      "why one form view instead of pagination?",
      "who signed off before launch?",
    ],
    askFollowUpPromptChips: [
      "How was the 33% turnaround improvement measured?",
      "How did you decide to keep the floating action button over the alternatives?",
      "What would you build next if you'd kept working on this?",
    ],
    summary:
      "NYU Client Service staff processed maintenance requests across CSVs and disconnected tools. I replaced that with one work-order platform and measured processing, training, and communication time from launch. First-month turnaround fell roughly 33%.",
    thumbnail: NyuThumbnail,
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

// Shared by every tap-to-ask surface: a tap that lands on a real control
// (link, button, the video toggle) should activate that control instead of
// opening the composer.
const ASK_TAP_IGNORED_TARGETS =
  "a, button, input, textarea, select, option, label, video, audio, [role='button'], [role='link'], [role='switch'], [contenteditable='true']";

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
    event.target.closest(ASK_TAP_IGNORED_TARGETS)
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

// Touch entry point for a card that deliberately carries no ask zone (the
// Brand Identity card keeps only its "DEELI.AI" live link). It still needs a
// way in on touch, since no pin shows and there is no "/" key there, but it
// must not borrow a neighbouring card's chips or context: passing no
// suggestedPrompts/zoneContext lets resolveAskContext fall through to the
// page default, matching the data-ask-zone="none" opt-out in
// findNearestSection (src/askContext.ts).
function handleDezonedCardTap(event: ReactMouseEvent<HTMLElement>) {
  if (!isCoarsePointer()) return;
  if (
    event.target instanceof Element &&
    event.target.closest(ASK_TAP_IGNORED_TARGETS)
  ) {
    return;
  }

  requestCursorChatOpen({
    clientX: event.clientX,
    clientY: event.clientY,
  });
}

// Slash is a keyboard affordance; on touch the same zones respond to a tap.
function askActionSuffix() {
  // On touch no pin is shown and a tap opens suggested questions rather than
  // sending one, so "Tap to ask." next to a question string would promise the
  // same thing the pin used to break.
  return isCoarsePointer() ? "Tap for related questions." : "Press slash to ask.";
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
            "aria-label": `${askHint} ${askActionSuffix()}`,
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
      aria-label={`${hint} ${askActionSuffix()}`}
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
          askHint="What kind of role fits Joanna?"
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
          askContextText="Joanna Yen is a designer and engineer whose work shrinks queues: maintenance tickets, device-issue reports, and searches people gave up on. Lately she does the same for Deeli AI's research assistant: designing what it says, testing the model's output, and planning for when it's wrong. She currently designs and ships at Deeli AI, with 7+ years of product design across enterprise SaaS, analytics, and transit data, previously at Swiftly, Diligent, NYU, and Blue Fountain Media. She is an avid long-distance runner working remotely in APAC. Her product focus includes data rigor, design quality, research, product systems, interface prototypes, and data workflows. She works across Figma and code. Contact: joannayen24@gmail.com."
        >
          <div className="profile-identity">
            <h1>
              <span>Joanna Yen</span>
            </h1>
            <p className="profile-role-line">Senior product designer</p>

            <p className="sidebar-bio sidebar-story">
              Most of my work shrinks queues: maintenance tickets, device-issue
              reports, searches people gave up on. Lately I&apos;m doing the
              same for{" "}
              <span className="bio-hl">
                Deeli AI&apos;s research assistant
              </span>
              : designing what they say, testing model&apos;s output, and
              planning for when they&apos;re wrong.
            </p>

            {/*
              Chat entry as the rail's one material object (the Caleb-style
              gray card). Unmounts while the intro overlay is up so it can't
              be reached before the shell dismisses.
            */}
            {!suspended ? (
              <button
                className="rail-askbox"
                type="button"
                aria-keyshortcuts="/"
                onClick={() => requestCursorChatOpen()}
              >
                <span className="rail-askbox-key" aria-hidden="true">
                  /
                </span>
                <span className="rail-askbox-copy">
                  <b>Ask about my work</b>
                  <span>Try: what shipped at Deeli?</span>
                </span>
              </button>
            ) : null}

            <ul className="rail-ledger">
              <li>
                <span className="rail-ledger-co">Deeli AI</span>
                <span className="rail-ledger-role">Product design</span>
                <span className="rail-ledger-yr">now</span>
              </li>
              <li>
                <span className="rail-ledger-co">Swiftly</span>
                <span className="rail-ledger-role">Product design</span>
                <span className="rail-ledger-yr">&rsquo;22</span>
              </li>
              <li>
                <span className="rail-ledger-co">Diligent</span>
                <span className="rail-ledger-role">Product design</span>
                <span className="rail-ledger-yr">&rsquo;20</span>
              </li>
              <li>
                <span className="rail-ledger-co">NYU</span>
                <span className="rail-ledger-role">Service design</span>
                <span className="rail-ledger-yr">&rsquo;18</span>
              </li>
            </ul>
          </div>
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
                href="/joanna-yen-resume-seniorPD.pdf"
                download="JoannaYen_SeniorProductDesigner.pdf"
                aria-label="Download resume"
              >
                <span className="rail-link-label">Resume</span>
                <span className="rail-link-leader" aria-hidden="true" />
                <DownloadIcon />
              </a>

              <a
                className="rail-link"
                href="https://www.linkedin.com/in/joanna-yen"
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
                <span className="rail-link-label rail-link-email-long">
                  joannayen24@gmail.com
                </span>
                <span
                  className="rail-link-label rail-link-email-short"
                  aria-hidden="true"
                >
                  Email
                </span>
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

// Shared play/pause control for the work-card media (video and coded
// thumbnail). stopPropagation keeps the toggle from bubbling into the card's
// askable region (and the "See it live" overlay on live projects).
function MediaControl({ isPlaying, onToggle }: { isPlaying: boolean; onToggle: () => void }) {
  return (
    <button
      className="work-media-control"
      type="button"
      aria-label={isPlaying ? "Pause preview" : "Play preview"}
      title={isPlaying ? "Pause preview" : "Play preview"}
      data-ask-ignore="true"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {isPlaying ? <PauseGlyph /> : <PlayGlyph />}
    </button>
  );
}

// Coded-thumbnail sibling of the video branch. The Swiftly/NYU cards render an
// animated SVG instead of a video, but match the video cards' behaviour:
// autoplay loop plus a pause/play control. data-playing gates the CSS
// animations declared inside each thumbnail component, so toggling it settles
// the card on its resting hero frame.
function ThumbnailMedia({ item }: { item: WorkItem }) {
  const [isPlaying, setIsPlaying] = useState(true);
  if (!item.thumbnail) return null;
  const Thumbnail = item.thumbnail;
  return (
    <div className="work-media work-media--thumbnail" data-playing={isPlaying}>
      <Thumbnail />
      <MediaControl isPlaying={isPlaying} onToggle={() => setIsPlaying((playing) => !playing)} />
    </div>
  );
}

function WorkMedia({ item }: { item: WorkItem }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  if (!item.media) {
    if (item.thumbnail) return <ThumbnailMedia item={item} />;
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
      <MediaControl isPlaying={isPlaying} onToggle={() => void togglePlayback()} />
    </div>
  );
}

function EssayPracticeCard({ item, index }: { item: EssayItem; index: number }) {
  // The URL owns which essay is open, so a deep link, a share, and the Back
  // button all agree with the dialog.
  const { essayId, openEssay, closeEssay } = useEssayHashRoute();
  const isOpen = essayId === item.id;
  const [isCardHovered, setIsCardHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const dialogId = `essay-dialog-${item.id}`;

  const openDialog = () => {
    openEssay(item.id);
  };
  const closeDialog = () => {
    closeEssay();
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

  const revealDelay = 120 + index * 90;

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
          // askKind is optional on WorkItem now, but every essay item sets
          // both prompt chip lists; default to [] so the intent (a real
          // zone always has prompts) stays explicit instead of incidental.
          data-ask-prompts={JSON.stringify(item.askPromptChips ?? [])}
          data-ask-follow-up-prompts={JSON.stringify(
            item.askFollowUpPromptChips ?? [],
          )}
          data-ask-context={[
            item.title,
            item.role,
            item.year,
            item.summary,
            item.dek,
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
  const cardBody = (
    <>
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
    </>
  );

  return (
    <Reveal
      as="article"
      className="work-card case-card"
      delay={120 + index * 90}
    >
      <p className="card-eyebrow">
        {item.year} · {item.eyebrow}
      </p>
      {item.askHint ? (
        <AskableRegion
          className="work-card-askable"
          hint={item.askHint}
          // A zone with a hint always declares its kind, so this fallback is
          // unreachable for a correctly configured zone; it exists only to
          // satisfy AskableRegion's required AskableKind prop now that
          // askKind is optional on WorkItem.
          kind={item.askKind ?? "project"}
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
          {cardBody}
        </AskableRegion>
      ) : (
        // Same layout classes, no ask attributes: .askable-region carries the
        // flex column that the card body depends on, and dropping
        // data-ask-hint is what keeps the pin and the zone resolver away.
        // data-ask-zone="none" is an explicit opt-out (see findNearestSection
        // in src/askContext.ts): without it, a "/" press or tap here would
        // resolve to whichever real zone sits nearest on screen and borrow
        // its chips and context, misattributing the panel to that project.
        // Tap is still wired so touch keeps an entry point (no pin, no "/"
        // key there); it opens with page-default context, same as the fix
        // above.
        // No tabIndex here: with no data-ask-hint there is nothing for the
        // Enter path in ContextualAskHint to resolve, so a focus stop would
        // announce an instruction and then do nothing. Desktop keyboard
        // readers still reach the chat through the plain "/" shortcut and the
        // rail ask card, and this card's own DEELI.AI link stays focusable
        // inside cardBody.
        <div
          className="askable-region work-card-askable"
          data-ask-zone="none"
          onClick={handleDezonedCardTap}
        >
          {cardBody}
        </div>
      )}
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

      <div aria-label="AI practice essays" className="work-grid" role="region">
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
