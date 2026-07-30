// Case-study grounding for the cursor-chat model on /nyu/. Injected after
// SITE_CONTEXT (see buildMessages in CursorChat.tsx) so chat answers on the
// case-study page stay grounded in the NYU project's real facts, not just
// whatever text happens to be under the cursor.
//
// Hard budget: <= 3500 characters for the NYU_CASE_CONTEXT string value.
// The worker caps the whole request at 24,000 chars shared with SITE_CONTEXT
// (~1.5k), zone contextText (<=2200), and 40-message history — this digest
// must leave room for all of that.
//
// Source of truth: the deck-verified merged case-study draft, plus Joanna's own
// post-launch analytics for the one outcome number (the ~33% turnaround figure
// below, which is NOT in the deck). Never invent a number not listed here — the
// ~33% turnaround improvement is the ONLY outcome metric this project has. Team
// is listed by role only; do not add names not already public.
export const NYU_CASE_CONTEXT: string = [
  `NYU case study — grounding facts (published copy is authoritative; never invent a number not listed here):`,
  `- Product: an internal work-order tool (service design) for NYU Client Service staff, the team processing campus maintenance requests. Role: product designer, cross-functional team of 6 (PM, 2 product owners, 2 engineers). Timeline: Sept-Oct 2018.`,
  `- Problem: staff processed maintenance requests by hand across disconnected tools — labor-intensive data entry, jumping between software to find work-request history. Representative request: Request Type "Campus Cash," Problem Code B801, "Campus cash — laundry refund." Through-line problem: no accurate, unified maintenance record to communicate from. Many requests are multi-step and span multiple departments.`,
  `- User framing (verbatim project quote): "As a Client Service Staff at NYU, I want to have an accurate maintenance record so that we can communicate more effectively with departments and clients."`,
  `- Findings that changed direction: early process work mapped how a request traveled from the submitter, through the Client Service Center, to the maintenance department — framed as "How might we help with facility request management?" This surfaced the multi-step, multi-department constraint and reframed the project from "replace the CSV with a form" to "represent the full lifecycle of a request in one place."`,
  `- Thesis: if staff work from one unified record instead of many disconnected tools, they will communicate more confidently, process requests faster, and train new employees more easily.`,
  `- Shipped decisions: (1) one unified work-order platform replacing CSV files and multiple platforms outright; (2) a single continuous form view over a paginated one — framed as "Should we prioritize lessening information overload or scannability?", chose scannability so a multi-department request stays visible in one pass; (3) kept the floating action button over alternatives — framed as visibility vs. minimizing distractions, chose visibility so the primary action stayed reachable while staff reviewed dense request details; (4) two separate pre-launch review loops — high-fidelity prototypes went to Client Service Center/maintenance staff for workflow and content sign-off, and separately to engineering for specs, edge cases, and micro-interactions.`,
  `- Impact: over the first month post-launch, average work-request turnaround time fell roughly 33% — Joanna's own post-launch analytics, an early directional read, NOT a deck figure. The deck only set the measurement plan: track work-request processing time, student-employee training time, and client communication time. Turnaround was the first of three instrumented metrics to report — do NOT invent training or communication figures.`,
  `- Learnings: measure the tradeoff directly (staff accuracy and task time vs. visual clutter); track email-heavy tasks for remaining communication overhead; design upstream/downstream users differently in one workflow; pre-launch review flagged future scope (search, grouping work orders); open question — how physical campus space and digital tools should relate.`,
  `- Never say "user-tested" — this project was validated through crit and internal design review, not usability testing with end users. The ~33% turnaround improvement is the only outcome number; never invent others.`,
  `- An older resume draft mentioned an iPad field app and NLP request parsing; those are NOT part of this documented project — never confirm or describe them.`,
].join("\n");

if (import.meta.env.DEV && NYU_CASE_CONTEXT.length > 3500) {
  // eslint-disable-next-line no-console
  console.error(
    `NYU_CASE_CONTEXT is ${NYU_CASE_CONTEXT.length} chars, over the 3500-char budget. Trim before shipping.`,
  );
}
