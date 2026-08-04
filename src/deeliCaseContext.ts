// Case-study grounding for the cursor-chat model on /deeli/. Injected after
// SITE_CONTEXT (see buildMessages in CursorChat.tsx) so chat answers on the
// case-study page stay grounded in the Deeli project's real facts, not just
// whatever text happens to be under the cursor.
//
// Hard budget: <= 5100 characters for the DEELI_CASE_CONTEXT string value.
// Measured length as of writing: 5044 chars.
// The worker REJECTS (it does not truncate) any request over MAX_TOTAL_CHARS =
// 24,000, shared with the system prose (~1.2k), SITE_CONTEXT (~2k), zone
// contextText (<=2200), the composer prompt (<=2000), and recentHistory
// (MAX_HISTORY_CHARS = 14,000 in CursorChat.tsx). Every character spent here is
// a character a long thread cannot spend on history before the worker 400s it,
// so this digest is the one knob that trades grounding against thread length.
// The ceiling moved from 3500 to 5100 when the unpublished facts gained
// explicit markers and the published quotes became verbatim: a marked, quoted
// fact costs more characters than a bare paraphrase, and the alternatives
// (deleting true facts, or letting the model pass unpublished ones off as page
// copy) are worse. Raising it further means trimming history first; do not
// raise it without redoing that math.
// The dev-only assert below fails loudly if the digest drifts over budget.
//
// The contract, which is NOT "everything below is on the page":
//   1. deeli/index.html published copy is authoritative. Where this file and
//      the page disagree, the page wins and this file gets corrected.
//   2. Published facts are citable and may be quoted back to a visitor.
//   3. Unpublished facts carry an explicit
//      "UNPUBLISHED, internal only, do not state to visitors" marker. They are
//      real, they may inform reasoning, but they must never be attributed to
//      the page and must never be volunteered.
//   4. Never invent a number that is not listed here.
//   5. Where the internal sources contradict each other, the digest says so and
//      says the point is unresolved. The eval bullet is the live example: the
//      three internal docs describe one Braintrust run scored 85.71% (6 of 7)
//      but name different cases as the miss, and the page deliberately
//      publishes only the pattern, never the case. An earlier version of this
//      file read that disagreement as two separate runs with two misses and
//      told the model to keep them apart; there is no evidence of a second
//      run, so that framing is gone. Do not reintroduce it.
// Provenance for the unpublished figures lives outside this repo, under
// ~/Desktop/deeli-projects/ (the portfolio-assets sweep spec, the eval context
// dump, and the case-study-copy build notes). None of it is on the site.
//
// Page structure as shipped, in order:
//   #ns-problem (The problem) -> #ns-research (The research) ->
//   #ns-solution (The solution) -> #ns-outcome (Outcome) ->
//   #ns-method (Method, how I worked with AI) -> #ns-postlaunch (Post-launch).
//
// Dense bullet facts, not prose: the model has a small context window and
// bullets ground answers more reliably than paragraphs.
export const DEELI_CASE_CONTEXT: string = [
  `Deeli case study grounding. Published page copy is authoritative; UNPUBLISHED items are internal only (never state them to a visitor, never attribute them to the page). Never invent a number.`,
  `- Deeli: an enterprise deep-tech research product. Client: a top-5 semiconductor foundry. Joanna: Product design + PM on a 5-engineer build. Launched June 2026; impact measured over the first 2 weeks live.`,
  `- #ns-problem "Search answered the topic, not the question.": the old search matched words, never knew who was asking, so every role got the same generic report from a process no one could inspect.`,
  `- #ns-research "I put the model through the same research I put people through." Page copy: mock-real queries from researcher interviews; before answering the model picks who it is writing for, "and it got six of seven right. The seventh question fit two readers at once, so it asked instead of guessing." Researchers wanted to ask in their own words, watch the research run, and check every claim's source.`,
  `- The eval. Published: "11 automated checks", the figcaption "Pattern from the eval run's one flagged case", and "it got six of seven right". The page gives the pattern, never the case. Asked which case failed, answer that the page publishes the pattern rather than the case, and stop. Never mention internal notes or say anything is disputed. UNPUBLISHED, do not state to visitors: the suite is 9 cases (neither the 9 nor the 9x11 pairing is page copy); persona_hint scored 85.7%, other checks 100% (cases and checks differ; persona_hint ran on 7 of the 9). Internal notes conflict on which case missed, so there is no settled answer.`,
  `- UNPUBLISHED, internal only, do not state to visitors: 263 tagged issues ranked by frequency x impact (report content led frequency, citations led impact, rare but severe); 21 benchmark runs where path-grounded retrieval, every claim traceable to a source, cost about 6x more per run than fast retrieval and was judged worth paying (6x is derived, rounded from $0.02 vs $0.11, i.e. 5.5x); logs and interviews showed multi-part, bilingual, role-specific asks the keyword box flattened into one topic.`,
  `- #ns-solution "Designed as a researcher's journey: ask, scope, watch the work, check the receipts." The page's four moves, quote these verbatim: "01 · Ask" / "Take the question, not the keyword"; "02 · Scope" / "Aim the report"; "03 · Research" / "Show the agents"; "04 · Verify" / "Make claims inspectable". Nothing else names them; express/aim/observe/verify is not page copy.`,
  `- Detail behind the moves (paraphrase, not page wording): 01 takes natural questions, fragments and bilingual queries, keeps the original and shows its interpretation separately, no silent rewrites. 02 asks one clarifying question back as tappable chips with a rewrite escape hatch; in the prototype a chip tap attaches a footnote and arms submit; submit shows a queued state, no report. 03 has each named agent report concrete source activity while generating, not a progress bar. 04 exposes source count, citations and drill-down paths.`,
  `- #ns-outcome "Researchers trusted what came back." Published, first ~2 weeks live: natural-language query share rose 13% -> 70% (keyword fell 87% -> 30%); average queries per active day rose +220% from internal pilot to launch week 2, indexed 31% -> 53% -> 100%, same denominator.`,
  `- UNPUBLISHED, internal only, do not state to visitors: 91 of 92 live queries returned an inspectable report (generation reliability, not research-outcome quality, which was evaluated separately). Never cite it as page copy.`,
  `- #ns-method "The story above ran on a working method." Published: persona.md is built from interviews, user feedback and usage data and feeds product prioritization, and upkeep that took "6+ hours a week now takes about one"; an AI judge grades every answer against the persona questions, so review asks which check failed instead of arguing taste; the interface is written as a few design primitives in design.md, and the doc is the handoff, engineers read it instead of meeting. UNPUBLISHED, do not state to visitors: those primitives are content not chrome, encode by exception, hierarchy via weight and space not color.`,
  `- #ns-postlaunch "28% of queries were re-asks. We're finding out why." Page copy: "Each re-ask raises one question: did the answer miss, or did the topic have a second angle? The two need opposite fixes, so the next move is research, not a feature." That answers any what-is-next question. No feature is committed or planned; never tell a visitor one is.`,
  `- UNPUBLISHED, internal only, do not state to visitors: one candidate direction was discussed and explicitly NOT committed to, surfacing the system's interpretation before generating so users can steer it and same-intent queries return one consistent report; candidate only, never describe it as planned. Also unpublished: near-identical queries sometimes produced different report titles, e.g. one MRAM-aerospace question asked 5x produced 2 different titles.`,
  `- Never cite $300K ARR or 82% booked revenue: unverified old-resume figures.`,
].join("\n");

if (import.meta.env.DEV && DEELI_CASE_CONTEXT.length > 5100) {
  // eslint-disable-next-line no-console
  console.error(
    `DEELI_CASE_CONTEXT is ${DEELI_CASE_CONTEXT.length} chars, over the 5100-char budget. Trim before shipping.`,
  );
}
