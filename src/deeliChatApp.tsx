// Deeli case-study chat mount. Loaded lazily by deeliChat.tsx (idle-time
// dynamic import) so this module's cost — React, CursorChat, the case-study
// digest — never sits on the page's initial paint path. Deliberately does not
// reuse main.tsx's <App>: the landing tree owns the intro sequencer, the logo,
// the rail, and a dozen other things this page doesn't have. This is a
// minimal parallel root carrying only the three chat surfaces, wired to the
// same components the landing page uses.
import { createRoot } from "react-dom/client";
import "./chat-ui.css";
import { CursorChat } from "./CursorChat";
import { ContextualAskHint } from "./components/ContextualAskHint";
import { SelectionAskPill } from "./components/SelectionAskPill";
import { DEELI_CASE_CONTEXT } from "./deeliCaseContext";

const root = document.createElement("div");
root.id = "deeli-chat-root";
document.body.appendChild(root);

createRoot(root).render(
  <>
    <ContextualAskHint />
    <SelectionAskPill />
    <CursorChat extraContext={DEELI_CASE_CONTEXT} />
  </>,
);
