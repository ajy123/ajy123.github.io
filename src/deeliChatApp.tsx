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
import { DEELI_CASE_CONTEXT } from "./deeliCaseContext";

// Opens the shared essay modal in place of navigating to `/#ai-practice`.
// Delegated on document so it works for any current or future
// a[data-essay-id] link on the page without a per-link listener. An unknown
// id (or a link with no data-essay-id at all) is left alone — the click
// falls through to the anchor's href as a plain navigation.
function DeeliEssayModal() {
  const [activeItem, setActiveItem] = useState<EssayItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[data-essay-id]");
      if (!link) return;

      const essayId = link.dataset.essayId;
      const item = essayId ? essaysById[essayId] : undefined;
      if (!item) return; // unknown id: graceful degradation to the href

      event.preventDefault();
      setActiveItem(item);
      setIsOpen(true);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (!activeItem) return null;

  return (
    <EssayDialog
      item={activeItem}
      open={isOpen}
      onClose={() => setIsOpen(false)}
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
