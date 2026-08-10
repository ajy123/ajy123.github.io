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
  type CaseContextKey,
  type CursorChatZoneContext,
  type CursorChatRequestOpenDetail,
  type SuggestedPrompt,
} from "./chatEvents";
import { CASE_CONTEXTS, toCaseContextKey } from "./caseContexts";
import { SITE_CONTEXT } from "./siteContext";
import { setLlmBusy } from "./llmActivity";
import {
  trackChatQuery,
  trackChatResponse,
  type ChatQuerySource,
} from "./analytics";
import { getAudienceRole } from "./audienceRole";
import {
  findOpenEssayPanel,
  resolveAskContext,
  zoneKindLabel,
} from "./askContext";
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

// Mirrors openComposer's argument shape. Declared at module scope (rather than
// inferred from openComposer, which lives inside a mount-only effect and
// isn't reachable from finishCloseActive) so a queued reopen can be typed.
type OpenComposerOptions = {
  anchorOverride?: { x: number; y: number };
  suggestedPrompts?: SuggestedPrompt[];
  followUpPrompts?: SuggestedPrompt[];
  zoneContext?: CursorChatZoneContext;
  caseKey?: CaseContextKey;
  docked?: boolean;
  autoAsk?: string;
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
  dragPageLeft?: number;
  dragPageTop?: number;
  draftPlaceholder?: string;
  suggestedPrompts?: SuggestedPrompt[];
  promptPool?: SuggestedPrompt[];
  shownPromptIds: string[];
  zoneContext?: CursorChatZoneContext;
  // The project digest this thread carries, chosen by the surface that opened
  // it (a work card, a case-study ask zone). Frozen for the thread's life, and
  // it outranks the page-level extraContext prop — see submitThread.
  caseKey?: CaseContextKey;
  // Opened from a zone that named itself, so the pointer must not retarget it.
  // A card hands over its own chips, its own follow-ups and its own case
  // digest; letting the pointer-follow effect re-resolve the section would
  // swap all three for whatever the pointer drifts over next, while the topbar
  // tag stayed put (every work card reads "ASKING ABOUT: THIS PROJECT"). That
  // is how a thread opened from the NYU card came back offering Deeli's
  // follow-up chips. Threads opened by "/" carry no zone and still follow.
  zoneLocked?: boolean;
  // Opened by a pin press / auto-ask, i.e. the zone's own hint was sent as the
  // first question. Frozen at creation and read on every later turn: the hint
  // is a full question now, so quoting it back at the model alongside a
  // follow-up would read as a second, competing instruction. See buildMessages.
  openedByAutoAsk?: boolean;
  // Bottom-docked layout (touch FAB / small viewport) instead of anchored.
  docked?: boolean;
  // "ASKING ABOUT: <NOUN>" for the topbar tag. Tracks the pointer while the
  // thread is still a draft, then freezes on the first question — see the
  // pointer-follow effect below.
  contextLabel?: string;
};

// Single source of truth for the panel's box. placeComposer() clamps the
// fixed top/left against these, and they are injected as custom properties so
// the stylesheet cannot drift away from the numbers the placement math uses —
// which it did once, opening the panel 41px below the viewport floor.
const COMPOSER_WIDTH = 340;
const COMPOSER_MAX_HEIGHT = 440;
const EDGE = 14;
// Gap between the anchor point and the panel's nearest corner. Kept smaller
// than EDGE so the panel visibly sits against what it was opened from.
const ANCHOR_GAP = 6;
// Must match cursorChatOut's duration in index.css.
const LEAVE_MS = 170;

function toSuggestedPromptId(value: string, index: number) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `persona-${slug || "prompt"}-${index}`;
}

// The zone instructions a resolved section contributes to the system prompt.
// Both the open path and the pointer-retarget path derive it from here, so the
// tag, the chips and what the model is told can never describe different
// sections.
function zoneContextFor(
  element: HTMLElement | undefined,
  contextText: string,
): CursorChatZoneContext | undefined {
  if (!element) return undefined;
  return {
    hint: element.dataset.askHint ?? "",
    kind: element.dataset.askKind ?? "",
    contextText,
  };
}

function toSuggestedPrompts(values: string[]): SuggestedPrompt[] {
  return values.map((prompt, index) => ({
    id: toSuggestedPromptId(prompt, index),
    label: prompt,
    prompt,
  }));
}

