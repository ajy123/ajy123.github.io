// Site-level grounding for the cursor-chat model. The page copy is intentionally
// sparse, so cursor-local text alone can't answer "who is Joanna / what is her
// work" questions. This profile is injected into every system prompt (see
// buildMessages in CursorChat.tsx) so answers stay grounded in real facts about
// Joanna and this portfolio, regardless of where the cursor sits.
//
// Keep it short and factual. The model has a small context window — dense bullet
// facts ground better than prose. Fill the TODO slots with real detail; the
// model can only be as accurate as what's written here.

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
  // Free-form facts the model may cite: skills, background, what she's looking
  // for, anything a recruiter or designer would ask about.
  facts: string[];
};

const PROFILE: SiteProfile = {
  name: "Joanna Yen",
  role: "Designer and engineer building AI products",
  email: "joannayen24@gmail.com",
  focus: [
    "AI products that hold data rigor and design quality equally",
    "Research, product systems, interface prototypes, and data workflows",
  ],
  work: [
    {
      title: "Brand Identity",
      role: "Solo design + build",
      year: "2026; case study coming soon",
      liveUrl: "https://deeli.ai",
      summary:
        "Built Deeli's brand site and sales kit in a week for our Computex debut, which opened enterprise pilots across semiconductors, aerospace, and industrial research.",
    },
    {
      title: "AI Agent",
      role: "AI systems",
      year: "2026",
      // TODO: what was it, your role, the problem, the outcome.
      summary: "Placeholder — replace with the real case study summary.",
    },
  ],
  facts: [
    "Works across Figma and code.",
    // TODO: add real background, skills, location, what she's looking for, etc.
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
