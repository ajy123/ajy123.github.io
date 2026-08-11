// Site-level grounding for the cursor-chat model. The page copy is intentionally
// sparse, so cursor-local text alone can't answer "who is Joanna / what is her
// work" questions. This profile is injected into every system prompt (see
// buildMessages in CursorChat.tsx) so answers stay grounded in real facts about
// Joanna and this portfolio, regardless of where the cursor sits.
//
// Keep it short and factual. The model has a small context window — dense bullet
// facts ground better than prose. Every line is a claim the model may repeat to
// a recruiter, so it can only be as accurate as what's written here.

type SiteProfile = {
  name: string;
  role: string;
  email: string;
  focus: string[];
  work: {
    title: string;
    role: string;
    year: string;
    liveUrl?: string;
    summary: string;
  }[];
  // Free-form facts the model may cite: experience, background, skills, and how
  // she works. Scoped to her experience and introduction only, so nothing here
  // states what kind of role she is looking for.
  facts: string[];
};

const PROFILE: SiteProfile = {
  name: "Joanna Yen",
  role: "Senior product designer. AI and search, in complex B2B.",
  email: "joannayen24@gmail.com",
  focus: [
    "AI products that hold data rigor and design quality equally",
    "Search and research tools for complex B2B work: research, product systems, interface prototypes, and data workflows",
  ],
  work: [
    {
      title: "From search box to research assistant (Deeli)",
      role: "Only designer, research to launch",
      year: "2026",
      liveUrl: "/deeli/",
      summary:
        "Search that clears up an ambiguous query, a word like 'market', before it answers. Queries per active day rose 220% from the internal pilot to launch week 2, and real questions instead of keywords went from 13% to 70%.",
    },
    {
      title: "Brand Identity",
      role: "Solo design + build",
      year: "2026",
      liveUrl: "https://deeli.ai",
      summary:
        "Built Deeli's brand site and sales kit in a week for Deeli's Computex debut, where the enterprise pilot conversations started: semiconductors, aerospace, industrial research.",
    },
    {
      title: "From daily paper reports to live device monitoring (Swiftly)",
      role: "Product designer, research to launch",
      year: "2022",
      liveUrl: "/swiftly/",
      summary:
        "A 0-to-1 dashboard that let transit IT spot failing in-vehicle devices themselves instead of waiting on daily reports. Investigation time fell from 30+ hours to 12–24, and requests to the internal team dropped 20%.",
    },
    {
      title: "Unifying campus maintenance (NYU)",
      role: "Product designer, research to launch",
      year: "2018",
      liveUrl: "/nyu/",
      summary:
        "NYU Client Service staff processed maintenance requests across CSVs and disconnected tools. She replaced that with one work-order platform. The team set the measurement plan before launch and instrumented all three metrics on day one: turnaround, training, and communication time. Average work-request turnaround was the first to report back, down roughly 33% in the first month on Joanna's own post-launch analytics. That number is early and directional, not an audited figure.",
    },
  ],
  facts: [
    "On Deeli's research assistant, she designed what the AI says and not just the UX and UI around it. She created response patterns the model could adapt to new situations, then tested its answers against expected outputs before shipping. That process taught her to treat model behavior as part of the product experience.",
    "No evaluation catches every edge case in what an AI generates.",
    "Queries typed in mixed English and Mandarin came back in the wrong language, and the evaluation cases had not covered that. She worked with the ML engineer on the options against a short timeline and a small scope: improve the Chinese output, prompt the reader to switch, or say plainly that English returns the best result.",
    "Every claim in a Deeli report shows the source it came from, so the reader can check it and flag a claim that is wrong or a source that does not belong.",
    "Deeli's intent parser reads the query to work out which kind of reader is asking, then asks the one clarification that reader's definition needs. A word like market means one thing to a deep tech researcher and another to a deep tech VC, and each definition opens a different question.",
    "When the product team proposed thumbs up and down on each citation, she flagged that a thumbs down can mean several different things and gives the model nothing to act on. She went to the engineers for what the model needs from the signal and to users for what they expect the buttons to mean in a research assistant.",
    "Around 7 years of product design experience across enterprise SaaS, governance analytics, transit data, and now AI-native products.",
    "Currently designs and ships at Deeli AI, where she started in August 2025.",
    "At Deeli she is the only designer and their first full-time product design hire.",
    "Previously: Swiftly (transit data platform, 2020 to 2022), Diligent (news analytics, 2020), New York University (internal maintenance tooling, 2018 to 2019), Blue Fountain Media (2015 to 2017).",
    "At Swiftly the ask was a better daily report, but agencies across the US and Europe triage differently, so a better report would only have helped the ones that already had one. She pushed back and built one consolidated view where in-service status leads, since that is the one thing IT scans for.",
    "On Swiftly, the team set the under-12-hour target deliberately ambitious. Investigation time still fell from 30+ hours to 12–24, so landing short of that target was a large improvement rather than a failure. The miss also taught the team that a single investigation-time target measured the wrong thing.",
    "Joanna's read on why staff took to WorkLink: it replaced the CSV files and the software-hopping with one record in one system, so nobody had to check several places to be sure a maintenance request reached the right team.",
    "On NYU, two sign-off loops ran before launch: ops staff reviewed the workflow and engineering reviewed the specs. Three metrics were instrumented at launch, turnaround, training, and communication time, on a measurement plan set before shipping.",
    "Studied data storytelling at Columbia's School of Journalism in 2024.",
    "She is a designer who writes code. She works in Figma and in React and Vue, and what she designs is usually what ships. Building is part of how she designs, so 'designer' is the right title for her and 'engineer' is not.",
    "She usually owns work end to end, but decisions are reached by consensus rather than made alone. She writes out the reasoning behind each decision and tracks it against data.",
    "Her personas and research regenerate every week because there are user interviews and feedback tickets every week, and that is when the team learns something new about users.",
    "LinkedIn profile, for a reader who wants more than this page carries: https://www.linkedin.com/in/joanna-yen (link only; its contents are not available here).",
    "APAC remote in Taipei; open to relocation.",
    "AI does the broad pass and she keeps the refinement, because it generates options fast but lacks precise control, so she drops into code for anything that has to be exact.",
    "Her synthesis pipeline turns support tickets and interview transcripts into updated personas, which cut research synthesis from over six hours a week to about one.",
    "That same weekly pipeline also ranks what it reads: agents cluster tickets, PRDs and transcripts into feature themes, score them with RICE, and draft directions for the top ones. One workflow, not two.",
    "The ranking half produced fourteen features on its first run and now adds three to five a week while re-ranking the rest.",
    "Because the directions exist before the PRD is written, design stops waiting on the document and about a week of waiting comes out of every feature.",
    "Her design system at Deeli is one consolidated system, maintained by the only designer on the team, with the interface described as design primitives in design.md so the AI can adapt them to cases nobody drew, and that same document doubles as the engineering handoff.",
    "To put more evidence behind what real users already told her, she runs personas built from interviews and in-product feedback through AI-generated scenarios, which widens coverage beyond the users she can reach directly.",
    "Experts can tell when generated content is wrong because they have the domain knowledge to catch it, so trust patterns that survive a deep tech researcher are conservative by construction and transfer down to less expert readers rather than up.",
    "She put an evidence tab inside the tooltip, A/B tested it, and it lost, so it was cut and layered disclosure won instead, overview first and then methodology.",
    "Interviews said VCs and engineers wanted different sections of the report, so rather than ask again she replaced a hidden Basic/Advanced toggle with section-level buttons and let the clicks answer it.",
    "When she and the PM disagreed about whether asking readers for input up front would cause abandonment, she had already tested search with filters and found nobody used them, so the guidance shipped.",
  ],
};

