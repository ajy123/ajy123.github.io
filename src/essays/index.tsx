// Essay copy + visuals — the single source of truth for the "Designing with
// AI" essays. Moved out of main.tsx so the landing page and the /deeli/ chat
// island can both render the same essay data through the same EssayDialog,
// instead of each carrying its own copy.
import { EssayEvalThumbnail } from "../components/EssayEvalThumbnail";
import { EssayAgentsThumbnail } from "../components/EssayAgentsThumbnail";
import {
  AgentsTriptychVisual,
  AgentsWorkflowVisual,
} from "../components/EssayAgentsVisuals";
import { EssayPersonaThumbnail } from "../components/EssayPersonaThumbnail";
import {
  PersonaCoverageGrid,
  PersonaScenarioCards,
} from "../components/EssayPersonaVisuals";
import type { EssayItem } from "./types";

// Unlisted: kept out of the landing grid until the essay has a concrete
// incident/number to carry it, but still resolvable by id so a shared
// #essay/eval-is-the-spec deep link keeps working.
const unlistedEssayItems: EssayItem[] = [
  {
    id: "eval-is-the-spec",
    eyebrow: "Essay",
    title: "The eval is the spec",
    role: "Model evaluation",
    year: "2026",
    // No askHint: this item is unlisted, so no card renders it and nothing
    // reads a hint from it. The chips below are still live, reached through
    // essaysById when a #essay/eval-is-the-spec deep link opens the modal.
    askKind: "essay",
    askAnchorPreference: "cursor",
    askPromptChips: [
      "does the essay argue that the eval becomes the spec?",
      "does the essay say generated paragraphs are behavior, not static components?",
      "does an eval define product quality?",
    ],
    askFollowUpPromptChips: [
      "is the interface only half the AI product spec?",
      "does a test tell the model what good work means?",
      "does the essay say exact states in a conventional product spec still matter?",
    ],
    summary:
      "In an AI product, screens are only half the spec. The model writes the other half fresh every run, so I use evals to define what a good answer is.",
    dek:
      "In AI products, the interface is only half the spec. The other half is the test that tells the model what good work means.",
    sections: [
      {
        heading: "The hard part is the part that changes",
        body: [
          "A conventional product spec can describe a report screen with exact states: what loads, what fails, what the citation chip looks like, what the empty state says. That still matters.",
          "But the most important surface in an AI product is often generated fresh every run. The paragraph, recommendation, synthesis, or follow-up question is behavior, not a static component.",
        ],
      },
      {
        heading: "So the eval becomes the design artifact",
        body: [
          "An eval names the quality bar in a way the team can actually inspect. It turns fuzzy taste into repeatable checks: did the answer cite the right source, preserve uncertainty, avoid overclaiming, and help the user decide what to do next?",
          "That makes the eval closer to a spec than a QA afterthought. It is where product judgment, content strategy, and system behavior meet.",
        ],
      },
      {
        heading: "Designing with evals changes the conversation",
        body: [
          "With an eval in hand, the review question changes from whether an answer feels smart to which failure mode it triggered. Quality gets tested across messy inputs instead of one polished demo.",
          "For me, that is the practical bridge between design and AI systems: define the experience, then define the evidence that it is actually happening.",
        ],
      },
    ],
    thumbnail: EssayEvalThumbnail,
  },
];

