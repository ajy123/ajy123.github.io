// Builds a CSS mask for the print intro's shader canvas: the sentence is
// painted (dilated + feathered) into an offscreen bitmap and punched out of an
// opaque field, so halftone dots vanish in soft letterform pockets exactly
// where glyphs land. Scattered letters travel on transforms, which never move
// their layout boxes — so sampling untransformed rects here pins the pockets
// to the settled positions, and letters visibly fly into their cleared slots.
//
// Rebuilt only on resize / fonts.ready (the sticky stage is static during
// scroll), so the mask costs nothing per frame.

// Dilation and feather scale with the glyph size so the gutter reads the same
// at every breakpoint. At the mobile clamp floor the sentence wraps to many
// more lines at a proportionally tighter physical line-height, so the
// full-size gutter bleeds into the line above/below (a double-image halo);
// both terms lerp down toward the mobile end of the font-size clamp.
const DILATE_EM_MAX = 0.1;
const DILATE_EM_MIN = 0.06;
const FEATHER_EM_MAX = 0.14;
const FEATHER_EM_MIN = 0.08;
// Touch viewports wrap deep at tiny glyphs, where a softly-feathered pocket
// edge reads as a fuzzy per-glyph outline. Tighten the feather floor on coarse
// pointers only so mobile letter edges stay crisp; desktop keeps its softer
// pocket (this floor only bites at small font sizes, i.e. the mobile clamp).
const FEATHER_EM_MIN_COARSE = 0.06;
const FONT_SIZE_MAX = 72;
const FONT_SIZE_MIN = 40;

function lerpEm(min: number, max: number, fontSize: number): number {
  const t = Math.min(
    1,
    Math.max(0, (fontSize - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)),
  );
  return min + (max - min) * t;
}

function drawWord(
  context: CanvasRenderingContext2D,
  text: string,
  rect: DOMRect,
  stage: DOMRect,
  scale: number,
) {
  const x = (rect.left - stage.left) * scale;
  const y = ((rect.top + rect.bottom) / 2 - stage.top) * scale;
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
}

function wordRectsFromTextNodes(root: HTMLElement): Array<{
  text: string;
  rect: DOMRect;
}> {
  const results: Array<{ text: string; rect: DOMRect }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(".intro-scramble-token")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const content = node.textContent ?? "";
    const range = document.createRange();
    const wordPattern = /\S+/g;
    let match = wordPattern.exec(content);
    while (match) {
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0) results.push({ text: match[0], rect });
      match = wordPattern.exec(content);
    }
  }

  return results;
}

export function buildSentenceMask(
  sentence: HTMLElement,
  stageElement: HTMLElement,
): string | null {
  const stage = stageElement.getBoundingClientRect();
  if (stage.width < 1 || stage.height < 1) return null;

  const style = getComputedStyle(sentence);
  const fontSize = Number.parseFloat(style.fontSize);
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;

  // Rasterize the mask at the shader's own device-pixel resolution on touch
  // viewports. A mask baked at 1 CSS px then stretched (mask-size:100% 100%)
  // over a 2-3x phone gets upscaled, smearing every feathered letterform
  // pocket into a fuzzy outline the halftone dots bleed through — the reported
  // "font border". Matching the shader's min(dpr,2) makes the pockets land 1:1
  // with device pixels, so edges stay crisp. Desktop stays at 1x (unchanged).
  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse), (max-width: 860px)").matches;
  const scale = coarse ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const featherEmMin = coarse ? FEATHER_EM_MIN_COARSE : FEATHER_EM_MIN;

  const font = `${style.fontWeight} ${fontSize * scale}px ${style.fontFamily}`;
  // dilate/feather keep their em ratios, then convert to the bitmap's device
  // pixels via `scale` so the gutter and edge softness read identically.
  const dilate =
    fontSize * lerpEm(DILATE_EM_MIN, DILATE_EM_MAX, fontSize) * scale;
  const feather =
    fontSize * lerpEm(featherEmMin, FEATHER_EM_MAX, fontSize) * scale;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(stage.width * scale);
  canvas.height = Math.round(stage.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;

  // Paint the sentence (dilated via a fat round stroke) as the punch shape.
  const glyphs = document.createElement("canvas");
  glyphs.width = canvas.width;
  glyphs.height = canvas.height;
  const glyphContext = glyphs.getContext("2d");
  if (!glyphContext) return null;
  glyphContext.font = font;
  glyphContext.textBaseline = "middle";
  glyphContext.fillStyle = "#000";
  glyphContext.strokeStyle = "#000";
  glyphContext.lineWidth = dilate * 2;
  glyphContext.lineJoin = "round";

  // Scramble tokens are transform-free wrappers, so their rects are the
  // settled layout boxes even while the chars inside are mid-flight.
  for (const token of sentence.querySelectorAll<HTMLElement>(
    ".intro-scramble-token",
  )) {
    const text = token.textContent ?? "";
    if (text.trim()) {
      drawWord(glyphContext, text, token.getBoundingClientRect(), stage, scale);
    }
  }
  for (const { text, rect } of wordRectsFromTextNodes(sentence)) {
    drawWord(glyphContext, text, rect, stage, scale);
  }

  // Opaque field with soft glyph holes: where the mask is transparent, the
  // shader canvas disappears.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "destination-out";
  context.filter = `blur(${feather.toFixed(1)}px)`;
  context.drawImage(glyphs, 0, 0);

  return canvas.toDataURL("image/png");
}
