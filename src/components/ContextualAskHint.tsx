import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CURSOR_CHAT_OPENED_EVENT,
  requestCursorChatOpen,
  type SuggestedPrompt,
} from "../chatEvents";

export type AskableKind = "project" | "essay" | "profile" | "contact";

export type AskAnchorPreference = "cursor" | "edge" | "margin";

export type AskableZone = {
  id: string;
  hint: string;
  kind: AskableKind;
  anchorPreference?: AskAnchorPreference;
};

export type ContextualAskHintDials = {
  dwellMs: number;
  offsetX: number;
  offsetY: number;
  pinSize: number;
  expandDelayMs: number;
  hintMaxWidth: number;
};

type ActiveHint = {
  element: HTMLElement;
  hint: string;
  kind: AskableKind;
  anchorPreference: AskAnchorPreference;
  suggestedPrompts: SuggestedPrompt[];
};

type HintStage = "pin" | "expanded" | "exiting";

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
  hintMaxWidth: 220,
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
  return target.closest<HTMLElement>("[data-ask-hint]");
}

function canShowHoverHints() {
  return (
    window.innerWidth > 860 &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function parsePromptChips(element: HTMLElement) {
  const fallback = [element.dataset.askHint ?? "Ask about this"];
  if (!element.dataset.askPrompts) return fallback;

  try {
    const parsed = JSON.parse(element.dataset.askPrompts);
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
  return parsePromptChips(element).map((prompt, index) => ({
    id: toPromptId(prompt, index),
    label: prompt,
    prompt,
  }));
}

function readActiveHint(element: HTMLElement): ActiveHint {
  return {
    element,
    hint: element.dataset.askHint ?? "Ask about this",
    kind: (element.dataset.askKind as AskableKind | undefined) ?? "project",
    anchorPreference:
      (element.dataset.askAnchor as AskAnchorPreference | undefined) ?? "cursor",
    suggestedPrompts: getSuggestedPrompts(element),
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
  const pointerRef = useRef<Point>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const anchorRef = useRef<Point>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  const dwellTimerRef = useRef<number | null>(null);
  const expandTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [active, setActive] = useState<ActiveHint | null>(null);
  const [hintStage, setHintStage] = useState<HintStage>("expanded");

  const clearDwellTimer = () => {
    if (dwellTimerRef.current !== null) {
      window.clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  };

  const clearExpandTimer = () => {
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
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
    clearExpandTimer();
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
      skipPin = false,
    }: {
      anchor?: Point;
      skipPin?: boolean;
    } = {},
  ) => {
    clearDwellTimer();
    clearExpandTimer();
    clearExitTimer();
    pendingElementRef.current = null;

    const next = readActiveHint(element);
    clearZoneState(activeRef.current?.element ?? null);
    activeRef.current = next;
    visibleRef.current = true;
    anchorRef.current = { ...anchor };
    applyZoneState(next.element);

    if (skipPin) {
      setHintStage("expanded");
    } else {
      setHintStage("pin");
      expandTimerRef.current = window.setTimeout(() => {
        expandTimerRef.current = null;
        if (visibleRef.current) setHintStage("expanded");
      }, Math.max(0, dials.expandDelayMs));
    }

    setActive(next);
  };

  const requestChatForHint = (current: ActiveHint, anchor: Point) => {
    writeConverted();
    requestCursorChatOpen({
      clientX: anchor.x,
      clientY: anchor.y,
      suggestedPrompts: current.suggestedPrompts,
      zoneContext: { hint: current.hint, kind: current.kind },
    });
  };

  const openActiveChat = () => {
    const current = activeRef.current;
    if (!current) return;

    requestChatForHint(current, anchorRef.current);
    hide();
  };

  useEffect(() => {
    hoverCapableRef.current = canShowHoverHints();

    return () => {
      clearDwellTimer();
      clearExpandTimer();
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
          show(element, { skipPin: converted });
        }
      }, converted ? 250 : Math.max(0, dials.dwellMs));
    };

    const onPointerOver = (event: PointerEvent) => {
      hoverCapableRef.current = canShowHoverHints();
      if (event.pointerType === "touch" || isEditableTarget(event.target)) return;
      const element = getAskableElement(event.target);
      if (!element) return;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      scheduleShow(element);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
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
      show(element, { anchor: getFocusAnchor(element), skipPin: true });
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

      if (event.key === "/" && canOpenFromHint) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openActiveChat();
        return;
      }

      if (event.key === "Enter" && focusedZone) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const focusedHint =
          activeRef.current?.element === focusedZone
            ? activeRef.current
            : readActiveHint(focusedZone);
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

    window.addEventListener("pointerover", onPointerOver);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", onPointerOut);
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(CURSOR_CHAT_OPENED_EVENT, hide);

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
      aria-label={`Open chat suggestions: ${copy}`}
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
        <span className="contextual-ask-key">/</span>
        <span className="contextual-ask-copy">{copy}</span>
      </span>
    </button>
  ) : null;
}
