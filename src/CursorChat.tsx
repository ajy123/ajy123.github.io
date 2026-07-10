import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import {
  isAbortError,
  isEngineReady,
  isWebGPUAvailable,
  onInitProgress,
  streamChat,
} from "./llmEngine";
import {
  CURSOR_CHAT_OPENED_EVENT,
  CURSOR_CHAT_REQUEST_OPEN_EVENT,
  type CursorChatZoneContext,
  type CursorChatRequestOpenDetail,
  type SuggestedPrompt,
} from "./chatEvents";
import { SITE_CONTEXT } from "./siteContext";

type ChatStatus =
  | "draft"
  | "loading"
  | "streaming"
  | "done"
  | "error";

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
  status: ChatStatus;
  isPinned: boolean;
  createdAt: number;
  dragPageLeft?: number;
  dragPageTop?: number;
  draftPlaceholder?: string;
  suggestedPrompts?: SuggestedPrompt[];
  zoneContext?: CursorChatZoneContext;
};

const COMPOSER_WIDTH = 320;
const COMPOSER_MAX_HEIGHT = 360;
const EDGE = 14;
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
      "what's she strongest at?",
      "what has she shipped recently?",
      "walk me through her background",
      "what roles is she looking for?",
    ],
    placeholder: "or ask what's on your checklist",
  },
  "product design": {
    chips: [
      "how was this chat built?",
      "what's her design process?",
      "what did she actually ship?",
    ],
    placeholder: "or ask how anything here was made",
  },
  default: {
    chips: [
      "what did she actually ship?",
      "what's she strongest at?",
      "how was this chat built?",
    ],
    placeholder: "or ask anything about her work",
  },
};

function getAudiencePrompts() {
  const role = getAudienceRole();
  return (role && AUDIENCE_PROMPTS[role]) || AUDIENCE_PROMPTS.default;
}

function shufflePrompts(prompts: string[]) {
  return prompts
    .map((prompt) => ({ prompt, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ prompt }) => prompt);
}

function toSuggestedPromptId(value: string, index: number) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `persona-${slug || "prompt"}-${index}`;
}

function pickAudienceSuggestions(): SuggestedPrompt[] {
  return shufflePrompts(getAudiencePrompts().chips)
    .slice(0, 3)
    .map((prompt, index) => ({
      id: toSuggestedPromptId(prompt, index),
      label: prompt,
      prompt,
    }));
}

function pickDraftPlaceholder(fromSelection: boolean): string {
  if (fromSelection) return "Ask about what you selected";
  return getAudiencePrompts().placeholder;
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
  chipStaggerMs: 40,
  radiusTight: 4,
  radiusRoomy: 14,
};

type AnchorCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

