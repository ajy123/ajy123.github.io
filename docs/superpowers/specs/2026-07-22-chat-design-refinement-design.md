# Chat design refinement — design

Date: 2026-07-22
Branch: `chat-design-refinement`
Status: frozen spec, pre-implementation

## Problem

Three complaints, one root.

1. **The hiring/exploring toggle should go.** It renders as `here for  hiring · exploring  ×`
   (`src/CursorChat.tsx:1546-1577`, styled `src/chat-ui.css:428-523`).
2. **Weird spacing when `/` opens the chat.**
3. **Follow-up questions ignore where the reader is** — the same landing-page questions
   appear on the Deeli case study.

### Measured diagnosis

Taken from a live render at `localhost:8001`, 1417×840, panel open via `/`:

| Element | Measurement | Reading |
|---|---|---|
| `.cursor-chat` | height 302px, padding 16px | — |
| `.cursor-chat-topbar` | **height 42px, exactly one child**: a 22px `.cursor-chat-iconbtn` close button | 14% of the panel is a band with no content in it |
| `.cursor-chat-roleask` | top 158.5, its own text `×` at top 165, right 1077 | a second dismiss glyph 15px under the topbar's SVG `×`, same right edge |
| block gaps | topbar→roleask 8px, roleask→suggestions 8px, suggestions→composer 8px | vertical rhythm is already correct |

So the spacing complaint is **not** a scale problem. It is one empty element plus a duplicated
affordance. Deleting the role-ask row (complaint 1) removes the duplicate `×` and leaves the
empty 42px band *more* exposed. Complaints 1 and 2 are one change.

### Why the follow-ups are wrong

`AUDIENCE_PROMPTS` (`CursorChat.tsx:122-155`) is the only chip source for the `/` key, the FAB,
the rail button, and the intro dismiss. It has no page input. There is **no `location.pathname`
read anywhere in the repo** (only `location.search`, at `CursorChat.tsx:290`, `main.tsx:865`,
`ScrollIntro.tsx:103`).

Consequence: pressing `/` on `/deeli/` offers *"what did she build for Deeli?"* and *"does the
page say the work opened enterprise pilots across semiconductors, aerospace, and industrial
research?"* — questions phrased about the landing page, shown on the case study.

Second, narrower bug: `/deeli/`'s 8 zones author `data-ask-prompts` but never
`data-ask-follow-up-prompts`, so `getFollowUpPrompts` returns `[]`
(`src/components/ContextualAskHint.tsx:137-146`) and `buildPromptPool` falls back entirely to
the landing-page audience chips.

### What already works (steelman before changing)

The zone system was built content-first and should be extended, not replaced. Home work items
already author both chip sets per item (`main.tsx:76-85, 103-113`), emitted as
`data-ask-prompts` / `data-ask-follow-up-prompts` (`main.tsx:258, 634`). The model prompt is
*already* page-aware: `context.url`, `context.title` (`CursorChat.tsx:456-457`), `nearbyText`
from the DOM under the cursor (`:460`), and `extraContext = DEELI_CASE_CONTEXT` on `/deeli/`.

Only the **suggested questions** are page-blind. That is the actual gap.

## The decision that matters

Not "how do I close the gap" but **what the top of the panel is for**. It is currently chrome
with no figure.

- **Option A** — delete the topbar; absolutely-position `×` over the first row. Panel drops to
  ~260px. Cheapest.
- **Option B (chosen)** — give the band a figure: a context label, with `×` beside it.

B chosen. Rationale: context-awareness that never surfaces is indistinguishable from the model
guessing. The label is the receipt — it makes "pressing `/` *here* differs from pressing `/`
*there*" legible in one glance, and `openComposer` already computes the anchor element and
nearby text at `:900-902`. B shows what it captured. Principle: content is the figure, chrome is
the ground; an empty ground band is the defect, and A hides it where B fixes it.

### Label behaviour

Captured **at open, then frozen for the life of the thread**. Not live.

Live would re-target to the panel itself the moment the pointer moves to the textarea, and after
the first question the thread's context is already baked into the system prompt — a drifting
label would misreport what the model actually read.

| Open path | Label source |
|---|---|
| hover a hint badge, then `/` or tap | that zone's `data-ask-hint` |
| `/` with pointer over a section | nearest section to `anchorElement` |
| `/` keyboard-only (pointer never moved) | pointer defaults to viewport centre (`CursorChat.tsx:681`) → section mid-screen |
| FAB / rail button | the click point's section, in practice the page default |

Close and reopen elsewhere → new thread, new label. Accepted consequence: on a long section the
label stays put across several screens of scroll. Sections are the authoring unit, so the label
is honest about its granularity.

**Wording — corrected against ground truth after the spec was first drafted.**

The label is not new. `getZoneTagLabel` (`CursorChat.tsx:229-239`) already emits
`ASKING ABOUT: THIS PROJECT`, rendered by `.cursor-chat-zonetag`
(`CursorChat.tsx:1504-1508`, styled `chat-ui.css:270-286`): 10px mono, uppercase, muted,
`nowrap` + `text-overflow: ellipsis`, sharing a flex row with the pin/close buttons inside a
360px panel. Its generic buckets are short on purpose.

An earlier draft of this spec proposed lowercase caption labels (`about the Deeli case study`).
That is **rejected** — it breaks the established treatment and overflows the row. Budget is
~34 characters including the prefix.

