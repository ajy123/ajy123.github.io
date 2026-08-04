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

1. **Press always sends, in every state.** No escape hatch over a zone, and no
   silent discard when a chat panel is already open. Earlier, `openComposer`
   early-returned in that case, so a press over a zone while a panel was open
   did nothing and the reader saw no response. Now a press over a zone always
   asks that zone's question: if a panel is open, its thread closes and a new
   thread opens anchored at the pressed pin. It must be a new thread rather
   than an appended turn, because a thread freezes its zone context when
   created, so appending would answer the new question using the previous
   section's context. A reader who wants a blank composer moves off the zone
   and presses `/` on empty page, which the `handleKeyDown` window listener in
   `src/CursorChat.tsx` already handles. One key, one meaning.
2. **Pin copy is the question.** Sent verbatim via `submitThread`.
3. **Action pins are untouched.** `kind="action"` pins ("Read", "See it live")
   still navigate. Only `kind="project"` / `"essay"` / `"profile"` pins ask.
4. **Touch is unchanged for every card that keeps a zone.** Pins are hidden at
   or below 860px, so tap-to-ask (`handleAskableTap`) keeps opening the panel
   with that card's own chips. The one card without a zone is different: the
   Brand Identity card (decision 5) loses `askHint`, and `handleAskableTap` is
   wired inside the components that carry a hint, so removing the hint also
   removed that card's touch entry point. That card gets an explicit tap entry
   instead, which opens the composer with page-default context rather than
   borrowing a neighbouring card's chips.
5. **The brand card loses its ask zone entirely.** `askHint`,
   `askPromptChips`, and `askFollowUpPromptChips` come off the Brand Identity
   item. Only its `DEELI.AI` action pin remains.
6. **No new teaching affordance in this round.** The pin is a `<button>`, so a
   reader who does not know the key can click it, and clicking now sends too.
   Auto-send makes the key less load-bearing, not more. Revisit only if it
   still feels undiscovered in use.
7. **Asking from the de-zoned card resolves to the page default, not a
   neighbour.** With no `data-ask-hint`, nearest-section resolution picked the
   adjacent Deeli card, so pressing `/` over Brand Identity opened a panel
   headed "ASKING ABOUT: THIS PROJECT" carrying the Deeli card's chips and
   context. An explicit opt-out marker on the de-zoned wrapper makes
   resolution fall through to the page default instead. An opt-out marker was
   chosen over changing the nearest-section distance logic itself, because
   every other zone depends on that logic and a change there risks all of
   them, not just this one card.
8. **A focus-summoned pin retires when the pointer moves away.** A pin
   summoned by keyboard focus used to stay active indefinitely, so `/` could
   send that zone's question while the pointer was over unrelated content.
   Harmless when a press only opened suggestions; not harmless now that a
   press sends. Keyboard-only readers are unaffected, since no pointermove
   fires for them.

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

The "Essay: evals" row names a zone the landing page does not render: its item
lives in `unlistedEssayItems`, which no card iterates over, so this string is
unreachable as a pin. Its chips stay live through `essaysById` for readers who
land on the `#essay/eval-is-the-spec` deep link. Left in the table as a record
of the copy, not a claim that a pin shows it.

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
it does now. It must not call `submitThread` directly, and the reason is a
silent failure rather than a loud one: `submitThread` opens with
`if (!activeThread || leavingIdRef.current) return` (line 1160), and
`activeThread` is derived from render state (line 648,
`threads.find((thread) => thread.id === activeId)`). A synchronous call from
`openComposer` runs before React commits the new thread, so `activeThread` is
null, the function returns, and nothing is sent or logged. The reader would
press and get an empty panel.

Instead `openComposer` stores the string in a `pendingAutoAskRef`, and a
separate effect drains it:

```tsx
const pendingAutoAskRef = useRef<string | null>(null);

// in openComposer, right after setThreads(...):
pendingAutoAskRef.current = autoAsk?.trim() || null;

// component level, below submitThread:
useEffect(() => {
  const pending = pendingAutoAskRef.current;
  if (!pending || !activeThread || activeThread.status !== "draft") return;
  pendingAutoAskRef.current = null;   // clear BEFORE submitting
  void submitThread(pending);
}, [activeThread?.id]);
```

Three details carry the correctness:

- Keyed on `activeThread?.id`, not the thread object, so the effect does not
  re-run on every `draft -> loading -> streaming` transition.
- The ref is cleared before the submit, so a re-render cannot fire the same
  question twice.
- The `status === "draft"` guard stops a pinned or resumed thread being
  hijacked by a stale pending value.

Rejected: holding `submitThread` in a ref and calling it from `openComposer`
behind `requestAnimationFrame`. That only works if the commit happens to land
first, which under React batching is a race that fails the same silent way.

**Analytics.** `submitThread:1166` classifies any `promptOverride` as
`"suggested"`, so pin auto-asks would land in the same bucket as chip clicks.
Since the question this change asks is whether pins convert, that number must
not be blended. Add `"pin"` to `ChatQuerySource` (`src/analytics.ts:63`) and
pass it for auto-asks.

**Copy and zones.** `src/main.tsx` work items (`askHint` at lines 74, 111, 145,
172), the rail region (line 471), and `src/essays/index.tsx` (lines 28, 79,
146). The brand item at line 111 loses its ask fields.

**Accessibility.** Two labels describe opening, not asking, and both ship with
the behavior rather than ahead of it, so they never describe something that
does not happen yet.

- `src/components/ContextualAskHint.tsx:597` — `Open chat suggestions: ${copy}`
  becomes `Ask "${copy}"`. The action-pin branch (`kind === "action"`) keeps
  returning `copy` unchanged.
- `src/main.tsx:329` — `${askHint}. ${askActionSuffix()}` becomes
  `${askHint} ${askActionSuffix()}`. The hints now end in a question mark, so
  the template's own period produced "...what AI says?. Press slash to ask."

`askActionSuffix` (`src/main.tsx:266`) needs its coarse-pointer branch changed
from "Tap to ask." to "Tap for related questions." On touch no pin is shown and
tapping opens chips rather than sending, so "Tap to ask." next to a question
string would recreate, for screen-reader touch users, the exact mismatch this
change removes. The fine-pointer branch ("Press slash to ask.") stays correct.

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

## Post-implementation review

A whole-branch review, run after the change above first shipped, confirmed the
auto-ask mechanism itself sound: no double-send, missed-send, or cross-thread
leak was reproducible. `openComposer` assigns the pending ref unconditionally
on every open that passes its guards, so plain composer opens, the selection
pill, the FAB, and touch taps all clear it rather than inheriting a stale
value.

The four findings above, decisions 1, 4, 7, and 8, were what the review
raised, and all four are fixed on this branch.

One piece of dead copy was removed separately, in the same pass: the pin
question "Why did evals become the spec?" belonged to an essay in
`unlistedEssayItems`, which no card renders, so the string was unreachable.
Its chips remain live through `essaysById` for the `#essay/eval-is-the-spec`
deep link. The note beside the copy table above records this so a future
reader is not misled into thinking every row in that table is a pin someone
can press.

## Known limitation

Any future hint over roughly 36 characters clips silently rather than wrapping,
a consequence of the `nowrap` plus `max-width` pairing shipped in PR #65. All
current strings fit. No guard is added here.
