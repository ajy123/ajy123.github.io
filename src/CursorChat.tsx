import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChatRequestError,
  isAbortError,
  streamChat,
  type ChatMessage,
  type ChatTier,
} from "./chatApi";
import {
  CURSOR_CHAT_OPENED_EVENT,
  CURSOR_CHAT_REQUEST_OPEN_EVENT,
  requestCursorChatOpen,
  type CursorChatZoneContext,
  type CursorChatRequestOpenDetail,
  type SuggestedPrompt,
} from "./chatEvents";
import { SITE_CONTEXT } from "./siteContext";
import { setLlmBusy } from "./llmActivity";
import {
  trackAudienceRole,
  trackChatQuery,
  trackChatResponse,
  type ChatQuerySource,
} from "./analytics";
// Same posters the WorkCanvas case-study cards use (see workItems in main.tsx),
// reused as inline thumbnails when a response names one of those projects.
import researchChatThumbUrl from "../images/deeli-casestudy-poster.jpg?url";
import brandIdentityThumbUrl from "../images/case-study-test-poster.jpg?url";

type ChatStatus =
  | "draft"
  | "loading"
  | "streaming"
  | "done"
  | "error";

// Viewport at/under this width opens the composer bottom-docked regardless of
// entry point; it's the small-screen layout, not a touch-only concern.
const DOCK_MAX_VIEWPORT = 860;

type CapturedContext = {
  url: string;
  title: string;
  audienceRole?: "recruiter" | "product design";
  selectedText: string;
  nearbyText: string;
  element: string;
  position: { x: number; y: number };
  viewport: { width: number; height: number };
};

type ChatTurn = {
  prompt: string;
  response: string;
};

type Thread = {
  id: string;
  pageX: number;
  pageY: number;
  prompt: string;
  response: string;
  history: ChatTurn[];
  context: CapturedContext | null;
  selectedTextOverride?: string;
  nearbyTextOverride?: string;
  status: ChatStatus;
  isPinned: boolean;
  createdAt: number;
  dragPageLeft?: number;
  dragPageTop?: number;
  draftPlaceholder?: string;
  suggestedPrompts?: SuggestedPrompt[];
  promptPool?: SuggestedPrompt[];
  shownPromptIds: string[];
  zoneContext?: CursorChatZoneContext;
  // Bottom-docked layout (touch FAB / small viewport) instead of anchored.
  docked?: boolean;
  // First-open role ask (Component B): shown once per session, above the
  // suggestion chips. See openComposer for the session gate.
  showRoleAsk?: boolean;
  // Whether this thread's chips/placeholder came from pickAudienceSuggestions
  // (the default "/" / FAB / intro-dismiss path) rather than an explicit
  // override (contextual hint, text selection) — a role pick only re-derives
  // suggestions for threads that started out audience-driven.
  audienceSuggestionsEligible?: boolean;
  // The `fromSelection` flag captured at open time, replayed into
  // pickDraftPlaceholder when a role pick re-derives the placeholder.
  fromSelectionOnOpen?: boolean;
  // The explicit followUpPrompts this thread opened with, replayed into
  // buildPromptPool when a role pick re-derives the pool (so they aren't lost).
  followUpPromptsOnOpen?: SuggestedPrompt[];
};

const COMPOSER_WIDTH = 360;
const COMPOSER_MAX_HEIGHT = 360;
const EDGE = 14;
// Gap between the anchor point and the panel's tight corner. Kept smaller than
// EDGE so the sharpened corner visibly touches what it points at.
const ANCHOR_GAP = 6;
// Must match cursorChatOut's duration in index.css.
const LEAVE_MS = 170;
const AUDIENCE_PRESETS = {
  recruiter: "recruiter",
  "product-design": "product design",
} as const;

// Suggested chips carry the questions. Placeholders stay instructional so the
// composer never repeats the same copy in two places.
const AUDIENCE_PROMPTS: Record<
  string,
  { chips: string[]; placeholder: string }
> = {
  recruiter: {
    chips: [
      "what is Joanna's role?",
      "what did she build for Deeli?",
      "what does Joanna focus on?",
      "did she build Deeli's site in a week?",
      "is Joanna a designer and engineer?",
      "what is Joanna's email?",
    ],
    placeholder: "or ask what's on your checklist",
  },
  "product design": {
    chips: [
      "does Joanna build AI products that hold data rigor and design quality equally?",
      "what was her role on the brand identity?",
      "does Joanna work across Figma and code?",
      "what did she build in a week?",
      "does the page say the work opened enterprise pilots across semiconductors, aerospace, and industrial research?",
      "is Joanna a designer and engineer?",
    ],
    placeholder: "or ask how anything here was made",
  },
  default: {
    chips: [
      "what is Joanna's role?",
      "what did she build for Deeli?",
      "what does Joanna focus on?",
      "did she build Deeli's site in a week?",
      "is Joanna a designer and engineer?",
      "what is Joanna's email?",
    ],
    placeholder: "or ask anything about her work",
  },
};

function getAudiencePrompts() {
  const role = getAudienceRole();
  return (role && AUDIENCE_PROMPTS[role]) || AUDIENCE_PROMPTS.default;
}

function toSuggestedPromptId(value: string, index: number) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `persona-${slug || "prompt"}-${index}`;
}

function pickAudienceSuggestions(): SuggestedPrompt[] {
  return getAudiencePrompts()
    .chips
    .slice(0, 3)
    .map((prompt, index) => ({
      id: toSuggestedPromptId(prompt, index),
      label: prompt,
      prompt,
    }));
}

function pickDraftPlaceholder(fromSelection: boolean): string {
  if (fromSelection) return "ask about what you selected";
  return getAudiencePrompts().placeholder;
}

// Union of a thread's opening suggestions and the full audience chip set,
// deduped by prompt text. This is the pool follow-up suggestions draw from
// after each answered turn.
function buildPromptPool(
  initial: SuggestedPrompt[] | undefined,
  followUps: SuggestedPrompt[] | undefined,
): SuggestedPrompt[] {
  const audience: SuggestedPrompt[] = getAudiencePrompts().chips.map(
    (prompt, index) => ({
      id: toSuggestedPromptId(prompt, index),
      label: prompt,
      prompt,
    }),
  );

  const seen = new Set<string>();
  const pool: SuggestedPrompt[] = [];
  for (const entry of [...(initial ?? []), ...(followUps ?? []), ...audience]) {
    const key = entry.prompt.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(entry);
  }
  return pool;
}

