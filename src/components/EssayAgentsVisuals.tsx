import { useFigureReveal, useActiveIndex } from "../essays/figureReveal";

const GREEN = "#174C3A";
const STROKE = "#171717";
const ACCENT = "#f44800";
const MUTED = "#757169";
const HAIRLINE = "rgba(31, 30, 29, 0.4)";
const HAIRLINE_FAINT = "rgba(31, 30, 29, 0.16)";

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

const labelProps = {
  fontFamily: MONO,
  fontSize: 8.5,
  letterSpacing: "0.1em",
} as const;

function Label({
  x,
  y,
  children,
  className,
  dim = false,
  anchor = "middle",
}: {
  x: number;
  y: number;
  children: string;
  className?: string;
  dim?: boolean;
  anchor?: "middle" | "start" | "end";
}) {
  return (
    <text
      {...labelProps}
      className={className}
      fill={dim ? MUTED : STROKE}
      textAnchor={anchor}
      x={x}
      y={y}
    >
      {children}
    </text>
  );
}

const STRIPE_XS: number[] = [];
for (let x = 33; x <= 77; x += 5) STRIPE_XS.push(x);

const FEATURE_CELLS = Array.from({ length: 14 }, (_, i) => ({
  x: 300 + (i % 7) * 14,
  y: 58 + Math.floor(i / 7) * 20,
}));

// Each station carries a fact the figure has no room to print. They come from
// the essay's own sentences, not from a fresh reading of the work — a station
// with nothing new to say would make hovering a dead gesture.
// factX/factAnchor exist because a fact is far wider than the ~97px its
// station occupies: centred on the first or last station it would run off the
// viewBox and clip. The two ends anchor to the figure's edges instead.
const STATIONS: {
  label: string;
  sub: string;
  fact: string;
  x: number;
  factX?: number;
  factAnchor?: "start" | "middle" | "end";
}[] = [
  {
    label: "BACKLOG",
    sub: "40% UNSORTED",
    fact: "FASTER THAN ANYONE COULD SORT IT",
    x: 55,
    factX: 0,
    factAnchor: "start",
  },
  { label: "THEMES", sub: "GROUPED", fact: "CLUSTERED INTO FEATURE THEMES", x: 152 },
  { label: "RICE GATE", sub: "SCORED", fact: "THE TOP ONES PASS ON", x: 249 },
  { label: "14 FEATURES", sub: "FIRST RUN", fact: "THREE VARIATIONS EACH", x: 346 },
  { label: "REVIEW", sub: "HUMAN", fact: "THE CALL STAYED MINE", x: 443 },
  {
    label: "DIRECTION",
    sub: "CHOSEN",
    fact: "EXPLORATION, NOT FINISHED DESIGN",
    x: 540,
    factX: 590,
    factAnchor: "end",
  },
];

const LEADS = [
  { x1: 84, x2: 118 },
  { x1: 186, x2: 216 },
  { x1: 281, x2: 294 },
  { x1: 400, x2: 424 },
  { x1: 462, x2: 517 },
];

// Hit areas are wider than the artwork so the whole column — glyph and its two
// labels — is one target. They carry no stroke of their own: the signifier is
// the other five stations dimming, not a box drawn around this one.
const STATION_BOXES = [
  { x: 14, width: 82 },
  { x: 118, width: 68 },
  { x: 216, width: 65 },
  { x: 294, width: 106 },
  { x: 424, width: 38 },
  { x: 517, width: 46 },
];

