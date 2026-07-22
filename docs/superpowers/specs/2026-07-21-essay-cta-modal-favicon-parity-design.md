# Essay CTA / in-place essay modal / head parity

Date: 2026-07-21 · Branch: `cs-essay-parity` · Status: frozen for implementation

Canon note: this repo has no `DESIGN.md` / `design.json`. Ground truth is
`src/tokens.css` + the `:root` block in `src/index.css` (landing) and the inline
`:root` in `deeli/index.html` (case study). No hex/rgb literal may be introduced
in changed lines; every value resolves to one of those token sets.

## Goal

Three consistency defects, one branch.

1. **CTA parity.** Work cards carry a right-aligned `.card-eyebrow-flag`
   (noun on desktop, verb + ≥44px target at `(hover:none), (max-width:860px)`).
   Essay cards carry nothing — on touch there is no visible affordance that the
   card opens anything.
2. **Essay link on the case study.** `deeli/index.html:893` links out to
   `/#ai-practice`, dumping the reader onto the landing page mid-case-study. The
   essay is a modal everywhere else; it should open in place.
3. **Head parity.** `deeli/index.html` ships only `favicon.svg`; the landing
   page also ships `favicon-32.png`, `apple-touch-icon`, and `theme-color`.

## W2 — Essay modal on `/deeli/` (delegated; largest)

### Options considered

- **A (picked) — extract the dialog into shared modules; the React island
  already mounted on `/deeli/` renders it.** One source of truth for essay copy
  and dialog behavior; the second consumer proves the boundary. Cost: a real
  refactor of `main.tsx` + a CSS extraction.
- B — deep link `/#essay/eval-is-the-spec`, landing opens the modal on load.
  Nearly free, but still navigates away; the reader loses their place in the
  case study. Fails the actual ask.
- C — duplicate the essay copy into `deeli/index.html` as a local modal.
  Guarantees drift between two copies of the same essay. Rejected.

