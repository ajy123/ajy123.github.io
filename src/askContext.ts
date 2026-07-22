// Resolves what the chat panel's chips/label/placeholder should be when a
// thread opens — the "suggested questions ignore where the reader is" fix.
// Replaces AUDIENCE_PROMPTS as the chip *source* (CursorChat.tsx:118-155) and
// getZoneTagLabel (CursorChat.tsx:229-239) as the label source: this module's
// `label` output already matches getZoneTagLabel's exact string shape
// (`ASKING ABOUT: <NOUN>`), so the wiring agent (T6) can delete that function
// and call zoneKindLabel/resolveAskContext instead.
//
// Resolution runs once, at open — not via a persistent observer — because the
// label is frozen for the life of the thread (see the design doc): a live
// label would drift the moment the pointer moves, and after the first answer
// the thread's system-prompt context is already baked in, so a moving label
// would misreport what the model actually read.
import { essaysById } from "./essays";
import { getAudienceRole, type AudienceRole } from "./audienceRole";

export type AskContext = {
  label: string;
  chips: string[];
  followUps: string[];
  placeholder: string;
  /** The section this resolved from, when it resolved to one. The caller feeds
   * the model text from this element rather than from whatever sat under the
   * pointer: if the pointer rests in the gutter between two work items, the
   * panel would otherwise label one section while the prompt quoted another. */
  element?: HTMLElement;
};

type PageDefault = {
  label: string;
  chips: string[];
  followUps: string[];
  placeholder: string;
};

// ---------------------------------------------------------------------------
// Label vocabulary — "ASKING ABOUT: <SHORT UPPERCASE NOUN>", budget ~34 chars
// including the prefix. Mirrors getZoneTagLabel's labelByKind buckets exactly
// (CursorChat.tsx:232-236) so zone-kind labels don't drift from today's copy.
// ---------------------------------------------------------------------------
const ZONE_KIND_LABELS: Record<string, string> = {
  project: "THIS PROJECT",
  essay: "THIS ESSAY",
  profile: "JOANNA",
};
const DEFAULT_ZONE_NOUN = "THIS PAGE";

/** Same shape/fallback as CursorChat's getZoneTagLabel, minus the null case:
 * this resolver always has a label to give (page default is the floor). */
export function zoneKindLabel(kind?: string | null): string {
  const noun = (kind && ZONE_KIND_LABELS[kind]) || DEFAULT_ZONE_NOUN;
  return `ASKING ABOUT: ${noun}`;
}

const DEELI_LABEL = "ASKING ABOUT: DEELI CASE STUDY";
const HOME_LABEL = "ASKING ABOUT: JOANNA'S WORK";
const ESSAY_LABEL = zoneKindLabel("essay"); // "ASKING ABOUT: THIS ESSAY" — fixed
// wording per correction; the open essay's title is NOT interpolated in (it
// would overflow the 360px zonetag row).

// ---------------------------------------------------------------------------
// Home page defaults — copy reused verbatim from the old AUDIENCE_PROMPTS
// (CursorChat.tsx:122-155), not re-authored: re-writing that copy is out of
// scope. All three of its branches survive. recruiter and default shared one
// chip array there and still do; only their placeholders differ.
const HOME_DEFAULT_CHIPS = [
  "what is Joanna's role?",
  "what did she build for Deeli?",
  "what does Joanna focus on?",
  "did she build Deeli's site in a week?",
  "is Joanna a designer and engineer?",
  "what is Joanna's email?",
];
const HOME_RECRUITER_PLACEHOLDER = "or ask what's on your checklist";
const HOME_DEFAULT_PLACEHOLDER = "or ask anything about her work";

const HOME_PRODUCT_DESIGN_CHIPS = [
  "does Joanna build AI products that hold data rigor and design quality equally?",
  "what was her role on the brand identity?",
  "does Joanna work across Figma and code?",
  "what did she build in a week?",
  "does the page say the work opened enterprise pilots across semiconductors, aerospace, and industrial research?",
  "is Joanna a designer and engineer?",
];
const HOME_PRODUCT_DESIGN_PLACEHOLDER = "or ask how anything here was made";

