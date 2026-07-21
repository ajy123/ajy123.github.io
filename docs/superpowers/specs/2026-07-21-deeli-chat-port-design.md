# Deeli case study — cursor-chat port

Date: 2026-07-21 · Branch: `chat-in-case-study` · Status: frozen for implementation

## Goal

The `/deeli/` case-study page gets the landing page's chat system: `"/"` opens
CursorChat, text selection shows SelectionAskPill, dwell over tagged sections
shows ContextualAskHint. Chat answers are grounded in a curated case-study
digest on top of the existing site profile. No TOC hint (dropped by decision).
Landing page behavior and rendering must not change.

## Architecture

Four independent workstreams. File ownership is exclusive — no two tasks touch
the same file.

### T1 — CSS extraction (`src/chat-ui.css`)

Problem: all chat component styles live in `src/index.css`, which the deeli
page must not load (it has its own inline page styles and `:root`).

- Create `src/chat-ui.css`. **Move** (not copy) these rule ranges out of
  `src/index.css`, byte-identical:
  - `.contextual-ask-hint*` + zone styles `[data-ask-hint]`, `.askable-region`,
    `[data-ask-active="true"]` (index.css ~1596–1750)
  - `.cursor-chat*` (~1757–2699, includes the `--chat-panel-fill` definition
    at 1760)
  - `.selection-ask-pill*` (~2700+, plus its media query near 3033)
  - Any `@media`/`prefers-reduced-motion` blocks belonging to those selectors,
    wherever they sit in the file.
- Token bridge: the moved rules reference `:root` tokens that deeli's page does
  not define: `--plate-fill`, `--plate-border`, `--plate-shadow`,
  `--control-dark`, `--control-dark-hover`, `--spring`, `--white`,
  `--selection-bg`, `--selection-ink`, `--shadow-soft`, `--surface-elevated`,
  `--overlay`, `--body`, `--muted-strong`, `--ease-out-strong` (verify the full
  list by grepping `var(--` in the moved rules and diffing against deeli's
  inline `:root`). Define the missing ones in `chat-ui.css` **scoped to
  component roots**, values referenced from `src/index.css` `:root` (move the
  declaration if it is used ONLY by moved rules; otherwise scope-copy with a
  comment naming index.css as source of truth):

  ```css
  .cursor-chat, .selection-ask-pill, .contextual-ask-hint,
  .askable-region, [data-ask-hint] { /* bridge tokens here */ }
  ```

  Never add to `:root` in chat-ui.css — deeli's inline `:root` must stay
  authoritative for page tokens. Shared names that deeli already defines
  (`--canvas`, `--ink`, `--accent`, `--ghost`, `--surface-warm`, `--muted`,
  `--hairline`, `--hairline-faint`, `--font-mono`) are NOT bridged — they
  resolve from each page's own root.
- `src/index.css` gets `@import "./chat-ui.css";` at top (after the tokens.css
  import) so the landing page is unchanged.
- Acceptance: landing renders pixel-identical; `grep -c "cursor-chat"
  src/index.css` returns 0 (all moved).

### T2 — Context prop + deeli entry (src/ only; does NOT edit deeli/index.html)

- `src/CursorChat.tsx`:
  - Props (line ~668): `{ suspended?: boolean; extraContext?: string }`.
  - Thread `extraContext` as an argument: component → `runGeneration`
    (~1076, called ~1206) → `buildMessages` (~528, called ~1089). Mirror the
    `suspendedRef` pattern (~689/795) if a ref is cleaner than re-binding.
  - Inject in `buildMessages` immediately after `SITE_CONTEXT` (~567):
    `extraContext ? "\n" + extraContext : ""`. The system string MUST still
    start byte-identical with `CHAT_SYSTEM_PREFIX` (~343) — the worker
    rejects otherwise.
  - Landing call site (`main.tsx`) is untouched; prop optional.
- `src/deeliChat.tsx` (new entry):
  - Small bootstrap: on `requestIdleCallback` (fallback `setTimeout` 200ms),
    dynamic-`import()` a `src/deeliChatApp.tsx` module that imports
    `chat-ui.css`, creates a `<div id="deeli-chat-root">` appended to
    `document.body`, and mounts:

    ```tsx
    <ContextualAskHint />
    <SelectionAskPill />
    <CursorChat extraContext={DEELI_CASE_CONTEXT} />
    ```

    No `suspended` (defaults false — no intro on this page).
  - Reuse `ContextualAskHint` directly (not the DEV dials wrapper).
- Acceptance: `npm run build` passes (tsc + vite, both entries); landing
  bundle does not include `deeliCaseContext`.

### T3 — Grounding digest (`src/deeliCaseContext.ts`)

- Export a single precompiled string `DEELI_CASE_CONTEXT`, same pattern as
  `SITE_CONTEXT` in `src/siteContext.ts`.
