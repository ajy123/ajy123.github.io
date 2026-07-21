// Essay copy + visuals — the single source of truth for the "AI practice"
// essays. Moved out of main.tsx so the landing page and the /deeli/ chat
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

export const aiPracticeItems: EssayItem[] = [
  {
    id: "eval-is-the-spec",
    eyebrow: "Essay",
    title: "The eval is the spec",
    role: "Applied AI",
    year: "2026",
    askHint: "Ask why evals became the spec",
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
      "You can design a report's layout and citations — but not the sentences a model writes fresh every time. So the eval becomes the spec — it's how I define product quality.",
    dek:
      "In AI products, the interface is only half the spec. The other half is the test that tells the model what good work means.",
    sections: [
      {
        heading: "The hard part is the part that changes",
        body: [
          "A conventional product spec can describe a report screen with exact states: what loads, what fails, what the citation chip looks like, what the empty state says. That still matters.",
          "But the most important surface in an AI product is often generated fresh every run. The paragraph, recommendation, synthesis, or follow-up question is not a static component. It is behavior.",
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
          "Instead of arguing whether an answer feels smart, the team can ask what failure mode it triggered. Instead of polishing one golden demo, the team can test the shape of quality across messy inputs.",
          "For me, that is the practical bridge between design and AI systems: define the experience, then define the evidence that the experience is actually happening.",
        ],
      },
    ],
    takeaway:
      "The UI shows the promise. The eval proves whether the product can keep it.",
    thumbnail: EssayEvalThumbnail,
  },
  {
    id: "team-of-agents",
    eyebrow: "Essay",
    title: "Designing with a team of agents",
    role: "Applied AI",
    year: "2026",
    askHint: "Ask how agents earned design time",
    askKind: "essay",
    askAnchorPreference: "cursor",
    // Chip facts must sit inside the first 2200 chars of data-ask-context —
    // ContextualAskHint truncates there before the chat model sees it.
    askPromptChips: [
      "does the essay say roughly 40% of issues were uncategorized?",
      "did agents group tickets into themes and score them with RICE?",
      "did agents generate fourteen baseline options?",
    ],
    askFollowUpPromptChips: [
      "was the bottleneck deciding which screens were worth drawing?",
      "did the token usage request look simple?",
      "did Joanna treat agents as a temporary design team?",
    ],
    summary:
      "I ran agents as a temporary design team — grouping hundreds of tickets into themes, scoring them with RICE, generating fourteen baselines — and kept the judgment human.",
    dek:
      "How I turned messy product context into reviewable design direction — and why the judgment stayed mine.",
    thumbnail: EssayAgentsThumbnail,
    sections: [
      {
        heading: "The bottleneck was never drawing screens",
        body: [
          "It was deciding which screens were worth drawing. On an AI research product, the work arrives as a mess: hundreds of open issues, roughly 40% of them uncategorized, customer context scattered across transcripts and sales calls, and product questions that look small until you read them twice.",
          "To help the team anchor a North Star design, I had to understand which tickets belonged together, what users were really asking for and how that shifted over the past six months, and where the product needed a decision instead of another mockup. So I stopped treating agents as one assistant and started treating them as a temporary design team.",
        ],
      },
      {
        heading: "Agents went wide. Judgment went right.",
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
          "One example was the token-usage feature. The request looked simple — “show token usage.” The real question underneath was not simple: how much cost should a user see, and when?",
          "Token usage scored high mostly on reach: cost isn't a corner feature, it's attached to every report generation — the product's core action — so it touched the entire active base, not a subset. High reach, low effort. That's what earned it design time over louder but narrower requests.",
        ],
        visual: <AgentsTriptychVisual />,
        visualCaption: "Three generated directions. The comparison was the point.",
      },
      {
        heading: "The productive kill",
        body: [
          "Then the design did something better than shipping. The strongest-looking direction showed users a confident cost estimate before they generated a report. On screen, it was clean and reassuring. The problem: the ML side couldn't actually produce an accurate estimate yet. The interface was making a promise the model couldn't keep — and a confident number the system can't back is worse than no number, because it kills trust.",
          "Killing it surfaced two calibrations no mockup had made visible before. One technical: how confident can the UI be before it outruns what the model can truthfully show? One business: is usage even metered per person or per team — a pricing question that changes what the number on screen means. The generated design turned “show token usage” into a real decision, grounding engineering and business in the same room — and showing everyone exactly where we weren't ready.",
        ],
      },
      {
        heading: "The judgment stayed mine",
        body: [
          "That's the shape of the whole workflow. Agents find the possibilities. What they can't do is tell you which possibility the rest of the company can actually stand behind. That judgment — technical truth, business model, trust — stayed mine. The agents got me to it faster, from a mapped set of tradeoffs instead of a blank page.",
        ],
      },
    ],
    takeaway:
      "Agents mapped the tradeoffs. The judgment — technical truth, business model, trust — stayed mine.",
  },
  {
    id: "persona-golden-dataset",
    eyebrow: "Essay",
    title: "Use personas to build a golden dataset",
    role: "Applied AI",
    year: "2026",
    askHint: "Ask why personas regenerate weekly",
    askKind: "essay",
    askAnchorPreference: "cursor",
    // Chip facts must sit inside the first 2200 chars of data-ask-context —
    // ContextualAskHint truncates there before the chat model sees it.
    askPromptChips: [
      "do agents regenerate personas every week?",
      "did mixed-language queries break three things at once?",
      "did manual research cost 6+ hours a week?",
    ],
    askFollowUpPromptChips: [
      "does a persona written three months ago miss how users now behave?",
      "did users start writing longer, iterative prompts?",
      "does each persona become a scenario to test against?",
    ],
    summary:
      "Every week agents regenerate personas from transcripts, product data, and past queries — each one becomes a scenario the design and the model must survive.",
    dek: "How weekly research became living scenarios — and evals.",
    thumbnail: EssayPersonaThumbnail,
    sections: [
      {
        heading: "Static personas can't keep up",
        body: [
          "I don't fully trust static personas for AI products. Not because user goals change — they're stable. What changes fast is what people expect the AI to do. Someone who uses these tools daily builds new instincts in weeks. They ask longer questions. They mix languages. They expect the system to clarify intent, show its work, and recover when the answer isn't good enough. A persona written three months ago still describes the user's job but quietly misses how that user now expects the product to behave.",
        ],
      },
      {
        heading: "From document to pipeline",
        body: [
          "I saw this the moment we shipped a chat-based report flow. Query behavior shifted fast: users stopped typing one-line searches and started writing longer, iterative prompts. The persona we'd designed against was already behind the users it described. So I stopped treating research as a document and started treating it as a pipeline.",
          "Every week, agents ingest interviews, product data, and past queries to extract personas, jobs, vocabulary, objections, and edge cases. The old version was manual: tag transcripts by hand, read every ticket, assign owners. It cost 6+ hours a week. The workflow cuts that to about an hour — reviewing the output and watching how the direction moves over time.",
        ],
      },
      {
        heading: "Personas became situations",
        body: [
          "The goal isn't speed. It's that the personas turn into something I can test against. Each one becomes a scenario, and those scenarios pressure-test the design and the model at once. Real queries didn't arrive in clean English. They came mixed — a sentence in one language with technical terms dropped in from another. That broke three things at once: language detection guessed wrong, our eval cases didn't cover it, and the model answered in the wrong language for the user's intent. It wasn't a translation feature. It was an entire user the write-once personas had never surfaced. The scenario also changed the interface: instead of letting the system guess, the chat now confirms the response language as part of pinning down intent.",
        ],
        visual: <PersonaScenarioCards />,
        visualCaption: "Personas became situations the product had to survive.",
      },
      {
        heading: "Where research meets the model",
        body: [
          "That's the shift that matters most: in an AI product, a persona isn't a portrait — it's a scenario generator. The weekly scenarios feed the eval suite directly, so a change in how users actually behave becomes a test case the model is measured against that same week.",
        ],
        visual: <PersonaCoverageGrid />,
        visualCaption: "Where research meets the model — shipped, in design, gap.",
      },
      {
        heading: "Judgment doesn't automate",
        body: [
          "None of this runs unattended. Agents overgeneralize, invent quotes, and flatten the messy specifics that make a scenario real. So I still own the judgment: is this persona accurate, is this scenario realistic. For AI products, research written once is already behind. Research that regenerates keeps the product honest — and keeps the team meeting users' expectations while those expectations are still current.",
        ],
      },
    ],
    takeaway:
      "The personas regenerate weekly. The judgment about what's real doesn't automate.",
  },
];

export const essaysById: Record<string, EssayItem> = Object.fromEntries(
  aiPracticeItems.map((item) => [item.id, item]),
);