// Up to 3 pool prompts not already asked in this thread (history includes the
// just-answered prompt, so that is excluded too). Empty → no chips render.
function followUpsFor(
  thread: Thread,
  history: ChatTurn[],
): SuggestedPrompt[] | undefined {
  const used = new Set(history.map((turn) => turn.prompt.trim().toLowerCase()));
  const shown = new Set(thread.shownPromptIds);
  const picks = (thread.promptPool ?? [])
    .filter(
      (entry) =>
        !used.has(entry.prompt.trim().toLowerCase()) && !shown.has(entry.id),
    )
    .slice(0, 3);
  return picks.length ? picks : undefined;
}

function getZoneTagLabel(zoneContext?: CursorChatZoneContext) {
  if (!zoneContext) return null;

  const labelByKind: Record<string, string> = {
    project: "THIS PROJECT",
    essay: "THIS ESSAY",
    profile: "JOANNA",
  };

  return `ASKING ABOUT: ${labelByKind[zoneContext.kind] ?? "THIS PAGE"}`;
}

const CURSOR_CHAT_DEFAULTS = {
  chipStaggerMs: 70,
  radiusTight: 2,
  radiusRoomy: 16,
};

type AnchorCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

// Session keys for the first-open role ask (Component B). Kept alongside
// getAudienceRole so the read/write sides of the sessionStorage contract sit
// together. sessionGet/Set swallow the private-browsing throw in one place.
const AUDIENCE_ROLE_KEY = "ask-audience-role";
const AUDIENCE_ROLE_ASKED_KEY = "ask-audience-role-asked";
const AUDIENCE_ROLE_LOGGED_KEY = "ask-audience-role-logged";

function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in private browsing modes.
  }
}

const readStoredAudienceRole = (): string | null =>
  sessionGet(AUDIENCE_ROLE_KEY);
const writeStoredAudienceRole = (role: keyof typeof AUDIENCE_PRESETS): void =>
  sessionSet(AUDIENCE_ROLE_KEY, role);

const hasAskedAudienceRole = (): boolean =>
  sessionGet(AUDIENCE_ROLE_ASKED_KEY) === "1";
const markAudienceRoleAsked = (): void =>
  sessionSet(AUDIENCE_ROLE_ASKED_KEY, "1");

// First pick this session is the "intent" signal and must never be
// overwritten by a later toggle; this flag is the one-shot gate for that.
const hasLoggedAudienceRoleFirstTouch = (): boolean =>
  sessionGet(AUDIENCE_ROLE_LOGGED_KEY) === "1";
const markAudienceRoleFirstTouchLogged = (): void =>
  sessionSet(AUDIENCE_ROLE_LOGGED_KEY, "1");

function getAudienceRole(): CapturedContext["audienceRole"] {
  const audience = new URLSearchParams(window.location.search)
    .get("audience")
    ?.trim()
    .toLowerCase();

  if (audience) {
    return AUDIENCE_PRESETS[audience as keyof typeof AUDIENCE_PRESETS];
  }

  // Fallback: the deferred first-open role ask (Component B) writes the
  // visitor's pick here instead of a URL param.
  const stored = readStoredAudienceRole()?.trim().toLowerCase();
  if (!stored) return undefined;
  return AUDIENCE_PRESETS[stored as keyof typeof AUDIENCE_PRESETS];
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable ||
    target.closest("[contenteditable='true']") !== null
  );
}

