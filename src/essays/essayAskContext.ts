// The whole essay flattened into the grounding string an ask surface ships as
// data-ask-context. Its own module (types only) so the essay dialog can read it
// without importing src/essays/index.tsx, which pulls in every essay's copy and
// its visual components.
//
// Extracted because two surfaces need the identical string and used to build it
// in two places: the card in src/main.tsx, and now the open dialog panel. When
// they drifted the same chip answered correctly from the card and fell back to
// SITE_CONTEXT inside the dialog.
import type { EssayItem } from "./types";

export function essayAskContext(item: EssayItem): string {
  return [
    item.title,
    item.role,
    item.year,
    item.summary,
    item.dek,
    ...item.sections.flatMap((section) => [section.heading, ...section.body]),
  ].join(" ");
}
