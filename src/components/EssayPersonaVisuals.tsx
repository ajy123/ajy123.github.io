import { useState } from "react";
import type { CSSProperties } from "react";
import { useFigureReveal } from "../essays/figureReveal";

// A touch fires pointerenter on the same tap that fires click, so the pointer
// handlers below stay mouse-only and taps go through onClick instead.
const isMouse = (event: { pointerType?: string }) => event.pointerType === "mouse";

const GREEN = "#174C3A";
const STROKE = "#171717";
const ACCENT = "#f44800";

// In-essay figure: three scenario cards, each led by a glyph from the
// site's shape alphabet — a triangle for the warning, split stripes for
// two languages in one query, concentric rings for five refinement passes.
//
// Two behaviors, and they compose: on arrival each glyph strokes itself on,
// which is the section's claim that an agent generated these rather than that
// they were always there. At rest, pointing at a card makes its glyph act out
// the scenario it stands for.
export function PersonaScenarioCards() {
  const { ref, state } = useFigureReveal<HTMLDivElement>();

  return (
    <div className="essay-scenario-cards" data-reveal={state} ref={ref}>
      <div className="essay-scenario-card" style={{ "--card-delay": "0ms" } as CSSProperties}>
        <svg
          aria-hidden="true"
          className="essay-glyph"
          fill="none"
          height="36"
          viewBox="0 0 40 40"
          width="36"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="glyph-draw glyph-warn"
            d="M36 34 H4 L20 6 Z"
            pathLength={1}
            stroke={STROKE}
            strokeWidth={1.5}
            style={{ "--draw-delay": "160ms" } as CSSProperties}
          />
        </svg>
        <p className="essay-scenario-title">Vague query</p>
        <p className="essay-scenario-desc">
          Needs clarification before the answer runs.
        </p>
      </div>
      <div className="essay-scenario-card" style={{ "--card-delay": "90ms" } as CSSProperties}>
        <svg
          aria-hidden="true"
          className="essay-glyph"
          fill="none"
          height="36"
          viewBox="0 0 40 40"
          width="36"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Split into a group of two and a group of three: on hover they
              drift apart, which is the one query carrying two languages. */}
          <g className="glyph-split-a" stroke={STROKE} strokeWidth={1.5}>
            <line className="glyph-draw" pathLength={1} style={{ "--draw-delay": "250ms" } as CSSProperties} x1="8" x2="8" y1="6" y2="34" />
            <line className="glyph-draw" pathLength={1} style={{ "--draw-delay": "300ms" } as CSSProperties} x1="13" x2="13" y1="6" y2="34" />
          </g>
          <g className="glyph-split-b" stroke={STROKE} strokeWidth={1.5}>
            <line className="glyph-draw" pathLength={1} style={{ "--draw-delay": "350ms" } as CSSProperties} x1="18" x2="18" y1="6" y2="34" />
            <line className="glyph-draw" pathLength={1} style={{ "--draw-delay": "400ms" } as CSSProperties} x1="23" x2="23" y1="6" y2="34" />
            <line className="glyph-draw" pathLength={1} style={{ "--draw-delay": "450ms" } as CSSProperties} x1="28" x2="28" y1="6" y2="34" />
          </g>
          <line
            className="glyph-draw glyph-sweep"
            pathLength={1}
            stroke={GREEN}
            strokeWidth={2}
            style={{ "--draw-delay": "560ms" } as CSSProperties}
            x1="8"
            x2="32"
            y1="34"
            y2="6"
          />
        </svg>
        <p className="essay-scenario-title">Mixed-language query</p>
        <p className="essay-scenario-desc">
          Two languages, borrowed technical terms.
        </p>
      </div>
      <div className="essay-scenario-card" style={{ "--card-delay": "180ms" } as CSSProperties}>
        <svg
          aria-hidden="true"
          className="essay-glyph"
          fill="none"
          height="36"
          viewBox="0 0 40 40"
          width="36"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Two offset ripples read as passes leaving the centre; they only
              run while the card is pointed at. */}
          <circle className="glyph-ripple" cx="20" cy="20" r="17" stroke={GREEN} strokeWidth={1.5} style={{ "--ripple-delay": "0ms" } as CSSProperties} />
          <circle className="glyph-ripple" cx="20" cy="20" r="17" stroke={GREEN} strokeWidth={1.5} style={{ "--ripple-delay": "470ms" } as CSSProperties} />
          <g stroke={STROKE} strokeWidth={1.5}>
            <circle className="glyph-draw" cx="20" cy="20" pathLength={1} r="17" style={{ "--draw-delay": "340ms" } as CSSProperties} />
            <circle className="glyph-draw" cx="20" cy="20" pathLength={1} r="11.5" style={{ "--draw-delay": "420ms" } as CSSProperties} />
            <circle className="glyph-draw" cx="20" cy="20" pathLength={1} r="6" style={{ "--draw-delay": "500ms" } as CSSProperties} />
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