| Context | Label |
|---|---|
| zone kind `project` | `ASKING ABOUT: THIS PROJECT` *(existing)* |
| zone kind `essay`, or an essay modal is open | `ASKING ABOUT: THIS ESSAY` *(existing)* |
| zone kind `profile` | `ASKING ABOUT: JOANNA` *(existing)* |
| `/deeli*`, no zone resolved | `ASKING ABOUT: DEELI CASE STUDY` *(new)* |
| home, nothing resolved | `ASKING ABOUT: JOANNA'S WORK` *(new)* |

Home work item titles are not interpolated — *"From keyword search to a research chat"* far
exceeds the budget, so resolved work items use the `THIS PROJECT` bucket.

Consequence: `getZoneTagLabel` becomes redundant and is deleted, its job absorbed by
`resolveAskContext`.

## Chip resolution chain

Replaces `AUDIENCE_PROMPTS` as the chip **source**. First match wins:

```
1. explicit zone prompts       data-ask-prompts / -follow-up-prompts   (hover or tap — exists today)
2. nearest section in viewport data-ask-prompts on the nearest [data-ask-hint] container (NEW for "/")
3. page default                keyed by pathname, or by open essay      (NEW)
```

Essay is a modal owning a URL (`useEssayHashRoute`, `main.tsx:582`, `deeliChatApp.tsx:27`), so
when an essay is open it **outranks pathname**.

Nearest-section resolution runs **once, at open**, inside `openComposer`. No persistent
IntersectionObserver: `openComposer` already has `anchorElement` from
`document.elementFromPoint` (`:900`), so resolution is
`anchorElement.closest('[data-ask-hint]')`, else the `[data-ask-hint]` whose rect is nearest the
viewport centre and actually intersects the viewport, else the page default.

### Silent role

Per the chosen option "remove UI, keep silent role":

- **Kept**: `getAudienceRole()` (`:289-304`), the `?audience=` query param, the sessionStorage
  role value, `trackAudienceRole`, and the per-role system-prompt guidance (`:535-540`).
- **Removed**: the visible row, the `-asked` session key, `showRoleAsk`, `dismissRoleAsk`.
- **Chips**: role swaps the **home** default set only. `/deeli/` and essays get one set each — a
  recruiter variant there is speculation with no link pointing at it (YAGNI). Recruiter-targeted
  links land on home.

## Tasks

Ordered by dependency. T3 must be frozen before T4/T5 run in parallel.

| # | Task | Files |
|---|---|---|
| T1 | Delete role-ask UI: the row, the CSS block, `showRoleAsk`, `dismissRoleAsk`, the `-asked` session key. Keep everything listed under "Silent role → Kept". | `CursorChat.tsx:1546-1577, 903-909, 1310-1316`; `chat-ui.css:428-523, 1224-1226` |
| T2 | Make the topbar's context tag **always resolve**. The tag element already exists (`.cursor-chat-zonetag`, `CursorChat.tsx:1504-1508`) — it renders nothing when there is no zone, which is exactly the empty band. Feed it from T3 and delete `getZoneTagLabel`. No new element is added. | `CursorChat.tsx:229-239, 764, 1504-1508`; `chat-ui.css:247-286` |
| T3 | `src/askContext.ts` — resolve zone → nearest section → page/essay. Returns `{ label, chips, followUps, placeholder }`. | new `src/askContext.ts` |
| T4 | Author the missing `data-ask-follow-up-prompts` on `/deeli/`'s 8 zones. | `deeli/index.html` |
| T5 | Page-default sets (home / deeli / essay) + label map. | `src/askContext.ts` |
| T6 | Rewire `pickAudienceSuggestions`, `buildPromptPool`, `pickDraftPlaceholder` to T3. | `CursorChat.tsx:170-227` |
| T7 | Screenshot gate, then fresh-reviewer verification. | — |

## Success criteria

Every item must be checkable by grep or by screenshot. Visual criteria require an actual
rendered capture — a passing diff does not satisfy them.

1. No `.cursor-chat-roleask` in the DOM on any entry path, on either page.
2. `?audience=recruiter` still alters the system prompt — grep-checkable that the branch at
   `CursorChat.tsx:535-540` survives.
3. Panel contains **zero empty layout rows**: every block has a figure. Screenshot at 1440 and 375.
4. Exactly **one** dismiss affordance visible in the panel.
5. `/` on `/deeli/` shows three questions naming case-study content, and **none** naming the
   landing page.
6. `/` partway down the home page shows chips for the section in view, not the top of the page.
7. With an essay open, chips are about that essay.
8. Follow-ups after an answer never fall back to landing chips on `/deeli/`.
9. Token gate: no new colour/radius/duration literals outside `src/tokens.css` and
   `deeli/index.html:23-42`. **Note: this repo has no `DESIGN.md` and no `design.json`** despite
   references in `chat-ui.css:189` and `deeliCaseContext.ts:30` (those point at the Deeli
   product's spec, not a file here). Those two files are the token authority.
10. Reduced-motion path still honoured after the `chat-ui.css:1224-1226` block is edited.

## Out of scope

- Model-generated follow-ups (rejected: adds a round-trip, risks off-voice questions).
- Re-authoring the home page's existing per-item chip copy.
- The separate finding that pressing `/` during the intro dismisses the intro but does **not**
  open the composer. Real, reproduced, but a different defect — logged, not fixed here.