Precedent for A: the `chat-ui.css` extraction (PR #36) did exactly this and the
landing page came through unchanged.

### Files (exclusive ownership — this workstream owns all of them)

- **NEW** `src/essays/types.ts` — `EssaySection`, `EssayItem` types moved out of
  `main.tsx`. `EssayItem` currently extends `WorkItem`; move `WorkItem` here too
  and have `main.tsx` import it. Do not restructure the types.
- **NEW** `src/essays/index.tsx` — `export const aiPracticeItems: EssayItem[]`
  and `export const essaysById: Record<string, EssayItem>`, moved verbatim from
  `main.tsx` (lines ~180–~430). Visual JSX (`<AgentsWorkflowVisual />` etc.)
  moves with it; imports come along.
- **NEW** `src/components/EssayDialog.tsx` — the portal/backdrop/stage/panel
  half of `EssayPracticeCard`, lifted verbatim. Props:
  ```ts
  {
    item: EssayItem;
    open: boolean;
    onClose: () => void;
    /** Card-morph mode passes a layoutId; standalone (deeli) omits it and the
      * panel fades/scales in instead of morphing from a trigger. */
    layoutIdPrefix?: string;
  }
  ```
  Keeps every existing behavior: Escape close, focus trap
  (`getFocusableElements`), body-scroll lock, `data-scroll-ready` gate,
  `prefers-reduced-motion` branches, focus return to the trigger on unmount.
  `getFocusableElements` moves here; `main.tsx` imports it if still needed.
- **NEW** `src/essay-dialog.css` — **move** (not copy, byte-identical) from
  `src/index.css`: `.essay-dialog-backdrop`, `-stage`, `-panel`, `-close`,
  `-header`, `-title`, `-meta`, `-dek`, `-hero`, `-body`, `-section`, `-figure`,
  `-takeaway`, `.essay-figure-caption`, `.essay-scenario-*`, and the dialog
  rules inside the media blocks near lines 1700, 1749. Also move/scope-copy the
  `.work-media` rules the thumbnail depends on (`EssayEvalThumbnail` renders
  `className="work-media"`).
  **Leave in `index.css`:** `.essay-carousel*`, `.essay-dialog-trigger*`,
  `.essay-dialog-visual*`, `.card-*` — landing-only.
  Token bridge: deeli's `:root` lacks `--overlay` and `--shadow-soft`. Define
  them **scoped to the dialog roots**, never `:root`:
  ```css
  .essay-dialog-backdrop, .essay-dialog-stage, .essay-dialog-panel { /* … */ }
  ```
  with `/* source of truth: index.css :root */`. Grep `var(--` across every
  moved rule and diff against deeli's inline `:root` — bridge whatever else is
  missing, bridge nothing that both roots already define.
- `src/index.css` — add `@import "./essay-dialog.css";` next to the existing
  `chat-ui.css` import. Net effect on the landing page: zero.
- `src/main.tsx` — `EssayPracticeCard` keeps the trigger/card half and renders
  `<EssayDialog … layoutIdPrefix={...} />`. Imports `aiPracticeItems` from
  `src/essays`. No copy or markup changes to the card.
- `src/deeliChatApp.tsx` — mount a `<DeeliEssayModal />` alongside the chat
  components. It listens for clicks on `a[data-essay-id]` (delegated on
  `document`), `preventDefault()`s, resolves the id through `essaysById`, and
  opens `<EssayDialog>` standalone. Unknown id → let the click through to the
  href (graceful degradation).
- `deeli/index.html` line 893 only — the anchor keeps its `href="/#ai-practice"`
  as the no-JS fallback and gains
  `data-essay-id="eval-is-the-spec"`. Copy unchanged. Nothing else in the file
  may be touched (the `<head>` belongs to W3).

### Constraints

- The dialog on `/deeli/` must render at the same measure and the same
  breakpoints as on the landing page — the moved media queries do that; verify,
  do not re-author them.
- No new dependency, no new token, no copy edit.
- `npm run build` (tsc + both Vite entries) must stay green.

## W1 — Essay card CTA (supervisor-owned)

`EssayPracticeCard`'s `.card-role-row` gains a flag matching the work card's
slot, geometry, and type tokens.

Decision — **the flag is a non-interactive `<span>`, not an anchor.** The whole
card is already `role="button"`; nesting a second control inside it would break
the trigger's semantics and duplicate the tap target. Consequence: the touch
rule promotes size and contrast but adds no padding — the card is the 44px+
target, and it already is.

Decision — **verb at both breakpoints ("Read essay"), not noun/verb.** The work
card splits noun/verb because the two differ ("Case study" / "Read the case
study"). The essay's noun is already spent in the eyebrow (`2026 · Essay`), so
repeating it desktop-side would be dead copy. [Likely]

Decision — glyph `→`, not `↗`. `↗` is the site's "this opens a page" mark; the
essay opens in place. [Likely — worth a look at gate 0]

Hover/focus of the card (`.essay-dialog-trigger:hover/:focus-visible`) drives
the flag to `--ink-strong` with the same underline treatment as
`a.card-eyebrow-flag`.

Files: `src/main.tsx` (card markup), `src/index.css` (flag rules). Sequenced
**after** W2 lands to keep `index.css` and `main.tsx` single-owner.

## W3 — Head parity (supervisor-owned)

`deeli/index.html` `<head>` only:

- `<link rel="icon" sizes="32x32" href="/favicon-32.png" type="image/png">`
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
- `<meta name="theme-color" content="#ffffff">` (matches landing verbatim)

Title stays `From search box to research partner · Joanna Yen` — it already
follows the `<page> · Joanna Yen` pattern the landing page's bare `Joanna Yen`
anchors. **Reported, not changed:** the landing work card names this case study
"From keyword search to a research chat" while the page's `<h1>` and `<title>`
say "From search box to research partner." That is a copy decision, not a bug
fix; it needs a call before either string moves.

Out of scope, flagged: `src/faviconPulse.ts` animates the tab icon while the LLM
is busy, and the chat now runs on `/deeli/` too — so the case study's tab sits
still where the landing page's breathes. Wiring it needs `logoPulse`'s
`FALLBACK_LEVELS` path to work without a `GridLogo` in the DOM. Not in this
branch.

## Success criteria (each needs evidence; visual claims need a screenshot)

1. Essay cards show the CTA in the same slot and rhythm as work cards.
   Evidence: landing screenshot at ≥1200px showing a work card and an essay
   card together.
2. The CTA responds to card hover/focus (color + underline) and is reachable by
   keyboard via the card trigger. Evidence: hover screenshot + focus-visible
   screenshot.
3. At ≤860px and on touch, the essay CTA is promoted (contrast + size) exactly
   as the work flag is. Evidence: screenshots at 390px and 860px.
4. On `/deeli/`, clicking "More on evals as the spec →" opens the essay modal
   **in place** — the case study stays behind the backdrop, the URL does not
   change. Evidence: screenshot of the open modal over the case study.
5. That modal matches the landing modal: same panel width, padding, type scale,
   hero thumbnail, close button. Evidence: side-by-side screenshots.
6. The deeli modal is responsive — full-bleed panel, 44px close button, no
   horizontal scroll at 390px. Evidence: screenshot at 390px.
7. Escape closes it, focus returns to the link, and the page scroll position is
   preserved. Evidence: before/after screenshots + console check.
8. Landing page unchanged after the extraction: essay cards still open, morph
   animation intact, no visual regression. Evidence: screenshot + open-modal
   screenshot.
9. `/deeli/` head parity: `favicon-32.png`, `apple-touch-icon`, `theme-color`
   present; both pages resolve the same icon assets. Evidence: rendered `<head>`
   + a 200 on each asset.
10. No console errors on either page; `npm run build` green (tsc + both
    entries). Evidence: console read on both + build output.
11. Token gate: zero new hex/rgb literals in changed lines outside the two
    canonical `:root` blocks. Evidence: grep on the diff.
12. Chat still works on both pages (`/` opens, selection pill, hint zones) —
    the essay modal must not steal the `/` key or the selection. Evidence:
    screenshot of chat open on `/deeli/` after the modal closes.

## Out of scope

Favicon pulse on `/deeli/`. Case-study title/H1 copy reconciliation. OG/Twitter
meta (absent on both pages). Any essay copy edit. Worker changes.