// ---------------------------------------------------------------------------
// /deeli/ page default — grounded in deeli/index.html's published copy and
// src/deeliCaseContext.ts (keyword search failing, design.md as the spec, the
// intent-parser eval's persona_hint score, the 13%->70% NL-share flip, the
// 28% re-asks). Matches the existing chip voice: lowercase, question form,
// each one verifiable against the page.
// ---------------------------------------------------------------------------
const DEELI_CHIPS = [
  "does the page say keyword search returned the same report for everyone?",
  "was design.md written as the spec before any ui work?",
  "did the intent-parser eval score 85.7% on persona_hint?",
  "does the page say nl query share rose from 13% to 70%?",
  "were 28% of live queries re-asks?",
  "does the page name four decisions: express, aim, observe, verify?",
];
const DEELI_PLACEHOLDER = "or ask anything about how this shipped";

const ESSAY_DEFAULT_PLACEHOLDER = "or ask anything about this essay";

function homePageDefault(role: AudienceRole | undefined): PageDefault {
  // All three branches of the old AUDIENCE_PROMPTS survive. `product design`
  // is the one with genuinely different chips; dropping it would silently
  // regress `?audience=product-design` links to the default set.
  if (role === "product design") {
    return {
      label: HOME_LABEL,
      chips: HOME_PRODUCT_DESIGN_CHIPS,
      followUps: HOME_PRODUCT_DESIGN_CHIPS,
      placeholder: HOME_PRODUCT_DESIGN_PLACEHOLDER,
    };
  }
  return {
    label: HOME_LABEL,
    chips: HOME_DEFAULT_CHIPS,
    followUps: HOME_DEFAULT_CHIPS,
    placeholder:
      role === "recruiter"
        ? HOME_RECRUITER_PLACEHOLDER
        : HOME_DEFAULT_PLACEHOLDER,
  };
}

function deeliPageDefault(): PageDefault {
  return {
    label: DEELI_LABEL,
    chips: DEELI_CHIPS,
    followUps: DEELI_CHIPS,
    placeholder: DEELI_PLACEHOLDER,
  };
}

/** Essay's own askPromptChips/askFollowUpPromptChips (already authored real
 * copy, reused rather than invented) when the open id resolves; otherwise
 * falls back to the underlying page's default so an unknown id never breaks
 * the panel. */
function essayPageDefault(essayId: string, underlyingPage: PageDefault): PageDefault {
  // readOpenEssayId only returns ids present in essaysById, so this is defined.
  const item = essaysById[essayId];
  if (!item) return { ...underlyingPage, label: ESSAY_LABEL };

  const chips = item.askPromptChips.length ? item.askPromptChips : underlyingPage.chips;
  const followUps = item.askFollowUpPromptChips.length
    ? item.askFollowUpPromptChips
    : chips;

  return {
    label: ESSAY_LABEL,
    chips,
    followUps,
    placeholder: ESSAY_DEFAULT_PLACEHOLDER,
  };
}

// ---------------------------------------------------------------------------
// Essay-open detection — duplicated read-only from useEssayHashRoute
// (src/essays/useEssayHashRoute.ts:12, 31-37: `#essay/<id>`, URI-decoded).
// Deliberately reads location.hash directly instead of importing the hook:
// the hook is React state (mount-lifecycle-bound), and this resolver must run
// synchronously, once, at composer-open time, independent of any component's
// render cycle.
// ---------------------------------------------------------------------------
const ESSAY_HASH_PREFIX = "#essay/";

function readOpenEssayId(): string | null {
  if (typeof window === "undefined") return null;
  const { hash } = window.location;
  if (!hash.startsWith(ESSAY_HASH_PREFIX)) return null;
  const id = hash.slice(ESSAY_HASH_PREFIX.length);
  if (!id) return null;
  const decoded = decodeURIComponent(id);
  // An id we can't resolve renders no dialog, so the reader is still looking
  // at the page underneath — claiming "THIS ESSAY" there would be a lie.
  return essaysById[decoded] ? decoded : null;
}

function resolvePageDefault(): PageDefault {
  if (typeof window === "undefined") {
    // SSR floor: home/default, no role signal available.
    return homePageDefault(undefined);
  }

  const isDeeli = window.location.pathname.startsWith("/deeli");
  const underlyingPage = isDeeli ? deeliPageDefault() : homePageDefault(getAudienceRole());

  // Essay open outranks pathname: the essay modal can be reached from either
  // page (src/main.tsx and src/deeliChatApp.tsx both mount EssayDialog off
  // the same useEssayHashRoute), so its content — not the page underneath —
  // is what the reader is actually looking at.
  const essayId = readOpenEssayId();
  if (essayId) return essayPageDefault(essayId, underlyingPage);

  return underlyingPage;
}