export const aiPracticeItems: EssayItem[] = [
  {
    id: "team-of-agents",
    eyebrow: "Essay",
    title: "Product discovery on a weekly clock",
    role: "AI workflow",
    year: "2026",
    askHint: "Why run this as an experiment?",
    askKind: "essay",
    askAnchorPreference: "cursor",
    // Chip facts must sit inside CURATED_CONTEXT_MAX (4000) chars of
    // data-ask-context: every surface that reads it bounds there, see
    // boundAskContext in chatEvents. This essay's context measures 3703, so the
    // whole essay is reachable and a chip may draw on any section, "The kill
    // happened before the PRD" and "What changed is the order" included.
    // A chip also has to be unanswerable from the card face (title, role, year,
    // summary, thumbnail). The summary already prints the weekly workflow, the
    // analysis, and the top-ranked features, so no chip asks those back; they
    // ask what the card cannot show: the 40% figure, what RICE scores, the reach
    // call, the fourteen features the first run produced, the two calibrations
    // the kill surfaced, and the week of waiting the parallel tracks removed.
    // A chip must also name a fact the essay states outright, not one it
    // implies: a chip built on an analogy or an inference failed against the
    // live worker, because the prompt forbids inferring and the model correctly
    // refused to assert what the page never says.
    // A chip must also use the essay's own noun. Asking with a synonym the page
    // does not use returned "I don't know" on the live worker, since the model
    // will not equate two words the page keeps apart.
    askPromptChips: [
      "does the essay say roughly 40% of issues were uncategorized?",
      "what does the pipeline use RICE to score?",
      "did token usage score high mostly on reach?",
    ],
    askFollowUpPromptChips: [
      "how many features did the first run produce?",
      "what did killing the cost estimate surface?",
      "how much waiting did the parallel tracks remove?",
    ],
    summary:
      "Our backlog grew faster than anyone could read it. So I ran an experiment: a weekly agent workflow that analyzes the feedback and draws the top-ranked features.",
    dek:
      "Prioritization and design exploration run in parallel now, so the PRD gets written against something the team has already seen.",
    thumbnail: EssayAgentsThumbnail,
    sections: [
      {
        heading: "Two queues, both stuck",
        body: [
          "Hundreds of open issues, roughly 40% of them uncategorized, with customer context scattered across transcripts and sales calls. It came in faster than anyone could sort it. Before the product team could say which request had the most reach or the least effort, they had to review and categorize the pile themselves, and that review held up everything behind it.",
          "Design sat behind the same queue, one step further back. Exploration waited on the PRD, the PRD waited on prioritization, and by the time a document existed to react to, the discussion happened over words. So I ran it as a workflow experiment. Could feedback analysis run as an analytics pipeline, feedback in and ranked themes out, instead of a reading assignment the team worked through by hand? And would what came back be solid enough to plan against?",
        ],
      },
      {
        heading: "Tickets in, ranked features out",
        body: [
          "Tickets, PRDs, and transcripts go in. Agents cluster them into feature themes, score the themes with RICE, and pass the top ones to a second set that drafts directions and scopes what building them would take. I set the fan-out at three variations per feature, so a top feature arrives as a comparison rather than a proposal.",
          "The first run produced fourteen features, enough to sketch what the product could become. It has run weekly since: three to five new features, plus a re-ranking of everything already in the list as new feedback lands.",
        ],
        visual: <AgentsWorkflowVisual />,
        visualCaption:
          "Tickets, PRDs, and transcripts go in; the first run came back with fourteen features; the team reviews and picks a direction.",
      },
      {
        heading: "One example, read twice",
        body: [
          "Take the token usage request. It looked simple: “show token usage.” Underneath sat a harder question about how much cost a user should see, and when.",
          "It scored high mostly on reach. Cost attaches to every report generation, the product's core action, so it touched the whole active base rather than a subset. High reach against low effort earned it design time over louder but narrower requests.",
        ],
        visual: <AgentsTriptychVisual />,
        visualCaption: "Three generated directions. The comparison was the point.",
      },
      {
        heading: "The kill happened before the PRD",
        body: [
          "The strongest-looking direction showed a confident cost estimate before the user generated a report. On screen it was clean and reassuring. The machine learning engineers could not produce an accurate estimate yet, so the interface was making a promise the model could not keep, and a confident number the system cannot back is worse than no number, because it kills trust.",
          "Killing it surfaced two calibrations no document had made visible. One technical: how confident can the interface be before it outruns what the model can truthfully show. One business: whether usage is metered per person or per team, a pricing question that changes what the number on screen means. Both landed while the feature was still three sketches.",
        ],
      },
      {
        heading: "What changed is the order",
        body: [
          "The two tracks run in parallel now. Analysis arrives on its own clock and the top features arrive already drawn and scoped, so the PRD gets written against something the team has looked at. That removes about a week of waiting from every feature.",
          "Agents are strong at generating possibilities. They are not there yet on two counts: deciding which possibility the rest of the company can stand behind, and taking a direction through the final craft. That is why this workflow produces exploration and not finished design. The call on technical truth, the business model, and user trust stayed mine, and so did the last pass on the screens. What the experiment changed is when design shows up, and how much the team knows before it does.",
        ],
      },
    ],
  },
  {
    id: "persona-golden-dataset",
    eyebrow: "Essay",
    title: "Use personas to build a golden dataset",
    role: "Model evaluations",
    year: "2026",
    askHint: "Why regenerate personas weekly?",
    askKind: "essay",
    askAnchorPreference: "cursor",
    // Chip facts must sit inside CURATED_CONTEXT_MAX (4000) chars of
    // data-ask-context — every surface that reads it bounds there, see
    // boundAskContext in chatEvents. This essay's context is 2699, so all of it
    // is reachable, "What it caught" and "Judgment doesn't automate" included.
    // A chip must also be unanswerable from the card face (title, role, year,
    // summary, thumbnail). The summary now states the premise, the test, and the
    // mixed-language catch, so no chip asks those back; they ask what the card
    // cannot print — what design.md controls, what each situation includes
    // besides the query, the review cost, and the three things the
    // mixed-language query broke.
    // A chip must also name a fact the essay states outright. "what does
    // design.md have to do with personas?" was cut after failing twice against
    // the live worker: the essay offers that link as an analogy ("a persona
    // could work the same way"), and the prompt forbids inferring, so the model
    // correctly refused to assert a connection the page never states.
    // A chip must also use the essay's own noun. "what is in a scenario besides
    // the query?" returned "I don't know" on the live worker because the essay
    // attaches that list to "situations", not "scenario", and the prompt
    // forbids inferring, so the model would not equate the two.
    askPromptChips: [
      "what is design.md used to control?",
      "besides the query, what does each situation include?",
      "how long does the weekly review take?",
    ],
    askFollowUpPromptChips: [
      "what broke when a query mixed two languages?",
      "why do static personas work in most products?",
      "what changes in weeks for a daily AI user?",
    ],
    summary:
      "Static personas say who a user is. I tested whether one built from our interviews and query history could generate what that user would do; the scenarios caught a mixed-language case our hand-written model evaluations missed.",
    dek: "Personas as a spec an agent expands, the way design.md expands into screens nobody drew.",
    thumbnail: EssayPersonaThumbnail,
    sections: [
      {
        heading: "A persona is a stand-in",
        body: [
          "A persona is a stand-in for the user who is not in the room. Write it once and it holds for years, because what someone is trying to get done does not change much.",
          "AI products break that. Goals stay stable, expectations do not: a daily user builds new instincts in weeks, asks longer questions, mixes languages, expects the system to clarify intent and recover when an answer is wrong. The persona still tells me who they are. It stopped telling me what they will do.",
        ],
      },
      {
        heading: "The hypothesis",
        body: [
          "I had already consolidated our design system. The primitives live in design.md, and that file is how we control whether the system scales to screens nobody drew. A persona could work the same way: written as a spec, expanded by an agent into situations I never thought to test. The experiment was whether a persona could stand in for a user well enough to test what the model says.",
        ],
      },
      {
        heading: "What the golden dataset is made of",
        body: [
          "Looking into our data, agents draft personas each week from our interviews, product usage, and past queries, along with the situations each persona would put the product in: the queries that user would type, and what a good answer looks like. From that base the model scales what we already have into as many scenarios as it can generate, and I review what comes back. That reviewed set is our golden dataset, the one our model evaluations run against, and it costs about an hour a week against the six it took by hand.",
        ],
        visual: <PersonaScenarioCards />,
        visualCaption: "Personas became situations the product had to survive.",
      },
      {
        heading: "What it caught",
        body: [
          "The clearest catch came in a language our model evaluations did not cover. Real queries arrived mixed, a sentence in one language with technical terms from another, and that broke three things at once: language detection guessed wrong, our evaluation cases did not include it, and the model answered in the wrong language. Nobody had written that test, because the persona we wrote by hand described a user who typed in one language. Scenarios now feed the model evaluation suite directly, so a shift in behavior becomes a test case that same week.",
        ],
        visual: <PersonaCoverageGrid />,
        visualCaption: "Where research meets the model: shipped, in design, gap.",
      },
      {
        heading: "Judgment doesn't automate",
        body: [
          "Agents overgeneralize, invent quotes, and flatten the specifics that make a scenario real, so I still own the call on whether a persona is accurate and a scenario is plausible. In an AI product the value of a persona is the scenarios it generates. Research written once is already behind.",
        ],
      },
    ],
  },
];

export const essaysById: Record<string, EssayItem> = Object.fromEntries(
  [...aiPracticeItems, ...unlistedEssayItems].map((item) => [item.id, item]),
);