// Compiled once into the dense text block the model reads. Lives at module load
// so buildMessages stays cheap on every send.
export const SITE_CONTEXT: string = [
  `About the site owner:`,
  `- Name: ${PROFILE.name}`,
  `- Role: ${PROFILE.role}`,
  `- Contact: ${PROFILE.email}`,
  `- Focus:`,
  ...PROFILE.focus.map((f) => `  - ${f}`),
  `- Selected work:`,
  ...PROFILE.work.map(
    (w) =>
      `  - ${w.title} (${w.year}; role: ${w.role}${w.liveUrl ? `; live: ${w.liveUrl}` : ""}): ${w.summary}`,
  ),
  `- Other facts:`,
  ...PROFILE.facts.map((f) => `  - ${f}`),
].join("\n");

// Budget: <= 8000 characters. This block grew from 4388 to 7383 chars without
// anything failing loudly, and it is injected into every request on every page,
// so it is subtracted from the same 24,000-char request budget the case digests
// are measured against. It gets the same guard they have.
if (import.meta.env.DEV && SITE_CONTEXT.length > 8000) {
  // eslint-disable-next-line no-console
  console.error(
    `SITE_CONTEXT is ${SITE_CONTEXT.length} chars, over the 8000-char budget. Trim before shipping.`,
  );
}
