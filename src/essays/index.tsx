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
    title: "Designing with a team of agents",
    role: "Research synthesis",
    year: "2026",
    askHint: "What bottleneck needed a team?",
    askKind: "essay",
    askAnchorPreference: "cursor",
    // Chip facts must sit inside the first 2200 chars of data-ask-context —
    // ContextualAskHint truncates there before the chat model sees it. Here the
    // cut falls inside "The productive kill", so that section and "The judgment
    // stayed mine" are out of reach for a chip.
    // A chip also has to be unanswerable from the card face: the grouping of
    // tickets into themes and the fourteen baselines are both printed in the
    // summary, so chips asking those back returned what the reader had just
    // read. RICE and the reach score are the parts of the same paragraphs the
    // card never shows.
    askPromptChips: [
      "does the essay say roughly 40% of issues were uncategorized?",
      "did RICE scoring decide what got design time?",
      "did token usage score high mostly on reach?",
    ],
    askFollowUpPromptChips: [
      "did the output have to be solid enough to plan against?",
      "did the token usage request look simple?",
      "did Joanna treat agents as a temporary design team?",
    ],
    summary:
      "I used agents for the grunt work of research synthesis: grouping hundreds of tickets into themes and drafting fourteen baselines. The judgment calls stayed mine.",
    dek:
      "How I turned messy product context into reviewable design direction, and why the judgment stayed mine.",
    thumbnail: EssayAgentsThumbnail,
    sections: [
      {
        heading: "The bottleneck was never drawing screens",
        body: [
          "It was prioritizing which user feedback to explore first. The work arrives as a mess: hundreds of open issues, roughly 40% of them uncategorized, and customer context scattered across transcripts and sales calls. Feedback came in faster than anyone could read it, and parsing that pile by hand to decide what mattered held up everything after it. The bottleneck was a workflow problem before it was a design problem.",
          "So I ran it as an automation experiment. Could the reading and the ranking happen without me sitting in the middle of them, and would what came back be solid enough for the team to plan against? Anchoring a North Star design still meant knowing which tickets belonged together, what users were really asking for and how that shifted over the past six months, and where the product needed a decision instead of another mockup. I stopped treating agents as one assistant and started treating them as a temporary design team.",
        ],
      },
      {
        heading: "The pipeline: from raw tickets to fourteen baselines",
        body: [
          "I built an agent pipeline that fed the raw material in, grouped tickets into feature themes, then scored the themes with the RICE framework to decide what actually deserved design time. From there I spun up focused agents around specific lenses to generate fourteen baseline options for human review.",
        ],
        visual: <AgentsWorkflowVisual />,
        visualCaption:
          "Tickets, PRDs, and transcripts go in; fourteen baselines come out; one direction ships.",
      },
      {
        heading: "One ticket, read twice",
        body: [
          "One example was the token-usage feature. The request looked simple: “show token usage.” Underneath sat a harder question: how much cost should a user see, and when?",
          "Token usage scored high mostly on reach. Cost is attached to every report generation, the product's core action, so it touched the entire active base rather than a subset. High reach and low effort earned it design time over louder but narrower requests.",
        ],
        visual: <AgentsTriptychVisual />,
        visualCaption: "Three generated directions. The comparison was the point.",
      },
      {
        heading: "The productive kill",
        body: [
          "Then the design did something better than shipping. The strongest-looking direction showed users a confident cost estimate before they generated a report. On screen, it was clean and reassuring. The problem: the ML side couldn't actually produce an accurate estimate yet. The interface was making a promise the model couldn't keep. A confident number the system can't back is worse than no number, because it kills trust.",
          "Killing it surfaced two calibrations no mockup had made visible before. One technical: how confident can the UI be before it outruns what the model can truthfully show? One business: is usage metered per person or per team, a pricing question that changes what the number on screen means. The generated design turned “show token usage” into a real decision. It put engineering and business in the same room and showed everyone exactly where we weren't ready.",
        ],
      },
      {
        heading: "The judgment stayed mine",
        body: [
          "That pattern held across the whole workflow. Agents are good at finding possibilities, and bad at telling you which possibility the rest of the company can actually stand behind. The judgment about technical truth, the business model, and user trust stayed mine. What the agents changed is the starting point: the team reviewed a mapped set of tradeoffs instead of a blank page, and that review put an engineering constraint and a pricing question on the table before anything shipped.",
        ],
      },
    ],
  },
  {
    id: "persona-golden-dataset",
    eyebrow: "Essay",
    title: "Use personas to build a golden dataset",
    role: "Eval datasets",
    year: "2026",
    askHint: "Why regenerate personas weekly?",
    askKind: "essay",
    askAnchorPreference: "cursor",
    // Chip facts must sit inside the first 2200 chars of data-ask-context —
    // ContextualAskHint truncates there before the chat model sees it. For this
    // essay the cut falls mid-sentence in "Personas became situations", so the
    // last two sections are unreachable and no chip may draw on them.
    // A chip must also be unanswerable from the card face (title, role,
    // summary): three of these asked back what the summary already prints —
    // the weekly regeneration, the three things mixed-language broke, and
    // "each becomes a test scenario" — so they returned copy the reader had
    // just finished reading.
    askPromptChips: [
      "are user goals stable while expectations shift?",
      "was the persona already behind the users it described?",
      "did manual research cost 6+ hours a week?",
    ],
    askFollowUpPromptChips: [
      "does a persona written three months ago miss how users now behave?",
      "did users start writing longer, iterative prompts?",
      "do agents extract objections and edge cases too?",
    ],
    summary:
      "In my research workflow, agents update the personas weekly from fresh transcripts and queries. Each becomes a test scenario; one caught mixed-language users breaking language detection, the evals, and the model at once.",
    dek: "Agents refresh our personas every week, and each persona becomes a scenario that tests the design and the model.",
    thumbnail: EssayPersonaThumbnail,
    sections: [
      {
        heading: "Static personas can't keep up",
        body: [
          "I don't fully trust static personas for AI products. Not because user goals change; those are stable. What changes fast is what people expect the AI to do. Someone who uses these tools daily builds new instincts in weeks. They ask longer questions. They mix languages. They expect the system to clarify intent, show its work, and recover when the answer isn't good enough. A persona written three months ago still describes the user's job but quietly misses how that user now expects the product to behave.",
        ],
      },
      {
        heading: "From document to pipeline",
        body: [
          "I saw this the moment we shipped a chat-based report flow. Query behavior shifted fast: users stopped typing one-line searches and started writing longer, iterative prompts. The persona we'd designed against was already behind the users it described. So I stopped treating research as a document and started treating it as a pipeline.",
          "Every week, agents ingest interviews, product data, and past queries to extract personas, jobs, vocabulary, objections, and edge cases. The old version was manual: tag transcripts by hand, read every ticket, assign owners. It cost 6+ hours a week. The workflow cuts that to about an hour, spent reviewing the output and watching how the direction moves over time.",
        ],
      },
      {
        heading: "Personas became situations",
        body: [
          "Speed was a side effect. What I actually wanted was personas I could test against: each one becomes a scenario, and those scenarios pressure-test the design and the model at once. Real queries didn't arrive in clean English. They came mixed, a sentence in one language with technical terms dropped in from another. That broke three things at once: language detection guessed wrong, our eval cases didn't cover it, and the model answered in the wrong language for the user's intent. What looked like a translation bug was actually an entire user the write-once personas had never surfaced. The scenario changed the interface too: instead of letting the system guess, the chat now confirms the response language as part of pinning down intent.",
        ],
        visual: <PersonaScenarioCards />,
        visualCaption: "Personas became situations the product had to survive.",
      },
      {
        heading: "Where research meets the model",
        body: [
          "That's the shift that matters most: in an AI product, the value of a persona is the scenarios it generates. The weekly scenarios feed the eval suite directly, so a change in how users actually behave becomes a test case the model is measured against that same week.",
        ],
        visual: <PersonaCoverageGrid />,
        visualCaption: "Where research meets the model: shipped, in design, gap.",
      },
      {
        heading: "Judgment doesn't automate",
        body: [
          "None of this runs unattended. Agents overgeneralize, invent quotes, and flatten the messy specifics that make a scenario real. So I still own the judgment: is this persona accurate, is this scenario realistic. For AI products, research written once is already behind. Research that regenerates keeps the product honest and keeps the team current with what users expect.",
        ],
      },
    ],
  },
];

export const essaysById: Record<string, EssayItem> = Object.fromEntries(
  [...aiPracticeItems, ...unlistedEssayItems].map((item) => [item.id, item]),
);
