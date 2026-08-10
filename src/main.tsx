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
import type { CaseContextKey } from "./chatEvents";
import {
  ContextualAskHint,
  type AskableKind,
  type AskAnchorPreference,
} from "./components/ContextualAskHint";
import { SwiftlyThumbnail } from "./components/SwiftlyThumbnail";
import { NyuThumbnail } from "./components/NyuThumbnail";
import { SelectionAskPill } from "./components/SelectionAskPill";
import { EssayDialog } from "./components/EssayDialog";
import { FooterDialsContext, footerVars } from "./footerDials";
import { ScrollIntro } from "./components/ScrollIntro";
import { initAnalytics } from "./analytics";
import { initFaviconPulse } from "./faviconPulse";
import { aiPracticeItems } from "./essays";
import { essayAskContext } from "./essays/essayAskContext";
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
  /* Explicit "this region carries no ask zone" marker, the Reveal-level twin of
   * the plain wrapper WorkCard renders for a card without an askHint. Only
   * meaningful when askHint is absent; see the createElement branch below. */
  askZone?: "none";
};

/* Shared verb-register default: the cursor pill and the touch flag must never
 * drift apart, so both fall back to this. */
const DEFAULT_LINK_LABEL = "See it live";

const workItems: WorkItem[] = [
  {
    eyebrow: "Product design",
    title: "From search box to research assistant",
    role: "Only designer, research to launch",
    year: "2026",
    liveHref: "/deeli/",
    linkLabel: "Read",
    flagLabel: "Case study",
    askHint: "How does she design what AI says?",
    askKind: "project",
    askAnchorPreference: "cursor",
    askCaseKey: "deeli",
    askPromptChips: [
      "did queries per active day rise 220% after launch?",
      "did 70% of queries become real questions instead of keywords?",
      "why make it ask a question back before researching?",
    ],
    // Follow-ups press on a published claim from each of the case study's three
    // evidence areas: the eval miss (research), the re-ask rate (post-launch),
    // and the headline growth number's baseline (outcome). The first two are
    // answerable only from DEELI_CASE_CONTEXT, which is why this card sets
    // askCaseKey — that digest also carries the guardrails these two questions
    // need ("the page gives the pattern, never the case"; "no feature is
    // committed"), so the question and its rail arrive together. The third asks
    // what the baseline was, not why it is comparable: the page dropped its
    // "same denominator" phrasing precisely because the pilot ran on a
    // different surface, so a chip that asked the model to defend
    // comparability would be asking it to reassert what the page retracted.
    askFollowUpPromptChips: [
      "The model got six of seven right. What happened to the seventh?",
      "How is 28% of queries coming back as re-asks not a failure?",
      "The 220% is measured against an internal pilot. What was that baseline?",
    ],
    summary:
      "Search that clears up an ambiguous query, a word like 'market', before it answers. Queries per active day rose 220%, and real questions instead of keywords went from 13% to 70%.",
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
      "Built Deeli's brand site and sales kit in a week for our Computex debut, where the enterprise pilot conversations started: semiconductors, aerospace, industrial research.",
    liveHref: "https://deeli.ai",
    flagLabel: "deeli.ai",
    media: {
      type: "video",
      src: caseStudyVideoUrl,
      mimeType: "video/mp4",
      poster: caseStudyPosterUrl,
    },
  },
  // Copy locked against the deck (deck numbers only) + résumé. The card keeps
  // its coded thumbnail rather than video; /swiftly/ has shipped since.
  {
    eyebrow: "Product design",
    title: "From paper reports to live monitoring",
    role: "Research to launch",
    year: "2022",
    liveHref: "/swiftly/",
    linkLabel: "Read",
    flagLabel: "Case study",
    askHint: "Why not a better daily report?",
    askKind: "project",
    askAnchorPreference: "cursor",
    askCaseKey: "swiftly",
    askPromptChips: [
      "did investigation time drop from 30+ hrs to 12–24 hrs?",
      "did the tool hit its under-12-hour goal?",
      "why a color legend instead of status icons?",
    ],
    askFollowUpPromptChips: [
      "The team missed its own under-12-hour goal. What did that teach them?",
      "Why hover instead of click for the device status view?",
      "How did this project change how the team planned?",
    ],
    summary:
      "A 0-to-1 dashboard that let transit IT spot failing in-vehicle devices themselves instead of waiting on daily reports. Investigation time fell from 30+ hours to 12–24, and requests to the internal team dropped 20%.",
    thumbnail: SwiftlyThumbnail,
  },
  // Copy locked against the résumé (real project facts). The card keeps its
  // coded thumbnail rather than video; /nyu/ has shipped since.
  {
    eyebrow: "Product design",
    title: "Unifying campus maintenance",
    role: "Research to launch",
    year: "2018",
    liveHref: "/nyu/",
    linkLabel: "Read",
    flagLabel: "Case study",
    askHint: "How was that 33% measured?",
    askKind: "project",
    askAnchorPreference: "cursor",
    askCaseKey: "nyu",
    askPromptChips: [
      "what did staff use before the unified platform?",
      "why one form view instead of pagination?",
      "who signed off before launch?",
    ],
    askFollowUpPromptChips: [
      "How was the 33% turnaround improvement measured?",
      "Why keep the floating action button over the alternatives?",
      "What would she build next if the project had continued?",
    ],
    summary:
      "NYU Client Service staff ran maintenance requests through CSVs and disconnected tools. I replaced that with one work-order platform. Work-request turnaround fell roughly 33% in the first month.",
    thumbnail: NyuThumbnail,
  },
];