function getElementLabel(element: Element | null) {
  if (!element) return "unknown";

  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes =
    element instanceof HTMLElement && element.className
      ? `.${String(element.className).trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";

  return `${tag}${id}${classes}`;
}

// Matches getBoundedText's nearbyText clamp — keeps a big selection from
// pushing the request past the worker's MAX_TOTAL_CHARS (24k) limit.
const MAX_SELECTED_CHARS = 2200;

// Contract with the Cloudflare Worker: validMessages() 400s any request whose
// system message does not start with this exact string, so the endpoint can't
// be scripted as a general-purpose proxy with a custom persona. This constant
// is the single source of truth on the client; worker/src/index.js keeps a
// byte-identical copy in its own SYSTEM_PREFIX. Keep the two in sync — a DEV
// assertion in buildMessages fails loudly if the assembled prompt drifts off
// this prefix, so drift is caught the first time chat is exercised locally.
export const CHAT_SYSTEM_PREFIX =
  "You are a concise assistant embedded directly in Joanna Yen's portfolio website.";

function getBoundedText(element: Element | null) {
  const source =
    element?.closest("[data-ask-hint]") ??
    element?.closest("section, article, aside, main, footer") ??
    element;
  const text = (source?.textContent ?? "").replace(/\s+/g, " ").trim();
  const links = Array.from(source?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])
    .slice(0, 4)
    .map((link) => `${link.textContent?.trim() || "link"}: ${link.href}`)
    .join("; ");
  return `${text}${links ? ` Links: ${links}` : ""}`.slice(0, 2200);
}

function getSelectionAnchor() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return {
    x: rect.left + rect.width / 2,
    y: rect.bottom,
    selectedText: selection.toString().trim(),
  };
}

function getViewportPoint(pageX: number, pageY: number) {
  return {
    x: pageX - window.scrollX,
    y: pageY - window.scrollY,
  };
}

function placeComposer(pageX: number, pageY: number) {
  const point = getViewportPoint(pageX, pageY);
  const opensLeft = point.x + COMPOSER_WIDTH + EDGE > window.innerWidth;
  const opensUp = point.y + COMPOSER_MAX_HEIGHT + EDGE > window.innerHeight;

  const preferredLeft = opensLeft
    ? point.x - COMPOSER_WIDTH - ANCHOR_GAP
    : point.x + ANCHOR_GAP;
  const preferredTop = opensUp
    ? point.y - COMPOSER_MAX_HEIGHT - ANCHOR_GAP
    : point.y + ANCHOR_GAP;

  return {
    left: Math.min(
      Math.max(preferredLeft, EDGE),
      window.innerWidth - COMPOSER_WIDTH - EDGE,
    ),
    top: Math.min(
      Math.max(preferredTop, EDGE),
      window.innerHeight - EDGE - 120,
    ),
    anchorCorner:
      `${opensUp ? "bottom" : "top"}-${opensLeft ? "right" : "left"}` as AnchorCorner,
  };
}

function placePin(pageX: number, pageY: number) {
  const point = getViewportPoint(pageX, pageY);
  const touchWidth =
    window.matchMedia("(pointer: coarse)").matches ||
    window.innerWidth <= DOCK_MAX_VIEWPORT;
  const targetWidth = touchWidth ? 88 : 44;
  const roomOnRight = window.innerWidth - point.x - EDGE;
  const side = roomOnRight >= targetWidth + 8 ? "right" : "left";
  const preferredControlLeft =
    side === "right" ? point.x + 8 : point.x - targetWidth - 8;
  const controlLeft = Math.min(
    Math.max(preferredControlLeft, EDGE),
    window.innerWidth - EDGE - targetWidth,
  );
  const controlTop = Math.min(
    Math.max(point.y - 52, EDGE),
    window.innerHeight - EDGE - 44,
  );
  return {
    left: point.x,
    top: point.y,
    controlX: controlLeft - point.x,
    controlY: controlTop - point.y,
    side,
  };
}

function captureContext(
  pageX: number,
  pageY: number,
  selectedTextOverride = "",
  nearbyTextOverride = "",
): CapturedContext {
  const point = getViewportPoint(pageX, pageY);
  const selection = window.getSelection();
  // Clamp to the same bound as getBoundedText's nearbyText. A large selection
  // (a whole essay, Ctrl+A) would otherwise ship unbounded into the system
  // prompt and can push the request past the worker's 24k-char cap, which
  // 400s as a generic "could not get a response" the user can't retry past.
  const selectedText = (
    selectedTextOverride ||
    selection?.toString().trim() ||
    ""
  ).slice(0, MAX_SELECTED_CHARS);
  const element = document.elementFromPoint(point.x, point.y);
  const audienceRole = getAudienceRole();
  const context = {
    url: window.location.href,
    title: document.title,
    ...(audienceRole ? { audienceRole } : {}),
    selectedText,
    nearbyText: nearbyTextOverride || getBoundedText(element),
    element: getElementLabel(element),
    position: { x: Math.round(pageX), y: Math.round(pageY) },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };

  console.groupCollapsed("[cursor-chat] captured context");
  console.log(context);
  console.groupEnd();
  if (import.meta.env.DEV) {
    (
      window as unknown as { __cursorChatLastContext?: CapturedContext }
    ).__cursorChatLastContext = context;
  }

  return context;
}

// Generation narration: silent-ish pulse first, truthful stage phrases only
// when the wait drags on. Ends on "composing…" and holds.
const THINKING_PHRASES = [
  "thinking…",
  "reading this page…",
  "checking Joanna's notes…",
  "composing…",
];
const THINKING_PHRASE_DELAYS_MS = [3000, 5500, 8000];

// Only the most recent turns are re-sent to the API. Older turns rarely matter
// for a portfolio chat, and an unbounded history would eventually trip the
// worker's 40-message / 24k-char request limit and error the thread. The char
// budget matters as much as the turn count: 8 turns of 2000-char prompts
// (the composer's maxLength) plus full-length replies alone would blow the
// worker's 24k cap, so trimming stops at whichever bound hits first.
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 14000;

function recentHistory(history: ChatTurn[]): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let chars = 0;
  for (const turn of history.slice(-MAX_HISTORY_TURNS).reverse()) {
    chars += turn.prompt.length + turn.response.length;
    if (chars > MAX_HISTORY_CHARS && kept.length > 0) break;
    kept.unshift(turn);
  }
  return kept;
}

// Complexity routing: selection asks, essay zones, follow-up depth, and long
// questions go to the stronger model; one-shot profile lookups stay on the
// fast cheap one. The worker owns the tier→model map, so this only names the
// intent, never a model.
function pickTier(
  prompt: string,
  context: CapturedContext,
  history: ChatTurn[],
  zoneContext?: CursorChatZoneContext,
): ChatTier {
  if (context.selectedText) return "deep";
  if (zoneContext?.kind === "essay") return "deep";
  if (history.length >= 2) return "deep";
  if (prompt.length > 160) return "deep";
  return "quick";
}

function buildMessages(
  prompt: string,
  context: CapturedContext,
  history: ChatTurn[] = [],
  zoneContext?: CursorChatZoneContext,
): ChatMessage[] {
  const audienceGuidance =
    context.audienceRole === "recruiter"
      ? "Audience role: recruiter. Tailor the answer toward role fit, experience, collaboration, impact, and why Joanna is relevant to hiring or recruiting evaluation. Do not claim personal knowledge of the visitor."
      : context.audienceRole === "product design"
        ? "Audience role: product design. Tailor the answer toward design systems, product judgment, interaction design, prototyping, systems thinking, and craft. Do not claim personal knowledge of the visitor."
        : "";

  const contextLines = [
    `Page title: ${context.title}`,
    context.audienceRole ? `Audience role: ${context.audienceRole}` : "",
    zoneContext
      ? `The visitor opened this chat from the ${zoneContext.kind} section, invited by the prompt "${zoneContext.hint}". Answer with that focus.`
      : "",
    context.selectedText
      ? `Selected text (the visitor's primary focus): ${context.selectedText}`
      : "",
    context.nearbyText ? `Nearby content on the page: ${context.nearbyText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system =
    // MUST stay the literal first characters of every system prompt: the
    // Worker's validMessages() rejects any request whose system message does
    // not start with this exact string (see CHAT_SYSTEM_PREFIX). Reword the
    // rest freely; do not edit the prefix without matching worker/src/index.js.
    `${CHAT_SYSTEM_PREFIX} ` +
    "Answer the visitor's question about Joanna and the page they are looking at. " +
    "Ground your answer in the site profile and page context below. Prefer the selected text when present. " +
    "Use only facts explicitly stated in that context. Do not speculate, infer missing implementation details, or add examples that are not written there. " +
    "If a fact is not in the context, say you don't know rather than inventing it. For a yes-or-no question, begin with Yes or No and restate only the supporting fact. Answer in no more than two short sentences. " +
    (audienceGuidance ? `${audienceGuidance} ` : "") +
    "Keep replies direct, plain, and helpful.\n\n" +
    SITE_CONTEXT +
    "\n\nPage context:\n" +
    contextLines;

  // Fail loudly in dev if the system prompt no longer starts with the exact
  // prefix the worker gates on — otherwise the drift only shows up as a 502/400
  // in production. Stripped from prod bundles by the DEV guard.
  if (import.meta.env.DEV && !system.startsWith(CHAT_SYSTEM_PREFIX)) {
    console.error(
      "[cursor-chat] system prompt no longer starts with CHAT_SYSTEM_PREFIX — " +
        "the worker will 400 every request. Keep worker SYSTEM_PREFIX in sync.",
    );
  }

  const messages: ChatMessage[] = [{ role: "system", content: system }];

  recentHistory(history).forEach((turn) => {
    messages.push(
      { role: "user", content: turn.prompt },
      { role: "assistant", content: turn.response },
    );
  });

  messages.push({ role: "user", content: prompt });
  return messages;
}

// Keyword → inline thumbnail. Only projects with real assets; keywords track
// how the model actually names them (see SITE_CONTEXT / workItems). Patterns are
// non-global so .exec always reports the first match's index.
type ResponseMedia = { src: string; alt: string };
const RESPONSE_MEDIA: { pattern: RegExp; media: ResponseMedia }[] = [
  {
    pattern: /research chat|keyword search/i,
    media: {
      src: researchChatThumbUrl,
      alt: "Poster from the research chat case study",
    },
  },
  {
    // Not /deeli/: both case studies are Deeli work, so the company name
    // would bind this poster to research-chat answers via earliest-match.
    pattern: /brand identity|sales kit|computex/i,
    media: {
      src: brandIdentityThumbUrl,
      alt: "Poster from Deeli's brand identity case study",
    },
  },
];

// First project named in the response wins — matched by the earliest position
// in the text (not array order), so a growing stream never swaps the image once
// one keyword has appeared. At most one image per turn.
function matchResponseMedia(text: string): ResponseMedia | null {
  let best: { index: number; media: ResponseMedia } | null = null;
  for (const entry of RESPONSE_MEDIA) {
    const hit = entry.pattern.exec(text);
    if (hit && (best === null || hit.index < best.index)) {
      best = { index: hit.index, media: entry.media };
    }
  }
  return best?.media ?? null;
}

// Streaming fade-in. streamChat hands us the full accumulated text each step, so
// we diff against what we've already emitted and wrap only the new tail in its
// own span. Each span fades opacity 0→1 exactly once on mount, keyed by a stable
// id so already-settled spans never re-animate on unrelated re-renders (pin,
// drag, chip hover). prefers-reduced-motion disables the fade in CSS, so text
// appears instantly. Chunk-level (per streamed delta), not per character.
function StreamedResponseText({ text }: { text: string }) {
  const seenRef = useRef(text.length);
  const nextIdRef = useRef(1);
  const [chunks, setChunks] = useState<{ id: number; text: string }[]>(() =>
    text ? [{ id: 0, text }] : [],
  );

  useEffect(() => {
    if (text.length > seenRef.current) {
      const delta = text.slice(seenRef.current);
      seenRef.current = text.length;
      setChunks((prev) => [...prev, { id: nextIdRef.current++, text: delta }]);
    } else if (text.length < seenRef.current) {
      // Response replaced (retry / a reused instance): reseed with a fresh id
      // so the new opening chunk mounts and fades rather than silently swapping.
      seenRef.current = text.length;
      setChunks(text ? [{ id: nextIdRef.current++, text }] : []);
    }
  }, [text]);

  return (
    <>
      {chunks.map((chunk) => (
        <span key={chunk.id} className="cursor-chat-stream-chunk">
          {chunk.text}
        </span>
      ))}
    </>
  );
}

export function CursorChat({
  suspended = false,
}: {
  suspended?: boolean;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [tick, setTick] = useState(0);
  const pointerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  // One controller per thread: generations can overlap (a pinned thread keeps
  // streaming while another submits), so a shared controller would let one
  // thread's close/stop abort a different thread's request.
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const abortThread = (id: string) => {
    abortControllersRef.current.get(id)?.abort();
    abortControllersRef.current.delete(id);
  };
  const suspendedRef = useRef(suspended);
  // Increments on every role change after the first — the "switch" trigger's
  // counter. The first pick itself is logged as first_touch, never counted.
  const audienceRoleSwitchCountRef = useRef(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const previousPanelHeightRef = useRef<number | null>(null);
  const heightTimerRef = useRef<number | null>(null);
  const suggestionExitTimerRef = useRef<number | null>(null);
  const [exitingSuggestions, setExitingSuggestions] = useState<
    SuggestedPrompt[] | null
  >(null);
  const [announcement, setAnnouncement] = useState("");

  // Exit choreography: the panel plays cursorChatOut before it unmounts, so
  // closing reads as a collapse toward the anchor instead of a teleport. State
  // drives the class; the ref guards handlers captured by the mount effect.
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const leavingIdRef = useRef<string | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const beginLeave = (id: string, finish: () => void) => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      finish();
      return;
    }

    leavingIdRef.current = id;
    setLeavingId(id);
    leaveTimerRef.current = window.setTimeout(() => {
      leavingIdRef.current = null;
      leaveTimerRef.current = null;
      setLeavingId(null);
      finish();
    }, LEAVE_MS);
  };

  const restoreFocus = () => {
    window.requestAnimationFrame(() => {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) {
        previous.focus();
        return;
      }
      const pinButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".cursor-chat-pin-open"),
      );
      const fallback =
        pinButtons[pinButtons.length - 1] ??
        document.querySelector<HTMLButtonElement>(".cursor-chat-fab");
      fallback?.focus();
    });
  };

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current);
      }
      if (heightTimerRef.current !== null) {
        window.clearTimeout(heightTimerRef.current);
      }
      if (suggestionExitTimerRef.current !== null) {
        window.clearTimeout(suggestionExitTimerRef.current);
      }
    };
  }, []);

  const activeThread = threads.find((thread) => thread.id === activeId) ?? null;
  const activeZoneTag = getZoneTagLabel(activeThread?.zoneContext);

  // Generation narration index; restarts per thread.
  const [thinkingPhase, setThinkingPhase] = useState(0);
  const isGenerating = activeThread?.status === "loading";
  useEffect(() => {
    setThinkingPhase(0);
    if (!isGenerating) return;
    const timers = THINKING_PHRASE_DELAYS_MS.map((ms, index) =>
      window.setTimeout(() => setThinkingPhase(index + 1), ms),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [isGenerating, activeThread?.id]);

  // Publish "model is working" to ambient listeners (the logo's thinking
  // shimmer). Any thread counts, not just the active one — background
  // generation is still generation. No cleanup here: `threads` changes on
  // every streamed token, and a per-change false→true flap would restart the
  // shimmer's CSS animation each chunk. The store dedupes same-value sets, so
  // this effect is cheap; a separate unmount-only cleanup clears the bit.
  useEffect(() => {
    setLlmBusy(
      threads.some(
        (thread) =>
          thread.status === "loading" || thread.status === "streaming",
      ),
    );
  }, [threads]);
  useEffect(() => () => setLlmBusy(false), []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    suspendedRef.current = suspended;
  }, [suspended]);

  const structuralKey = activeThread
    ? `${activeThread.id}:${activeThread.status}:${(
        activeThread.suggestedPrompts ?? exitingSuggestions ?? []
      )
        .map((prompt) => prompt.id)
        .join(",")}`
    : "closed";

  // Animate only structural state changes. Streamed token updates leave this
  // key unchanged, so the panel grows naturally instead of pumping per chunk.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      previousPanelHeightRef.current = null;
      return;
    }

    const interruptedHeight = panel.getBoundingClientRect().height;
    const interrupted = heightTimerRef.current !== null;
    if (heightTimerRef.current !== null) {
      window.clearTimeout(heightTimerRef.current);
      heightTimerRef.current = null;
      panel.classList.remove("is-height-transitioning");
      panel.style.height = "";
    }
    const nextHeight = panel.getBoundingClientRect().height;
    const previousHeight = interrupted
      ? interruptedHeight
      : previousPanelHeightRef.current;
    previousPanelHeightRef.current = nextHeight;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (
      reduceMotion ||
      previousHeight === null ||
      Math.abs(nextHeight - previousHeight) < 1
    ) {
      return;
    }

    panel.classList.add("is-height-transitioning");
    panel.style.height = `${previousHeight}px`;
    const frame = window.requestAnimationFrame(() => {
      panel.style.height = `${nextHeight}px`;
    });
    heightTimerRef.current = window.setTimeout(() => {
      panel.classList.remove("is-height-transitioning");
      panel.style.height = "";
      previousPanelHeightRef.current = panel.getBoundingClientRect().height;
      heightTimerRef.current = null;
    }, 280);

    return () => window.cancelAnimationFrame(frame);
  }, [structuralKey]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleScrollOrResize = () => setTick((value) => value + 1);

    const openComposer = ({
      anchorOverride,
      suggestedPrompts,
      followUpPrompts,
      zoneContext,
      docked,
    }: {
      anchorOverride?: { x: number; y: number };
      suggestedPrompts?: SuggestedPrompt[];
      followUpPrompts?: SuggestedPrompt[];
      zoneContext?: CursorChatZoneContext;
      docked?: boolean;
    } = {}) => {
      if (suspendedRef.current) return;

      if (activeIdRef.current) {
        textareaRef.current?.focus();
        return;
      }

      previousFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      const selectionAnchor = getSelectionAnchor();
      const anchor = anchorOverride ?? selectionAnchor ?? pointerRef.current;
      const fromSelection = !anchorOverride && selectionAnchor !== null;
      const audienceSuggestionsEligible = !anchorOverride && !fromSelection;
      const threadSuggestedPrompts =
        suggestedPrompts ??
        (audienceSuggestionsEligible ? pickAudienceSuggestions() : undefined);
      // Explicit request wins; otherwise the small-screen layout docks.
      const isDocked = docked ?? window.innerWidth <= DOCK_MAX_VIEWPORT;
      const id = crypto.randomUUID();
      const anchorElement = document.elementFromPoint(anchor.x, anchor.y);
      const nearbyTextOverride =
        zoneContext?.contextText || getBoundedText(anchorElement);
      // Deferred role ask (Component B): fires once per session, on whichever
      // path is first to call openComposer — the "/" key, the FAB, the intro
      // dismiss, a contextual hint, or a text selection all funnel through
      // here, so gating here (rather than main.tsx's intro-only hook) is the
      // only place that sees every entry point.
      const showRoleAsk = !hasAskedAudienceRole();
      if (showRoleAsk) markAudienceRoleAsked();

      setDraft("");
      setAnnouncement("");
      setExitingSuggestions(null);
      activeIdRef.current = id;
      setThreads((current) => [
        ...current,
        {
          id,
          pageX: anchor.x + window.scrollX,
          pageY: anchor.y + window.scrollY,
          prompt: "",
          response: "",
          history: [],
          context: null,
          selectedTextOverride: selectionAnchor?.selectedText,
          nearbyTextOverride,
          status: "draft",
          isPinned: false,
          createdAt: Date.now(),
          suggestedPrompts: threadSuggestedPrompts,
          promptPool: buildPromptPool(threadSuggestedPrompts, followUpPrompts),
          shownPromptIds: (threadSuggestedPrompts ?? []).map(
            (prompt) => prompt.id,
          ),
          zoneContext,
          docked: isDocked,
          draftPlaceholder: pickDraftPlaceholder(fromSelection),
          showRoleAsk,
          audienceSuggestionsEligible,
          fromSelectionOnOpen: fromSelection,
          followUpPromptsOnOpen: followUpPrompts,
        },
      ]);
      setActiveId(id);
      window.dispatchEvent(
        new CustomEvent(CURSOR_CHAT_OPENED_EVENT, {
          detail: { id, clientX: anchor.x, clientY: anchor.y },
        }),
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !isEditableTarget(event.target)) {
        if (suspendedRef.current) return;
        event.preventDefault();
        openComposer();
      }

      if (event.key === "Escape" && activeIdRef.current) {
        event.preventDefault();
        closeActive();
      }
    };

    const handleRequestOpen = (event: Event) => {
      const detail = (event as CustomEvent<CursorChatRequestOpenDetail>).detail;
      const anchor =
        typeof detail?.clientX === "number" && typeof detail?.clientY === "number"
          ? { x: detail.clientX, y: detail.clientY }
          : undefined;

      openComposer({
        anchorOverride: anchor,
        suggestedPrompts: detail?.suggestedPrompts,
        followUpPrompts: detail?.followUpPrompts,
        zoneContext: detail?.zoneContext,
        docked: detail?.docked,
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(CURSOR_CHAT_REQUEST_OPEN_EVENT, handleRequestOpen);
    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(CURSOR_CHAT_REQUEST_OPEN_EVENT, handleRequestOpen);
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [activeId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 154)}px`;
  }, [draft, activeId]);

  // Close discards the thread — pinning is only ever the explicit pin
  // button's job. Auto-pinning on close left "random" pin markers behind.
  const closeActive = () => {
    const id = activeIdRef.current;
    if (!id || leavingIdRef.current) return;

    abortThread(id);
    beginLeave(id, () => finishCloseActive(id));
  };

  const finishCloseActive = (id: string) => {
    setThreads((current) => current.filter((item) => item.id !== id));
    activeIdRef.current = null;
    setActiveId(null);
    setDraft("");
    restoreFocus();
  };

  const removeThread = (id: string) => {
    abortThread(id);
    setThreads((current) => current.filter((thread) => thread.id !== id));
  };

  // Stop keeps the thread open: partial text becomes the answer; a stop before
  // any text arrived just returns the thread to a draft you can resend.
  const stopActive = () => {
    if (!activeThread) return;
    const id = activeThread.id;
    const stoppedResponse = activeThread.response;

    if (!stoppedResponse) {
      setDraft(activeThread.prompt);
      setAnnouncement("Generation stopped. Your prompt is ready to edit.");
    } else {
      setAnnouncement(`Response stopped. ${stoppedResponse}`);
    }
    window.requestAnimationFrame(() => textareaRef.current?.focus());

    abortThread(id);
    setThreads((current) =>
      current.map((thread) => {
        if (thread.id !== id) return thread;
        if (!thread.response) {
          return { ...thread, status: "draft" as ChatStatus };
        }
        const nextHistory = [
          ...thread.history,
          { prompt: thread.prompt, response: thread.response },
        ];
        const suggestedPrompts = followUpsFor(thread, nextHistory);
        return {
          ...thread,
          status: "done" as ChatStatus,
          history: nextHistory,
          suggestedPrompts,
          shownPromptIds: [
            ...thread.shownPromptIds,
            ...(suggestedPrompts ?? []).map((prompt) => prompt.id),
          ],
        };
      }),
    );
  };

  // Generation core. Assumes the thread already holds `message` as its prompt
  // and `context` captured.
  const runGeneration = async (
    id: string,
    message: string,
    context: CapturedContext,
    history: ChatTurn[],
    zoneContext: CursorChatZoneContext | undefined,
  ) => {
    const patch = (updater: (thread: Thread) => Thread) =>
      setThreads((current) =>
        current.map((thread) => (thread.id === id ? updater(thread) : thread)),
      );

    abortThread(id); // a retry replaces any in-flight request for this thread
    const controller = new AbortController();
    abortControllersRef.current.set(id, controller);
    const startedAt = performance.now();

    try {
      const messages = buildMessages(message, context, history, zoneContext);
      const response = await streamChat(
        messages,
        (full) => {
          patch((thread) => ({ ...thread, status: "streaming", response: full }));
        },
        controller.signal,
        pickTier(message, context, history, zoneContext),
      );
      patch((thread) => {
        const nextHistory = [...thread.history, { prompt: message, response }];
        const suggestedPrompts = followUpsFor(thread, nextHistory);
        return {
          ...thread,
          status: "done",
          response,
          history: nextHistory,
          suggestedPrompts,
          shownPromptIds: [
            ...thread.shownPromptIds,
            ...(suggestedPrompts ?? []).map((prompt) => prompt.id),
          ],
        };
      });
      setAnnouncement(response);
      trackChatResponse("done", Math.round(performance.now() - startedAt));
    } catch (error) {
      if (isAbortError(error)) return;
      const status = error instanceof ChatRequestError ? error.status : undefined;
      trackChatResponse("error", Math.round(performance.now() - startedAt), status);
      console.error("[cursor-chat] model response failed", error);
      // A rate limit is the one failure where "retry now" is the wrong advice.
      const copy =
        status === 429
          ? "You're sending messages quickly — give it a minute, then retry."
          : "Could not get a response. Retry keeps your prompt.";
      patch((thread) => ({
        ...thread,
        status: "error",
        response: copy,
      }));
      setAnnouncement(copy);
    } finally {
      if (abortControllersRef.current.get(id) === controller) {
        abortControllersRef.current.delete(id);
      }
    }
  };

  const submitThread = async (promptOverride?: string) => {
    if (!activeThread || leavingIdRef.current) return;

    const id = activeThread.id;
    // One precedence chain decides both what is sent and how it's classified,
    // so the analytics label can't drift from the submission logic.
    const [message, querySource]: [string, ChatQuerySource] = promptOverride?.trim()
      ? [promptOverride.trim(), "suggested"]
      : draft.trim()
        ? [draft.trim(), "typed"]
        : activeThread.status === "error"
          ? [activeThread.prompt.trim(), "retry"]
          : ["", "typed"];
    if (
      !message ||
      activeThread.status === "loading" ||
      activeThread.status === "streaming"
    ) {
      return;
    }

    const context = captureContext(
      activeThread.pageX,
      activeThread.pageY,
      activeThread.selectedTextOverride,
      activeThread.nearbyTextOverride,
    );
    const history = activeThread.history;
    const zoneContext = activeThread.zoneContext;

    trackChatQuery(message, querySource, zoneContext?.kind);
    if (activeThread.suggestedPrompts?.length) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (!reduceMotion) {
        setExitingSuggestions(activeThread.suggestedPrompts);
        if (suggestionExitTimerRef.current !== null) {
          window.clearTimeout(suggestionExitTimerRef.current);
        }
        suggestionExitTimerRef.current = window.setTimeout(() => {
          setExitingSuggestions(null);
          suggestionExitTimerRef.current = null;
        }, 140);
      } else {
        setExitingSuggestions(null);
      }
    }
    setAnnouncement("");
    setDraft("");

    const patch = (updater: (thread: Thread) => Thread) =>
      setThreads((current) =>
        current.map((thread) => (thread.id === id ? updater(thread) : thread)),
      );

    patch((thread) => ({
      ...thread,
      prompt: message,
      context,
      status: "loading",
      response: "",
      isPinned: false,
      suggestedPrompts: undefined,
      // An ignored first-open role ask tucks away once the visitor sends.
      showRoleAsk: false,
    }));

    await runGeneration(id, message, context, history, zoneContext);
  };

  const collapseActive = () => {
    if (!activeThread || activeThread.status === "draft") return;
    if (leavingIdRef.current) return;

    const id = activeThread.id;
    beginLeave(id, () => {
      setThreads((current) =>
        current.map((thread) =>
          thread.id === id ? { ...thread, isPinned: true } : thread,
        ),
      );
      activeIdRef.current = null;
      setActiveId(null);
      restoreFocus();
    });
  };

  const reopenThread = (id: string) => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id ? { ...thread, isPinned: false } : thread,
      ),
    );
    activeIdRef.current = id;
    setActiveId(id);
  };

  const retryActive = () => {
    if (!activeThread) return;
    void submitThread();
  };

  // A pick from the first-open role ask. Persists the role (so
  // getAudienceRole() picks it up everywhere), logs the intent once as
  // first_touch and every later change as a switch, then re-derives the
  // *current* thread's chips + placeholder so the tailoring updates live
  // instead of waiting for the next open.
  const pickAudienceRole = (
    id: string,
    role: keyof typeof AUDIENCE_PRESETS,
  ) => {
    writeStoredAudienceRole(role);

    if (hasLoggedAudienceRoleFirstTouch()) {
      audienceRoleSwitchCountRef.current += 1;
      trackAudienceRole(role, {
        trigger: "switch",
        switchCount: audienceRoleSwitchCountRef.current,
      });
    } else {
      markAudienceRoleFirstTouchLogged();
      trackAudienceRole(role, { trigger: "first_touch", switchCount: 0 });
    }

    setThreads((current) =>
      current.map((thread) => {
        if (thread.id !== id) return thread;
        // The placeholder is audience-driven, so it refreshes for every thread.
        const draftPlaceholder = pickDraftPlaceholder(
          thread.fromSelectionOnOpen ?? false,
        );
        // But chips/pool only re-derive for threads that opened with the
        // default audience-driven suggestions; a contextual hint's or a
        // selection's own suggestions are intentional and stay untouched.
        if (!thread.audienceSuggestionsEligible) {
          return { ...thread, showRoleAsk: false, draftPlaceholder };
        }
        const nextSuggestedPrompts = pickAudienceSuggestions();
        return {
          ...thread,
          showRoleAsk: false,
          suggestedPrompts: nextSuggestedPrompts,
          promptPool: buildPromptPool(
            nextSuggestedPrompts,
            thread.followUpPromptsOnOpen,
          ),
          shownPromptIds: (nextSuggestedPrompts ?? []).map(
            (prompt) => prompt.id,
          ),
          draftPlaceholder,
        };
      }),
    );
  };

  // Dismissing the ask logs nothing — it's not a signal either way.
  const dismissRoleAsk = (id: string) => {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id ? { ...thread, showRoleAsk: false } : thread,
      ),
    );
  };

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Docked composers are laid out entirely by CSS (fixed to the bottom rail),
  // so placeComposer is skipped and drag is disabled (activePosition stays null).
  const isDockedActive = activeThread?.docked === true;
  const activePosition =
    activeThread && !isDockedActive
      ? (() => {
          const placed = placeComposer(activeThread.pageX, activeThread.pageY);
          if (
            activeThread.dragPageLeft == null ||
            activeThread.dragPageTop == null
          ) {
            return placed;
          }
          return {
            ...placed,
            left: activeThread.dragPageLeft - window.scrollX,
            top: activeThread.dragPageTop - window.scrollY,
          };
        })()
      : null;

  const handleTopbarPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!activePosition) return;
    if ((event.target as HTMLElement).closest("button")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseLeft: activePosition.left,
      baseTop: activePosition.top,
    };
    setIsDragging(true);
  };

  const handleTopbarPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = dragStateRef.current;
    const id = activeIdRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !id) return;

    const left = Math.min(
      Math.max(drag.baseLeft + event.clientX - drag.startX, EDGE),
      window.innerWidth - COMPOSER_WIDTH - EDGE,
    );
    const top = Math.min(
      Math.max(drag.baseTop + event.clientY - drag.startY, EDGE),
      window.innerHeight - EDGE - 120,
    );
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id
          ? {
              ...thread,
              dragPageLeft: left + window.scrollX,
              dragPageTop: top + window.scrollY,
            }
          : thread,
      ),
    );
  };

  const handleTopbarPointerEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setIsDragging(false);
  };

  // Inline thumbnail for the active answer, if it names a known project.
  // Memoized on the response text: CursorChat re-renders on drags/ticks/
  // keystrokes, and the regexes only need to run when the text changes.
  const activeResponse = activeThread?.response;
  const activeStatus = activeThread?.status;
  const responseMedia = useMemo(
    () =>
      activeResponse !== undefined && activeStatus !== "error"
        ? matchResponseMedia(activeResponse)
        : null,
    [activeResponse, activeStatus],
  );

  void tick;

  return (
    <>
      {threads
        .filter((thread) => thread.isPinned)
        .map((thread) => {
          const position = placePin(thread.pageX, thread.pageY);
          const snippet =
            thread.prompt.length > 34
              ? `${thread.prompt.slice(0, 34).trimEnd()}…`
              : thread.prompt;
          return (
            <div
              className="cursor-chat-pin"
              key={thread.id}
              data-side={position.side}
              style={
                {
                  left: position.left,
                  top: position.top,
                  "--pin-control-x": `${position.controlX}px`,
                  "--pin-control-y": `${position.controlY}px`,
                } as CSSProperties
              }
            >
              <span className="cursor-chat-pin-anchor" aria-hidden="true" />
              <div className="cursor-chat-pin-controls" data-side={position.side}>
                <button
                  className="cursor-chat-pin-open"
                  type="button"
                  aria-label={`Reopen chat: ${thread.prompt}`}
                  onClick={() => reopenThread(thread.id)}
                >
                  <span className="cursor-chat-pin-key" aria-hidden="true">
                    /
                  </span>
                  <span className="cursor-chat-pin-label">{snippet}</span>
                </button>
                <button
                  className="cursor-chat-pin-remove"
                  type="button"
                  aria-label="Remove pinned chat"
                  onClick={() => removeThread(thread.id)}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path
                      d="M2 2l6 6M8 2l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}

      {activeThread && (isDockedActive || activePosition) ? (
        <section
          ref={panelRef}
          className={`cursor-chat cursor-chat-${activeThread.status}${
            leavingId === activeThread.id ? " is-leaving" : ""
          }`}
          data-anchor-corner={activePosition?.anchorCorner}
          data-docked={isDockedActive ? "true" : undefined}
          data-dragged={activeThread.dragPageLeft != null ? "true" : undefined}
          style={
            {
              ...(activePosition
                ? { left: activePosition.left, top: activePosition.top }
                : {}),
              "--chat-radius-tight": `${CURSOR_CHAT_DEFAULTS.radiusTight}px`,
              "--chat-radius-roomy": `${CURSOR_CHAT_DEFAULTS.radiusRoomy}px`,
            } as CSSProperties
          }
          role="dialog"
          aria-label="Cursor chat"
        >
          {/* Intentionally non-modal: the page remains available for context. */}
          <div
            className={`cursor-chat-topbar${isDragging ? " is-dragging" : ""}`}
            onPointerDown={handleTopbarPointerDown}
            onPointerMove={handleTopbarPointerMove}
            onPointerUp={handleTopbarPointerEnd}
            onPointerCancel={handleTopbarPointerEnd}
          >
            {activeZoneTag ? (
              <span className="cursor-chat-zonetag" aria-hidden="true">
                {activeZoneTag}
              </span>
            ) : null}
            {activeThread.status === "done" ? (
              <button
                className="cursor-chat-iconbtn"
                type="button"
                aria-label="Pin chat to page"
                onClick={collapseActive}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M4.2 1h3.6M5 1.2v3L3.2 6v.9h5.6V6L7 4.2v-3M6 6.9V11"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
            ) : null}
            <button
              className="cursor-chat-iconbtn"
              type="button"
              aria-label="Close chat"
              onClick={closeActive}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </div>

          {activeThread.showRoleAsk ? (
            <div className="cursor-chat-roleask" role="group" aria-label="Who are you here as?">
              <span className="cursor-chat-roleask-label">here for</span>
              <button
                type="button"
                className="cursor-chat-roleask-pick"
                onClick={() => pickAudienceRole(activeThread.id, "recruiter")}
              >
                hiring
              </button>
              <span className="cursor-chat-roleask-sep" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className="cursor-chat-roleask-pick"
                onClick={() =>
                  pickAudienceRole(activeThread.id, "product-design")
                }
              >
                exploring
              </button>
              <button
                type="button"
                className="cursor-chat-roleask-dismiss"
                aria-label="Dismiss"
                onClick={() => dismissRoleAsk(activeThread.id)}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
          ) : null}

          {activeThread.prompt ? (
            <div className="cursor-chat-message">
              <p>{activeThread.prompt}</p>
            </div>
          ) : null}

          {activeThread.response ||
          activeThread.status === "loading" ? (
            <div className="cursor-chat-response">
              {activeThread.status === "loading" ? (
                <p className="cursor-chat-thinking">
                  {THINKING_PHRASES[thinkingPhase]}
                  <span className="cursor-chat-caret" aria-hidden="true" />
                </p>
              ) : (
                <>
                  <p>
                    <StreamedResponseText text={activeThread.response} />
                    {activeThread.status === "streaming" ? (
                      <span className="cursor-chat-caret" aria-hidden="true" />
                    ) : null}
                  </p>
                  {responseMedia ? (
                    <img
                      key={responseMedia.src}
                      className="cursor-chat-media"
                      src={responseMedia.src}
                      alt={responseMedia.alt}
                      loading="lazy"
                      draggable={false}
                    />
                  ) : null}
                </>
              )}
              {activeThread.status === "loading" ||
              activeThread.status === "streaming" ? (
                <button
                  className="cursor-chat-stop"
                  type="button"
                  aria-label="Stop generating"
                  onClick={stopActive}
                >
                  <span className="cursor-chat-stop-square" aria-hidden="true" />
                  stop
                </button>
              ) : null}
              {activeThread.status === "error" ? (
                <button
                  className="cursor-chat-retry"
                  type="button"
                  onClick={retryActive}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {((activeThread.status === "draft" ||
            activeThread.status === "done") &&
            activeThread.suggestedPrompts?.length) ||
          exitingSuggestions?.length ? (
            <div
              className={`cursor-chat-suggestions${
                activeThread.suggestedPrompts?.length ? "" : " is-exiting"
              }`}
              aria-label="Suggested prompts"
            >
              {(activeThread.suggestedPrompts ?? exitingSuggestions ?? []).map(
                (chip, index) => (
                <button
                  key={chip.id}
                  style={
                    {
                      "--chip-delay": `${index * CURSOR_CHAT_DEFAULTS.chipStaggerMs}ms`,
                    } as CSSProperties
                  }
                  type="button"
                  disabled={!activeThread.suggestedPrompts?.length}
                  onClick={() => void submitThread(chip.prompt)}
                >
                  <span
                    className="cursor-chat-suggestion-arrow"
                    aria-hidden="true"
                  >
                    ↳
                  </span>
                  {chip.label}
                </button>
                ),
              )}
            </div>
          ) : null}

          {activeThread.status === "draft" ||
          activeThread.status === "done" ||
          activeThread.status === "error" ? (
            <div className="cursor-chat-composer">
              <textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                maxLength={2000}
                placeholder={
                  activeThread.status === "done"
                    ? "continue the chat"
                    : activeThread.draftPlaceholder ??
                      "or ask anything about her work"
                }
                aria-label="Cursor chat message"
                aria-describedby="cursor-chat-composer-help"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitThread();
                  }
                }}
              />
              <span className="sr-only" id="cursor-chat-composer-help">
                Enter sends. Shift+Enter inserts a new line.
              </span>
              {draft.length >= 1800 ? (
                <span className="cursor-chat-counter" aria-hidden="true">
                  {2000 - draft.length} left
                </span>
              ) : null}
              <button
                className="cursor-chat-send"
                type="button"
                aria-label="Send message"
                disabled={!draft.trim()}
                onClick={() => void submitThread()}
              >
                ⏎
              </button>
            </div>
          ) : null}
          {/* Provenance + hallucination warning, persistent under the
              composer for the same statuses the composer itself renders
              (draft/done/error) so it doesn't vanish after the first send. */}
          {activeThread.status === "draft" ||
          activeThread.status === "done" ||
          activeThread.status === "error" ? (
            <p className="cursor-chat-disclosure">
              answers can be wrong — verify what matters · logged to improve
              this site
            </p>
          ) : null}
          <span
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {announcement}
          </span>
        </section>
      ) : null}

      {/*
        Touch entry point #1 of three: a fixed orange keycap FAB. Visibility is
        CSS-only (coarse pointer / narrow viewport); it opens the composer
        bottom-docked. Hidden whenever a thread is already open or the intro is
        up so it never fights the panel.
      */}
      {!activeThread && !suspended ? (
        <button
          className="cursor-chat-fab"
          type="button"
          aria-label="Ask about Joanna's work"
          onClick={() => requestCursorChatOpen({ docked: true })}
        >
          <span className="cursor-chat-fab-key" aria-hidden="true">
            /
          </span>
        </button>
      ) : null}
    </>
  );
}
