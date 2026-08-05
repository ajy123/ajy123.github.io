// Shared shape for work-card and essay-card data. Moved out of main.tsx so
// src/essays/index.tsx and src/components/EssayDialog.tsx can depend on the
// types without importing the whole landing app.
import type { ComponentType, ReactNode } from "react";
import type {
  AskableKind,
  AskAnchorPreference,
} from "../components/ContextualAskHint";
import type { CaseContextKey } from "../chatEvents";

export type WorkItem = {
  eyebrow: string;
  title: string;
  role: string;
  year: string;
  status?: string;
  summary?: string;
  liveHref?: string;
  /** Verb label for the cursor pill over media; defaults to "See it live". */
  linkLabel?: string;
  /** Noun label for the card's flag link; defaults to "Live site". */
  flagLabel?: string;
  /** Omitted on cards that carry no ask zone (the reader gets the page-default
   * chips there instead). WorkCard renders a plain wrapper when this is unset. */
  askHint?: string;
  askKind?: AskableKind;
  askAnchorPreference?: AskAnchorPreference;
  askPromptChips?: string[];
  askFollowUpPromptChips?: string[];
  /** Which project's grounding digest a chat opened from this card should
   * carry. Set it on any card whose chips ask about project detail, or those
   * chips get answered from SITE_CONTEXT alone and come back "I don't know".
   * See src/caseContexts.ts. */
  askCaseKey?: CaseContextKey;
  media?: {
    type: "video";
    src: string;
    mimeType: string;
    poster?: string;
  };
  /** Coded line-art thumbnail, rendered when there is no video media.
   * Mirrors EssayItem.thumbnail so work cards can show a designed surface
   * instead of a blank placeholder. */
  thumbnail?: ComponentType;
};

export type EssaySection = {
  heading: string;
  body: string[];
  visual?: ReactNode;
  visualCaption?: string;
};

export type EssayItem = WorkItem & {
  id: string;
  dek: string;
  sections: EssaySection[];
  thumbnail: ComponentType<{ interactive?: boolean; active?: boolean }>;
};
