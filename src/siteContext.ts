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
  role: "Senior product designer",
  email: "joannayen24@gmail.com",
  focus: [
    "AI products that hold data rigor and design quality equally",
    "Research, product systems, interface prototypes, and data workflows",
  ],
  work: [
    {
      title: "From search box to research assistant (Deeli)",
      role: "Design + PM",
      year: "2026",
      liveUrl: "/deeli/",
      summary:
        "A search redesign that narrows what someone means by a word like 'market' before it answers. Queries per active day rose 220% from the internal pilot to launch week 2, measured on the same denominator, and 70% arrived as real questions instead of keywords.",
    },
    {
      title: "Brand Identity",
      role: "Solo design + build",
      year: "2026",
      liveUrl: "https://deeli.ai",
      summary:
        "Built Deeli's brand site and sales kit in a week for Deeli's Computex debut, which opened enterprise pilots across semiconductors, aerospace, and industrial research.",
    },
    {
      title: "From daily paper reports to live device monitoring (Swiftly)",
      role: "Product designer, Data Monitor Team",
      year: "2022",
      liveUrl: "/swiftly/",
      summary:
        "A 0-to-1 dashboard that let transit IT spot failing in-vehicle devices themselves instead of waiting on daily reports. Investigation time fell from 30+ hours to 12–24, and requests to the internal team dropped 20%.",
    },
    {
      title: "Unifying campus maintenance (NYU)",
      role: "Product designer, Maintenance Team",
      year: "2018",
      liveUrl: "/nyu/",
      summary:
        "NYU Client Service staff processed maintenance requests across CSVs and disconnected tools. She replaced that with one work-order platform and measured processing, training, and communication time from launch. First-month turnaround fell roughly 33%, from NYU's own first-month post-launch analytics; the number is early and directional, not an audited figure.",
    },
  ],
  facts: [
    "On Deeli's research assistant, she designed what the AI says and not just the UX and UI around it. She created response patterns the model could adapt to new situations, then tested its answers against expected outputs before shipping. That process taught her to treat model behavior as part of the product experience.",
    "Around 7 years of product design experience since 2015, across enterprise SaaS, governance analytics, transit data, and now AI-native products.",
    "Currently designs and ships at Deeli AI.",
    "Previously: Swiftly (transit data platform, 2020 to 2022), Diligent (news analytics, 2020), New York University (internal maintenance tooling, 2018 to 2019), Blue Fountain Media (2015 to 2017).",
    "Studied data storytelling at Columbia's School of Journalism in 2024.",
    "Works across Figma and code (React, Vue).",
    "Her personas and research regenerate every week because there are user interviews and feedback tickets every week, and that is when the team learns something new about users.",
    "LinkedIn: https://www.linkedin.com/in/joanna-yen. You can point a reader to that link, but you cannot open it, so never describe or quote what it contains.",
    "APAC remote in Taipei; open to relocation.",
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
