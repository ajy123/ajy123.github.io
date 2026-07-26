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
// Source of truth: the deck-verified merged case-study draft. Every claim
// below traces to a deck slide — never invent a number not listed here. This
// project has NO numeric outcome metric; do not imply one. Team is listed by
// role only; do not add names not already public.
export const NYU_CASE_CONTEXT: string = [
  `NYU case study — grounding facts (published copy is authoritative; never invent a number not listed here):`,
  `- Product: a unified work-order platform for NYU Client Service staff processing campus maintenance requests. Role: product designer, cross-functional team of 6 (PM, 2 product owners, 2 engineers). Timeline: Sept-Oct 2018.`,
  `- Problem: staff processed maintenance requests by hand across disconnected tools — manual, time-consuming, labor-intensive data entry, jumping between software to find work-request history — constant, unnecessary thrash. Representative request: Request Type "Campus Cash," Problem Code B801, "Campus cash — laundry refund." Through-line problem: no accurate, unified maintenance record to communicate from. Many requests are multi-step and span multiple departments.`,
  `- User framing (verbatim project quote): "As a Client Service Staff at NYU, I want to have an accurate maintenance record so that we can communicate more effectively with departments and clients."`,
  `- Findings that changed direction: early process work mapped how a request traveled from the submitter, through the Client Service Center, to the maintenance department — framed as "How might we help with facility request management?" This surfaced the multi-step, multi-department constraint and reframed the project from "replace the CSV with a form" to "represent the full lifecycle of a request in one place."`,
  `- Thesis: if staff work from one unified record instead of many disconnected tools, they will communicate more confidently, process requests faster, and train new employees more easily.`,
  `- Shipped decisions: (1) one unified work-order platform replacing CSV files and multiple platforms outright; (2) a single continuous form view over a paginated one — framed as "Should we prioritize lessening information overload or scannability?", chose scannability so a multi-department request stays visible in one pass; (3) kept the floating action button over alternatives — framed as visibility vs. minimizing distractions, chose visibility so the primary action stayed reachable while staff reviewed dense request details; (4) two separate pre-launch review loops — high-fidelity prototypes went to Client Service Center/maintenance staff for workflow and content sign-off, and separately to engineering for specs, edge cases, and micro-interactions.`,
  `- Impact: this project has NO published numeric outcome metric. What it has instead: a defined measurement plan set at launch — verbatim: "Post-launch, we will track both work request processing time, student employee training time, and communication time between client and Client Service Staff." The team shipped a platform and instrumented three specific metrics to validate it, instead of shipping and hoping.`,
  `- Learnings: measure the tradeoff directly (compare staff accuracy and task time against visual clutter); track email-heavy tasks to find remaining communication overhead; design for upstream/downstream users differently within the same workflow; pre-launch review also flagged future scope — search functionality and grouping multiple work orders; open question — how the relationship between physical campus space and digital tools should be rethought.`,
  `- Never say "user-tested" — this project was validated through crit and internal design review, not usability testing with end users. Never state a numeric outcome for this project; there isn't one.`,
].join("\n");

if (import.meta.env.DEV && NYU_CASE_CONTEXT.length > 3500) {
  // eslint-disable-next-line no-console
  console.error(
    `NYU_CASE_CONTEXT is ${NYU_CASE_CONTEXT.length} chars, over the 3500-char budget. Trim before shipping.`,
  );
}