const INTRO_EXIT_MS = 280;
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
    caseKey,
  }: {
    hint: string;
    kind: AskableKind;
    chips: string[];
    followUpChips: string[];
    contextText?: string;
    caseKey?: CaseContextKey;
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
    caseKey,
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
  askZone,
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
        : askZone === "none"
          ? {
              // Same opt-out the Brand Identity card uses (see WorkCard below
              // and findNearestSection in src/askContext.ts): dropping
              // data-ask-hint is what keeps the pin away, but without this
              // marker a "/" press or tap inside this region would fall to the
              // nearest zone with chips on screen and borrow a work card's
              // prompts and context. With it, resolveAskContext falls through
              // to the page default.
              // Tap stays wired so touch keeps an entry point here; it opens
              // with page-default context, and no tabIndex is added because
              // with no data-ask-hint the Enter path in ContextualAskHint has
              // nothing to resolve.
              "data-ask-zone": "none",
              onClick: handleDezonedCardTap,
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
  caseKey,
}: {
  children: ReactNode;
  className?: string;
  hint: string;
  kind: AskableKind;
  anchorPreference?: AskAnchorPreference;
  promptChips?: string[];
  followUpPromptChips?: string[];
  contextText?: string;
  caseKey?: CaseContextKey;
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
      // Read back off the DOM by the hover-pin path (ContextualAskHint reads
      // the zone element, not this component's props), so both entry points
      // send the same key.
      data-ask-case={caseKey}
      tabIndex={0}
      aria-label={`${hint} ${askActionSuffix()}`}
      onClick={(event) =>
        handleAskableTap(event, {
          hint,
          kind,
          chips: promptChips ?? [hint],
          followUpChips: followUpPromptChips ?? [],
          contextText,
          caseKey,
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

function ProfileRail({ suspended }: { suspended: boolean }) {
  const [copied, setCopied] = useState(false);
  const dials = useContext(FooterDialsContext);

  const copyEmail = async () => {
    await navigator.clipboard.writeText("joannayen24@gmail.com");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <aside className="profile-rail">
      <div className="profile-sticky">
        {/*
          The rail carries no ask zone: its pin question was retired with no
          replacement, and the zone attributes are all-or-nothing on askHint,
          so the chips and context text go with it rather than linger as dead
          props. Nothing is lost by that. The zone's chips were already the
          home page defaults in resolveAskContext ("what is Joanna's role?" is
          verbatim the same; the rest ask the same things), and the context
          text was a second biography of Joanna in third person, restating the
          global profile in src/siteContext.ts that every system prompt already
          carries. The visible bio is not sent either: a thread anchored inside
          this data-ask-zone="none" region now suppresses nearby page text
          entirely (see NEARBY_TEXT_SUPPRESSED in CursorChat.tsx), because
          feeding the rail's own copy back to the model contradicted the opt-out
          and had it answering from the bio instead of the profile fact.
          The rail's own "Ask about my work" button is the affordance here, and
          it is untouched.
        */}
        <Reveal as="div" className="profile-content" askZone="none">
          <div className="profile-identity">
            <h1>
              <span>Joanna Yen</span>
            </h1>
            <p className="profile-role-line">
              Senior product designer.{" "}
              <span className="profile-role-focus">
                AI and search in complex B2B.
              </span>
            </p>

            <p className="sidebar-bio sidebar-story">
              Most of my work shrinks queues: maintenance tickets, device-issue
              reports, searches people gave up on. Now the queue is research
              itself. On{" "}
              <span className="bio-hl">
                Deeli AI&apos;s research assistant
              </span>
              , I design what the model says, test its answers before they
              ship, and plan for when it&apos;s wrong. I own that end to end,
              and I start from the system.
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
                // Anchor to this button rather than opening coordinate-less.
                // Without a point, findNearestSection falls to its
                // viewport-centre scan and resolves to whichever zone happens
                // to be centred (at the top of the page, the Deeli card), so
                // the rail's own button answered as THIS PROJECT. Anchored
                // here it lands inside the rail's data-ask-zone="none" and
                // falls through to the page default, which is what a question
                // asked from the rail should get.
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  requestCursorChatOpen({
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2,
                  });
                }}
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
                <span className="rail-ledger-dom">AI research</span>
                <span className="rail-ledger-yr">now</span>
              </li>
              <li>
                <span className="rail-ledger-co">Swiftly</span>
                <span className="rail-ledger-dom">Transit analytics</span>
                <span className="rail-ledger-yr">&rsquo;22</span>
              </li>
              <li>
                <span className="rail-ledger-co">Diligent</span>
                <span className="rail-ledger-dom">News analytics</span>
                <span className="rail-ledger-yr">&rsquo;20</span>
              </li>
              <li>
                <span className="rail-ledger-co">NYU</span>
                <span className="rail-ledger-dom">Campus ops</span>
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

// The two card videos are large — 7MB for the Deeli film, 17MB for the Brand
// Identity montage — and the page used to fetch both before the visitor had
// scrolled anywhere. preload="metadata" does not fix that: measured against
// the production build, Chrome still pulled all 24MB at load. The only
// reliable gate is giving the element nothing to fetch, so the <source> is
// withheld until the card first enters the viewport and mounted then. A visitor
// who stops before the second card never pays for it.
//
// Pausing when the card leaves the viewport is the same idea in reverse: an
// offscreen loop is bandwidth and battery nobody is watching. A pause the
// visitor asked for is different from one the observer did, so userPausedRef
// records theirs and the observer refuses to override it.
function WorkMedia({ item, suspended }: { item: WorkItem; suspended: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const userPausedRef = useRef(false);
  // The observer and the arming effect each need to know what the other last
  // saw, and neither can read the other's state without re-subscribing, so the
  // two facts that cross between them live in refs.
  const inViewRef = useRef(false);
  const armedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnteredView, setHasEnteredView] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    // While the intro is up the cards sit in the layout viewport but behind a
    // full-screen overlay, and an IntersectionObserver counts them as visible
    // anyway. On a desktop viewport both video cards land in that first screen,
    // so arming here fetched all 24MB before the visitor had even entered the
    // site — the exact cost this gate exists to avoid. Waiting until the intro
    // is dismissed also keeps the fetch clear of first paint.
    if (!video || suspended) return;

    // Matches the NYU figure video: reduced motion means the poster holds and
    // the visitor presses play if they want the loop. Nothing is fetched until
    // they do. The observer still runs, so a video they did start still stops
    // when it leaves the viewport.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      userPausedRef.current = true;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // The callback receives a queue, not a single record. A fast scroll or
        // a blocked frame can deliver enter-then-exit together, and reading
        // entries[0] would act on the stale enter and leave the card playing
        // offscreen.
        const entry = entries[entries.length - 1];
        inViewRef.current = entry.isIntersecting;

        if (!entry.isIntersecting) {
          if (!video.paused) video.pause();
          return;
        }

        // Calling play() before the <source> is committed would flip paused to
        // false with nothing loaded: the control would read "Pause preview"
        // over a still poster, and pressing it would register as the visitor
        // pausing. Arm first and let the arming effect start playback.
        if (!armedRef.current) {
          setHasEnteredView(true);
          return;
        }
        if (!userPausedRef.current) void video.play().catch(() => {});
      },
      { threshold: 0.25 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [suspended]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasEnteredView) return;

    armedRef.current = true;
    // Inserting a <source> into an element that has loaded nothing starts
    // resource selection by itself. Calling load() anyway aborts that fetch and
    // reissues it, and the emptied event snaps any decoded frame back to the
    // poster — so only load() when the insertion did not already do it.
    if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load();
    if (!userPausedRef.current && inViewRef.current) void video.play().catch(() => {});
  }, [hasEnteredView]);

  if (!item.media) {
    if (item.thumbnail) return <ThumbnailMedia item={item} />;
    return <div className="work-media" aria-hidden="true" />;
  }

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      userPausedRef.current = false;
      // Under reduced motion the card is never armed on its own, so the first
      // press is what mounts the source; the arming effect starts playback.
      // They pressed the control, so the card is by definition in front of them
      // — say so, in case the observer has not reported yet.
      if (!hasEnteredView) {
        inViewRef.current = true;
        setHasEnteredView(true);
        return;
      }
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      userPausedRef.current = true;
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="work-media">
      <video
        ref={videoRef}
        aria-label={`${item.title} preview`}
        loop
        muted
        playsInline
        poster={item.media.poster}
        preload="none"
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      >
        {hasEnteredView ? <source src={item.media.src} type={item.media.mimeType} /> : null}
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
          // Same string the open dialog panel carries — see essayAskContext.
          data-ask-context={essayAskContext(item)}
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

function WorkCardMedia({ item, suspended }: { item: WorkItem; suspended: boolean }) {
  if (!item.liveHref) return <WorkMedia item={item} suspended={suspended} />;

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
      <WorkMedia item={item} suspended={suspended} />
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

function WorkCard({ item, index, suspended }: { item: WorkItem; index: number; suspended: boolean }) {
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
      <WorkCardMedia item={item} suspended={suspended} />
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
          caseKey={item.askCaseKey}
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

function WorkCanvas({ suspended }: { suspended: boolean }) {
  return (
    <main className="work-canvas" aria-label="Selected work">
      <Reveal as="div" className="work-heading">
        <span className="section-heading" aria-hidden="true">
          Work
        </span>
      </Reveal>

      <div className="work-grid">
        {workItems.map((item, index) => (
          <WorkCard item={item} index={index} suspended={suspended} key={item.title} />
        ))}
      </div>

      <Reveal as="div" className="work-heading">
        <span className="section-heading" id="ai-practice" aria-hidden="true">
          Designing with AI
        </span>
      </Reveal>

      <div
        aria-label="Designing with AI essays"
        className="work-grid"
        role="region"
      >
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
      <WorkCanvas suspended={showIntro} />
    </div>
  );

  return (
    <>
      {shell}
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
