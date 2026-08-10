import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  boundAskContext,
  CURSOR_CHAT_OPENED_EVENT,
  requestCursorChatOpen,
  type CaseContextKey,
  type SuggestedPrompt,
} from "../chatEvents";
import { toCaseContextKey } from "../caseContexts";
import { TextScramble } from "./TextScramble";

export type AskableKind = "project" | "essay" | "profile" | "contact" | "action";

export type AskAnchorPreference = "cursor" | "edge" | "margin";

export type ContextualAskHintDials = {
  dwellMs: number;
  offsetX: number;
  offsetY: number;
  pinSize: number;
  expandDelayMs: number;
  hintMaxWidth: number;
  scrambleDurMs: number;
  scrambleSpeed: number;
};

// How the active hint was summoned. A pointer-summoned hint tracks the
// pointer via the existing pointerout/pointermove wiring; a focus-summoned
// hint has no pointer relationship to lose, so it needs its own retirement
// rule (see the pointermove handler below). Left undefined for hints built
// outside the show() path (e.g. the Enter-key handler's transient object),
// which never linger long enough to need one.
type ActivationSource = "pointer" | "focus";

type ActiveHint = {
  element: HTMLElement;
  hint: string;
  kind: AskableKind;
  anchorPreference: AskAnchorPreference;
  suggestedPrompts: SuggestedPrompt[];
  followUpPrompts: SuggestedPrompt[];
  caseKey?: CaseContextKey;
  contextText: string;
  source?: ActivationSource;
};

type HintStage = "expanded" | "exiting";

type Point = {
  x: number;
  y: number;
};

const DEFAULT_DIALS: ContextualAskHintDials = {
  dwellMs: 400,
  offsetX: 10,
  offsetY: 10,
  pinSize: 20,
  expandDelayMs: 200,
  // Sized above the longest authored hint ("How does she design what AI says?",
  // 33 chars, measured at 257px incl. the copy's 20px padding) so the
  // single-line pin never clips against .contextual-ask-surface's clip-path.
  // The headroom is deliberate: the cap clips silently rather than wrapping,
  // so a future hint of up to about 36 chars still fits.
  hintMaxWidth: 280,
  scrambleDurMs: 800,
  scrambleSpeed: 0.04,
};

export const DEFAULT_CONTEXTUAL_ASK_HINT_DIALS = DEFAULT_DIALS;

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

function getAskableElement(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  // Controls inside a zone (e.g. the media play/pause button) opt out so the
  // pill never competes with their own affordance.
  if (target.closest("[data-ask-ignore]")) return null;
  return target.closest<HTMLElement>("[data-ask-hint]");
}

// "action" zones don't converse — activating one performs the zone's own
// navigation (the zone root if it is a link, else its first link, else the
// link the zone sits inside). Returns false when no link resolves, so callers
// can fall back instead of dead-ending on a pin that promised to navigate.
function activateActionZone(hint: ActiveHint) {
  const link =
    hint.element instanceof HTMLAnchorElement
      ? hint.element
      : (hint.element.querySelector<HTMLAnchorElement>("a[href]") ??
        hint.element.closest<HTMLAnchorElement>("a[href]"));
  if (!link) return false;
  link.click();
  return true;
}

// Mirrors SelectionAskPill's test for a "live" selection so the two agree on
// when the pill is showing.
function hasLiveSelection() {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== "";
}

function canShowHoverHints() {
  return (
    window.innerWidth > 860 &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function parsePromptChips(data: string | undefined, fallback: string[]) {
  if (!data) return fallback;

  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return fallback;
    const prompts = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);

    return prompts.length > 0 ? prompts : fallback;
  } catch {
    return fallback;
  }
}

function toPromptId(value: string, index: number) {
  return `${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "prompt"}-${index}`;
}

function getSuggestedPrompts(element: HTMLElement): SuggestedPrompt[] {
  return parsePromptChips(
    element.dataset.askPrompts,
    [element.dataset.askHint ?? "Ask about this"],
  ).map((prompt, index) => ({
    id: toPromptId(prompt, index),
    label: prompt,
    prompt,
  }));
}

function getFollowUpPrompts(element: HTMLElement): SuggestedPrompt[] {
  return parsePromptChips(
    element.dataset.askFollowUpPrompts,
    [],
  ).map((prompt, index) => ({
    id: toPromptId(prompt, index),
    label: prompt,
    prompt,
  }));
}

