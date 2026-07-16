import { useEffect, useState } from "react";
import {
  CURSOR_CHAT_OPENED_EVENT,
  requestCursorChatOpen,
} from "../chatEvents";

// After a text selection, a small pill floats under the selection offering to
// ask about it — on desktop it doubles as the discoverable affordance for the
// "/" key; on touch it is the only entry for select-then-ask.

const DEBOUNCE_MS = 350;
const EDGE = 14;
// Conservative rendered bounds for viewport clamping. The target is at least
// 44px tall and its mono label can be wider than the text alone suggests.
const PILL_WIDTH_EST = 168;
const PILL_HEIGHT = 44;
const PILL_GAP = 8;

type PillPos = { left: number; top: number };

function computeFromSelection(): PillPos | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const text = selection.toString().trim();
  if (!text) return null;

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const centerX = rect.left + rect.width / 2;
  const half = PILL_WIDTH_EST / 2;
  const left = Math.min(
    Math.max(centerX, EDGE + half),
    window.innerWidth - EDGE - half,
  );
  const top = Math.min(
    rect.bottom + PILL_GAP,
    window.innerHeight - EDGE - PILL_HEIGHT,
  );

  return { left, top };
}

export function SelectionAskPill({
  suspended = false,
}: {
  suspended?: boolean;
}) {
  const [pos, setPos] = useState<PillPos | null>(null);

  useEffect(() => {
    if (suspended) {
      setPos(null);
      return;
    }

    let timer: number | null = null;

    const evaluate = () => setPos(computeFromSelection());

    const onSelectionChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(evaluate, DEBOUNCE_MS);
    };

    const hide = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      setPos(null);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
    window.addEventListener(CURSOR_CHAT_OPENED_EVENT, hide);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", hide);
      window.removeEventListener("resize", hide);
      window.removeEventListener(CURSOR_CHAT_OPENED_EVENT, hide);
    };
  }, [suspended]);

  if (!pos) return null;

  return (
    <button
      className="selection-ask-pill"
      type="button"
      aria-label="Ask about the selected text"
      style={{ left: pos.left, top: pos.top }}
      // preventDefault keeps the live selection from collapsing on tap, so the
      // composer's openComposer can read it as the anchor + selected text.
      onPointerDown={(event) => {
        event.preventDefault();
        requestCursorChatOpen();
      }}
    >
      <span className="selection-ask-pill-key" aria-hidden="true">
        /
      </span>
      <span className="selection-ask-pill-label">Ask about this</span>
    </button>
  );
}