// In-essay figure: the agent pipeline in the site's shape alphabet.
// Stripes = the unsorted backlog, clustered circles = themes, triangle =
// the RICE gate, fourteen squares = generated features, ringed dot = the
// human review station, green disc = the chosen direction. Not "shipped": the
// essay says outright that the workflow produces exploration and not finished
// design, so the terminal node is the pick, not the release.
//
// Interaction: pointing at a station isolates it, fills the flow behind it,
// and sets a fact the figure has no room to print above the artwork. It does
// not animate on arrival — this is the hero of its essay, and a reader who
// does nothing sees exactly the figure that shipped before.
export function AgentsWorkflowVisual() {
  const { active, setActive, bind } = useActiveIndex();

  return (
    <svg
      className="essay-pipeline"
      viewBox="0 0 640 175"
      role="group"
      aria-label="Pipeline of geometric shapes: striped block for the backlog, three circles for themes, a triangle for the RICE gate, a grid of fourteen small squares for generated features, a ringed dot for human review, and a filled green circle for the chosen direction"
      data-active={active === null ? undefined : active}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") setActive(null); }}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <g transform="translate(25 0)">
        {/* A connector reads as travelled once the station past it is the one
            being inspected — the flow fills in behind the pointer. */}
        <g strokeWidth={1}>
          {LEADS.map((lead, index) => (
            <line
              className="pipe-lead"
              data-filled={active !== null && index < active ? "" : undefined}
              key={lead.x1}
              x1={lead.x1}
              x2={lead.x2}
              y1="76"
              y2="76"
            />
          ))}
        </g>

        {STATIONS.map((station, index) => (
          <g
            className="pipe-station"
            data-on={active === index ? "" : undefined}
            key={station.label}
            role="button"
            tabIndex={0}
            aria-label={`${station.label}: ${station.fact.toLowerCase()}`}
            {...bind(index)}
          >
            <rect
              fill="transparent"
              height="122"
              width={STATION_BOXES[index].width}
              x={STATION_BOXES[index].x}
              y="40"
            />
            {index === 0 ? (
              <g stroke={STROKE} strokeWidth={1.5}>
                {STRIPE_XS.map((x) => (
                  <line key={x} x1={x} y1={54} x2={x} y2={98} />
                ))}
              </g>
            ) : null}
            {index === 1 ? (
              <g stroke={STROKE} strokeWidth={1.5}>
                <circle cx="152" cy="58" r="9" />
                <circle cx="139" cy="85" r="9" />
                <circle cx="165" cy="85" r="9" />
              </g>
            ) : null}
            {index === 2 ? (
              <path d="M273 96 H225 L249 54 Z" stroke={STROKE} strokeWidth={1.5} />
            ) : null}
            {index === 3 ? (
              <g stroke={STROKE} strokeWidth={1.5}>
                {FEATURE_CELLS.map((cell) => (
                  <rect
                    height="9"
                    key={`${cell.x}-${cell.y}`}
                    width="9"
                    x={cell.x}
                    y={cell.y}
                  />
                ))}
              </g>
            ) : null}
            {index === 4 ? (
              <>
                <circle cx="443" cy="76" r="12" stroke={STROKE} strokeWidth={1.5} />
                <circle cx="443" cy="76" r="4" fill={STROKE} />
              </>
            ) : null}
            {index === 5 ? <circle cx="540" cy="76" r="16" fill={GREEN} /> : null}

            {/* The fact sets above the artwork, clear of the label pair below
                it, so an isolated station reads top-down: fact, shape, name. */}
            <text
              {...labelProps}
              className="pipe-fact"
              fill={ACCENT}
              textAnchor={station.factAnchor ?? "middle"}
              x={station.factX ?? station.x}
              y={26}
            >
              {station.fact}
            </text>
            <Label x={station.x} y={140}>{station.label}</Label>
            <Label className="pipe-sub" dim x={station.x} y={152}>{station.sub}</Label>
          </g>
        ))}
      </g>
    </svg>
  );
}

// In-essay figure: three hairline wireframes of the same screen, differing
// only in where the token-cost number lives. The promise row underneath is
// the real comparison — the pre-generation estimate makes the biggest
// promise, marked orange because it's the one the model couldn't keep.
//
// Two behaviors, and they compose: on arrival the three cards land together,
// then the estimate lifts and is struck through, which is the section's
// argument. At rest, pointing at any card isolates it and reads out what that
// direction asked of the system.
//
// Only the killed direction has a fate the essay records, so its line is the
// long one. The other two say what the figure cannot: what each one demands of
// the model to be truthful. Nothing here is asserted that the essay does not.
const TRIPTYCH_NOTES = [
  "Killed before the PRD: the model could not back the number yet.",
  "Never promises a number before the work runs; cost reports as it accrues.",
  "Asks nothing up front; the cost is there when the user looks.",
];

