// Resolves what the chat panel's chips/label/placeholder should be when a
// thread opens — the "suggested questions ignore where the reader is" fix.
// Replaces AUDIENCE_PROMPTS as the chip *source* (CursorChat.tsx:118-155) and
// getZoneTagLabel (CursorChat.tsx:229-239) as the label source: this module's
// `label` output already matches getZoneTagLabel's exact string shape
// (`ASKING ABOUT: <NOUN>`), so the wiring agent (T6) can delete that function
// and call zoneKindLabel/resolveAskContext instead.
//
// Resolution is a pure function of a point, called on open and again on
// pointer move while the thread is still a draft. It deliberately owns no
// observer and no state: the caller decides when a thread may retarget and
// stops calling once a question is asked, because from then on the thread's
// system-prompt context is baked in and a moving label would misreport what
// the model actually read.
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
const SWIFTLY_LABEL = "ASKING ABOUT: SWIFTLY CASE STUDY";
const NYU_LABEL = "ASKING ABOUT: NYU CASE STUDY";
const HOME_LABEL = "ASKING ABOUT: JOANNA'S WORK";
const ESSAY_LABEL = zoneKindLabel("essay"); // "ASKING ABOUT: THIS ESSAY" — fixed
// wording per correction; the open essay's title is NOT interpolated in (it
// would overflow the zonetag row, which shares its line with the close
// button inside a 340px panel).

// ---------------------------------------------------------------------------
// Home page defaults. Every chip here is new, and they replace six that a
// reader could already answer without opening the chat. "what is Joanna's role?"
// and "what does Joanna focus on?" are both printed in the rail's own bio, two
// lines above the button that opens this panel. "what did she build for Deeli?"
// and "did she build Deeli's site in a week?" were answered outright by the work
// card summaries, the second one almost word for word by the Brand Identity
// card. The fifth, "is Joanna a designer and engineer?", went for a worse reason
// than redundancy: it returned "No" against SITE_CONTEXT, which states designer
// is the right title for her and engineer is not, and a suggested question that
// talks the reader out of a capability is worse than no chip at all.
//
// "what is Joanna's email?" went too, and for the same reason rather than a
// softer one: the rail prints the address with a copy button directly below this
// panel's own button, so the chip spent a suggestion slot on the one thing the
// page already hands over.
//
// Every chip here is answerable only from the facts in
// src/siteContext.ts, and each deliberately avoids text already printed on the
// home page cards. The Deeli card prints the 220% and the 13% to 70% figures and
// the word market, and the Swiftly card prints 30+ to 12 to 24 hours and the 20%
// inbound drop, so none of those appear in the new chips or in the facts they
// draw on.
//
// Only the first three chips render at open (resolveAskContext slices to 3).
// followUpsFor then offers three previously unshown chips after each answered
// turn, so the whole set is reachable inside one thread and a reader who keeps
// going can click five of them. An earlier version of this comment claimed the
// unclicked opening chips were spent and capped a thread at two answers. That was
// wrong, verified by simulating followUpsFor against this array on 2026-08-10.
// The opening three still lead deliberately: one on how she tests model output,
// one on product judgment in the search flow, and one on resolving a disagreement
// with a PM, so a first glance shows range rather than three questions about the
// same subject.
//
// Browser-tested twice on 2026-08-10. The first chip used to ask what happens
// when the assistant gets it wrong, and the model answered it correctly but only
// from the last sentence of its fact, so the mixed-language example never reached
// the reader. The cause was one fact holding two answers, one about what
// evaluations catch before shipping and one about what a reader can verify
// afterwards, which forced the model to choose. The fact is now split in two. The
// catching half keeps this chip, retargeted to what it actually describes. The
// verification half is a fact with no chip of its own, still reachable by a typed
// question, since the reader-feedback chip already covers that territory.
//
// The first chip was then retargeted a second time, away from "what did the model
// evaluations catch before launch?", because the homepage essay card already
// prints that a persona test caught mixed-language users breaking language
// detection, so the answer restated copy the reader could already see. The
// mixed-language fact stays in src/siteContext.ts and a typed question still
// reaches it.
const HOME_DEFAULT_CHIPS = [
  "how does she test what the model says before it ships?",
  "why does the Deeli research assistant ask before it answers?",
  "what did she do when queries came in mixed English and Mandarin?",
  "how does she settle a disagreement with a PM?",
  "when has she pushed back on what she was asked to build?",
  "what happened when the product team proposed thumbs up and down?",
  "what does she not hand to AI in her own workflow?",
  "how does one designer keep a design system consistent at Deeli?",
  "why are expert users the hardest audience for AI-generated content?",
  "which of her own ideas did the data kill?",
  "what did she do when interviews could not settle which sections readers wanted?",
  "how does she get more evidence behind a finding?",
  "how much time did her synthesis pipeline save?",
  "can model evaluations catch every edge case?",
];
const HOME_RECRUITER_PLACEHOLDER = "or ask what's on your checklist";
const HOME_DEFAULT_PLACEHOLDER = "or ask anything about her work";

