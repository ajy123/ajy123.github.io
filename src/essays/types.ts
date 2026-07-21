// Shared shape for work-card and essay-card data. Moved out of main.tsx so
// src/essays/index.tsx and src/components/EssayDialog.tsx can depend on the
// types without importing the whole landing app.
import type { ComponentType, ReactNode } from "react";
import type {
  AskableKind,
  AskAnchorPreference,
} from "../components/ContextualAskHint";

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
  askHint: string;
  askKind: AskableKind;
  askAnchorPreference?: AskAnchorPreference;
  askPromptChips: string[];
  askFollowUpPromptChips: string[];
  media?: {
    type: "video";
    src: string;
    mimeType: string;
    poster?: string;
  };
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
  takeaway: string;
  thumbnail: ComponentType<{ interactive?: boolean; active?: boolean }>;
};