function readActiveHint(element: HTMLElement): ActiveHint {
  const text =
    element.dataset.askContext ??
    element.textContent?.replace(/\s+/g, " ").trim() ??
    "";
  const links = Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .slice(0, 4)
    .map((link) => `${link.textContent?.trim() || "link"}: ${link.href}`)
    .join("; ");
  return {
    element,
    hint: element.dataset.askHint ?? "Ask about this",
    kind: (element.dataset.askKind as AskableKind | undefined) ?? "project",
    anchorPreference:
      (element.dataset.askAnchor as AskAnchorPreference | undefined) ?? "cursor",
    suggestedPrompts: getSuggestedPrompts(element),
    followUpPrompts: getFollowUpPrompts(element),
    // Narrowed rather than cast: this is a DOM attribute, and an unknown value
    // must mean "no case context", not a lookup that returns undefined and
    // reaches the model as the string "undefined".
    caseKey: toCaseContextKey(element.dataset.askCase),
    // Same bounds getBoundedText applies, from the same place: without the
    // curated/walked split a pin ask on the essay card cut the 2699-char persona
    // essay at 2200 and lost the tail, while the identical chip inside the open
    // dialog got all of it.
    contextText: boundAskContext(
      `${text}${links ? ` Links: ${links}` : ""}`,
      !!element.dataset.askContext,
    ),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rectsOverlap(
  rectA: { left: number; top: number; right: number; bottom: number },
  rectB: DOMRect,
  padding = 8,
) {
  return !(
    rectA.right < rectB.left - padding ||
    rectA.left > rectB.right + padding ||
    rectA.bottom < rectB.top - padding ||
    rectA.top > rectB.bottom + padding
  );
}

function getAvoidRects(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      ".card-title, .card-summary, .card-role, .work-media-control, button, a, p",
    ),
  )
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function placeCommentPinLabel(
  label: HTMLElement,
  current: ActiveHint,
  anchor: Point,
  dials: ContextualAskHintDials,
) {
  const rect = label.getBoundingClientRect();
  const width = Math.max(rect.width, dials.pinSize);
  const height = Math.max(rect.height, dials.pinSize);
  const edge = 12;
  const candidates = [
    { x: anchor.x + dials.offsetX, y: anchor.y + dials.offsetY },
    { x: anchor.x + dials.offsetX, y: anchor.y - height - dials.offsetY },
    { x: anchor.x - width - dials.offsetX, y: anchor.y + dials.offsetY },
    { x: anchor.x - width - dials.offsetX, y: anchor.y - height - dials.offsetY },
  ].map((candidate) => ({
    x: clamp(candidate.x, edge, window.innerWidth - width - edge),
    y: clamp(candidate.y, edge, window.innerHeight - height - edge),
  }));
  const avoidRects = getAvoidRects(current.element);

  return (
    candidates.find((candidate) => {
      const candidateRect = {
        left: candidate.x,
        top: candidate.y,
        right: candidate.x + width,
        bottom: candidate.y + height,
      };

      return avoidRects.every((avoidRect) => !rectsOverlap(candidateRect, avoidRect));
    }) ?? candidates[0]
  );
}

function getFocusAnchor(element: HTMLElement): Point {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp(rect.right - 24, 12, window.innerWidth - 12),
    y: clamp(rect.top + 24, 12, window.innerHeight - 12),
  };
}

/*
 * "edge"/"margin" pin the hint to the zone's right edge (inside/outside
 * respectively) so it reads as attached to the card rather than dropped
 * wherever the cursor happened to dwell; only the y follows the pointer.
 */
function getPreferredAnchor(
  element: HTMLElement,
  preference: AskAnchorPreference,
  pointer: Point,
): Point {
  if (preference === "cursor") return pointer;
  const rect = element.getBoundingClientRect();
  const x = preference === "edge" ? rect.right - 24 : rect.right + 12;
  return {
    x: clamp(x, 12, window.innerWidth - 12),
    y: clamp(pointer.y, rect.top + 12, rect.bottom - 12),
  };
}

function readConverted() {
  try {
    return sessionStorage.getItem("ask-hint-converted") === "1";
  } catch {
    return false;
  }
}

function writeConverted() {
  try {
    sessionStorage.setItem("ask-hint-converted", "1");
  } catch {
    // Storage may be unavailable in private browsing modes.
  }
}

function applyZoneState(element: HTMLElement | null) {
  if (!element) return;
  element.dataset.askActive = "true";
}

function clearZoneState(element: HTMLElement | null) {
  if (!element) return;
  delete element.dataset.askActive;
}

