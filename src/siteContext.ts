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
      title: "From search to a research assistant (Deeli)",
      role: "Led design + part PM, team of 5",
      year: "2026",
      liveUrl: "/deeli/",
      summary:
        "A research assistant that pins down intent before it answers and shows its work as it builds. Keyword search became consult-grade reports, and time-to-report fell 50%+.",
    },
    {
      title: "Brand Identity",
      role: "Solo design + build",
      year: "2026",
      liveUrl: "https://deeli.ai",
      summary:
        "Built Deeli's brand site and sales kit in a week for our Computex debut, which opened enterprise pilots across semiconductors, aerospace, and industrial research.",
    },
    {
      title: "From daily paper reports to live device monitoring (Swiftly)",
      role: "Product designer, cross-functional team of 5",
      year: "2022",
      liveUrl: "/swiftly/",
      summary:
        "A 0-to-1 dashboard that let transit IT spot failing in-vehicle devices themselves instead of waiting on daily reports. Investigation time fell from 30+ hours to 12–24, and requests to the internal team dropped 20%.",
    },
    {
      title: "Unifying campus maintenance (NYU)",
      role: "Product designer, cross-functional team of 6",
      year: "2018",
      liveUrl: "/nyu/",
      summary:
        "NYU Client Service staff processed maintenance requests across CSVs and disconnected tools. I replaced that with one work-order platform and measured processing, training, and communication time from launch. First-month turnaround fell roughly 33%.",
    },
  ],
  facts: [
    "Around 7 years of product design experience since 2015, across enterprise SaaS, governance analytics, transit data, and now AI-native products.",
    "Previously: Swiftly (transit data platform, 2020 to 2022), Diligent (news analytics, 2020), New York University (internal maintenance tooling, 2018 to 2019), Blue Fountain Media (2015 to 2017).",
    "Studied data storytelling at Columbia's School of Journalism in 2024.",
    "Works across Figma and code (React, Vue).",
    "Open to relocating to Singapore.",
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