// Union of a thread's opening suggestions, any explicit follow-ups it opened
// with, and its resolved context's follow-up pool — deduped by prompt text.
// This is the pool follow-up suggestions draw from after each answered turn.
function buildPromptPool(
  initial: SuggestedPrompt[] | undefined,
  followUps: SuggestedPrompt[] | undefined,
  contextFollowUps: SuggestedPrompt[],
): SuggestedPrompt[] {
  const seen = new Set<string>();
  const pool: SuggestedPrompt[] = [];
  for (const entry of [
    ...(initial ?? []),
    ...(followUps ?? []),
    ...contextFollowUps,
  ]) {
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

const CURSOR_CHAT_DEFAULTS = {
  chipStaggerMs: 70,
  radiusRoomy: 12,
};

type AnchorCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

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

// textContent includes the text of <style> and <script> children, and the case
// study pages carry section-local <style> blocks (eight of them in
// deeli/index.html alone). A zone that fell back to rendered text therefore
// opened the model's nearby content with CSS: the /deeli/ solution section sent
// ".sol-b{ /* Local names, shared values..." before a word of prose. Walk text
// nodes instead and skip those two elements. Zones that set data-ask-context
// never reach this path.
function visibleTextOf(source: Element | null) {
  if (!source) return "";
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("style, script")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const parts: string[] = [];
  // Bounded so a long page section can't walk thousands of nodes before the
  // 2200-char slice throws the rest away. Count what survives whitespace
  // collapsing, not raw length: the case study pages are pretty-printed, so
  // indentation between elements arrives as its own text node. Charging those
  // against the budget cost /deeli/ sections between 440 and 2004 characters of
  // real prose, measured 2026-08-10, which is context the model used to get.
  let kept = 0;
  for (
    let node = walker.nextNode();
    node && kept < 2400;
    node = walker.nextNode()
  ) {
    const value = node.nodeValue ?? "";
    parts.push(value);
    kept += value.replace(/\s+/g, " ").trim().length;
  }
  return parts.join(" ");
}

function getBoundedText(element: Element | null) {
  const source =
    element?.closest("[data-ask-hint]") ??
    element?.closest("section, article, aside, main, footer") ??
    element;
  // A source that got no narrower than the document root is not "nearby"
  // anything, and visibleTextOf walks from the top of the tree: a thread opened
  // inside the persona essay that failed to resolve a zone came back with
  // element "body" and 2200 characters of the homepage — the profile rail
  // ("Joanna Yen Senior product designer...") and every work card — handed to
  // the model as what the visitor is looking at. Measured 2026-08-10. Returning
  // nothing is the honest answer: the model falls back to SITE_CONTEXT instead
  // of a confident claim about a section that was never on screen.
  if (
    !source ||
    source === document.body ||
    source === document.documentElement
  ) {
    return "";
  }
  // Prefer the zone's curated context over its rendered text, the same
  // preference ContextualAskHint's readActiveHint already applies. Without it
  // the two entry points disagreed: a hover-pin ask on an essay card sent the
  // essay body, while a "/" or click-opened thread on the same card sent only
  // the card face, so a chip written against the body answered from the pin and
  // returned "I don't know" from the card. Read off `source`, not `element`:
  // the attribute sits on the zone, and a click lands on a child span.
  const curated = (source as HTMLElement | null)?.dataset?.askContext;
  const text = (curated ?? visibleTextOf(source) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const links = Array.from(source?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])
    .slice(0, 4)
    .map((link) => `${link.textContent?.trim() || "link"}: ${link.href}`)
    .join("; ");
  return `${text}${links ? ` Links: ${links}` : ""}`.slice(0, 2200);
}

// The same explicit opt-out findNearestSection reads (src/askContext.ts:361).
// A region carrying it gets no chips and no zone from the resolver, and it must
// get no nearby text either: the profile rail sets data-ask-zone="none" on
// purpose, so feeding its visible bio back as nearby page content contradicted
// that opt-out. Browser-tested 2026-08-10: the model reached for the rail's
// "plan for when it's wrong" line instead of the profile fact that answers the
// question.
//
// Carried as a sentinel rather than an empty string because captureContext
// treats "" as "no override given" and falls back to getBoundedText(element),
// which would read the opted-out region straight back off the page.
const NO_ASK_ZONE_SELECTOR = '[data-ask-zone="none"]';
const NEARBY_TEXT_SUPPRESSED = "[nearby-text-suppressed:data-ask-zone-none]";
// Same sentinel trick, for the other half of the context. A zone-supplied chip
// must not ship the visitor's earlier selection as their "primary focus", and
// "" cannot say so: captureContext reads "" as "no override given" and falls
// back to the live window selection, which is still highlighted on the page
// while the thread that was opened from it is answering follow-ups.
const SELECTED_TEXT_SUPPRESSED = "[selected-text-suppressed:zone-chip]";

// elementFromPoint that reports a miss as a miss. A point outside the viewport
// returns null, but a point that lands on no real box returns <body>, and a
// non-null <body> short-circuits every `??` fallback behind it — pinning the
// thread to the document root instead of the element the selection knows about.
// Neither answer resolves a zone, so both come back null.
function elementAtPoint(x: number, y: number) {
  const hit = document.elementFromPoint(x, y);
  if (!hit || hit === document.body || hit === document.documentElement) {
    return null;
  }
  return hit;
}

function getSelectionAnchor() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  // The element the selection lives in, carried next to the point because the
  // point alone cannot resolve a zone: y is the selection's BOTTOM edge, so a
  // paragraph whose last line sits at the foot of the screen puts it below the
  // viewport, where elementFromPoint answers null. Measured 2026-08-10 with a
  // paragraph of the persona essay selected inside the essay dialog — element
  // "unknown", nearbyText "" (len 0), y 1777 against a 761px viewport — i.e.
  // the request reached the model with SITE_CONTEXT and no page text at all.
  //
  // Read off the START container, never commonAncestorContainer. A real Chrome
  // triple-click ends its range at a boundary outside the paragraph — measured
  // 2026-08-10 on the persona essay, endContainer was a body-level overlay DIV
  // — so the common ancestor climbs to BODY, which resolves no zone and which
  // getBoundedText refuses outright. The start container is the text node the
  // reader actually clicked into, and its parent is the paragraph.
  const start = range.startContainer;
  const element =
    start instanceof Element
      ? start.childNodes[range.startOffset] instanceof Element
        ? (start.childNodes[range.startOffset] as Element)
        : start
      : start.parentElement;

  return {
    x: rect.left + rect.width / 2,
    y: rect.bottom,
    selectedText: selection.toString().trim(),
    element,
  };
}

// Where a keyboard-driven "/" should open. The rail button advertises
// aria-keyshortcuts="/", so pressing "/" has to resolve the same zone that
// activating the focused control would — which means anchoring on the focused
// element, not on a cursor the reader never moved. Returns null when there is
// nothing meaningfully focused (body/documentElement), the focused element has
// no box, or focus has drifted off screen.
//
// Named for the element it reads, not for what it returns, because
// ContextualAskHint has its own getFocusAnchor with a different contract (it
// takes an element and offsets to the element's top-right).
function getFocusedElementAnchor() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active === document.body || active === document.documentElement) return null;

  const rect = active.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  // Focus can sit far outside the viewport: keyboard scrolling moves neither
  // focus nor the pointer, so a reader can Tab to a card, page to the bottom,
  // and press "/" with the focused element hundreds of pixels above the fold.
  // Anchoring there resolves a section nobody is looking at (elementFromPoint
  // returns null off screen, and the zone scan then picks by proximity to a
  // point off screen). Treat fully off-screen focus as no signal at all and
  // let the caller fall through to the pointer, which is what the reader is
  // actually looking at.
  if (
    rect.bottom <= 0 ||
    rect.top >= window.innerHeight ||
    rect.right <= 0 ||
    rect.left >= window.innerWidth
  ) {
    return null;
  }

  // Partially visible focus still anchors, clamped inside the viewport so the
  // point always lands on something.
  return {
    x: Math.min(Math.max(rect.left + rect.width / 2, EDGE), window.innerWidth - EDGE),
    y: Math.min(Math.max(rect.top + rect.height / 2, EDGE), window.innerHeight - EDGE),
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

function captureContext(
  pageX: number,
  pageY: number,
  selectedTextOverride = "",
  nearbyTextOverride = "",
  fallbackElement: Element | null = null,
): CapturedContext {
  const point = getViewportPoint(pageX, pageY);
  const selection = window.getSelection();
  // Clamp to the same bound as getBoundedText's nearbyText. A large selection
  // (a whole essay, Ctrl+A) would otherwise ship unbounded into the system
  // prompt and can push the request past the worker's 24k-char cap, which
  // 400s as a generic "could not get a response" the user can't retry past.
  const selectedText =
    selectedTextOverride === SELECTED_TEXT_SUPPRESSED
      ? ""
      : (selectedTextOverride || selection?.toString().trim() || "").slice(
          0,
          MAX_SELECTED_CHARS,
        );
  // The stored anchor can sit outside the viewport — a selection anchored on
  // its bottom edge below the fold, or a page scrolled since the thread opened
  // — and elementFromPoint answers null there, which is what reported element
  // "unknown" and dropped the nearbyText fallback to "". The caller's resolved
  // section stands in for the point in that case.
  const element = elementAtPoint(point.x, point.y) ?? fallbackElement;
  const audienceRole = getAudienceRole();
  const context = {
    url: window.location.href,
    title: document.title,
    ...(audienceRole ? { audienceRole } : {}),
    selectedText,
    nearbyText:
      nearbyTextOverride === NEARBY_TEXT_SUPPRESSED
        ? ""
        : nearbyTextOverride || getBoundedText(element),
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
// worker's 40-message / 24k-char request limit and error the thread.
//
// The char budget is computed, not fixed. It used to be a flat 14000, chosen
// against a system prompt assumed to be ~1.5-2k; SITE_CONTEXT alone is ~7.4k
// today and a case digest adds up to 5.1k more, so the fixed number described
// a request that no longer existed and a long thread on a case-study page
// could be assembled at ~28k and rejected outright by the worker (it rejects,
// it does not truncate — see MAX_TOTAL_CHARS in worker/src/index.js). History
// is the one part of the request that is safe to shorten, so it takes whatever
// the system prompt and the new question leave behind.
const MAX_HISTORY_TURNS = 8;
// Mirrors the worker's MAX_TOTAL_CHARS. Keep the two in sync.
const MAX_REQUEST_CHARS = 24000;
// Slack for the JSON envelope and for anything the worker counts that this
// arithmetic does not, so a request lands under the cap rather than exactly on
// it. Also the floor: below this much room, history is dropped entirely and
// the question still goes out grounded.
const REQUEST_CHARS_RESERVE = 1000;

function recentHistory(history: ChatTurn[], budget: number): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let chars = 0;
  for (const turn of history.slice(-MAX_HISTORY_TURNS).reverse()) {
    const next = chars + turn.prompt.length + turn.response.length;
    // No `kept.length > 0` escape hatch here: the old rule kept one turn even
    // when it overshot, which is exactly the case that gets the whole request
    // rejected. Grounding and the question outrank an old turn.
    if (next > budget) break;
    chars = next;
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
  extraContext?: string,
  fromAutoAsk = false,
): ChatMessage[] {
  const audienceGuidance =
    context.audienceRole === "recruiter"
      ? "Audience role: recruiter. Tailor the answer toward role fit, experience, collaboration, impact, and why Joanna is relevant to hiring or recruiting evaluation. Do not claim personal knowledge of the visitor."
      : context.audienceRole === "product design"
        ? "Audience role: product design. Tailor the answer toward design systems, product judgment, interaction design, prototyping, systems thinking, and craft. Do not claim personal knowledge of the visitor."
        : "";

  // A pin ask sends its hint verbatim as the prompt, so hint and prompt are
  // the same string on turn one — naming the prompt again would just tell the
  // model its own question twice. From turn two the strings differ, but the
  // hint is still a full question, so quoting it would hand the model a second
  // instruction competing with the follow-up actually asked; fromAutoAsk keeps
  // it suppressed for the whole life of such a thread. Only quote the hint when
  // it adds information: a chip click or typed question in a thread that was
  // not opened by a pin, where the hint names the zone rather than repeats the
  // question. The rest of the sentence, which names the section, always stays.
  const omitHintQuote =
    fromAutoAsk ||
    zoneContext?.hint.trim().toLowerCase() === prompt.trim().toLowerCase();

  const contextLines = [
    `Page title: ${context.title}`,
    context.audienceRole ? `Audience role: ${context.audienceRole}` : "",
    zoneContext
      ? omitHintQuote
        ? `The visitor opened this chat from the ${zoneContext.kind} section. Answer with that focus.`
        : `The visitor opened this chat from the ${zoneContext.kind} section, invited by the prompt "${zoneContext.hint}". Answer with that focus.`
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
    //
    // The three-sentence cap and the fidelity clause replaced a two-sentence cap
    // that was quietly costing answers their evidence. Browser-tested 2026-08-10:
    // three of four home page chips came back with the specific dropped (one lost
    // a named example, one lost the reason a decision was made), and two padded the
    // space with a closing generality lifted from the visible page copy. Two
    // sentences forces the model to summarize, and summarizing drops subordinate
    // clauses first, so the cap and the stay-specific instruction were fighting.
    `${CHAT_SYSTEM_PREFIX} ` +
    "Answer the visitor's question about Joanna and the page they are looking at. " +
    "Ground your answer in the site profile and page context below. Prefer the selected text when present. " +
    "Use only facts explicitly stated in that context. Do not speculate, infer missing implementation details, or add examples that are not written there. " +
    "If a fact is not in the context, say you don't know rather than inventing it. For a yes-or-no question, begin with Yes or No and restate only the supporting fact. " +
    "Answer in at most three sentences. When the profile below contains a fact that answers the question, use that fact's own wording and keep its specifics: the numbers, the named example, and the reason it gives. " +
    "Do not compress a specific into a generality. Prefer the profile facts over text that is visible on the page. Stop as soon as the fact is stated: add no closing sentence of your own, no restatement of the question, and no summary of what you just said. " +
    (audienceGuidance ? `${audienceGuidance} ` : "") +
    "Keep replies direct, plain, and helpful.\n\n" +
    SITE_CONTEXT +
    (extraContext ? "\n" + extraContext : "") +
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

  // What the worker's char count has left once the parts that cannot be
  // shortened are accounted for.
  const historyBudget = Math.max(
    0,
    MAX_REQUEST_CHARS - REQUEST_CHARS_RESERVE - system.length - prompt.length,
  );
  if (import.meta.env.DEV && historyBudget === 0) {
    console.warn(
      `[cursor-chat] system prompt (${system.length}) + question (${prompt.length}) ` +
        `leaves no room for history under the worker's ${MAX_REQUEST_CHARS}-char cap. ` +
        "Trim a case digest or SITE_CONTEXT.",
    );
  }

  recentHistory(history, historyBudget).forEach((turn) => {
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
    pattern: /research assistant|research chat|keyword search/i,
    media: {
      src: researchChatThumbUrl,
      alt: "Poster from the research-assistant case study",
    },
  },
  {
    // Not /deeli/: both case studies are Deeli work, so the company name
    // would bind this poster to research-assistant answers via earliest-match.
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
  extraContext,
}: {
  suspended?: boolean;
  extraContext?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [tick, setTick] = useState(0);
  const pointerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  // pointerRef starts at viewport centre, which is a real coordinate, not
  // "unknown" — so a session with no pointer at all still resolves whatever
  // happens to sit mid-screen. This flag records whether a pointermove has
  // EVER fired, which is the only honest signal that the cursor position means
  // anything. openComposer uses it to gate the focus-derived anchor: see
  // getFocusedElementAnchor. Do not "simplify" it away — without it, "/" would start
  // following focus for mouse users too, and a stale focus ring (a button
  // clicked minutes ago) would beat the cursor the reader is actually pointing
  // with.
  const pointerMovedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const pendingAutoAskRef = useRef<string | null>(null);
  // A pin press that lands while a panel is already open can't append to the
  // open thread (each thread freezes a different zone's context), so it
  // queues here, closes the open thread, and reopens once the close settles.
  const pendingOpenRef = useRef<OpenComposerOptions | null>(null);
  // The pre-press focus, captured at QUEUE time while the pin that triggered
  // the queued open still has focus. By the time the queue drains (up to
  // LEAVE_MS later) that pin is long unmounted and document.activeElement
  // has fallen back to <body>, so capturing there (as openComposer normally
  // does) would make restoreFocus land on <body> instead of a sensible
  // fallback. Applied onto previousFocusRef after the drained openComposer
  // call returns, since that call overwrites previousFocusRef itself.
  const pendingPreviousFocusRef = useRef<HTMLElement | null>(null);
  // openComposer is defined inside the mount-only event-wiring effect below,
  // out of reach for finishCloseActive; this ref is how the queued reopen
  // calls back into it once the effect assigns it.
  const openComposerRef = useRef<((options?: OpenComposerOptions) => void) | null>(
    null,
  );
  // Keyed by thread id so an abort can only ever cancel the request it belongs
  // to. In practice the map holds at most one entry: openComposer returns early
  // whenever activeIdRef is set, and finishCloseActive drops the outgoing
  // thread, so only one thread exists at a time.
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const abortThread = (id: string) => {
    abortControllersRef.current.get(id)?.abort();
    abortControllersRef.current.delete(id);
  };
  const suspendedRef = useRef(suspended);
  const panelRef = useRef<HTMLElement | null>(null);
  // The section a draft thread is currently pointed at, so pointer moves that
  // stay inside the same section don't churn state.
  const resolvedElementRef = useRef<HTMLElement | null>(null);
  // What the active thread was anchored on, kept because its stored point can
  // stop resolving anything: elementFromPoint answers null outside the viewport,
  // so a selection anchored on its bottom edge below the fold made captureContext
  // report element "unknown" and fall back to no nearby text at all. Released
  // with resolvedElementRef on close for the same detached-subtree reason.
  const anchorElementRef = useRef<Element | null>(null);
  // How the last message on this thread was submitted, so a retry can inherit
  // that classification instead of losing it: a retry re-sends
  // activeThread.prompt, which is the chip's text when the failed request was a
  // chip click, and reading only the retry's own querySource handed the
  // selection back to the exact prompt the suppression below exists to protect.
  // Keyed by thread id so it can't be read across a thread that never submitted.
  const lastSubmitSourceRef = useRef<{ id: string; source: ChatQuerySource } | null>(
    null,
  );
  // Where focus goes when the element that opened the panel is gone or hidden.
  // Captured at close, consumed once by restoreFocus.
  const focusFallbackRef = useRef<HTMLElement | null>(null);
  const draftRef = useRef("");
  // Mirrors whether the active thread still accepts retargeting, so the
  // pointer handler can bail before doing resolver work rather than
  // discovering it inside setThreads and returning a fresh array every frame.
  const followableRef = useRef(false);
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

  // Rendered (not display:none, not detached). getClientRects is the cheap
  // version of that question that also catches an ancestor being hidden.
  const isRendered = (element: Element) =>
    element.isConnected && element.getClientRects().length > 0;

  const restoreFocus = () => {
    window.requestAnimationFrame(() => {
      const previous = previousFocusRef.current;
      if (previous && isRendered(previous)) {
        previous.focus();
        return;
      }
      // The FAB is display:none above 860px on a fine pointer, and focusing a
      // hidden element is a no-op that silently drops focus to <body> — so on
      // desktop this fallback did nothing at all. Check before using it.
      const fab = document.querySelector<HTMLButtonElement>(".cursor-chat-fab");
      if (fab && isRendered(fab)) {
        fab.focus();
        return;
      }
      // Last resort: the section this thread was opened over, captured by
      // closeActive before it released the ref. It is not normally focusable,
      // so it gets a programmatic-only tabindex, the same pattern a dialog
      // uses to return a reader to where they were rather than to the top of
      // the document.
      const zone = focusFallbackRef.current;
      focusFallbackRef.current = null;
      if (zone && isRendered(zone)) {
        if (!zone.hasAttribute("tabindex")) zone.setAttribute("tabindex", "-1");
        zone.focus({ preventScroll: true });
      }
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
  const activeZoneTag = activeThread?.contextLabel ?? null;

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
  // shimmer). Scans `threads` rather than the active thread alone, which costs
  // nothing now that only one thread is ever open. No cleanup here: `threads` changes on
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
      // From the first real pointer move on, the cursor is a genuine statement
      // of intent and outranks focus forever after — see pointerMovedRef.
      pointerMovedRef.current = true;
    };

    const handleScrollOrResize = () => setTick((value) => value + 1);

    const openComposer = (options: OpenComposerOptions = {}) => {
      const {
        anchorOverride,
        suggestedPrompts,
        followUpPrompts,
        zoneContext,
        caseKey,
        docked,
        autoAsk,
      } = options;

      if (suspendedRef.current) return;

      if (activeIdRef.current) {
        // A pin's question must always land somewhere: a thread already open
        // belongs to a different zone, so appending would answer the new
        // question with the old section's context. Queue it, close the open
        // thread, and finishCloseActive reopens it once the close settles.
        if (autoAsk?.trim()) {
          pendingOpenRef.current = options;
          // Capture now, while the pin that sent this request still has
          // focus — see pendingPreviousFocusRef.
          pendingPreviousFocusRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          closeActive();
          return;
        }
        textareaRef.current?.focus();
        return;
      }

      // <body> is what document.activeElement reports when nothing is focused
      // (a pointer open, a tap). Storing it makes restoreFocus think it has a
      // target, and focusing <body> is a no-op — so the whole fallback chain
      // was skipped and focus stayed exactly where it already was: nowhere.
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null;

      const selectionAnchor = getSelectionAnchor();
      // Keyboard-only sessions (no pointermove ever) anchor on the focused
      // element; everyone else keeps the pointer. Precedence is unchanged
      // above this: explicit override, then selection.
      const focusAnchor =
        !anchorOverride && !selectionAnchor && !pointerMovedRef.current
          ? getFocusedElementAnchor()
          : null;
      const anchor =
        anchorOverride ?? selectionAnchor ?? focusAnchor ?? pointerRef.current;
      const fromSelection = !anchorOverride && selectionAnchor !== null;
      // Explicit request wins; otherwise the small-screen layout docks.
      const isDocked = docked ?? window.innerWidth <= DOCK_MAX_VIEWPORT;
      const id = crypto.randomUUID();
      // A selection anchors on its bottom edge, which is below the fold for any
      // paragraph ending at the foot of the screen, and elementFromPoint answers
      // null outside the viewport. Falling back to the element the selection
      // lives in keeps the anchor point from being the only way to resolve a
      // zone: without it askContext.element and anchorElement were both null,
      // getBoundedText(null) returned "", and the thread carried no page text.
      //
      // Keyed on the selection existing, NOT on fromSelection: the selection pin
      // handles the "/" itself and reopens through CURSOR_CHAT_REQUEST_OPEN with
      // an anchorOverride, which makes fromSelection false while selectionAnchor
      // is still non-null. Measured 2026-08-10 on that exact path — a paragraph
      // triple-clicked inside the persona essay, selectedText 288 chars, and the
      // thread still resolved element "body" and sent the homepage rail as
      // nearby content.
      const anchorElement =
        elementAtPoint(anchor.x, anchor.y) ?? selectionAnchor?.element ?? null;
      // What the reader is actually looking at, resolved once and frozen for
      // the life of the thread: an explicit zone wins, else the nearest
      // section in the viewport, else the page (or open essay) default.
      const askContext = resolveAskContext({
        anchorElement,
        anchorPoint: anchor,
        zonePrompts: suggestedPrompts?.map((entry) => entry.prompt),
        zoneFollowUps: followUpPrompts?.map((entry) => entry.prompt),
        zoneLabel: zoneContext ? zoneKindLabel(zoneContext.kind) : undefined,
      });
      // The model reads the same section the panel names. Taking this from the
      // raw pointer element instead would let the tag say "THIS PROJECT" while
      // the prompt quoted whatever the cursor happened to rest on.
      const nearbyTextOverride = anchorElement?.closest(NO_ASK_ZONE_SELECTOR)
        ? NEARBY_TEXT_SUPPRESSED
        : zoneContext?.contextText ||
          getBoundedText(askContext.element ?? anchorElement);
      // A "/" opened over a section resolves that section for the tag and the
      // chips, so it must carry the same instructions an explicit hint would.
      // Without this the model was only told which section to focus on after
      // the reader moved the pointer.
      const threadZoneContext =
        zoneContext ?? zoneContextFor(askContext.element, nearbyTextOverride);
      // A "/" opened over a work card adopts that card's chips, so it has to
      // adopt the card's grounding as well. Without this the card's own
      // follow-ups reach the model with SITE_CONTEXT alone and come back "I
      // don't know", which is the defect this registry exists to remove. The
      // retarget handler reads the attribute too, but it bails when the pointer
      // never leaves the card and again once history locks the thread, so it
      // does not cover the ordinary press-then-click path. An explicit caseKey
      // from the opening surface still wins.
      const caseKeyElement =
        askContext.element ??
        (anchorElement instanceof HTMLElement ? anchorElement : undefined);
      const threadCaseKey =
        caseKey ?? toCaseContextKey(caseKeyElement?.dataset.askCase);

      // A text selection is about the selection, not the section, so it keeps
      // its own placeholder and offers no opening chips.
      const threadSuggestedPrompts =
        suggestedPrompts ??
        (fromSelection ? undefined : toSuggestedPrompts(askContext.chips));
      setDraft("");
      setAnnouncement("");
      setExitingSuggestions(null);
      resolvedElementRef.current = askContext.element ?? null;
      anchorElementRef.current = anchorElement;
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
          suggestedPrompts: threadSuggestedPrompts,
          promptPool: buildPromptPool(
            threadSuggestedPrompts,
            followUpPrompts,
            toSuggestedPrompts(askContext.followUps),
          ),
          shownPromptIds: (threadSuggestedPrompts ?? []).map(
            (prompt) => prompt.id,
          ),
          zoneContext: threadZoneContext,
          caseKey: threadCaseKey,
          zoneLocked: Boolean(zoneContext),
          openedByAutoAsk: Boolean(autoAsk?.trim()),
          docked: isDocked,
          draftPlaceholder: fromSelection
            ? "ask about what you selected"
            : askContext.placeholder,
          contextLabel: askContext.label,
        },
      ]);
      // Drained by the effect below submitThread, not called here: submitThread
      // early-returns on !activeThread, and activeThread is derived from render
      // state, so a call on this tick would silently no-op before React commits
      // the thread just queued above.
      pendingAutoAskRef.current = autoAsk?.trim() || null;
      setActiveId(id);
      window.dispatchEvent(
        new CustomEvent(CURSOR_CHAT_OPENED_EVENT, {
          detail: { id, clientX: anchor.x, clientY: anchor.y },
        }),
      );
    };
    openComposerRef.current = openComposer;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !isEditableTarget(event.target)) {
        if (suspendedRef.current) return;
        event.preventDefault();
        openComposer();
      }

      if (event.key === "Escape" && activeIdRef.current) {
        event.preventDefault();
        // Escape is the universal "never mind". A pin press that landed while
        // this panel was open is sitting in the queue waiting for the close to
        // settle, and closeActive no-ops mid-leave, so without this the queued
        // question would still be sent on the visitor's behalf after they
        // cancelled. Outside that window both refs are already null.
        pendingOpenRef.current = null;
        pendingPreviousFocusRef.current = null;
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
        caseKey: toCaseContextKey(detail?.caseKey),
        docked: detail?.docked,
        autoAsk: detail?.autoAsk,
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
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    followableRef.current = Boolean(
      activeThread &&
        activeThread.status === "draft" &&
        !activeThread.history.length &&
        !activeThread.selectedTextOverride &&
        !activeThread.zoneLocked,
    );
  }, [activeThread]);

  // The composer is the right focus target for an ordinary open, and it stays
  // mounted there. An auto-ask is different: the effect below submits as soon
  // as this thread commits, and `loading` unmounts the textarea, so a deferred
  // focus would either miss it or be dropped to <body> when it unmounts under
  // the caret. The panel is role="dialog" and tabIndex={-1}, so focusing it
  // instead lands the reader inside the panel with stop/close one Tab away,
  // and it stays mounted for the whole exchange. Read the ref before the
  // auto-ask effect clears it: effects run in declaration order and this one
  // is declared first.
  useEffect(() => {
    if (!activeId) return;
    if (pendingAutoAskRef.current && panelRef.current) {
      panelRef.current.focus();
      return;
    }
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [activeId]);

  // A draft thread follows the pointer. Hovering a different section retargets
  // its chips, its label, and the text the model will read — all three move
  // together, so the tag never promises context the prompt won't carry. The
  // moment a question is asked the thread freezes: from then on it is about
  // what was asked, and offering questions the loaded context can't answer
  // would be worse than offering none.
  useEffect(() => {
    if (!activeId) return;

    let frame = 0;
    const retarget = (x: number, y: number) => {
      if (!followableRef.current) return;
      const panel = panelRef.current;
      const element = document.elementFromPoint(x, y);
      // Reaching for the textarea must never count as choosing a new section.
      if (panel && element && panel.contains(element)) return;

      const next = resolveAskContext({
        anchorElement: element,
        anchorPoint: { x, y },
      });
      if ((next.element ?? null) === resolvedElementRef.current) return;

      resolvedElementRef.current = next.element ?? null;
      // Same opt-out as the open path: drifting onto an opted-out region must
      // not hand the model text that region asked to keep out of the prompt.
      const contextText = element?.closest(NO_ASK_ZONE_SELECTOR)
        ? NEARBY_TEXT_SUPPRESSED
        : getBoundedText(next.element ?? element);
      // The zone instructions must move with the section too. Leaving the
      // opening zone in place would tell the model to focus on the section
      // the panel launched from while the tag named a different one.
      const zoneContext = zoneContextFor(next.element, contextText);

      setThreads((current) =>
        current.map((thread) => {
          if (thread.id !== activeId) return thread;
          // Re-checked here because followableRef is a frame behind a state
          // change; the ref is the cheap gate, this is the correct one.
          if (thread.status !== "draft") return thread;
          if (thread.history.length || thread.selectedTextOverride) return thread;
          // The correct gate for the zone lock too: a stop-before-first-token
          // returns a thread to "draft", which flips followableRef back on a
          // frame later, and that was one of the two ways a card-opened thread
          // could still be retargeted.
          if (thread.zoneLocked) return thread;

          const chips = toSuggestedPrompts(next.chips);
          return {
            ...thread,
            contextLabel: next.label,
            zoneContext,
            // The case digest moves with the section for the same reason the
            // zone instructions do: a "/" thread that drifts onto a work card
            // is offered that card's chips, and half of them ask about detail
            // only the project's own digest holds. Reading it off the resolved
            // element keeps this in step with the chips it just adopted, and
            // resolves to undefined on a zone that names no project.
            caseKey: toCaseContextKey(next.element?.dataset.askCase),
            nearbyTextOverride: contextText,
            suggestedPrompts: chips,
            promptPool: buildPromptPool(
              chips,
              undefined,
              toSuggestedPrompts(next.followUps),
            ),
            shownPromptIds: chips.map((chip) => chip.id),
            // Retargeting must not yank the placeholder out from under someone
            // who has already started typing.
            draftPlaceholder: draftRef.current
              ? thread.draftPlaceholder
              : next.placeholder,
          };
        }),
      );
    };

    const handleMove = (event: PointerEvent) => {
      // Same guard the hover pin applies (see ContextualAskHint's pointermove
      // handler): a finger is not a hover. On touch these events arrive while
      // the reader is starting a scroll, so following them retargets a thread
      // the reader opened deliberately.
      if (event.pointerType === "touch") return;
      if (frame) return;
      const { clientX, clientY } = event;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        retarget(clientX, clientY);
      });
    };

    if (import.meta.env.DEV) {
      // requestAnimationFrame is paused in a hidden tab, so browser-driven
      // verification can't reach retarget through handleMove. Same escape
      // hatch as __cursorChatTestResponse in chatApi.
      (window as unknown as { __retargetNow?: unknown }).__retargetNow = retarget;
    }
    window.addEventListener("pointermove", handleMove);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 154)}px`;
  }, [draft, activeId]);

  // Close discards the thread. Nothing outlives the panel: a closed chat leaves
  // no marker on the page and no history to reopen.
  const closeActive = () => {
    // Hand the section to restoreFocus before releasing it: the close is
    // animated, so by the time focus is restored this ref is long since null.
    focusFallbackRef.current = resolvedElementRef.current;
    // Release the resolved section so a closed panel can't retain a
    // detached subtree after that part of the page unmounts.
    resolvedElementRef.current = null;
    anchorElementRef.current = null;
    const id = activeIdRef.current;
    if (!id || leavingIdRef.current) return;

    abortThread(id);
    beginLeave(id, () => finishCloseActive(id));
  };

  // An ask pin pressed while a panel was open queues here instead of vanishing
  // (see openComposer's queue branch), and finishCloseActive drains it once the
  // close animation settles — so a press that lands mid-close is honoured
  // exactly once, never dropped and never replayed by a later, unrelated close.
  // Nulls the refs BEFORE calling back in, so a re-entrant open triggered by
  // that call can't replay the same request. Returns whether it drained
  // anything, so callers know whether to fall back to restoreFocus().
  const drainPendingOpen = () => {
    const queued = pendingOpenRef.current;
    if (!queued) return false;
    pendingOpenRef.current = null;
    const queuedFocus = pendingPreviousFocusRef.current;
    pendingPreviousFocusRef.current = null;
    openComposerRef.current?.(queued);
    // openComposer just captured document.activeElement into
    // previousFocusRef, but the pin that triggered this queued request has
    // long since unmounted by now; the pre-press focus captured at queue
    // time is the correct restore target, so it wins.
    if (queuedFocus?.isConnected) {
      previousFocusRef.current = queuedFocus;
    }
    return true;
  };

  const finishCloseActive = (id: string) => {
    setThreads((current) => current.filter((item) => item.id !== id));
    activeIdRef.current = null;
    setActiveId(null);
    setDraft("");

    if (drainPendingOpen()) return;

    restoreFocus();
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
    extraContext: string | undefined,
    fromAutoAsk: boolean,
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
      const messages = buildMessages(
        message,
        context,
        history,
        zoneContext,
        extraContext,
        fromAutoAsk,
      );
      if (import.meta.env.DEV) {
        // The assembled prompt is otherwise unobservable: __cursorChatTestResponse
        // short-circuits inside streamChat, after these messages are built. Stash
        // them so browser checks can assert what the model was actually told —
        // the zone/section a thread claims and the context it sends must agree.
        (window as unknown as { __cursorChatLastMessages?: unknown }).__cursorChatLastMessages =
          messages;
      }
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
          ? "You're sending messages quickly. Give it a minute, then retry."
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

  const submitThread = async (
    promptOverride?: string,
    sourceOverride?: ChatQuerySource,
  ) => {
    if (!activeThread || leavingIdRef.current) return;

    const id = activeThread.id;
    // One precedence chain decides both what is sent and how it's classified,
    // so the analytics label can't drift from the submission logic.
    const [message, querySource]: [string, ChatQuerySource] = promptOverride?.trim()
      ? [promptOverride.trim(), sourceOverride ?? "suggested"]
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

    // A chip is written against the zone, not against whatever the visitor had
    // highlighted when the thread opened. Measured 2026-08-10: with the
    // "Judgment doesn't automate" paragraph selected in the persona essay, the
    // zone follow-up "what broke when a query mixed two languages?" still
    // shipped that paragraph as "the visitor's primary focus", so the model
    // answered about a section the chip never asked about — and from
    // SITE_CONTEXT, naming languages the essay does not name. Only text the
    // visitor typed (or a retry of it) keeps the selection. A retry of a chip
    // stays suppressed too — it re-sends the chip's own text, so re-deriving
    // from its "retry" label alone would ship the stale selection one keypress
    // later.
    const chipSubmit =
      querySource === "suggested" ||
      (querySource === "retry" &&
        lastSubmitSourceRef.current?.id === id &&
        lastSubmitSourceRef.current.source === "suggested");
    const selectedTextOverride = chipSubmit
      ? SELECTED_TEXT_SUPPRESSED
      : activeThread.selectedTextOverride;
    // Recorded only for a first send: a retry must not overwrite the source it
    // just inherited, or a second retry would fall back to "retry" itself.
    if (querySource !== "retry") {
      lastSubmitSourceRef.current = { id, source: querySource };
    }

    // A chip offered inside the open essay is written against the whole essay,
    // but the thread's nearby text is only the section nearest the anchor
    // (300-700 chars in the persona essay), so a chip about any other section
    // had nothing to answer from. Measured 2026-08-10: with "Judgment doesn't
    // automate" as the resolved section, "what broke when a query mixed two
    // languages?" came back in SITE_CONTEXT's words ("English and Mandarin",
    // src/siteContext.ts) — languages the rewritten essay deliberately does not
    // name. The same chip from the CARD, whose data-ask-context is the whole
    // essay, answers off the essay, so the dialog panel now carries that same
    // string and a chip reads it there.
    //
    // Clamped to the 2200 getBoundedText applies to every other nearby text.
    // This essay's context is 2699 chars, so its tail is cut — that is the
    // limit the card has always sent under, and raising it pushes the request
    // toward the worker's 24k cap. Not a bug to fix.
    //
    // Only for a chip: a selection ask and a typed question (and its retry)
    // asked about one place on the page and keep the section they resolved. The
    // opt-out sentinel still wins outright — a region that asked to stay out of
    // the prompt does not get overridden by the essay it sits in.
    const essayChipContext =
      chipSubmit &&
      activeThread.nearbyTextOverride !== NEARBY_TEXT_SUPPRESSED
        ? findOpenEssayPanel()?.dataset.askContext?.trim()
        : undefined;

    const context = captureContext(
      activeThread.pageX,
      activeThread.pageY,
      selectedTextOverride,
      essayChipContext
        ? essayChipContext.slice(0, 2200)
        : activeThread.nearbyTextOverride,
      resolvedElementRef.current ?? anchorElementRef.current,
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
    // Between here and the reply there is nothing on screen but a thinking
    // line, and a pin ask sends on a single keypress, so without this a screen
    // reader gets no confirmation that anything was sent at all. What it
    // confirms has to match what happened: a retry is not a new question, and
    // plenty of what visitors type ("tell me about the eval") is a statement.
    setAnnouncement(
      querySource === "retry"
        ? "Retrying. Generating a reply."
        : message.endsWith("?")
          ? "Question sent. Generating a reply."
          : "Message sent. Generating a reply.",
    );
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
      suggestedPrompts: undefined,
    }));

    await runGeneration(
      id,
      message,
      context,
      history,
      zoneContext,
      // A thread that named its project outranks the page. On a case-study page
      // the two agree; on the homepage only the thread knows, and without this
      // the card's own chips ask about detail SITE_CONTEXT has never held.
      (activeThread.caseKey ? CASE_CONTEXTS[activeThread.caseKey] : undefined) ??
        extraContext,
      activeThread.openedByAutoAsk === true,
    );
  };

  // Sends the pin's question once the thread it belongs to exists. Keyed on the
  // thread id rather than the thread object so it does not re-run on every
  // draft -> loading -> streaming transition, and the ref is cleared before the
  // await so a re-render cannot fire the same question twice.
  useEffect(() => {
    const pending = pendingAutoAskRef.current;
    if (!pending || !activeThread || activeThread.status !== "draft") return;
    pendingAutoAskRef.current = null;
    void submitThread(pending, "ask_pin");
  }, [activeThread?.id]);

  const retryActive = () => {
    if (!activeThread) return;
    void submitThread();
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
              "--chat-radius-roomy": `${CURSOR_CHAT_DEFAULTS.radiusRoomy}px`,
              "--chat-width": `${COMPOSER_WIDTH}px`,
              "--chat-max-height": `${COMPOSER_MAX_HEIGHT}px`,
            } as CSSProperties
          }
          role="dialog"
          aria-label="Cursor chat"
          // Programmatic focus target only (never in the Tab order). An
          // auto-ask has no mounted composer to focus, so the dialog itself
          // takes focus — see the open-focus effect.
          tabIndex={-1}
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
              this can hallucinate, so double-check anything important. chats
              are logged to improve the site.
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
