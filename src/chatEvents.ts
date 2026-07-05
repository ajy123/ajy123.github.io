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
};

export type CursorChatRequestOpenDetail = {
  clientX?: number;
  clientY?: number;
  suggestedPrompts?: SuggestedPrompt[];
  zoneContext?: CursorChatZoneContext;
};

export function requestCursorChatOpen(detail: CursorChatRequestOpenDetail = {}) {
  window.dispatchEvent(
    new CustomEvent<CursorChatRequestOpenDetail>(
      CURSOR_CHAT_REQUEST_OPEN_EVENT,
      { detail },
    ),
  );
}