const HOME_PRODUCT_DESIGN_PLACEHOLDER = "or ask how anything here was made";

// ---------------------------------------------------------------------------
// /deeli/ page default — grounded in deeli/index.html's published copy (keyword
// search failing, design.md, the six-of-seven persona result, the 13%->70%
// NL-share flip, the 28% re-asks, the four named moves). Matches the existing
// chip voice: lowercase, question form, each one verifiable against the page.
// Chips must check PUBLISHED copy, not the private grounding in
// src/deeliCaseContext.ts. Three chips here previously asked about the
// persona_hint eval score, design.md as a pre-UI spec, and decisions named
// "express, aim, observe, verify". None of those strings are on the page, so
// each chip invited a page check that returned no. The page's own wording is
// "it got six of seven right", "I write the interface as a few design
// primitives in design.md", and the moves numbered 01 Ask / 02 Scope /
// 03 Research / 04 Verify.
// ---------------------------------------------------------------------------
const DEELI_CHIPS = [
  "does the page say keyword search returned the same report for everyone?",
  "does the page say the interface was written as design primitives in design.md?",
  "does the page say nl query share rose from 13% to 70%?",
  "did the model get six of seven right on who the report was for?",
  "were 28% of queries re-asks?",
  "does the page name four moves: ask, scope, research, verify?",
];
const CASE_PLACEHOLDER = "or ask anything about how this shipped";

// ---------------------------------------------------------------------------
// /swiftly/ and /nyu/ page defaults. Before these existed, resolvePageDefault
// special-cased only /deeli and every other path fell through to the homepage
// set, so a reader on the Swiftly case study was offered "what is Joanna's
// role?" and "what is Joanna's email?" while looking at a transit dashboard.
// The digest for the page was loaded and could answer far better questions;
// nothing invited them.
//
// Same rule as DEELI_CHIPS: each chip must be answerable from the PUBLISHED
// page, not from the private grounding. These ask after the decisions the page
// states its reasoning for, since that is what a hiring reader is trying to
// judge. Verified against the page copy: "I stopped trying to improve the
// report.", "In-service status leads: it is the one thing IT scans for", "I
// chose a labeled color legend over icons", "Hover to monitor, click to
// investigate", "The internal goal was not met." / "The target was under 12
// hours per investigation.", "claims nothing the data cannot back up".
//
// The sixth slot on each page deliberately does NOT ask for a fact. Its first
// draft ("what did one device issue cost before?") only recited a number, and
// its draft before that repeated what the opening chip already answers. A
// follow-up should give the reader a reason to keep going, so it asks after a
// stance instead: designing within what the data can honestly support, and
// stating the hypothesis before building. The chip says "hypothesis" where
// nyu/index.html:565 says "bet"; a chip has to be answerable from the page,
// not quote it, and "hypothesis" is the word a hiring reader is scanning for.
// ---------------------------------------------------------------------------
const SWIFTLY_CHIPS = [
  "why stop trying to improve the report?",
  "why does in-service status lead the table?",
  "what did missing the under-12-hour goal teach?",
  "why a labeled legend instead of icons?",
  "why hover to monitor but click to investigate?",
  "why claim nothing the data cannot back up?",
];

// Verified against nyu/index.html: "a workflow, not a row of data.", "I weighed
// overload against scannability and chose a continuous form over a paginated
// one", "I weighed button visibility against minimizing distraction and kept
// the floating action button", "I ran two pre-launch loops", the measurement
// note under the ~33% stat, and "I mapped how a request travels".
const NYU_CHIPS = [
  "why is a request a workflow, not a row?",
  "why a continuous form instead of pagination?",
  "how was the 33% turnaround measured?",
  "why keep the floating action button?",
  "who signed off before launch?",
  "what was the hypothesis before building?",
];

const ESSAY_DEFAULT_PLACEHOLDER = "or ask anything about this essay";

// Rotating the opening three. resolveAskContext takes the first three chips for
// the panel, and that slice always started at index 0, so a reader who opened the
// panel, asked a question and came back saw the same three forever. Everything
// past the sixth chip was reachable only by someone who kept one thread going for
// four turns.
//
// The offset advances once per page load, not once per thread. resolveAskContext
// runs again on every pointer move while a thread is still a draft, so an offset
// that moved per call would change the chips under the reader mid-draft. Stored in
// sessionStorage, the same place getAudienceRole and the intro flag already keep
// their state, so moving between pages keeps walking through the set. Read once
// into a module-scope memo so every call within one load agrees.
const HOME_CHIP_OFFSET_KEY = "ask-home-chip-offset";
const HOME_CHIP_OPENING_COUNT = 3;
let homeChipOffset: number | null = null;

