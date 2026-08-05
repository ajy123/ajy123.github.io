export const CURSOR_CHAT_REQUEST_OPEN_EVENT = "cursor-chat:request-open";
export const CURSOR_CHAT_OPENED_EVENT = "cursor-chat:opened";

export type SuggestedPrompt = {
  id: string;
  label: string;
  prompt: string;
};

export type CursorChatZoneContext = {
  hint: string;
  kind: string;
  contextText?: string;
};

// Which project's grounding digest a thread should carry. The union lives here
// rather than in caseContexts.ts so the surfaces that only name a key (work
// cards, the ask pin, the open event) don't pull three case digests into their
// bundle to do it. The key→digest map is in src/caseContexts.ts.
export type CaseContextKey = "deeli" | "swiftly" | "nyu";

export type CursorChatRequestOpenDetail = {
  clientX?: number;
  clientY?: number;
  suggestedPrompts?: SuggestedPrompt[];
  followUpPrompts?: SuggestedPrompt[];
  zoneContext?: CursorChatZoneContext;
  // The project this chat is about, when the surface that opened it knows.
  // Work cards and case-study ask zones set it; a "/" press or a text selection
  // does not, and those threads keep whatever context the page itself passes.
  caseKey?: CaseContextKey;
  // Touch entry points (FAB) ask the composer to open bottom-docked rather
  // than anchored at a point. Omitted = let the composer decide by viewport.
  docked?: boolean;
  // When set, the composer opens and immediately sends this string as the
  // reader's question. The contextual ask pin uses it so that pressing "/"
  // asks the exact question the pin displayed, rather than opening a panel of
  // chips that never included it. Absent means today's open-only behavior.
  autoAsk?: string;
};

export function requestCursorChatOpen(detail: CursorChatRequestOpenDetail = {}) {
  window.dispatchEvent(
    new CustomEvent<CursorChatRequestOpenDetail>(
      CURSOR_CHAT_REQUEST_OPEN_EVENT,
      { detail },
    ),
  );
}

// Shared coarse-pointer probe for the touch-entry surfaces (tap-to-ask regions,
// selection pill, docked composer). Static at call time — good enough; we do
// not re-render on device rotation.
export function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

// Turn a list of prompt-chip strings into SuggestedPrompt records. Mirrors the
// id/label/prompt shape ContextualAskHint builds from data-ask-prompts so tap
// and hover entry points produce identical chips.
export function toSuggestedPrompts(chips: string[]): SuggestedPrompt[] {
  return chips
    .map((chip) => chip.trim())
    .filter(Boolean)
    .map((prompt, index) => ({
      id: `${
        prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
        "prompt"
      }-${index}`,
      label: prompt,
      prompt,
    }));
}
