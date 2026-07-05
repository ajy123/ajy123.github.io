import { useEffect, useRef, useState } from "react";
import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import {
  isAbortError,
  isWebGPUAvailable,
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

export function CursorChat({ suspended = false }: { suspended?: boolean }) {
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
          suggestedPrompts,
          zoneContext,
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

  const closeActive = () => {
    const id = activeIdRef.current;
    if (!id) return;

    abortRef.current?.abort();
    abortRef.current = null;
    setThreads((current) => current.filter((thread) => thread.id !== id));
    activeIdRef.current = null;
    setActiveId(null);
    setDraft("");
    previousFocusRef.current?.focus();
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

  const activePosition = activeThread
    ? placeComposer(activeThread.pageX, activeThread.pageY)
    : null;

  void tick;

  return (
    <>
      {threads
        .filter((thread) => thread.isPinned)
        .map((thread) => {
          const position = placePin(thread.pageX, thread.pageY);
          return (
            <button
              className="cursor-chat-pin"
              key={thread.id}
              style={{ left: position.left, top: position.top }}
              type="button"
              aria-label="Open cursor chat thread"
              onClick={() => reopenThread(thread.id)}
            >
              <span />
            </button>
          );
        })}

      {activeThread && activePosition ? (
        <section
          className={`cursor-chat cursor-chat-${activeThread.status}`}
          style={{ left: activePosition.left, top: activePosition.top }}
          role="dialog"
          aria-label="Cursor chat"
        >
          <div className="cursor-chat-grip" aria-hidden="true" />

          {activeThread.prompt ? (
            <div className="cursor-chat-message">
              <p>{activeThread.prompt}</p>
            </div>
          ) : null}

          {activeThread.response ||
          activeThread.status === "loading" ? (
            <div className="cursor-chat-response" aria-live="polite">
              {activeThread.status === "loading" ? (
                <p>Thinking...</p>
              ) : (
                <p>{activeThread.response}</p>
              )}
            </div>
          ) : null}

          {activeThread.status === "draft" &&
          activeThread.suggestedPrompts?.length ? (
            <div className="cursor-chat-suggestions" aria-label="Suggested prompts">
              {activeThread.suggestedPrompts.map((chip) => (
                <button
                  key={chip.id}
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
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              maxLength={2000}
              placeholder={
                activeThread.status === "done"
                  ? "Continue the chat"
                  : activeThread.zoneContext?.hint ?? "Ask about this spot"
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
          ) : null}

          <div className="cursor-chat-actions">
            <button type="button" onClick={closeActive}>
              Close
            </button>
            {activeThread.status === "error" ? (
              <button type="button" onClick={retryActive}>
                Retry
              </button>
            ) : null}
            {activeThread.status === "draft" ? (
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={() => void submitThread()}
              >
                Send
              </button>
            ) : null}
            {activeThread.status === "done" && draft.trim() ? (
              <button type="button" onClick={() => void submitThread()}>
                Send
              </button>
            ) : null}
            {activeThread.status === "done" ? (
              <button type="button" onClick={collapseActive}>
                Pin
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
