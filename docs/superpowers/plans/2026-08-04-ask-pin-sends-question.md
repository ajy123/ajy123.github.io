# Contextual Ask Pin Sends Its Question Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing `/` or clicking a contextual ask pin sends the pin's own copy as the question immediately, instead of opening a panel of three chips that never include the question the pin named.

**Architecture:** A new optional `autoAsk` string rides the existing `cursor-chat:request-open` CustomEvent. `ContextualAskHint` sets it to the pin's hint; `CursorChat` stores it in a ref during `openComposer` and drains it from an effect once React has committed the new thread, then submits through the same `submitThread` path the suggestion chips already use. Pin copy is rewritten from imperatives ("Ask how the search redesign shipped") into literal questions ("How does she design what AI says?") so one string per zone cannot drift from what gets sent.

**Tech Stack:** React 19, TypeScript 5.7, Vite 8001 dev server, PostHog analytics.

**Spec:** `docs/superpowers/specs/2026-08-04-ask-pin-sends-question-design.md`

## Global Constraints

- **No unit-test runner exists in this repo.** `package.json` has no `test` script; `playwright` is a devDependency but there is no config and no test files. Do not add a test framework — it is out of scope for this change. Every task below verifies with `npx tsc --noEmit` plus a specific browser observation with an exact expected result.
- **Dev server:** `npm run dev` serves on port **8001** (`--strictPort`). A server is often already running; reuse it rather than starting a second one. Check with `lsof -ti:8001`.
- **The dev dials persist.** `ContextualAskHintDials` saves to `localStorage["joanna-contextual-ask-hint-dials"]`. Stale values silently override `DEFAULT_DIALS` in DEV. Before any browser verification run: `Object.keys(localStorage).filter(k=>k.includes('ask-hint')).forEach(k=>localStorage.removeItem(k))` then reload.
- **The site opens behind a scroll-driven intro loader.** Scroll down roughly 20 wheel ticks until a "Read on" button appears, then click it to reach the Work grid.
- **Pins are desktop-only.** `.contextual-ask-hint` is `display: none` at or below 860px (`src/chat-ui.css:1107`). Verify at 1440x900 or wider.
- **Pin copy hard cap: 36 characters.** `.contextual-ask-copy` is `white-space: nowrap` with a 280px max-width, so longer strings clip silently instead of wrapping. Every string in Task 3 is already under the cap; if you author a new one, measure it.
- **Copy rule: no em dashes** in any user-facing string.
- **Deterministic answers without the worker.** `src/chatApi.ts:51-68` short-circuits streaming in DEV when `window.__cursorChatTestResponse` is a string. Set it in the console (`window.__cursorChatTestResponse = "test answer"`) for any check about *whether a send happened*, so the verification does not depend on model latency or spend a real call. Clear it (`delete window.__cursorChatTestResponse`) for Task 5 and Task 6, which are about the answer content itself.
- Commit after each task. Do not squash tasks together.

---

### Task 1: Auto-ask plumbing (event, analytics, drain effect)

Delivers the whole receiver side: an `autoAsk` on the open event causes the composer to open and immediately send that question. Nothing dispatches `autoAsk` yet, so there is no user-visible change until Task 2.

**Files:**
- Modify: `src/chatEvents.ts:16-25`
- Modify: `src/analytics.ts:63`
- Modify: `src/CursorChat.tsx:750-762` (openComposer signature), `:810-814` (after setThreads), `:868-881` (listener), `:1159-1171` (submitThread signature and source chain), plus a new effect below `submitThread`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CursorChatRequestOpenDetail.autoAsk?: string` — Task 2 sets it. `ChatQuerySource` gains `"pin"`.

- [ ] **Step 1: Add `autoAsk` to the open-event detail**

In `src/chatEvents.ts`, add the field to `CursorChatRequestOpenDetail` (after `docked`):

```ts
  // When set, the composer opens and immediately sends this string as the
  // reader's question. The contextual ask pin uses it so that pressing "/"
  // asks the exact question the pin displayed, rather than opening a panel of
  // chips that never included it. Absent means today's open-only behavior.
  autoAsk?: string;