export function AgentsTriptychVisual() {
  const { ref, state } = useFigureReveal<HTMLDivElement>();
  const { active, setActive, bind } = useActiveIndex();

  return (
    <div className="essay-triptych" ref={ref}>
      <svg
        className="essay-triptych-svg"
        viewBox="0 0 640 235"
        role="group"
        aria-label="Three wireframe cards: a modal with a large cost estimate, a screen with a thin top usage bar, and a settings list with usage in a row; a promise rating sits under each. The estimate direction is struck through — it was killed."
        data-reveal={state}
        data-active={active === null ? undefined : active}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") setActive(null); }}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
      >
        <g
          className="trip-card"
          data-i={0}
          data-on={active === 0 ? "" : undefined}
          role="button"
          tabIndex={0}
          aria-label={`Pre-generation estimate, killed. ${TRIPTYCH_NOTES[0]}`}
          {...bind(0)}
        >
          <rect fill="transparent" height="200" width="176" x="27" y="14" />
          <g className="trip-lift">
            <rect height="130" stroke={STROKE} strokeWidth={1.5} width="170" x="30" y="20" />
            <rect height="74" stroke={HAIRLINE} strokeWidth={1} width="106" x="62" y="48" />
            <text
              fill={STROKE}
              fontFamily={MONO}
              fontSize={14}
              letterSpacing="0.1em"
              textAnchor="middle"
              x="115"
              y="80"
            >
              ~1.2K
            </text>
            <Label dim x={115} y={94}>EST. TOKENS</Label>
            <rect fill={ACCENT} height="10" width="66" x="82" y="104" />
          </g>
          <Label x={115} y={172}>PRE-GENERATION ESTIMATE</Label>
          <Label dim x={115} y={186}>PROMISE BEFORE ACTION</Label>
          <text
            {...labelProps}
            fill={ACCENT}
            textAnchor="middle"
            x="115"
            y="208"
          >
            PROMISE: HIGH
          </text>
          <rect className="trip-strike" fill={ACCENT} height="2" width="170" x="30" y="84" />
        </g>
        <g
          className="trip-card"
          data-i={1}
          data-on={active === 1 ? "" : undefined}
          role="button"
          tabIndex={0}
          aria-label={`Persistent top bar. ${TRIPTYCH_NOTES[1]}`}
          {...bind(1)}
        >
          <rect fill="transparent" height="200" width="176" x="232" y="14" />
          <rect height="130" stroke={STROKE} strokeWidth={1.5} width="170" x="235" y="20" />
          <line stroke={HAIRLINE} strokeWidth={1} x1="235" x2="405" y1="38" y2="38" />
          <rect fill={GREEN} height="5" width="44" x="243" y="27" />
          <g stroke={HAIRLINE_FAINT} strokeWidth={1}>
            <line x1="251" x2="389" y1="62" y2="62" />
            <line x1="251" x2="389" y1="82" y2="82" />
            <line x1="251" x2="365" y1="102" y2="102" />
          </g>
          <Label x={320} y={172}>PERSISTENT TOP BAR</Label>
          <Label dim x={320} y={186}>AMBIENT COST</Label>
          <Label x={320} y={208}>PROMISE: MEDIUM</Label>
        </g>
        <g
          className="trip-card"
          data-i={2}
          data-on={active === 2 ? "" : undefined}
          role="button"
          tabIndex={0}
          aria-label={`Usage in settings. ${TRIPTYCH_NOTES[2]}`}
          {...bind(2)}
        >
          <rect fill="transparent" height="200" width="176" x="437" y="14" />
          <rect height="130" stroke={STROKE} strokeWidth={1.5} width="170" x="440" y="20" />
          <g stroke={HAIRLINE_FAINT} strokeWidth={1}>
            <line x1="456" x2="594" y1="50" y2="50" />
            <line x1="456" x2="594" y1="76" y2="76" />
            <line x1="456" x2="594" y1="102" y2="102" />
          </g>
          <rect fill={GREEN} height="7" width="30" x="456" y="112" />
          <Label anchor="start" dim x={494} y={119}>USAGE</Label>
          <Label x={525} y={172}>USAGE IN SETTINGS</Label>
          <Label dim x={525} y={186}>COST ON DEMAND</Label>
          <Label x={525} y={208}>PROMISE: LOW</Label>
        </g>
      </svg>
      {/* Each card's aria-label already carries its note, so this readout
          serves sighted pointer users; aria-hidden stops it being announced a
          second time when the card takes focus. */}
      <p
        aria-hidden="true"
        className="essay-figure-note"
        data-shown={active !== null}
      >
        {active === null ? " " : TRIPTYCH_NOTES[active]}
      </p>
    </div>
  );
}