// ---------------------------------------------------------------------------
// Nearest-section resolution (chain step 2) — runs once, synchronously, at
// composer-open time. No persistent IntersectionObserver.
// ---------------------------------------------------------------------------
function parseJsonStringArray(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function rectIntersectsViewport(rect: DOMRect): boolean {
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

/** A zone only counts as a section if it actually carries chips. The work
 * canvas nests promptless link zones ("Read the case study", "See it live")
 * inside real ones, and those must not shadow the parent they sit in. */
function hasChips(element: HTMLElement): boolean {
  return parseJsonStringArray(element.dataset.askPrompts).length > 0;
}

/** Straight-line distance from a point to a rect; 0 when the point is inside.
 * Vertical distance alone is wrong here: the home page lays work items out
 * side by side, so two zones routinely share one vertical band and would tie. */
function distanceToRect(rect: DOMRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

// The essay modal covers the page, so while it is open the sections behind it
// are not what the reader is looking at. Scope section resolution to the panel.
const ESSAY_PANEL_SELECTOR = ".essay-dialog-panel";

function findNearestSection(
  anchorElement: Element | null,
  anchorPoint?: { x: number; y: number },
  scope?: ParentNode,
): HTMLElement | null {
  if (typeof window === "undefined") return null;

  const root = scope ?? document;
  if (scope && anchorElement && !scope.contains(anchorElement)) {
    anchorElement = null;
  }

  // Walk up rather than taking the first hit: the closest [data-ask-hint] may
  // be a promptless link zone sitting inside the section we actually want.
  let ancestor = anchorElement?.closest<HTMLElement>("[data-ask-hint]") ?? null;
  while (ancestor) {
    if (hasChips(ancestor)) return ancestor;
    ancestor = ancestor.parentElement?.closest<HTMLElement>("[data-ask-hint]") ?? null;
  }

  const point = anchorPoint ?? {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };

  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const candidate of root.querySelectorAll<HTMLElement>(
    "[data-ask-hint]",
  )) {
    if (!hasChips(candidate)) continue;
    const rect = candidate.getBoundingClientRect();
    if (!rectIntersectsViewport(rect)) continue;
    const distance = distanceToRect(rect, point.x, point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function sectionAskContext(
  element: HTMLElement,
  pageDefault: PageDefault,
): AskContext | null {
  const chips = parseJsonStringArray(element.dataset.askPrompts);
  if (!chips.length) return null; // no real chip content here — treat as a miss

  const parsedFollowUps = parseJsonStringArray(element.dataset.askFollowUpPrompts);
  const followUps = parsedFollowUps.length ? parsedFollowUps : pageDefault.followUps;

  return {
    label: zoneKindLabel(element.dataset.askKind),
    chips: chips.slice(0, 3),
    followUps,
    placeholder: pageDefault.placeholder,
    element,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function resolveAskContext(opts: {
  anchorElement: Element | null;
  anchorPoint?: { x: number; y: number };
  zonePrompts?: string[];
  zoneFollowUps?: string[];
  zoneLabel?: string;
}): AskContext {
  const pageDefault = resolvePageDefault();

  // 1. Explicit zone (hover badge or tap already resolved a zone upstream).
  if (opts.zonePrompts && opts.zonePrompts.length > 0) {
    const followUps =
      opts.zoneFollowUps && opts.zoneFollowUps.length > 0
        ? opts.zoneFollowUps
        : pageDefault.followUps;
    return {
      label: opts.zoneLabel ?? zoneKindLabel(undefined),
      chips: opts.zonePrompts.slice(0, 3),
      followUps,
      placeholder: pageDefault.placeholder,
    };
  }

  // 2. Nearest section in the viewport. While the essay modal is open the
  // search is scoped to it — a section behind the overlay is not what the
  // reader is looking at, and letting it win would contradict the label.
  const essayIsOpen = typeof window !== "undefined" && !!readOpenEssayId();
  const essayPanel = essayIsOpen
    ? document.querySelector<HTMLElement>(ESSAY_PANEL_SELECTOR)
    : null;
  if (!essayIsOpen || essayPanel) {
    const section = findNearestSection(
      opts.anchorElement,
      opts.anchorPoint,
      essayPanel ?? undefined,
    );
    if (section) {
      const resolved = sectionAskContext(section, pageDefault);
      if (resolved) return resolved;
    }
  }

  // 3. Page default (essay > pathname > home).
  return {
    label: pageDefault.label,
    chips: pageDefault.chips.slice(0, 3),
    followUps: pageDefault.followUps,
    placeholder: pageDefault.placeholder,
  };
}