function CoverageMark({
  state,
  animated = false,
  delay = 0,
}: {
  state: CoverageState;
  animated?: boolean;
  delay?: number;
}) {
  const className = animated ? `cov-mark cov-mark-${state}` : undefined;
  const style = animated
    ? ({ "--mark-delay": `${delay}ms` } as CSSProperties)
    : undefined;

  if (state === "shipped") {
    return (
      <svg fill="none" height="12" viewBox="0 0 14 14" width="12">
        <circle className={className} cx="7" cy="7" fill={GREEN} r="5.5" style={style} />
      </svg>
    );
  }
  if (state === "design") {
    return (
      <svg fill="none" height="12" viewBox="0 0 14 14" width="12">
        <circle
          className={className}
          cx="7"
          cy="7"
          r="5.25"
          stroke={STROKE}
          strokeWidth={1.5}
          style={style}
        />
      </svg>
    );
  }
  return (
    <svg fill="none" height="12" viewBox="0 0 14 14" width="12">
      <path className={className} d="M13 12 H1 L7 2 Z" fill={ACCENT} style={style} />
    </svg>
  );
}

const COLUMNS = ["UI", "Model", "Evaluation"];

const STATE_LABELS: Record<CoverageState, string> = {
  shipped: "shipped",
  design: "in design",
  gap: "gap found",
};

// Notes exist only where the essay states what actually broke — the
// mixed-language row. The other six cells say no more than their mark and
// their column already do, so they get no readout rather than invented copy.
const COVERAGE_ROWS: {
  scenario: string;
  marks: CoverageState[];
  notes: (string | null)[];
  // Gap marks land after everything else has settled, so the finding is the
  // last thing to arrive and the only thing still moving.
  delays: number[];
}[] = [
  {
    scenario: "Vague query",
    marks: ["shipped", "shipped", "shipped"],
    notes: [null, null, null],
    delays: [120, 180, 240],
  },
  {
    scenario: "Mixed-language",
    marks: ["design", "gap", "gap"],
    notes: [
      "Language detection guessed wrong.",
      "The model answered in the wrong language.",
      "Nobody had written that test.",
    ],
    delays: [300, 1400, 1560],
  },
  {
    scenario: "Five refinements",
    marks: ["shipped", "design", "design"],
    notes: [null, null, null],
    delays: [420, 480, 540],
  },
];

const LEGEND: { state: CoverageState; label: string }[] = [
  { state: "shipped", label: "shipped" },
  { state: "design", label: "in design" },
  { state: "gap", label: "gap found" },
];

// In-essay figure: the persona-to-eval matrix as a coverage grid — rows are
// scenarios, columns are the surfaces they pressure-test, cells are state
// marks. Compact on purpose: it should read at a glance, not scroll.
//
// Two behaviors, and they compose: on arrival the rows sweep in and the two
// gap marks land last, alone, after a deliberate hold. At rest it reads like a
// table — the row under the pointer lifts, and pointing at a legend key drops
// every mark that is not in that state.
export function PersonaCoverageGrid() {
  const { ref, state } = useFigureReveal<HTMLDivElement>();
  const [filter, setFilter] = useState<CoverageState | null>(null);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div
      className="essay-coverage"
      data-filter={filter ?? undefined}
      data-reveal={state}
      ref={ref}
    >
      <table className="essay-coverage-table">
        <thead>
          <tr>
            <th scope="col">Scenario</th>
            {COLUMNS.map((column) => (
              <th key={column} scope="col">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COVERAGE_ROWS.map((row, rowIndex) => (
            <tr key={row.scenario} style={{ "--row-delay": `${rowIndex * 110}ms` } as CSSProperties}>
              <td className="scenario">{row.scenario}</td>
              {row.marks.map((mark, index) => {
                const cellNote = row.notes[index];
                return (
                  <td
                    key={index}
                    // A focusable cell holding only an unlabelled <svg> is a
                    // silent stop; the label carries the whole cell — scenario,
                    // surface, state, and what broke.
                    aria-label={
                      cellNote
                        ? `${row.scenario}, ${COLUMNS[index]}: ${STATE_LABELS[mark]}. ${cellNote}`
                        : `${row.scenario}, ${COLUMNS[index]}: ${STATE_LABELS[mark]}`
                    }
                    onBlur={cellNote ? () => setNote(null) : undefined}
                    onClick={
                      cellNote
                        ? () => setNote((current) => (current === cellNote ? null : cellNote))
                        : undefined
                    }
                    onFocus={cellNote ? () => setNote(cellNote) : undefined}
                    onPointerEnter={
                      cellNote ? (event) => { if (isMouse(event)) setNote(cellNote); } : undefined
                    }
                    onPointerLeave={
                      cellNote ? (event) => { if (isMouse(event)) setNote(null); } : undefined
                    }
                    tabIndex={cellNote ? 0 : undefined}
                  >
                    <CoverageMark animated delay={row.delays[index]} state={mark} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="essay-coverage-legend">
        {LEGEND.map((key) => (
          <button
            key={key.state}
            className="essay-coverage-key"
            onBlur={() => setFilter(null)}
            onClick={() => setFilter((current) => (current === key.state ? null : key.state))}
            onFocus={() => setFilter(key.state)}
            onPointerEnter={(event) => { if (isMouse(event)) setFilter(key.state); }}
            onPointerLeave={(event) => { if (isMouse(event)) setFilter(null); }}
            type="button"
          >
            <CoverageMark state={key.state} /> {key.label}
          </button>
        ))}
      </div>
      {/* The cell's own aria-label already carries its note, so this readout
          serves sighted pointer users; aria-hidden stops it being announced a
          second time when the cell takes focus. */}
      <p
        aria-hidden="true"
        className="essay-figure-note"
        data-shown={note !== null}
      >
        {note ?? " "}
      </p>
    </div>
  );
}
