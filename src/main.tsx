import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

type RelatedWork = {
  title: string;
  summary: string;
};

type Experience = {
  dates: string;
  organization: string;
  role: string;
  location: string;
  summary: string;
  relatedWork?: RelatedWork[];
};

const experience: Experience[] = [
  {
    dates: "2025–Present",
    organization: "Deeli AI",
    role: "Founding Product Designer",
    location: "Taipei",
    summary:
      "Solo designer for an AI-native deep-tech research platform, working end to end with a five-engineer team.",
    relatedWork: [
      {
        title: "Research assistant",
        summary:
          "Reframed enterprise search around intent, clarification, and inspectable sources. Natural-language queries rose from 13% to 70%, and queries per active day rose roughly 220%.",
      },
      {
        title: "Brand identity",
        summary:
          "Built the brand site and sales kit in one week for Deeli’s Computex debut.",
      },
    ],
  },
  {
    dates: "2020–2022",
    organization: "Swiftly",
    role: "Product Designer",
    location: "New York",
    summary:
      "Led discovery, information architecture, and shipped product design for transit data tools used by more than 190 agencies.",
    relatedWork: [
      {
        title: "Live device monitoring",
        summary:
          "Designed a 0-to-1 dashboard that cut investigation time from more than 30 hours to 12–24 hours and reduced device-issue requests 20%.",
      },
    ],
  },
  {
    dates: "Summer 2020",
    organization: "Diligent",
    role: "Product Designer · Contract",
    location: "New York",
    summary:
      "Redesigned a news analytics product for governance, risk, and compliance using research and A/B testing.",
  },
  {
    dates: "2018–2019",
    organization: "New York University",
    role: "Product Designer",
    location: "New York",
    summary:
      "Led service design across campus IT, finance, and maintenance workflows for 50,000 users.",
    relatedWork: [
      {
        title: "Unified work-order platform",
        summary:
          "Replaced CSVs and disconnected tools with one system. Average request turnaround fell roughly 33% in the first month.",
      },
    ],
  },
  {
    dates: "2015–2017",
    organization: "Blue Fountain Media",
    role: "Associate UX Designer",
    location: "New York",
    summary:
      "Turned research into information architecture, user journeys, and tested product designs for Fortune 500 clients.",
  },
];

function SectionHeading({ children, id }: { children: string; id: string }) {
  return (
    <h2 className="section-heading" id={id}>
      {children}
    </h2>
  );
}

function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <main className="site-shell" id="main-content">
        <header className="profile-header">
          <div className="identity">
            <h1>Joanna Yen</h1>
            <p className="profile-title">Senior Product Designer</p>
            <p className="profile-location">Taipei · Singapore</p>
          </div>

          <div className="introduction">
            <p>
              I design AI and agents for complex B2B work, from model behavior
              and research through to the shipped interface. My work turns
              ambiguous, high-stakes workflows into systems people can
              understand, inspect, and use.
            </p>
          </div>

          <nav className="contact-links" aria-label="Contact">
            <a href="mailto:joannayen24@gmail.com">Email</a>
            <a
              href="https://www.linkedin.com/in/joanna-yen"
              rel="noreferrer"
              target="_blank"
            >
              LinkedIn <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </header>

        <section className="profile-section" aria-labelledby="experience">
          <SectionHeading id="experience">Experience</SectionHeading>
          <div className="entry-list">
            {experience.map((item) => (
              <article className="entry experience-entry" key={item.organization}>
                <div className="entry-meta">
                  <p>{item.dates}</p>
                  <p>{item.location}</p>
                </div>
                <div className="entry-body">
                  <h3>{item.organization}</h3>
                  <p className="entry-role">{item.role}</p>
                  <p className="entry-summary">{item.summary}</p>
                  {item.relatedWork ? (
                    <div
                      className="related-work"
                      aria-label={`Related work at ${item.organization}`}
                    >
                      <p className="related-work-label">Related work</p>
                      {item.relatedWork.map((work) => (
                        <div className="related-work-item" key={work.title}>
                          <h4>{work.title}</h4>
                          <p>{work.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="site-footer">
          <p>© 2026 Joanna Yen</p>
        </footer>
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
