// Deeli case-study chat mount. Loaded lazily by deeliChat.tsx (idle-time
// dynamic import) so this module's cost — React, CursorChat, the case-study
// digest — never sits on the page's initial paint path. Deliberately does not
// reuse main.tsx's <App>: the landing tree owns the intro sequencer, the logo,
// the rail, and a dozen other things this page doesn't have. This is a
// minimal parallel root carrying only the three chat surfaces, wired to the
// same components the landing page uses.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./chat-ui.css";
import "./essay-dialog.css";
import { CursorChat } from "./CursorChat";
import { ContextualAskHint } from "./components/ContextualAskHint";
import { SelectionAskPill } from "./components/SelectionAskPill";
import { EssayDialog } from "./components/EssayDialog";
import { essaysById } from "./essays";
import type { EssayItem } from "./essays/types";
import { useEssayHashRoute } from "./essays/useEssayHashRoute";
import { DEELI_CASE_CONTEXT } from "./deeliCaseContext";

// Opens the shared essay modal in place of navigating to `/#ai-practice`.
// Delegated on document so it works for any current or future
// a[data-essay-id] link on the page without a per-link listener. An unknown
// id (or a link with no data-essay-id at all) is left alone — the click
// falls through to the anchor's href as a plain navigation.
function DeeliEssayModal() {
  const { essayId, openEssay, closeEssay } = useEssayHashRoute();
  const item = essayId ? essaysById[essayId] : undefined;
  // The hash goes empty the instant we close, but AnimatePresence still needs
  // an item to render the exit morph against — so hold the last one open.
  const [renderedItem, setRenderedItem] = useState<EssayItem | null>(null);

  useEffect(() => {
    if (item) setRenderedItem(item);
  }, [item]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[data-essay-id]");
      if (!link) return;

      const clickedId = link.dataset.essayId;
      if (!clickedId || !essaysById[clickedId]) return; // unknown id: fall through to the href

      event.preventDefault();
      openEssay(clickedId);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openEssay]);

  if (!renderedItem) return null;

  return (
    <EssayDialog
      item={renderedItem}
      open={Boolean(item)}
      onClose={closeEssay}
    />
  );
}

const root = document.createElement("div");
root.id = "deeli-chat-root";
document.body.appendChild(root);

createRoot(root).render(
  <>
    <ContextualAskHint />
    <SelectionAskPill />
    <CursorChat extraContext={DEELI_CASE_CONTEXT} />
    <DeeliEssayModal />
  </>,
);