- **Hard budget: ≤ 3500 characters.** Worker caps total request at 24 000
  chars shared with SITE_CONTEXT (~1.5k), zone contextText (≤2200), and 40-msg
  history; the digest must leave room.
- Content, dense bullet facts (no prose paragraphs):
  - Product + client: Deeli, deep-tech research product; client is a top-5
    semiconductor foundry.
  - Role, team, timeline (from the CS hero meta grid).
  - Problem: keyword search answered the topic, not the question.
  - Three research findings that changed direction (Process section).
  - Four shipped decisions (Solution section): intent input, clarification,
    plus the other two — one line each with the "why".
  - Impact metrics with what each proves: 13%→70% NL query share, +220%
    queries/day, 91 of 92 reports inspectable, 28% re-asks (learnings).
  - Open questions from Learnings.
- Sources of truth, in order: `deeli/index.html` copy (authoritative for
  claims already published) and `~/Desktop/deeli-projects` (metric
  provenance — read-only; if inaccessible, use page copy only and say so).
- Voice: factual, precise, no hype. Never invent a number not present in a
  source.
- Acceptance: `DEELI_CASE_CONTEXT.length ≤ 3500` (add a dev-only assert or
  comment with the measured count); every metric traceable to a source.

### T4 — Zone tagging + script tag (`deeli/index.html` only)

- Add before `</body>`:
  `<script type="module" src="/src/deeliChat.tsx"></script>`
- Tag these zones with `data-ask-hint`, `data-ask-kind`, and
  `data-ask-prompts` (JSON array of 2 strings). No `data-ask-context` except
  hero (its visible text is sparse). `data-ask-anchor` omitted (default
  cursor). Frozen copy:

  | Zone (element) | data-ask-hint | prompts |
  |---|---|---|
  | `header.cs-hero` | Ask what my role was | "What was Joanna's role on Deeli?", "How long did this take to ship?" |
  | `#anchor-problem` | Ask why keyword search failed | "Why did keyword search fail researchers?", "What did users do instead?" |
  | `#anchor-process` | Ask what changed the direction | "Which finding changed the product direction?", "How was the research run?" |
  | `#anchor-spec` | Ask why design.md became the spec | "Why write the spec as design.md?", "How did agents use the spec?" |
  | `#anchor-eval` | Ask how the evals were written | "What did the evals measure?", "Why evals before UI?" |
  | `cs-sechead#sec-solution` | Ask why these four decisions | "Why these four decisions?", "What got cut?" |
  | `#anchor-flip` | Ask what 13→70% means | "What does the 13% to 70% shift prove?", "How was NL share measured?" |
  | `#anchor-reask` | Ask about the 28% re-asks | "Why did 28% of queries get re-asked?", "What would you fix next?" |

  All zones `data-ask-kind="project"` except hero → `"profile"`.
- Hero `data-ask-context`: one sentence stating role, team, launch window
  (copy the hero meta grid values verbatim).
- Add `data-ask-ignore="true"` to each interactive widget wrapper
  (`.sol-widget` roots: `sol-w1`…`sol-w4`) so hints don't fire while readers
  operate the prototypes. Note: `#sec-solution` zone is the sechead block,
  which does not contain the widgets.
- Do not touch anything else in the file — no copy edits, no style edits.

## Success criteria (all must hold; each needs evidence)

1. On `/deeli/`, pressing `"/"` opens the chat panel. Evidence: screenshot.
2. Selecting a paragraph shows the ask pill; clicking it opens chat and the
   reply reflects the selected text. Evidence: screenshots (pill + reply).
3. Dwelling over a tagged section shows the contextual hint with that
   section's frozen copy. Evidence: screenshot of ≥2 different zones.
4. A case-study question ("what does the 70% metric mean?") gets an answer
   citing digest facts. Evidence: screenshot of streamed reply.
5. Landing page unchanged: `"/"` still opens chat, hints and pill still work,
   no visual regression. Evidence: screenshot + interaction check.
6. Chat bundle loads on idle: initial HTML paint has no chat JS blocking;
   module fetch happens post-load. Evidence: network waterfall or
   `performance` check.
7. No console errors on either page. Evidence: console read on both.
8. `npm run build` green (tsc + both vite entries).
9. Prompt budget: `CHAT_SYSTEM_PREFIX` byte-identical at position 0;
   SITE_CONTEXT + digest + max zone context < 8k chars, leaving >16k for
   history. Evidence: computed sizes.
10. Widget interactions (`sol-w1`…`w4` forms) still work with hint layer
    active — no hint over widgets (`data-ask-ignore`). Evidence: screenshot
    while focused in a widget input.

## Out of scope

TOC hint row (dropped). Touch-specific chat affordances beyond what the
components already do. Worker changes. Any copy edits to case-study prose.
