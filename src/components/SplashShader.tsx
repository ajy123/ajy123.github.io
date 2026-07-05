import { useEffect, useRef } from "react";

// WebGL halftone background for the loading splash.
// Pure decoration: it renders behind the splash content and unmounts when the
// splash dismisses, so it costs nothing once the portfolio is up. It never
// touches the LLM warmup (that runs on WebGPU; this is plain WebGL).

export type SplashPaper = "cream" | "white";

type SplashShaderProps = {
  paper?: SplashPaper;
  cellPx?: number; // halftone cell size, in CSS px
  speed?: number; // animation time multiplier
  enabled?: boolean;
};

// Base paper/ink colors fed to the shader (it adds micro-tints on top).
const PAPER_RGB: Record<SplashPaper, [number, number, number]> = {
  cream: [0.98, 0.976, 0.961], // --surface-warm #FAF9F5
  white: [1, 1, 1], // --canvas #FFFFFF
};
const INK_RGB: [number, number, number] = [0.067, 0.067, 0.067]; // --ink #111111

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Ported halftone fragment shader. Differences from laudera: cell size, paper and
// ink are uniforms (u_cell / u_paper / u_ink) so the dev panel + cream/white
// toggle can drive them; everything else (fBm domain warp → halftone screen →
// well + vignette + grain + mouse/click reactivity + birth reveal) is unchanged.
const FRAG_HALFTONE = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_mAct;
uniform vec2 u_click;
uniform float u_clickT;
uniform float u_dpr;
uniform float u_birth;
uniform float u_focus;
uniform float u_keyT;
uniform float u_keyAmp;
uniform vec2 u_actionOrigin;
uniform float u_reduced;
uniform vec3 u_paper;
uniform vec3 u_ink;
uniform float u_cell;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 R = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = R * p * 2.03;
    a *= 0.5;
  }
  return v;
}

