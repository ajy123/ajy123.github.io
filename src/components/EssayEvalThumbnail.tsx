import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { interpolate } from "flubber";

const ACCENT = "#174C3A";
const STROKE = "#171717";

type Shape = {
  d: [string, string];
  fill?: string;
  maskId?: string;
  stroke?: string;
  morph?: boolean;
  transform?: [string, string];
};

const SHAPES_BEFORE_STRIPES: Shape[] = [
  {
    d: [
      "M84 94H36C36 67.4903 57.4903 46 84 46V94Z",
      "M60 46C73.2548 46 84 56.7452 84 70C84 83.2548 73.2548 94 60 94C46.7452 94 36 83.2548 36 70C36 56.7452 46.7452 46 60 46Z",
    ],
    fill: ACCENT,
    morph: true,
  },
  {
    d: [
      "M164 46L164 44.5L162.5 44.5L162.5 46L164 46ZM212 46L213.5 46L213.5 44.5L212 44.5L212 46ZM164 94L162.5 94L162.5 95.5L164 95.5L164 94ZM164 46L164 47.5L212 47.5L212 46L212 44.5L164 44.5L164 46ZM212 46L210.5 46C210.5 71.6812 189.681 92.5 164 92.5L164 94L164 95.5C191.338 95.5 213.5 73.3381 213.5 46L212 46ZM164 94L165.5 94L165.5 46L164 46L162.5 46L162.5 94L164 94Z",
      "M164 46L164 44.5L162.5 44.5L162.5 46L164 46ZM212 46L213.5 46L213.5 44.5L212 44.5L212 46ZM164 94L162.5 94L162.5 95.5L164 95.5L164 94ZM164 46L164 47.5L212 47.5L212 46L212 44.5L164 44.5L164 46ZM212 46L210.5 46C210.5 71.6812 189.681 92.5 164 92.5L164 94L164 95.5C191.338 95.5 213.5 73.3381 213.5 46L212 46ZM164 94L165.5 94L165.5 46L164 46L162.5 46L162.5 94L164 94Z",
    ],
    fill: STROKE,
    maskId: "essay-eval-top-quarter-mask",
    transform: ["none", "translateX(-63px)"],
  },
  {
    d: [
      "M86.2002 153.25H33.2998L59.75 107.498L86.2002 153.25Z",
      "M86.2002 153.25H33.2998L59.75 107.498L86.2002 153.25Z",
    ],
    fill: "none",
    stroke: STROKE,
  },
  {
    d: [
      "M266.2 93.2501H213.3L239.75 47.4981L266.2 93.2501Z",
      "M266.2 93.2501H213.3L239.75 47.4981L266.2 93.2501Z",
    ],
    fill: "none",
    stroke: STROKE,
  },
  {
    d: [
      "M267.25 106.75V153.25H164.75V106.75H267.25Z",
      "M188 106.75H304C316.841 106.75 327.25 117.159 327.25 130C327.25 142.841 316.841 153.25 304 153.25H188C175.159 153.25 164.75 142.841 164.75 130C164.75 117.159 175.159 106.75 188 106.75Z",
    ],
    fill: "none",
    stroke: STROKE,
    morph: true,
  },
];

const BOTTOM_MORPH_SHAPE: Shape = {
  d: [
    "M147.25 153.25H100.757C101.154 127.75 121.75 107.153 147.25 106.756V153.25Z",
    "M110 106.75H138C143.109 106.75 147.25 110.891 147.25 116V144C147.25 149.109 143.109 153.25 138 153.25H110C104.891 153.25 100.75 149.109 100.75 144V116C100.75 110.891 104.891 106.75 110 106.75Z",
  ],
  fill: "none",
  stroke: STROKE,
  morph: true,
};

const SQUARE = {
  x: 280.75,
  y: 46.75,
  width: 46.5,
  height: 46.5,
};