```

- [ ] **Step 2: Add the `"pin"` analytics source**

In `src/analytics.ts:63`, widen the union:

```ts
export type ChatQuerySource = "typed" | "suggested" | "retry" | "pin";
```

- [ ] **Step 3: Let `submitThread` carry an explicit source**

In `src/CursorChat.tsx:1159`, change the signature and the precedence chain. Current:

```tsx
  const submitThread = async (promptOverride?: string) => {
    if (!activeThread || leavingIdRef.current) return;

    const id = activeThread.id;
    // One precedence chain decides both what is sent and how it's classified,
    // so the analytics label can't drift from the submission logic.
    const [message, querySource]: [string, ChatQuerySource] = promptOverride?.trim()
      ? [promptOverride.trim(), "suggested"]
```

Becomes:

```tsx
  const submitThread = async (
    promptOverride?: string,
    sourceOverride?: ChatQuerySource,
  ) => {
    if (!activeThread || leavingIdRef.current) return;

    const id = activeThread.id;
    // One precedence chain decides both what is sent and how it's classified,
    // so the analytics label can't drift from the submission logic.
    const [message, querySource]: [string, ChatQuerySource] = promptOverride?.trim()
      ? [promptOverride.trim(), sourceOverride ?? "suggested"]
```

Leave the rest of the chain (`draft.trim()`, the error-retry branch) untouched. Chip clicks pass no `sourceOverride`, so they stay `"suggested"`.

- [ ] **Step 4: Accept `autoAsk` in `openComposer` and stash it**

In `src/CursorChat.tsx:750`, add `autoAsk` to both the destructured params and the inline type:

```tsx
    const openComposer = ({
      anchorOverride,
      suggestedPrompts,
      followUpPrompts,
      zoneContext,
      docked,
      autoAsk,
    }: {
      anchorOverride?: { x: number; y: number };
      suggestedPrompts?: SuggestedPrompt[];
      followUpPrompts?: SuggestedPrompt[];
      zoneContext?: CursorChatZoneContext;
      docked?: boolean;
      autoAsk?: string;
    } = {}) => {
```

Then immediately after the `setThreads((current) => [...])` call that ends at line 848, add:

```tsx
      // Drained by the effect below submitThread, not called here: submitThread
      // early-returns on !activeThread, and activeThread is derived from render
      // state, so a call on this tick would silently no-op before React commits
      // the thread just queued above.
      pendingAutoAskRef.current = autoAsk?.trim() || null;
```

- [ ] **Step 5: Declare the ref**

Next to the other refs near the top of the `CursorChat` component (alongside `activeIdRef` / `leavingIdRef`), add:

```tsx
  const pendingAutoAskRef = useRef<string | null>(null);
```

- [ ] **Step 6: Pass `autoAsk` through the event listener**

In `src/CursorChat.tsx:874-880`, add the field to the `openComposer` call:

```tsx
      openComposer({
        anchorOverride: anchor,
        suggestedPrompts: detail?.suggestedPrompts,
        followUpPrompts: detail?.followUpPrompts,
        zoneContext: detail?.zoneContext,
        docked: detail?.docked,
        autoAsk: detail?.autoAsk,
      });
```

- [ ] **Step 7: Add the drain effect**

Directly below the `submitThread` declaration (it must be after it — `submitThread` is a `const`), add:

```tsx
  // Sends the pin's question once the thread it belongs to exists. Keyed on the
  // thread id rather than the thread object so it does not re-run on every
  // draft -> loading -> streaming transition, and the ref is cleared before the
  // await so a re-render cannot fire the same question twice.
  useEffect(() => {
    const pending = pendingAutoAskRef.current;
    if (!pending || !activeThread || activeThread.status !== "draft") return;
    pendingAutoAskRef.current = null;
    void submitThread(pending, "pin");
  }, [activeThread?.id]);
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0, no output. If it reports `useRef`/`useEffect` unused-import errors, add them to the existing `react` import at the top of the file.

- [ ] **Step 9: Verify in the browser**

Free/reuse the dev server (`lsof -ti:8001`; `npm run dev` if nothing is listening). Open `http://localhost:8001/` at 1440x900, clear the dials key, reload, scroll past the loader and click "Read on".

In the devtools console, dispatch the event by hand:

```js
window.dispatchEvent(new CustomEvent("cursor-chat:request-open", {
  detail: { clientX: 700, clientY: 400, autoAsk: "What was the NYU work?" },
}));
```

Expected: the chat panel opens, "What was the NYU work?" appears immediately as the reader's own message, and an answer streams in. Follow-up chips appear under the answer when it completes.

Then dispatch the same event with no `autoAsk`. Expected: panel opens as a draft with suggestion chips and nothing is sent — today's behavior, unregressed.

- [ ] **Step 10: Commit**

```bash
git add src/chatEvents.ts src/analytics.ts src/CursorChat.tsx
git commit -m "Add an autoAsk path that sends a question on composer open"
```

---

### Task 2: The pin sends its question

**Files:**
- Modify: `src/components/ContextualAskHint.tsx:381-394` (`requestChatForHint`), `:596-598` (aria-label)

**Interfaces:**
- Consumes: `CursorChatRequestOpenDetail.autoAsk` from Task 1.
- Produces: pin press now sends. Task 3 rewrites what it sends.

- [ ] **Step 1: Send the hint on press**

In `requestChatForHint` (`src/components/ContextualAskHint.tsx:381`), add `autoAsk` to the `requestCursorChatOpen` call:

```tsx
  const requestChatForHint = (current: ActiveHint, anchor: Point) => {
    writeConverted();
    requestCursorChatOpen({
      clientX: anchor.x,
      clientY: anchor.y,
      suggestedPrompts: current.suggestedPrompts,
      followUpPrompts: current.followUpPrompts,
      // The pin displays a question; pressing it asks that question. The
      // suggested prompts survive as follow-ups under the answer.
      autoAsk: current.hint,
      zoneContext: {
        hint: current.hint,
        kind: current.kind,
        contextText: current.contextText,
      },
    });
  };
```

`openActiveChat` already routes `kind === "action"` to `activateActionZone` and returns before reaching this function, so navigation pins are unaffected. No change needed there.

- [ ] **Step 2: Correct the pin's accessible name**

At `src/components/ContextualAskHint.tsx:596`, the label describes opening a panel. Current:

```tsx
      aria-label={
        active.kind === "action" ? copy : `Open chat suggestions: ${copy}`
      }
```

Becomes:

```tsx
      aria-label={active.kind === "action" ? copy : `Ask "${copy}"`}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Verify in the browser**

Reload, clear dials, pass the loader. Hover the "From search box to research assistant" card title (hover twice at slightly different points to trigger the ~400ms dwell), wait for the pin, then press `/`.

Expected: the panel opens with the pin's own copy as the sent question and an answer streams. The copy is still the old imperative ("Ask how the search redesign shipped") at this point — Task 3 fixes the wording. What matters here is that the string sent is the string the pin showed.

Then click a pin instead of pressing `/`. Expected: identical behavior.

Then hover the video thumbnail on the same card (the orange "Read" pin). Expected: it still navigates to `/deeli/` and sends nothing.

- [ ] **Step 5: Commit**

```bash
git add src/components/ContextualAskHint.tsx
git commit -m "Send the pin's question when the pin is pressed"
```

---

### Task 3: Rewrite pin copy as questions

**Files:**
- Modify: `src/main.tsx:74` (Deeli), `:145` (Swiftly), `:172` (NYU), `:471` (rail), `:266` (`askActionSuffix`), `:329` (aria template)
- Modify: `src/essays/index.tsx:28`, `:79`, `:146`

**Interfaces:**
- Consumes: sending behavior from Task 2.
- Produces: the final sent strings, which Task 6 verifies for answerability.

- [ ] **Step 1: Rewrite the four `main.tsx` hints**

Replace each `askHint` value. The Brand Identity card at line 111 is deliberately skipped — Task 4 removes its zone entirely.

| Line | From | To |
| --- | --- | --- |
| 74 | `"Ask how the search redesign shipped"` | `"How does she design what AI says?"` |
| 145 | `"Ask about the Swiftly work"` | `"What was the Swiftly work?"` |
| 172 | `"Ask about the NYU work"` | `"What was the NYU work?"` |
| 471 | `askHint="Ask about Joanna's fit"` | `askHint="What kind of role fits Joanna?"` |

- [ ] **Step 2: Rewrite the three essay hints**

In `src/essays/index.tsx`:

| Line | From | To |
| --- | --- | --- |
| 28 | `"Ask why evals became the spec"` | `"Why did evals become the spec?"` |
| 79 | `"Ask how agents earned design time"` | `"How did agents earn design time?"` |
| 146 | `"Ask why personas regenerate weekly"` | `"Why regenerate personas weekly?"` |

- [ ] **Step 3: Fix the tap-affordance copy**

`src/main.tsx:265-267` currently reads:

```tsx
function askActionSuffix() {
  return isCoarsePointer() ? "Tap to ask." : "Press slash to ask.";
}
```

Becomes:

```tsx
function askActionSuffix() {
  // On touch no pin is shown and a tap opens suggested questions rather than
  // sending one, so "Tap to ask." next to a question string would promise the
  // same thing the pin used to break.
  return isCoarsePointer() ? "Tap for related questions." : "Press slash to ask.";
}
```

- [ ] **Step 4: Fix the double period in the region label**

`src/main.tsx:329` builds `${askHint}. ${askActionSuffix()}`. The hints now end in `?`, so this renders "...what AI says?. Press slash to ask." Change to:

```tsx
            "aria-label": `${askHint} ${askActionSuffix()}`,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Verify no string clips**

Reload, clear dials, pass the loader, and hover each of the four homepage zones (Deeli card, Swiftly card, NYU card, left rail). For each, confirm visually that the pin renders on one line with no cut-off character.

Then confirm by measurement in the console while a pin is showing:

```js
const c = document.querySelector('.contextual-ask-copy');
({ text: c.textContent, scrollW: c.scrollWidth, clientW: c.clientWidth });
```

Expected: `scrollW === clientW` for each. Note that the surface animates `scale(0.95) -> 1` on entry, so wait about a second after the pin appears before measuring; a rect read mid-animation reads about 5% narrow and looks like a clip that is not there.

- [ ] **Step 7: Commit**

```bash
git add src/main.tsx src/essays/index.tsx
git commit -m "Rewrite ask-pin copy as the questions the pin sends"
```

---

### Task 4: Remove the Brand Identity ask zone

The Brand Identity card keeps only its `DEELI.AI` action link. Pressing `/` near it falls back to page-default resolution.

**Files:**
- Modify: `src/essays/types.ts:22, 25, 26` (make three fields optional)
- Modify: `src/main.tsx:111-123` (delete the brand item's ask fields), `:860-877` (branch `WorkCard`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `WorkItem.askHint`, `.askPromptChips`, `.askFollowUpPromptChips` become optional. `EssayItem` extends `WorkItem` and all three essays still set them, so essays are unaffected.

- [ ] **Step 1: Make the ask fields optional**

In `src/essays/types.ts`, change these three lines inside `WorkItem`:

```ts
  askHint: string;
  askKind: AskableKind;
  askAnchorPreference?: AskAnchorPreference;
  askPromptChips: string[];
  askFollowUpPromptChips: string[];
```

to:

```ts
  /** Omitted on cards that carry no ask zone (the reader gets the page-default
   * chips there instead). WorkCard renders a plain wrapper when this is unset. */
  askHint?: string;
  askKind: AskableKind;
  askAnchorPreference?: AskAnchorPreference;
  askPromptChips?: string[];
  askFollowUpPromptChips?: string[];
```

- [ ] **Step 2: Delete the brand card's ask fields**

In `src/main.tsx`, in the `Brand Identity` item, delete `askHint`, `askPromptChips` (all three chips), and `askFollowUpPromptChips` (all three chips) — lines 111 and 114-123. Keep `askKind` and `askAnchorPreference`; they are inert without a hint and keeping them avoids touching the required `askKind` field.

- [ ] **Step 3: Branch `WorkCard` on the hint**

`src/main.tsx:850-901`. The `contextText` expression is shared, so hoist it, then choose the wrapper. Replace the `<AskableRegion ...>` opening tag and its closing tag as follows, leaving the children (`h2.card-title` through `p.card-summary`) exactly as they are:

```tsx
function WorkCard({ item, index }: { item: WorkItem; index: number }) {
  const cardBody = (
    <>
      <h2 className="card-title">{item.title}</h2>
      <div className="card-role-row">
        <p className="card-role">{item.role}</p>
        {item.liveHref ? (
          <a
            className="card-eyebrow-flag"
            href={item.liveHref}
            target={/^https?:\/\//.test(item.liveHref) ? "_blank" : undefined}
            rel={/^https?:\/\//.test(item.liveHref) ? "noreferrer" : undefined}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="flag-noun">{item.flagLabel ?? "Live site"}</span>
            <span className="flag-verb">{item.linkLabel ?? DEFAULT_LINK_LABEL}</span> ↗
          </a>
        ) : item.status ? (
          <p className="card-eyebrow-flag">{item.status}</p>
        ) : null}
      </div>
      <WorkCardMedia item={item} />
      {item.summary ? <p className="card-summary">{item.summary}</p> : null}
    </>
  );

  return (
    <Reveal
      as="article"
      className="work-card case-card"
      delay={120 + index * 90}
    >
      <p className="card-eyebrow">
        {item.year} · {item.eyebrow}
      </p>
      {item.askHint ? (
        <AskableRegion
          className="work-card-askable"
          hint={item.askHint}
          kind={item.askKind}
          anchorPreference={item.askAnchorPreference}
          promptChips={item.askPromptChips}
          followUpPromptChips={item.askFollowUpPromptChips}
          contextText={[
            item.title,
            item.role,
            item.year,
            item.status,
            item.summary,
            item.liveHref ? `Live site: ${item.liveHref}` : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {cardBody}
        </AskableRegion>
      ) : (
        // Same layout classes, no ask attributes: .askable-region carries the
        // flex column that the card body depends on, and dropping
        // data-ask-hint is what keeps the pin and the zone resolver away.
        <div className="askable-region work-card-askable">{cardBody}</div>
      )}
    </Reveal>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0. If `AskableRegion`'s `promptChips`/`followUpPromptChips` props reject `string[] | undefined`, they are already optional (`src/main.tsx:356-357`) — no change needed; a failure here means Step 1 edited the wrong fields.

- [ ] **Step 5: Verify in the browser**

Reload, clear dials, pass the loader.

Expected: hovering anywhere over the Brand Identity card body shows **no** ask pin. The `DEELI.AI ↗` link still renders and still works. The card's layout (title, role row, video, summary spacing) is visually identical to before — compare against the Deeli card beside it.

Then move the pointer over the Brand Identity card and press `/`. Expected: a panel still opens (page-default or nearest-section chips) and nothing is auto-sent, because no pin was showing.

- [ ] **Step 6: Commit**

```bash
git add src/essays/types.ts src/main.tsx
git commit -m "Drop the Brand Identity ask zone, keeping its live link"
```

---

### Task 5: Ground the Deeli question in site context

The Deeli pin now asks how the model's output was designed. `src/siteContext.ts` carries outcomes but nothing about designing model behavior, and `DEELI_CASE_CONTEXT` only loads on `/deeli/`.

**Files:**
- Modify: `src/siteContext.ts:70-76` (`facts`)

**Interfaces:**
- Consumes: the Deeli question from Task 3.
- Produces: the context Task 6's answerability pass reads.

- [ ] **Step 1: Add the fact**

Append to the `facts` array in `src/siteContext.ts`, as the first entry (it is the most load-bearing claim on the homepage). Use this wording verbatim — it is Joanna's own text and must not be paraphrased:

```ts
    "On Deeli's research assistant, I designed what the AI says and not just the UX and UI around it. I created response patterns the model could adapt to new situations, then tested its answers against expected outputs before shipping. That process taught me to treat model behavior as part of the product experience.",
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Verify the model reads it**

Reload, pass the loader, hover the Deeli card, press `/`.

Expected: the answer to "How does she design what AI says?" draws on the new fact — it should mention designing the model's responses / response patterns / testing answers against expected outputs, not deflect to the 220% and 70% metrics alone.

- [ ] **Step 4: Commit**

```bash
git add src/siteContext.ts
git commit -m "Add the model-behavior fact the Deeli pin question needs"
```

---

### Task 6: Answerability and regression pass

With no confirmation step, a question that produces a weak answer now ships straight to the reader. This task is the gate.

**Files:**
- Create: none (scratch script only; do not commit it)
- Modify: `src/main.tsx` / `src/essays/index.tsx` only if a question needs rewording

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Ask all seven through the real app, not a script**

Do **not** hand-roll a script that POSTs to the worker. The worker rejects any request whose system prompt does not begin with `CHAT_SYSTEM_PREFIX` (`src/CursorChat.tsx:441`, mirrored in `worker/src/index.js`), so a script would have to duplicate the entire prompt builder at `src/CursorChat.tsx:440-451` and would still miss the per-zone context that `openComposer` attaches. Driving the real UI sends the exact payload a visitor sends.

First ensure `window.__cursorChatTestResponse` is unset (`delete window.__cursorChatTestResponse`) — this task is about real answers.

Then, at 1440x900 with dials cleared and past the loader, hover each zone and press `/`, waiting for each answer to finish before moving on. Record the question and the full answer for each:

1. Deeli work card — How does she design what AI says?
2. Swiftly work card — What was the Swiftly work?
3. NYU work card — What was the NYU work?
4. Left rail — What kind of role fits Joanna?
5. Essay card 1 — Why did evals become the spec?
6. Essay card 2 — How did agents earn design time?
7. Essay card 3 — Why regenerate personas weekly?

- [ ] **Step 2: Judge each answer**

For each, decide: does the answer make a specific, grounded claim, or does it hedge ("I don't have details on...", "the page doesn't say...")? Record a verdict per question and report all seven verbatim to Joanna — she is the only one who can say whether a grounded-sounding answer is actually true about her work.

- [ ] **Step 3: Reword any question that hedges**

If a question's answer hedges, either reword the question toward what the context can support, or report back which additional `siteContext.ts` fact would fix it. Do not invent facts about Joanna's work — surface the gap instead. Any reworded string must stay under 36 characters.

- [ ] **Step 4: Full regression sweep in the browser**

At 1440x900, dials cleared, past the loader:

1. Each of the three remaining work-card zones and the rail: hover, press `/`, question sends, answer streams, follow-up chips appear.
2. Click a pin instead of pressing: same result.
3. Action pins ("Read" on the Deeli video, "See it live" / `DEELI.AI`): navigate, send nothing.
4. Brand Identity card: no pin on hover.
5. Each of the three essay cards: hover, press `/`, question sends.
6. Selection pill: triple-click a paragraph, confirm "Ask about this" still opens a draft panel and does **not** auto-send (it never sets `autoAsk`).
7. Press `/` over empty page background: blank composer opens, nothing sent.
8. Resize to 800px wide: no pins appear at all; tapping a card still opens the panel with chips.

- [ ] **Step 5: Commit any rewording**

```bash
git add src/main.tsx src/essays/index.tsx
git commit -m "Reword ask-pin questions that the site context cannot answer"
```

Skip this commit if no rewording was needed.

---

## Notes for the reviewer

- The silent-failure risk is concentrated in Task 1 Step 7. If the drain effect is keyed on `activeThread` instead of `activeThread?.id`, it re-runs on every status transition; if the ref is cleared after the submit instead of before, a re-render can double-send. Both faults look fine in a diff and only show up as a duplicated question in the panel.
- Task 4 Step 3 changes the wrapper element for cards without a hint. If `.askable-region`'s `display: flex; flex-direction: column` (`src/chat-ui.css:51-54`) is dropped from the fallback, the Brand Identity card's internals reflow and the regression is visual, not typed.
