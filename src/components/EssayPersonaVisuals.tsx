const GREEN = "#174C3A";
const STROKE = "#171717";
const ACCENT = "#f44800";

// In-essay figure: three scenario cards, each led by a glyph from the
// site's shape alphabet — a triangle for the warning, split stripes for
// two languages in one query, concentric rings for five refinement passes.
export function PersonaScenarioCards() {
  return (
    <div className="essay-scenario-cards">
      <div className="essay-scenario-card">
        <svg
          aria-hidden="true"
          fill="none"
          height="36"
          viewBox="0 0 40 40"
          width="36"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M36 34 H4 L20 6 Z" stroke={STROKE} strokeWidth={1.5} />
        </svg>
        <p className="essay-scenario-title">Vague query</p>
        <p className="essay-scenario-desc">
          Needs clarification before the answer runs.
        </p>
      </div>
      <div className="essay-scenario-card">
        <svg
          aria-hidden="true"
          fill="none"
          height="36"
          viewBox="0 0 40 40"
          width="36"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g stroke={STROKE} strokeWidth={1.5}>
            <line x1="8" x2="8" y1="6" y2="34" />
            <line x1="13" x2="13" y1="6" y2="34" />
            <line x1="18" x2="18" y1="6" y2="34" />
            <line x1="23" x2="23" y1="6" y2="34" />
            <line x1="28" x2="28" y1="6" y2="34" />
          </g>
          <line stroke={GREEN} strokeWidth={2} x1="8" x2="32" y1="34" y2="6" />
        </svg>
        <p className="essay-scenario-title">Mixed-language query</p>
        <p className="essay-scenario-desc">
          Two languages, borrowed technical terms.
        </p>
      </div>
      <div className="essay-scenario-card">
        <svg
          aria-hidden="true"
          fill="none"
          height="36"
          viewBox="0 0 40 40"
          width="36"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g stroke={STROKE} strokeWidth={1.5}>
            <circle cx="20" cy="20" r="17" />
            <circle cx="20" cy="20" r="11.5" />
            <circle cx="20" cy="20" r="6" />
          </g>
          <circle cx="20" cy="20" fill={GREEN} r="2" />
        </svg>
        <p className="essay-scenario-title">Five refinements</p>
        <p className="essay-scenario-desc">
          User tunes output across five passes.
        </p>
      </div>
    </div>
  );
}

type CoverageState = "shipped" | "design" | "gap";

function CoverageMark({ state }: { state: CoverageState }) {
  if (state === "shipped") {
    return (
      <svg fill="none" height="12" viewBox="0 0 14 14" width="12">
        <circle cx="7" cy="7" fill={GREEN} r="5.5" />
      </svg>
    );
  }
  if (state === "design") {
    return (
      <svg fill="none" height="12" viewBox="0 0 14 14" width="12">
        <circle cx="7" cy="7" r="5.25" stroke={STROKE} strokeWidth={1.5} />
      </svg>
    );
  }
  return (
    <svg fill="none" height="12" viewBox="0 0 14 14" width="12">
      <path d="M13 12 H1 L7 2 Z" fill={ACCENT} />
    </svg>
  );
}

const COVERAGE_ROWS: { scenario: string; marks: CoverageState[] }[] = [
  { scenario: "Vague query", marks: ["shipped", "shipped", "shipped"] },
  { scenario: "Mixed-language", marks: ["design", "gap", "gap"] },
  { scenario: "Five refinements", marks: ["shipped", "design", "design"] },
];

// In-essay figure: the persona-to-eval matrix as a coverage grid — rows are
// scenarios, columns are the surfaces they pressure-test, cells are state
// marks. Compact on purpose: it should read at a glance, not scroll.
export function PersonaCoverageGrid() {
  return (
    <div>
      <table className="essay-coverage-table">
        <thead>
          <tr>
            <th scope="col">Scenario</th>
            <th scope="col">UI</th>
            <th scope="col">Model</th>
            <th scope="col">Eval</th>
          </tr>
        </thead>
        <tbody>
          {COVERAGE_ROWS.map((row) => (
            <tr key={row.scenario}>
              <td className="scenario">{row.scenario}</td>
              {row.marks.map((mark, index) => (
                <td key={index}>
                  <CoverageMark state={mark} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="essay-coverage-legend">
        <span>
          <CoverageMark state="shipped" /> shipped
        </span>
        <span>
          <CoverageMark state="design" /> in design
        </span>
        <span>
          <CoverageMark state="gap" /> gap found
        </span>
      </div>
    </div>
  );
}
