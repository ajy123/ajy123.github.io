# Contextual ask pin: press sends the question

Date: 2026-08-04
Branch: `ask-pin-sends-question`

## Problem

The floating contextual ask pin reads as an imperative ("Ask how the search
redesign shipped") but pressing `/` only opens the chat panel with three
suggested chips. On the Deeli work card those chips are:

- did queries per active day rise 220% after launch?
- did 70% of queries become real questions instead of keywords?
- why make it ask a question back before researching?

None of them is the question the pin named. The pin makes a promise the panel
does not keep: the reader hovers, reads a specific question, presses, and the
question disappears, replaced by three different ones.

A second, smaller gap: nothing visible teaches the `/` key. The instruction
"Press slash to ask." exists at `src/main.tsx:266` (`askActionSuffix`) but only
inside `aria-label`, so screen-reader users hear it and sighted users never see
it. The rail ask card (`src/main.tsx:509`) teaches the key visually, but it sits
in the left rail, far from where pins appear, and is hidden on touch.

## Approach

Make the pin do what it says. Pressing `/` or clicking the pin sends the pin's
own copy as the question immediately. The pin's copy becomes the literal
question, so there is exactly one string per zone and it cannot drift from what
gets sent.

Rejected alternatives:

- **Separate `askQuestion` field.** Pin keeps its imperative copy, a second
  per-zone string is what gets sent. Two strings per zone to keep in sync,
  which reintroduces a quieter version of the same drift.
- **Send the first chip.** No new copy to author, but chips run 45 to 62
  characters and are written as page-checks, so the pin would still name one
  thing and send another.
- **Prefill without sending.** Panel opens with the question typed in the
  composer, Enter sends. Keeps the reader's agency, but is no longer literally
  "press equals ask". Decided against: the value of this change is that the
  grammar becomes one thing.

## Decisions

1. **Press always sends.** No escape hatch over a zone. A reader who wants a
   blank composer moves off the zone and presses `/` on empty page, which
   `src/main.tsx:1042` already handles. One key, one meaning.
2. **Pin copy is the question.** Sent verbatim via `submitThread`.
3. **Action pins are untouched.** `kind="action"` pins ("Read", "See it live")
   still navigate. Only `kind="project"` / `"essay"` / `"profile"` pins ask.
4. **Touch is unchanged.** Pins are hidden at or below 860px, so tap-to-ask
   (`handleAskableTap`) keeps opening the panel with chips. Nothing was
   promised on touch, so nothing changes.
5. **The brand card loses its ask zone entirely.** `askHint`,
   `askPromptChips`, and `askFollowUpPromptChips` come off the Brand Identity
   item. Only its `DEELI.AI` action pin remains.
6. **No new teaching affordance in this round.** The pin is a `<button>`, so a
   reader who does not know the key can click it, and clicking now sends too.
   Auto-send makes the key less load-bearing, not more. Revisit only if it
   still feels undiscovered in use.

## Copy

Every string is under the 36-character cap, above which
`.contextual-ask-copy` (now `white-space: nowrap` with a 280px max-width)
clips silently.

| Zone | Was | Becomes |
| --- | --- | --- |
| Deeli work card | Ask how the search redesign shipped | How does she design what AI says? |
| Brand Identity card | Ask what shipped for Computex | *(zone removed)* |
| Swiftly work card | Ask about the Swiftly work | What was the Swiftly work? |
| NYU work card | Ask about the NYU work | What was the NYU work? |
| Rail profile | Ask about Joanna's fit | What kind of role fits Joanna? |
| Essay: evals | Ask why evals became the spec | Why did evals become the spec? |
| Essay: agents | Ask how agents earned design time | How did agents earn design time? |
| Essay: personas | Ask why personas regenerate weekly | Why regenerate personas weekly? |

The Deeli question moved from process ("how it shipped") to model-behavior
design at Joanna's direction: it is more specific to product design and to how
she works with the model, and it is the question a recruiter reads as AI
fluency.

## Context addition

The Deeli question is not answerable from `src/siteContext.ts` today. That file
carries outcomes (queries per active day rose 220%, 70% arrived as real
questions) but nothing about how the assistant's replies were shaped, and
`DEELI_CASE_CONTEXT` only loads on `/deeli/`.

Add this line, authored by Joanna, to `SITE_CONTEXT.facts`:

> On Deeli's research assistant, I designed what the AI says and not just the
> UX and UI around it. I created response patterns the model could adapt to new
> situations, then tested its answers against expected outputs before shipping.
> That process taught me to treat model behavior as part of the product
> experience.

## Implementation

**Event layer.** `src/chatEvents.ts` gains an optional `autoAsk?: string` on
`CursorChatRequestOpenDetail`. Absent means today's behavior.

**Sender.** `requestChatForHint` in `src/components/ContextualAskHint.tsx:381`
passes `autoAsk: current.hint` for non-action kinds.

**Receiver.** `openComposer` in `src/CursorChat.tsx:750` creates the thread as
it does now. It must not call `submitThread` directly: `openComposer` lives
inside an effect, while `submitThread` is declared later in the component body
(`src/CursorChat.tsx:1159`), so a direct call would capture that effect's
first-render closure and send with stale state.

Instead `openComposer` stores the string in a `pendingAutoAskRef`, and a
separate effect keyed on the active thread drains it exactly once: read the
ref, clear it, then `void submitThread(question)`. Clearing before submitting
matters so a re-render cannot fire the same question twice. This runs after
`activeIdRef` and `setThreads` are set, so the thread the chips path expects
already exists.

**Copy and zones.** `src/main.tsx` work items (`askHint` at lines 74, 111, 145,
172), the rail region (line 471), and `src/essays/index.tsx` (lines 28, 79,
146). The brand item at line 111 loses its ask fields.

**Accessibility.** Two labels currently describe opening, not asking, and both
need to match the new behavior:

- `src/components/ContextualAskHint.tsx:597` — `Open chat suggestions: ${copy}`
- `src/main.tsx:329` — `${askHint}. ${askActionSuffix()}`

`askActionSuffix` ("Press slash to ask." / "Tap to ask.") stays accurate for
the pin and stays accurate for touch, which still opens chips.

## Verification

1. `tsc --noEmit` clean.
2. Live browser: hover each zone, press `/`, confirm the question appears as
   the reader's message and the answer streams. Confirm chips arrive as
   follow-ups afterwards.
3. Confirm clicking the pin does the same thing as pressing `/`.
4. Confirm action pins still navigate and do not send.
5. Confirm the brand card shows no ask pin and that pressing `/` near it still
   opens a working panel via page-default resolution.
6. Answerability pass: send all seven questions to the live worker
   (`https://worker-portfolio.lty207.workers.dev/`) with the exact context the
   app attaches, read the answers, and revise any question whose answer hedges.
   This is the check that matters most: with no confirmation step, a question
   that produces a weak answer is now shipped directly to the reader.

## Known limitation

Any future hint over roughly 36 characters clips silently rather than wrapping,
a consequence of the `nowrap` plus `max-width` pairing shipped in PR #65. All
current strings fit. No guard is added here.
