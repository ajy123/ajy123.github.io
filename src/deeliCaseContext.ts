// Case-study grounding for the cursor-chat model on /deeli/. Injected after
// SITE_CONTEXT (see buildMessages in CursorChat.tsx) so chat answers on the
// case-study page stay grounded in the Deeli project's real facts, not just
// whatever text happens to be under the cursor.
//
// Hard budget: <= 3500 characters for the DEELI_CASE_CONTEXT string value.
// The worker caps the whole request at 24,000 chars shared with SITE_CONTEXT
// (~1.5k), zone contextText (<=2200), and 40-message history — this digest
// must leave room for all of that. Measured length as of writing: 3417 chars
// (see the dev-only assert below, which fails loudly if it ever drifts over
// budget).
//
// Sources of truth, in priority order: deeli/index.html published copy
// (authoritative for any claim already public), then
// ~/Desktop/deeli-projects/deeli-portfolio-assets/case-study-build/
// case-study-copy-LOCKED.md for metric provenance where the page is terse.
// Every number below appears in one of those two places — never invent one.
//
// Dense bullet facts, not prose: the model has a small context window and
// bullets ground answers more reliably than paragraphs.
export const DEELI_CASE_CONTEXT: string = [
  `Deeli case study — grounding facts (published copy is authoritative; never invent a number not listed here):`,
  `- Product: Deeli, an enterprise deep-tech research product. Client: a top-5 semiconductor foundry.`,
  `- Role: solo product designer — framing, strategy, interaction, launch analysis. Team: 5-engineer build. Launched June 2026; impact measured over the first 2 weeks live.`,
  `- Problem: keyword search matched a topic and printed that topic's template — same report for everyone, no way to express intent, shape the output, or verify it (no sources or reasoning shown). It answered the topic, not the question.`,
  `- Three findings changed direction (Process):`,
  `  1. Logs + interviews showed multi-part, bilingual, role-specific asks; the keyword box flattened all of it into one topic.`,
  `  2. Ranked 263 tagged issues by frequency x impact — report-content led on frequency, citations led on impact (rare but severe).`,
  `  3. 21 benchmark runs: path-grounded retrieval (every claim traceable to a source) cost ~6x more per run than fast retrieval — judged worth paying.`,
  `  Fork/thesis: "Stop returning documents. Return the synthesis." Two control surfaces enforced it before UI work: a design spec (design.md — content is the figure not the chrome, encode by exception, hierarchy via weight/space not color) and a 9-case intent-parser eval suite (persona_hint scored 85.7%, 6 of 7; all other checks 100%; the one miss routed a billing question to clarification instead of a persona tag).`,
  `- Four shipped decisions (Solution), each closing one gap — express, aim, observe, verify:`,
  `  1. Take the question, not the keyword: accepts natural questions, fragments, bilingual queries; preserves the original query, shows its interpretation separately (no silent rewrites). Proof: 70% of live queries used forms the old box could not parse.`,
  `  2. Let the researcher aim the report: one focused clarifying question back as tappable chips (rewrite escape hatch); one tap changes the report's shape and depth.`,
  `  3. Show what the agents are doing: while generating, each named agent reports concrete source activity (e.g. patents, matched papers) instead of a plain progress bar.`,
  `  4. Make every claim inspectable: final report exposes source count, citations, and drill-down paths. Proof: 91 of 92 live queries returned an inspectable report (generation reliability, not research-outcome quality).`,
  `- Impact metrics (first ~2 weeks live):`,
  `  - NL query share rose 13% -> 70% (keyword fell 87% -> 30%), historical vs post-launch — proves researchers stopped translating intent into keyword syntax.`,
  `  - Avg queries/active day rose ~+220% from internal pilot to launch week 2 (indexed 31% -> 53% -> 100%) — proves it became a working habit, not a curiosity.`,
  `  - 91 of 92 live queries returned an inspectable report — generation reliability; research-outcome quality was evaluated separately.`,
  `  - 28% of live queries were re-asks — the redesigned input fixed intent capture but left two seams unresolved (see open questions).`,
  `- Open questions (Learnings): near-identical queries sometimes produced different report titles (e.g. one MRAM-aerospace question asked 5x produced 2 different report titles) — a re-ask could mean a rejected first answer or a genuinely new angle, unresolved which. Next bet: surface the system's interpretation before generating the answer, let users steer it, and make same-intent queries return a consistent report.`,
].join("\n");

if (import.meta.env.DEV && DEELI_CASE_CONTEXT.length > 3500) {
  // eslint-disable-next-line no-console
  console.error(
    `DEELI_CASE_CONTEXT is ${DEELI_CASE_CONTEXT.length} chars, over the 3500-char budget. Trim before shipping.`,
  );
}