float field(vec2 p, float t) {
  vec2 q = vec2(
    fbm(p + 0.07 * vec2(t, -t * 0.7)),
    fbm(p + vec2(5.2, 1.3) - 0.05 * t)
  );
  vec2 r = vec2(
    fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.11 * t),
    fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.09 * t)
  );
  return fbm(p + 3.2 * r);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / u_res;
  float minDim = min(u_res.x, u_res.y);
  vec2 p = (fc - 0.5 * u_res) / minDim;
  float t = u_time;

  float cellPx = u_cell * u_dpr;
  float ang = 0.78539816;
  float cs = cos(ang);
  float sn = sin(ang);
  mat2 Rm = mat2(cs, -sn, sn, cs);
  mat2 Rt = mat2(cs, sn, -sn, cs);
  vec2 rfc = Rm * fc;
  vec2 cellID = floor(rfc / cellPx);
  vec2 cellLoc = (fract(rfc / cellPx) - 0.5) * 2.0;
  vec2 cellCtr = Rt * ((cellID + 0.5) * cellPx);
  vec2 cellP = (cellCtr - 0.5 * u_res) / minDim;

  float fld = field(cellP * 1.25, t);

  vec2 mp = (u_mouse - 0.5 * u_res) / minDim;
  float md = length(cellP - mp);
  float mBulge = exp(-md * md * 14.0) * u_mAct;
  float mHalo = exp(-md * 3.2) * u_mAct;
  fld += mBulge * 0.55 + mHalo * 0.20;
  fld -= smoothstep(0.05, 0.55, md) * u_mAct * 0.12;

  vec2 cp = (u_click - 0.5 * u_res) / minDim;
  float cDt = t - u_clickT;
  if (cDt > 0.0 && cDt < 2.6) {
    float cd = length(cellP - cp);
    float rr = cDt * 0.72;
    float ring = exp(-abs(cd - rr) * 13.0) * (1.0 - cDt / 2.6);
    fld += ring * 0.55;
  }

  vec2 aoP = (u_actionOrigin - 0.5 * u_res) / minDim;
  float ar = length(cellP - aoP);
  float kDt = t - u_keyT;
  if (kDt > 0.0 && kDt < 1.6) {
    float kR = kDt * 0.72;
    float kBand = exp(-abs(ar - kR) * 15.0);
    float kDecay = 1.0 - kDt / 1.6;
    fld += kBand * kDecay * u_keyAmp * 0.30;
  }

  float breathAmp = 0.045 + 0.030 * u_focus;
  float breathHz = 0.28 + 0.10 * u_focus;
  fld += breathAmp * sin(t * breathHz);

  float compose = smoothstep(-1.4, 1.4, p.y * 0.80 - p.x * 0.50);
  fld = mix(fld, fld * 0.82 + (1.0 - compose) * 0.38, 0.30);

  vec2 wellSize = vec2(0.22, 0.12);
  float wellD = length((cellP - aoP) / wellSize);
  float wellInner = smoothstep(1.35, 0.92, wellD);
  fld = mix(fld, 0.0, wellInner * 0.99);

  float wellHalo = smoothstep(2.2, 1.35, wellD);
  fld = mix(fld, fld * 0.30, wellHalo * mix(0.55, 0.80, u_focus));

  float birthR = u_birth * 1.9;
  float birthVis = smoothstep(birthR + 0.08, birthR - 0.08, length(p - aoP));
  fld *= birthVis;

  fld = clamp(fld, 0.0, 1.0);

  float radius = smoothstep(0.08, 0.98, fld);
  radius = pow(radius, 0.92);
  float d = length(cellLoc) / 1.414;
  float aa = 1.6 / cellPx;
  float jitter = (hash21(cellID) - 0.5) * 0.015;
  float dotMask = 1.0 - smoothstep(radius - aa + jitter, radius + aa + jitter, d);

  vec3 paper = u_paper;
  vec3 ink = u_ink;
  paper += vec3(0.006, 0.004, 0.000) * (1.0 - compose);
  ink += vec3(-0.006, -0.005, 0.002) * compose;
  vec3 col = mix(paper, ink, dotMask);

  float g1 = hash21(fc + vec2(fract(t * 13.73), fract(t * 7.31)));
  col += (g1 - 0.5) * 0.020 * (1.0 - 0.7 * u_reduced);
  col += (vnoise(fc * 0.006) - 0.5) * 0.012 * vec3(1.0, 0.97, 0.92);

  float vig = smoothstep(1.08, 0.38, length(uv - 0.5));
  col = mix(col * 0.94, col, vig);

  float mPx = distance(fc, u_mouse) / minDim;
  col += vec3(1.00, 0.96, 0.90) * exp(-mPx * mPx * 26.0) * u_mAct * 0.06;

  gl_FragColor = vec4(col, 1.0);
}
`;

export function SplashShader({
  paper = "cream",
  cellPx = 14,
  speed = 1,
  enabled = true,
}: SplashShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Latest props read live inside the rAF loop so prop/panel changes apply
  // without rebuilding the GL context.
  const propsRef = useRef({ paper, cellPx, speed, enabled });
  propsRef.current = { paper, cellPx, speed, enabled };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) return; // no WebGL → the CSS .splash cream floor shows through

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("[splash-shader] compile failed: " + gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_HALFTONE);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[splash-shader] link", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // Fullscreen triangle.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const loc = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      res: loc("u_res"),
      time: loc("u_time"),
      mouse: loc("u_mouse"),
      mAct: loc("u_mAct"),
      click: loc("u_click"),
      clickT: loc("u_clickT"),
      dpr: loc("u_dpr"),
      birth: loc("u_birth"),
      focus: loc("u_focus"),
      keyT: loc("u_keyT"),
      keyAmp: loc("u_keyAmp"),
      actionOrigin: loc("u_actionOrigin"),
      reduced: loc("u_reduced"),
      paper: loc("u_paper"),
      ink: loc("u_ink"),
      cell: loc("u_cell"),
    };

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let W = 1;
    let H = 1;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth || window.innerWidth;
      const ch = canvas.clientHeight || window.innerHeight;
      W = Math.max(1, Math.round(cw * dpr));
      H = Math.max(1, Math.round(ch * dpr));
      canvas.width = W;
      canvas.height = H;
      gl.viewport(0, 0, W, H);
    };
    resize();

    const start = performance.now();
    let lastFrame = start;
    let raf = 0;

    // Interaction state in device px, y-flipped to gl_FragCoord's bottom-left
    // origin. Listeners live on window so the canvas can stay pointer-events:none
    // and clicks still reach the splash button beneath.
    const state = { mx: W / 2, my: H / 2, mAct: 0, cx: W / 2, cy: H / 2, clickT: -1000 };
    const toGl = (clientX: number, clientY: number): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [(clientX - r.left) * dpr, (r.height - (clientY - r.top)) * dpr];
    };
    const onMove = (e: MouseEvent) => {
      const [x, y] = toGl(e.clientX, e.clientY);
      state.mx = x;
      state.my = y;
      state.mAct = 1;
    };
    const onClick = (e: MouseEvent) => {
      const [x, y] = toGl(e.clientX, e.clientY);
      state.cx = x;
      state.cy = y;
      state.clickT = ((performance.now() - start) / 1000) * propsRef.current.speed;
    };

    const renderFrame = (nowMs: number, tOverride?: number) => {
      const dt = Math.min(0.05, (nowMs - lastFrame) / 1000);
      lastFrame = nowMs;

      if (!propsRef.current.enabled) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }

      const t = tOverride ?? ((nowMs - start) / 1000) * propsRef.current.speed;
      state.mAct = Math.max(0, state.mAct - dt * 1.6);
      const birth = reduced ? 1 : Math.min(1, t / 1.1);
      const birthEase = birth * birth * (3 - 2 * birth);
      const pr = PAPER_RGB[propsRef.current.paper] ?? PAPER_RGB.cream;

      gl.uniform2f(u.res, W, H);
      gl.uniform1f(u.dpr, dpr);
      gl.uniform2f(u.actionOrigin, W / 2, H / 2);
      gl.uniform3f(u.paper, pr[0], pr[1], pr[2]);
      gl.uniform3f(u.ink, INK_RGB[0], INK_RGB[1], INK_RGB[2]);
      gl.uniform1f(u.cell, propsRef.current.cellPx);
      gl.uniform1f(u.focus, 0.0);
      gl.uniform1f(u.keyAmp, 0.0);
      gl.uniform1f(u.keyT, -1000.0);
      gl.uniform1f(u.reduced, reduced ? 1 : 0);
      gl.uniform1f(u.time, t);
      gl.uniform2f(u.mouse, state.mx, state.my);
      gl.uniform1f(u.mAct, reduced ? 0 : state.mAct);
      gl.uniform2f(u.click, state.cx, state.cy);
      gl.uniform1f(u.clickT, state.clickT);
      gl.uniform1f(u.birth, birthEase);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) renderFrame(performance.now(), 0);
    });
    ro.observe(canvas);

    if (reduced) {
      renderFrame(performance.now(), 0); // single static frame, no loop
    } else {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("click", onClick);
      const loop = (now: number) => {
        renderFrame(now);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("click", onClick);
      // Delete this run's GL resources but DON'T loseContext(): a canvas hands
      // back the same context object on the next getContext(), so force-losing
      // it here would poison a remount (React StrictMode mounts twice in dev).
      // On real unmount the canvas leaves the DOM and the context is freed.
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="splash-shader-canvas" aria-hidden="true" />
  );
}