const STRIPES =
  "M102.603 46V94H101.095V46H102.603ZM105.619 46V94H104.111V46H105.619ZM108.635 46V94H107.127V46H108.635ZM111.651 46V94H110.143V46H111.651ZM114.666 46V94H113.159V46H114.666ZM117.682 46V94H116.175V46H117.682ZM120.698 46V94H119.191V46H120.698ZM123.714 46V94H122.206V46H123.714ZM126.73 46V94H125.222V46H126.73ZM129.746 46V94H128.238V46H129.746ZM132.761 46V94H131.254V46H132.761ZM135.777 46V94H134.27V46H135.777ZM138.793 46V94H137.286V46H138.793ZM141.809 46V94H140.301V46H141.809ZM144.825 46V94H143.317V46H144.825ZM147.841 46V94H146.333V46H147.841Z";

const STRIPES_TRANSFORM: [string, string] = ["none", "translateX(56px)"];

const transition = { type: "spring" as const, stiffness: 220, damping: 26 };

function MorphPath({
  active,
  shape,
}: {
  active: boolean;
  shape: Shape;
}) {
  const interpolator = useMemo(
    () => interpolate(shape.d[0], shape.d[1], { maxSegmentLength: 2 }),
    [shape],
  );
  const progress = useMotionValue(active ? 1 : 0);
  const [path, setPath] = useState(() => interpolator(active ? 1 : 0));

  useMotionValueEvent(progress, "change", (latest) => {
    setPath(interpolator(latest));
  });

  useEffect(() => {
    const controls = animate(progress, active ? 1 : 0, transition);
    return () => controls.stop();
  }, [active, progress]);

  return (
    <path
      d={path}
      fill={shape.fill ?? "none"}
      stroke={shape.stroke ?? "none"}
      strokeWidth={shape.stroke ? 1.5 : 0}
    />
  );
}

const renderPath = (
  shape: Shape,
  index: number,
  active: boolean,
) => (
  shape.morph ? (
    <MorphPath active={active} key={index} shape={shape} />
  ) : (
    <motion.path
      key={index}
      initial={false}
      animate={{
        d: shape.d[active ? 1 : 0],
        transform: shape.transform?.[active ? 1 : 0] ?? "none",
      }}
      style={{
        transformBox: "fill-box",
        transformOrigin: "center",
      }}
      transition={shape.transform ? transition : { duration: 0 }}
      fill={shape.fill ?? "none"}
      mask={shape.maskId ? `url(#${shape.maskId})` : undefined}
      stroke={shape.stroke ?? "none"}
      strokeWidth={shape.stroke ? 1.5 : 0}
    />
  )
);

export function EssayEvalThumbnail() {
  const [hovered, setHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const isActive = hovered && !prefersReducedMotion;

  return (
    <motion.div
      aria-label="Interactive thumbnail for The eval is the spec"
      className="work-media"
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      role="img"
      style={{
        background: "var(--surface-subtle)",
        borderRadius: 0,
        containerType: "inline-size",
        cursor: "pointer",
        display: "flex",
      }}
      tabIndex={0}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 8%",
        }}
      >
        <svg
          viewBox="0 0 361 201"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: "min(78%, 330px)", height: "auto" }}
        >
          <mask id="essay-eval-top-quarter-mask" fill="white">
            <path d="M164 46L212 46C212 72.5097 190.51 94 164 94L164 46Z" />
          </mask>
          {SHAPES_BEFORE_STRIPES.map((shape, index) =>
            renderPath(shape, index, isActive),
          )}
          <motion.rect
            animate={{
              transform: isActive ? "rotate(90deg)" : "none",
            }}
            fill="none"
            height={SQUARE.height}
            initial={false}
            stroke={STROKE}
            strokeWidth={1.5}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
            transition={transition}
            width={SQUARE.width}
            x={SQUARE.x}
            y={SQUARE.y}
          />
          <motion.path
            animate={{ transform: STRIPES_TRANSFORM[isActive ? 1 : 0] }}
            d={STRIPES}
            fill={STROKE}
            initial={false}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
            transition={transition}
          />
          {renderPath(BOTTOM_MORPH_SHAPE, 99, isActive)}
        </svg>
      </div>
    </motion.div>
  );
}