function homeChipsRotated(): string[] {
  const chips = HOME_DEFAULT_CHIPS;
  if (typeof window === "undefined" || chips.length <= HOME_CHIP_OPENING_COUNT) {
    return chips;
  }
  if (homeChipOffset === null) {
    let start = 0;
    try {
      const raw = window.sessionStorage.getItem(HOME_CHIP_OFFSET_KEY);
      const parsed = raw ? Number.parseInt(raw, 10) : 0;
      start = Number.isFinite(parsed) && parsed >= 0 ? parsed % chips.length : 0;
    } catch {
      start = 0; // Storage unavailable in private browsing; rotation just stays at 0.
    }
    homeChipOffset = start;
    try {
      window.sessionStorage.setItem(
        HOME_CHIP_OFFSET_KEY,
        String((start + HOME_CHIP_OPENING_COUNT) % chips.length),
      );
    } catch {
      // Same private-browsing case: the next load reads 0 and opens with the
      // strongest three, which is the right thing to fall back to.
    }
  }
  return [...chips.slice(homeChipOffset), ...chips.slice(0, homeChipOffset)];
}

function homePageDefault(role: AudienceRole | undefined): PageDefault {
  // All three branches of the old AUDIENCE_PROMPTS survive, but the reasoning
  // has flipped: the default set is now the stronger one, so `product design`
  // keeps only its placeholder and serves the same chips. Its own six chips
  // were cut because "is Joanna a designer and engineer?" returned "No"
  // against SITE_CONTEXT, "does Joanna build AI products that hold data rigor
  // and design quality equally?" restated a positioning claim so the answer
  // could only echo it back, and "does the page say enterprise pilot
  // conversations started at Computex?" reads as a test assertion rather than
  // a question a reader would ask.
  if (role === "product design") {
    return {
      label: HOME_LABEL,
      chips: homeChipsRotated(),
      followUps: HOME_DEFAULT_CHIPS,
      placeholder: HOME_PRODUCT_DESIGN_PLACEHOLDER,
    };
  }
  return {
    label: HOME_LABEL,
    chips: homeChipsRotated(),
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
    placeholder: CASE_PLACEHOLDER,
  };
}

function swiftlyPageDefault(): PageDefault {
  return {
    label: SWIFTLY_LABEL,
    chips: SWIFTLY_CHIPS,
    followUps: SWIFTLY_CHIPS,
    placeholder: CASE_PLACEHOLDER,
  };
}

function nyuPageDefault(): PageDefault {
  return {
    label: NYU_LABEL,
    chips: NYU_CHIPS,
    followUps: NYU_CHIPS,
    placeholder: CASE_PLACEHOLDER,
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

  // Both chip fields are optional on EssayItem: an essay may ship without its
  // own copy, in which case the underlying page's chips stand in.
  const chips = item.askPromptChips?.length
    ? item.askPromptChips
    : underlyingPage.chips;
  const followUps = item.askFollowUpPromptChips?.length
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

  const path = window.location.pathname;
  const casePage = path.startsWith("/deeli")
    ? deeliPageDefault()
    : path.startsWith("/swiftly")
      ? swiftlyPageDefault()
      : path.startsWith("/nyu")
        ? nyuPageDefault()
        : undefined;
  const underlyingPage = casePage ?? homePageDefault(getAudienceRole());

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

// The open essay's panel, or null when no essay is open. Exported so the
// composer can read the panel's own data-ask-context at submit time through the
// one open-essay lookup this file already owns, instead of a second selector
// somewhere else that could outlive a class rename.
export function findOpenEssayPanel(): HTMLElement | null {
  const essayId = readOpenEssayId();
  if (!essayId) return null;
  // By id, not by class. Two panels share the class during a switch between
  // essays: the outgoing one is still mounted for its exit animation while the
  // incoming one has rendered, and querySelector would hand back whichever
  // comes first in the DOM. Measured 2026-08-10 — going straight from the
  // persona essay to team-of-agents left both mounted, so a chip fired in that
  // window would have quoted the essay the reader just closed. The id is the
  // same `essay-dialog-<id>` EssayDialog puts on the panel.
  return document.getElementById(`essay-dialog-${essayId}`);
}

// A work card can deliberately ship with no ask zone (the Brand Identity card
// keeps only its "DEELI.AI" live link and opts out of the ask surface). Its
// fallback wrapper carries this marker instead of data-ask-hint. Without an
// explicit opt-out, the viewport scan below would still treat "nearest zone
// with chips" as a good enough answer and borrow a neighbouring card's chips
// and context text, mislabeling the panel with a project the reader isn't
// looking at.
const NO_ASK_ZONE_SELECTOR = '[data-ask-zone="none"]';

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

  // Explicit opt-out: the anchor sits inside a de-zoned card. Bail before the
  // nearest-section scan rather than letting proximity pick a neighbour's
  // zone for it; resolveAskContext falls through to the page default.
  if (anchorElement?.closest(NO_ASK_ZONE_SELECTOR)) return null;

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