export function ContextualAskHint({
  dials = DEFAULT_DIALS,
}: {
  dials?: ContextualAskHintDials;
}) {
  const labelRef = useRef<HTMLButtonElement | null>(null);
  const activeRef = useRef<ActiveHint | null>(null);
  const pendingElementRef = useRef<HTMLElement | null>(null);
  const visibleRef = useRef(false);
  const hoverCapableRef = useRef(false);
  // A live text selection means SelectionAskPill's "Ask about this" pill is
  // showing; that pill is the more specific affordance, so the hint yields —
  // it hides and refuses to reveal while a non-collapsed selection exists.
  const selectionActiveRef = useRef(false);
  const pointerRef = useRef<Point>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const anchorRef = useRef<Point>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const dwellTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [active, setActive] = useState<ActiveHint | null>(null);
  const [hintStage, setHintStage] = useState<HintStage>("expanded");

  const clearDwellTimer = () => {
    if (dwellTimerRef.current !== null) {
      window.clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  };

  const clearExitTimer = () => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  };

  const hide = () => {
    clearDwellTimer();
    pendingElementRef.current = null;

    const current = activeRef.current;
    if (!current && !visibleRef.current) return;

    visibleRef.current = false;
    clearZoneState(current?.element ?? null);
    activeRef.current = null;
    setHintStage("exiting");
    clearExitTimer();
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setActive(null);
      setHintStage("expanded");
    }, 120);
  };

  const show = (
    element: HTMLElement,
    {
      anchor = pointerRef.current,
      source = "pointer",
    }: {
      anchor?: Point;
      source?: ActivationSource;
    } = {},
  ) => {
    clearDwellTimer();
    clearExitTimer();
    pendingElementRef.current = null;

    const next: ActiveHint = { ...readActiveHint(element), source };
    clearZoneState(activeRef.current?.element ?? null);
    activeRef.current = next;
    visibleRef.current = true;
    anchorRef.current = getPreferredAnchor(element, next.anchorPreference, {
      ...anchor,
    });
    applyZoneState(next.element);

    // Always open with the full label: the old collapsed pin stage read as a
    // glitch when caught on its own in a zone's whitespace.
    setHintStage("expanded");
    setActive(next);
  };

  const requestChatForHint = (current: ActiveHint, anchor: Point) => {
    writeConverted();
    requestCursorChatOpen({
      clientX: anchor.x,
      clientY: anchor.y,
      suggestedPrompts: current.suggestedPrompts,
      followUpPrompts: current.followUpPrompts,
      caseKey: current.caseKey,
      // The pin displays a question; pressing it asks that question. The
      // suggested prompts survive as follow-ups under the answer: the opening
      // chips are not pre-marked as shown for an auto-ask thread, precisely
      // so they can still be offered once the answer lands.
      // An "action" zone only reaches this path when its navigation could not
      // be resolved; its hint is a label, not a question, so open the composer
      // on the zone's chips rather than sending the label as the ask.
      autoAsk: current.kind === "action" ? "" : current.hint,
      zoneContext: {
        hint: current.hint,
        kind: current.kind,
        contextText: current.contextText,
      },
    });
  };

  const openActiveChat = () => {
    const current = activeRef.current;
    if (!current) return;

    // Only take the navigation exit when there is something to navigate to;
    // otherwise fall through so the press still opens something.
    if (current.kind === "action" && activateActionZone(current)) {
      hide();
      return;
    }

    requestChatForHint(current, anchorRef.current);
    hide();
  };

  useEffect(() => {
    hoverCapableRef.current = canShowHoverHints();

    return () => {
      clearDwellTimer();
      clearExitTimer();
    };
  }, []);

  useLayoutEffect(() => {
    const label = labelRef.current;
    const current = activeRef.current;
    if (!label || !current || !visibleRef.current || hintStage === "exiting") return;

    const { x, y } = placeCommentPinLabel(
      label,
      current,
      anchorRef.current,
      dials,
    );
    label.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, [active, hintStage, dials.offsetX, dials.offsetY, dials.pinSize, dials.hintMaxWidth]);

  useEffect(() => {
    const scheduleShow = (element: HTMLElement) => {
      if (!hoverCapableRef.current) return;
      if (activeRef.current?.element === element && visibleRef.current) return;

      hide();
      pendingElementRef.current = element;
      const converted = readConverted();
      dwellTimerRef.current = window.setTimeout(() => {
        if (pendingElementRef.current === element) {
          show(element);
        }
      }, converted ? 250 : Math.max(0, dials.dwellMs));
    };

    const onPointerOver = (event: PointerEvent) => {
      hoverCapableRef.current = canShowHoverHints();
      if (event.pointerType === "touch" || isEditableTarget(event.target)) return;
      const element = getAskableElement(event.target);
      if (!element) return;
      // Yield to the selection pill while text is selected.
      if (selectionActiveRef.current) return;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      scheduleShow(element);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };

      // A focus-summoned hint has no pointer relationship to lose (unlike a
      // pointer-summoned one, which retires via onPointerOut). Retire it the
      // moment the pointer strays off both the focused zone and the pin
      // itself, so "/" can't send a stale zone's question for wherever the
      // reader's eyes actually are.
      const current = activeRef.current;
      if (current && visibleRef.current && current.source === "focus") {
        const target = event.target;
        const insideZone = target instanceof Node && current.element.contains(target);
        const insidePin = target instanceof Node && labelRef.current?.contains(target);
        if (!insideZone && !insidePin) hide();
      }
    };

    const onPointerOut = (event: PointerEvent) => {
      const current = activeRef.current?.element ?? pendingElementRef.current;
      if (!current) return;
      const related = event.relatedTarget;
      if (related instanceof Node && current.contains(related)) return;
      if (related instanceof Node && labelRef.current?.contains(related)) return;
      if (event.target instanceof Node && current.contains(event.target)) hide();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (isEditableTarget(event.target)) {
        hide();
        return;
      }

      const element = getAskableElement(event.target);
      if (!element) return;
      // Yield to the selection pill while text is selected.
      if (selectionActiveRef.current) return;
      show(element, { anchor: getFocusAnchor(element), source: "focus" });
    };

    const onFocusOut = (event: FocusEvent) => {
      const current = activeRef.current?.element;
      if (!current) return;
      const related = event.relatedTarget;
      if (related instanceof Node && current.contains(related)) return;
      if (related instanceof Node && labelRef.current?.contains(related)) return;
      if (event.target instanceof Node && current.contains(event.target)) hide();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
        return;
      }

      const current = activeRef.current;
      const focusedZone =
        document.activeElement instanceof EventTarget
          ? getAskableElement(document.activeElement)
          : null;
      const canOpenFromHint = current && visibleRef.current;

      if (event.key === "/" && canOpenFromHint && !isEditableTarget(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openActiveChat();
        return;
      }

      if (event.key === "Enter" && focusedZone) {
        // Native activation must win: never swallow Enter for real controls
        // (button / role=switch / links) that
        // happen to live inside or be a [data-ask-hint] zone.
        if (
          event.target instanceof Element &&
          event.target.closest('button, [role="switch"], a[href]')
        ) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        const focusedHint =
          activeRef.current?.element === focusedZone
            ? activeRef.current
            : readActiveHint(focusedZone);
        // Explicit action check — the a[href] exclusion above only covers
        // zones whose root is itself a link. Same rule as the pin press: take
        // the navigation exit only when a link resolves, else fall through.
        if (focusedHint.kind === "action" && activateActionZone(focusedHint)) {
          hide();
          return;
        }
        const anchor =
          activeRef.current?.element === focusedZone && visibleRef.current
            ? anchorRef.current
            : getFocusAnchor(focusedZone);

        clearZoneState(activeRef.current?.element ?? null);
        activeRef.current = focusedHint;
        visibleRef.current = true;
        anchorRef.current = anchor;
        requestChatForHint(focusedHint, anchor);
        hide();
      }
    };

    const onSelectionChange = () => {
      const active = hasLiveSelection();
      selectionActiveRef.current = active;
      // Selection pill takes precedence: retract any shown hint the moment a
      // selection appears.
      if (active) hide();
    };

    window.addEventListener("pointerover", onPointerOver);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", onPointerOut);
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(CURSOR_CHAT_OPENED_EVENT, hide);
    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      window.removeEventListener("pointerover", onPointerOver);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", hide);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(CURSOR_CHAT_OPENED_EVENT, hide);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [dials]);

  const copy = active?.hint ?? "";
  const visualStage = hintStage === "exiting" ? "expanded" : hintStage;
  const isExiting = hintStage === "exiting";

  return active ? (
    <button
      ref={(node) => {
        labelRef.current = node;
      }}
      className={`contextual-ask-hint contextual-ask-hint--comment-pin contextual-ask-hint--${visualStage}${
        isExiting ? " contextual-ask-hint--exiting" : ""
      }`}
      data-kind={active.kind}
      data-stage={visualStage}
      type="button"
      aria-label={active.kind === "action" ? copy : `Ask "${copy}"`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={openActiveChat}
      onPointerLeave={(event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && active.element.contains(related)) return;
        hide();
      }}
      style={
        {
          "--ask-pin-size": `${dials.pinSize}px`,
          "--ask-hint-max-width": `${dials.hintMaxWidth}px`,
        } as CSSProperties
      }
    >
      <span className="contextual-ask-surface">
        <span className="contextual-ask-key">
          {active.kind === "action" ? "↗" : "/"}
        </span>
        <span className="contextual-ask-copy">
          <TextScramble
            text={copy}
            active={visualStage === "expanded" && !isExiting}
            durationMs={dials.scrambleDurMs}
            speed={dials.scrambleSpeed}
          />
        </span>
      </span>
    </button>
  ) : null;
}
