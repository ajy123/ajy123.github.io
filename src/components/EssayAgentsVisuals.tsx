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
  dim = false,
  anchor = "middle",
}: {
  x: number;
  y: number;
  children: string;
  dim?: boolean;
  anchor?: "middle" | "start" | "end";
}) {
  return (
    <text
      {...labelProps}
      fill={dim ? MUTED : STROKE}
      textAnchor={anchor}
      x={x}
      y={y}
    >
      {children}
    </text>
  );
}

// In-essay figure: the agent pipeline in the site's shape alphabet.
// Stripes = the unsorted backlog, clustered circles = themes, triangle =
// the RICE gate, fourteen squares = generated baselines, ringed dot = the
// human review station, green disc = the shipped direction.
export function AgentsWorkflowVisual() {
  const stripes: number[] = [];
  for (let x = 33; x <= 77; x += 5) stripes.push(x);
  const baselines = Array.from({ length: 14 }, (_, i) => ({
    x: 300 + (i % 7) * 14,
    y: 58 + Math.floor(i / 7) * 20,
  }));

  return (
    <svg
      viewBox="0 0 640 175"
      role="img"
      aria-label="Pipeline of geometric shapes: striped block for the backlog, three circles for themes, a triangle for the RICE gate, a grid of fourteen small squares for generated baselines, a ringed dot for human review, and a filled green circle for the shipped direction"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <g transform="translate(25 0)">
        <g stroke={HAIRLINE_FAINT} strokeWidth={1}>
          <line x1="84" y1="76" x2="118" y2="76" />
          <line x1="186" y1="76" x2="216" y2="76" />
          <line x1="281" y1="76" x2="294" y2="76" />
          <line x1="400" y1="76" x2="424" y2="76" />
          <line x1="462" y1="76" x2="517" y2="76" />
        </g>
        <g stroke={STROKE} strokeWidth={1.5}>
          {stripes.map((x) => (
            <line key={x} x1={x} y1={54} x2={x} y2={98} />
          ))}
        </g>
        <g stroke={STROKE} strokeWidth={1.5}>
          <circle cx="152" cy="58" r="9" />
          <circle cx="139" cy="85" r="9" />
          <circle cx="165" cy="85" r="9" />
          <path d="M273 96 H225 L249 54 Z" />
          {baselines.map((cell) => (
            <rect
              height="9"
              key={`${cell.x}-${cell.y}`}
              width="9"
              x={cell.x}
              y={cell.y}
            />
          ))}
          <circle cx="443" cy="76" r="12" />
        </g>
        <circle cx="443" cy="76" r="4" fill={STROKE} />
        <circle cx="540" cy="76" r="16" fill={GREEN} />

        <Label x={55} y={140}>BACKLOG</Label>
        <Label x={152} y={140}>THEMES</Label>
        <Label x={249} y={140}>RICE GATE</Label>
        <Label x={346} y={140}>14 BASELINES</Label>
        <Label x={443} y={140}>REVIEW</Label>
        <Label x={540} y={140}>SHIPPED</Label>
        <Label dim x={55} y={152}>40% UNSORTED</Label>
        <Label dim x={152} y={152}>GROUPED</Label>
        <Label dim x={249} y={152}>SCORED</Label>
        <Label dim x={346} y={152}>GENERATED</Label>
        <Label dim x={443} y={152}>HUMAN</Label>
        <Label dim x={540} y={152}>DIRECTION</Label>
      </g>
    </svg>
  );
}

// In-essay figure: three hairline wireframes of the same screen, differing
// only in where the token-cost number lives. The promise row underneath is
// the real comparison — the pre-generation estimate makes the biggest
// promise, marked orange because it's the one the model couldn't keep.
export function AgentsTriptychVisual() {
  return (
    <svg
      viewBox="0 0 640 235"
      role="img"
      aria-label="Three wireframe cards: a modal with a large cost estimate, a screen with a thin top usage bar, and a settings list with usage in a row; a promise rating sits under each"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
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

      <rect height="130" stroke={STROKE} strokeWidth={1.5} width="170" x="235" y="20" />
      <line stroke={HAIRLINE} strokeWidth={1} x1="235" x2="405" y1="38" y2="38" />
      <rect fill={GREEN} height="5" width="44" x="243" y="27" />
      <g stroke={HAIRLINE_FAINT} strokeWidth={1}>
        <line x1="251" x2="389" y1="62" y2="62" />
        <line x1="251" x2="389" y1="82" y2="82" />
        <line x1="251" x2="365" y1="102" y2="102" />
      </g>

      <rect height="130" stroke={STROKE} strokeWidth={1.5} width="170" x="440" y="20" />
      <g stroke={HAIRLINE_FAINT} strokeWidth={1}>
        <line x1="456" x2="594" y1="50" y2="50" />
        <line x1="456" x2="594" y1="76" y2="76" />
        <line x1="456" x2="594" y1="102" y2="102" />
      </g>
      <rect fill={GREEN} height="7" width="30" x="456" y="112" />
      <Label anchor="start" dim x={494} y={119}>USAGE</Label>

      <Label x={115} y={172}>PRE-GENERATION ESTIMATE</Label>
      <Label x={320} y={172}>PERSISTENT TOP BAR</Label>
      <Label x={525} y={172}>USAGE IN SETTINGS</Label>
      <Label dim x={115} y={186}>PROMISE BEFORE ACTION</Label>
      <Label dim x={320} y={186}>AMBIENT COST</Label>
      <Label dim x={525} y={186}>COST ON DEMAND</Label>
      <text
        fill={ACCENT}
        fontFamily={MONO}
        fontSize={8.5}
        letterSpacing="0.1em"
        textAnchor="middle"
        x="115"
        y="208"
      >
        PROMISE: HIGH
      </text>
      <Label x={320} y={208}>PROMISE: MEDIUM</Label>
      <Label x={525} y={208}>PROMISE: LOW</Label>
    </svg>
  );
}