function getAudienceRole(): CapturedContext["audienceRole"] {
  const audience = new URLSearchParams(window.location.search)
    .get("audience")
    ?.trim()
    .toLowerCase();

  if (!audience) return undefined;
  return AUDIENCE_PRESETS[audience as keyof typeof AUDIENCE_PRESETS];
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

function getBoundedText(element: Element | null) {
  const source =
    element?.closest("section, article, aside, main, footer") ?? element;
  return (source?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 900);
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
    ? point.x - COMPOSER_WIDTH - EDGE
    : point.x + EDGE;
  const preferredTop = opensUp
    ? point.y - COMPOSER_MAX_HEIGHT - EDGE
    : point.y + EDGE;

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
  return {
    left: Math.min(Math.max(point.x, EDGE), window.innerWidth - 36),
    top: Math.min(Math.max(point.y, EDGE), window.innerHeight - 36),
  };
}

function captureContext(pageX: number, pageY: number): CapturedContext {
  const point = getViewportPoint(pageX, pageY);
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";
  const element = document.elementFromPoint(point.x, point.y);
  const audienceRole = getAudienceRole();
  const context = {
    url: window.location.href,
    title: document.title,
    ...(audienceRole ? { audienceRole } : {}),
    selectedText,
    nearbyText: getBoundedText(element),
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

  return context;
}

const UNSUPPORTED_MESSAGE =
  "This browser cannot run the local model. It needs WebGPU (recent Chrome, Edge, or Arc).";

// Generation narration: silent-ish pulse first, truthful stage phrases only
// when the wait drags on. Ends on "composing…" and holds.
const THINKING_PHRASES = [
  "thinking…",
  "reading this page…",
  "checking Joanna's notes…",
  "composing…",
];
const THINKING_PHRASE_DELAYS_MS = [3000, 5500, 8000];

const BRAIN_METER_CELLS = 12;

function renderResponseText(response: string, isStreaming: boolean) {
  if (!isStreaming) return response;

  return response.split(/(\s+)/).map((part, index) => (
    <span className="cursor-chat-response-token" key={index}>
      {part}
    </span>
  ));
}

function buildMessages(
  prompt: string,
  context: CapturedContext,
  history: ChatTurn[] = [],
  zoneContext?: CursorChatZoneContext,
): ChatCompletionMessageParam[] {
  const audienceGuidance =
    context.audienceRole === "recruiter"
      ? "Audience role: recruiter. Tailor the answer toward role fit, experience, collaboration, impact, and why Joanna is relevant to hiring or recruiting evaluation. Do not claim personal knowledge of the visitor."
      : context.audienceRole === "product design"
        ? "Audience role: product design. Tailor the answer toward design systems, product judgment, interaction design, prototyping, systems thinking, and craft. Do not claim personal knowledge of the visitor."
        : "";

  const contextLines = [
    `URL: ${context.url}`,
    `Page title: ${context.title}`,
    context.audienceRole ? `Audience role: ${context.audienceRole}` : "",
    zoneContext
      ? `The visitor opened this chat from the ${zoneContext.kind} section, invited by the prompt "${zoneContext.hint}". Answer with that focus.`
      : "",
    context.selectedText
      ? `Selected text (the visitor's primary focus): ${context.selectedText}`
      : "",
    context.nearbyText ? `Nearby content on the page: ${context.nearbyText}` : "",
    `Element under cursor: ${context.element}`,
  ]
    .filter(Boolean)
    .join("\n");

  const system =
    "You are a concise assistant embedded directly in Joanna Yen's portfolio website. " +
    "Answer the visitor's question about Joanna and the page they are looking at. " +
    "Ground your answer in the site profile and page context below. Prefer the selected text when present. " +
    "If a fact is not in the context, say you don't know rather than inventing it. " +
    (audienceGuidance ? `${audienceGuidance} ` : "") +
    "Keep replies short, plain, and helpful.\n\n" +
    SITE_CONTEXT +
    "\n\nPage context:\n" +
    contextLines;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
  ];

  history.forEach((turn) => {
    messages.push(
      { role: "user", content: turn.prompt },
      { role: "assistant", content: turn.response },
    );
  });

  messages.push({ role: "user", content: prompt });
  return messages;
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
  const abortRef = useRef<AbortController | null>(null);
  const suspendedRef = useRef(suspended);

  const activeThread = threads.find((thread) => thread.id === activeId) ?? null;
  const activeZoneTag = getZoneTagLabel(activeThread?.zoneContext);

  // Engine download progress (0..1). While a thread is "loading" but the model
  // is still downloading, the UI shows an honest progress state instead of
  // pretending to think.
  const [engineProgress, setEngineProgress] = useState(() =>
    isEngineReady() ? 1 : 0,
  );
  useEffect(() => onInitProgress((report) => setEngineProgress(report.progress)), []);
  const engineIsReady = isEngineReady() || engineProgress >= 1;

  // Generation narration index; restarts per thread and only once the engine
  // is actually generating (not while downloading).
  const [thinkingPhase, setThinkingPhase] = useState(0);
  const isGenerating = activeThread?.status === "loading" && engineIsReady;
  useEffect(() => {
    setThinkingPhase(0);
    if (!isGenerating) return;
    const timers = THINKING_PHRASE_DELAYS_MS.map((ms, index) =>
      window.setTimeout(() => setThinkingPhase(index + 1), ms),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [isGenerating, activeThread?.id]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    suspendedRef.current = suspended;
  }, [suspended]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleScrollOrResize = () => setTick((value) => value + 1);

    const openComposer = ({
      anchorOverride,
      suggestedPrompts,
      zoneContext,
    }: {
      anchorOverride?: { x: number; y: number };
      suggestedPrompts?: SuggestedPrompt[];
      zoneContext?: CursorChatZoneContext;
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
      const threadSuggestedPrompts =
        suggestedPrompts ??
        (!anchorOverride && !fromSelection ? pickAudienceSuggestions() : undefined);
      const id = crypto.randomUUID();

      setDraft("");
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
          status: "draft",
          isPinned: false,
          createdAt: Date.now(),
          suggestedPrompts: threadSuggestedPrompts,
          zoneContext,
          draftPlaceholder: pickDraftPlaceholder(fromSelection),
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
        zoneContext: detail?.zoneContext,
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

  // Closing an answered thread pins it in place instead of destroying it, so a
  // stray Escape never eats a conversation. Unanswered drafts still discard.
  const closeActive = () => {
    const id = activeIdRef.current;
    if (!id) return;

    abortRef.current?.abort();
    abortRef.current = null;
    setThreads((current) => {
      const thread = current.find((item) => item.id === id);
      const keep =
        thread && (thread.status === "done" || thread.history.length > 0);

      if (!keep) return current.filter((item) => item.id !== id);

      return current.map((item) => {
        if (item.id !== id) return item;
        const lastTurn = item.history[item.history.length - 1];
        const revertToLastTurn = item.status !== "done" && lastTurn;
        return {
          ...item,
          isPinned: true,
          status: "done" as ChatStatus,
          prompt: revertToLastTurn ? lastTurn.prompt : item.prompt,
          response: revertToLastTurn ? lastTurn.response : item.response,
        };
      });
    });
    activeIdRef.current = null;
    setActiveId(null);
    setDraft("");
    previousFocusRef.current?.focus();
  };

  const removeThread = (id: string) => {
    setThreads((current) => current.filter((thread) => thread.id !== id));
  };

  const submitThread = async (promptOverride?: string) => {
    if (!activeThread) return;

    const id = activeThread.id;
    const message =
      promptOverride?.trim() ||
      draft.trim() ||
      (activeThread.status === "error" ? activeThread.prompt.trim() : "");
    if (
      !message ||
      activeThread.status === "loading" ||
      activeThread.status === "streaming"
    ) {
      return;
    }

    const context = captureContext(activeThread.pageX, activeThread.pageY);
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
    }));

    // No WebGPU: cannot run the local model. Show a clear inline message.
    if (!isWebGPUAvailable()) {
      patch((thread) => ({
        ...thread,
        status: "done",
        response: UNSUPPORTED_MESSAGE,
        history: [
          ...thread.history,
          { prompt: message, response: UNSUPPORTED_MESSAGE },
        ],
      }));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const messages = buildMessages(
        message,
        context,
        activeThread.history,
        activeThread.zoneContext,
      );
      const response = await streamChat(
        messages,
        (full) => {
          patch((thread) => ({ ...thread, status: "streaming", response: full }));
        },
        controller.signal,
      );
      patch((thread) => ({
        ...thread,
        status: "done",
        response,
        history: [...thread.history, { prompt: message, response }],
      }));
    } catch (error) {
      if (isAbortError(error)) return;
      console.error("[cursor-chat] model response failed", error);
      patch((thread) => ({
        ...thread,
        status: "error",
        response: "Could not get a response. Retry keeps your prompt.",
      }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const collapseActive = () => {
    if (!activeThread || activeThread.status === "draft") return;

    setThreads((current) =>
      current.map((thread) =>
        thread.id === activeThread.id ? { ...thread, isPinned: true } : thread,
      ),
    );
    activeIdRef.current = null;
    setActiveId(null);
    previousFocusRef.current?.focus();
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

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const activePosition = activeThread
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
              style={{ left: position.left, top: position.top }}
            >
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
          );
        })}

      {activeThread && activePosition ? (
        <section
          className={`cursor-chat cursor-chat-${activeThread.status}`}
          data-anchor-corner={activePosition.anchorCorner}
          data-dragged={activeThread.dragPageLeft != null ? "true" : undefined}
          style={
            {
              left: activePosition.left,
              top: activePosition.top,
              "--chat-radius-tight": `${CURSOR_CHAT_DEFAULTS.radiusTight}px`,
              "--chat-radius-roomy": `${CURSOR_CHAT_DEFAULTS.radiusRoomy}px`,
            } as CSSProperties
          }
          role="dialog"
          aria-label="Cursor chat"
        >
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
              aria-label={
                activeThread.status === "done" ||
                activeThread.history.length > 0
                  ? "Close chat (stays pinned on the page)"
                  : "Close chat"
              }
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
            <div className="cursor-chat-response" aria-live="polite">
              {activeThread.status === "loading" && !engineIsReady ? (
                <>
                  <p className="cursor-chat-thinking">
                    {engineProgress <= 0
                      ? "finding the tiny brain…"
                      : `still waking the tiny brain — ${Math.min(
                          99,
                          Math.round(engineProgress * 100),
                        )}%`}
                  </p>
                  <span className="cursor-chat-brainmeter" aria-hidden="true">
                    {Array.from({ length: BRAIN_METER_CELLS }, (_, index) => (
                      <span
                        key={index}
                        data-filled={
                          index < Math.round(engineProgress * BRAIN_METER_CELLS)
                            ? "true"
                            : undefined
                        }
                      />
                    ))}
                  </span>
                </>
              ) : activeThread.status === "loading" ? (
                <p className="cursor-chat-thinking">
                  {THINKING_PHRASES[thinkingPhase]}
                  <span className="cursor-chat-caret" aria-hidden="true" />
                </p>
              ) : (
                <p>
                  {renderResponseText(
                    activeThread.response,
                    activeThread.status === "streaming",
                  )}
                  {activeThread.status === "streaming" ? (
                    <span className="cursor-chat-caret" aria-hidden="true" />
                  ) : null}
                </p>
              )}
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

          {activeThread.status === "draft" &&
          activeThread.suggestedPrompts?.length ? (
            <div className="cursor-chat-suggestions" aria-label="Suggested prompts">
              {activeThread.suggestedPrompts.map((chip, index) => (
                <button
                  key={chip.id}
                  style={
                    {
                      "--chip-delay": `${index * CURSOR_CHAT_DEFAULTS.chipStaggerMs}ms`,
                    } as CSSProperties
                  }
                  type="button"
                  onClick={() => void submitThread(chip.prompt)}
                >
                  {chip.label}
                </button>
              ))}
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
                    ? "Continue the chat"
                    : activeThread.draftPlaceholder ??
                      "or ask anything about her work"
                }
                aria-label="Cursor chat message"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitThread();
                  }
                }}
              />
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
        </section>
      ) : null}
    </>
  );
}
