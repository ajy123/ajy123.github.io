// One registry mapping a project key to that project's grounding digest, so a
// chat opened from a work card can be told about the project the card is for.
//
// Why this exists: the case digests used to load only on their own case-study
// page, injected as CursorChat's extraContext prop by deeliChatApp /
// swiftlyChatApp / nyuChatApp. But the homepage work cards carry chips that ask
// about project detail — the eval miss, the re-ask rate, the colour-legend
// decision, the floating action button — and on the homepage the model was
// given SITE_CONTEXT alone. Eight chips invited a question the loaded context
// could not answer, so the honest reply was "I don't know" and the dishonest
// one was invention. Worse for the two Deeli chips: the guardrails that keep
// those answers safe ("the page gives the pattern, never the case", "no feature
// is committed") live in the digest too, so the risky question shipped without
// its rail.
//
// The alternative was to copy the facts into siteContext.ts, which would have
// meant two wordings of the same claim drifting apart and ~1.2k more characters
// on every request from every page. A card names its project instead, and the
// thread it opens carries that project's digest for its whole life.
//
// Cost: all three digests are in every page bundle now (~12k of string). They
// are only ever SENT one at a time — see the caseKey resolution in
// CursorChat.submitThread, and the request budget math in recentHistory.
import { DEELI_CASE_CONTEXT } from "./deeliCaseContext";
import { NYU_CASE_CONTEXT } from "./nyuCaseContext";
import { SWIFTLY_CASE_CONTEXT } from "./swiftlyCaseContext";
import type { CaseContextKey } from "./chatEvents";

export const CASE_CONTEXTS: Record<CaseContextKey, string> = {
  deeli: DEELI_CASE_CONTEXT,
  swiftly: SWIFTLY_CASE_CONTEXT,
  nyu: NYU_CASE_CONTEXT,
};

// Narrow an untrusted string (a data-ask-case attribute, an event detail) to a
// key the registry actually has. Anything else resolves to no case context at
// all, which is the old behaviour rather than a broken request.
export function toCaseContextKey(
  value: string | undefined | null,
): CaseContextKey | undefined {
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so "constructor"
  // and "__proto__" would pass and resolve to Object internals, which then
  // stringify into the system prompt as native-code text.
  return value && Object.prototype.hasOwnProperty.call(CASE_CONTEXTS, value)
    ? (value as CaseContextKey)
    : undefined;
}
