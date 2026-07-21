#!/usr/bin/env node
// Records the deeli hero demo: one page load, one Playwright video, four
// in-place restaged scenes (type -> clarify -> generate -> cite), trimmed
// and encoded with ffmpeg into mp4 + webm + poster.
//
// Usage: BASE_URL=http://localhost:8001/deeli/ node scripts/record-hero.mjs

import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const SCRATCH = process.env.HERO_SCRATCH_DIR || path.join(REPO_ROOT, '.tmp');
const REC_DIR = path.join(SCRATCH, 'hero-rec');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8001/deeli/';

const VIEWPORT = { width: 1070, height: 602 };
const OUT_MP4 = path.join(REPO_ROOT, 'images/deeli-hero-demo.mp4');
const OUT_WEBM = path.join(REPO_ROOT, 'images/deeli-hero-demo.webm');
const OUT_POSTER = path.join(REPO_ROOT, 'images/deeli-hero-demo-poster.jpg');

// Chrome and caption/eyebrow chrome hidden in every staged scene. The w1
// example chips are deliberately NOT in this list -- they stay visible.
const ALWAYS_HIDE = ['.w3-replay', '.sol-w2-caption', '.gal-widget-eyebrow'];

// ---------------------------------------------------------------------------
// Synthetic cursor (runs inside the page; must not close over outer scope)
// ---------------------------------------------------------------------------

function cursorInit() {
  window.__cur = (function setup() {
    const el = document.createElement('div');
    el.id = '__hero_cursor';
    el.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'width:20px', 'height:20px',
      'z-index:2147483647', 'pointer-events:none',
      'transition:transform 550ms cubic-bezier(0.22,1,0.36,1)',
      'transform:translate(-100px,-100px)', 'will-change:transform',
    ].join(';');
    el.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2 1 L2 17 L6.5 13.2 L9.2 19 L11.6 17.9 L9 12.3 L14.8 12.1 Z" ' +
      'fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

    const mount = () => document.body && document.body.appendChild(el);
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);

    let x = -100;
    let y = -100;
    return {
      move(nx, ny) {
        x = nx; y = ny;
        el.style.transform = `translate(${x}px, ${y}px)`;
      },
      press() {
        el.style.transform = `translate(${x}px, ${y}px) scale(0.88)`;
      },
      release() {
        el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
      },
    };
  })();
}

async function cur(page, x, y, ms = 600) {
  await page.evaluate(({ x, y }) => window.__cur.move(x, y), { x, y });
  await page.mouse.move(x, y, { steps: 20 });
  await page.waitForTimeout(ms);
}

async function click(page, x, y) {
  await page.evaluate(() => window.__cur.press());
  await page.waitForTimeout(90);
  await page.mouse.click(x, y);
  await page.evaluate(() => window.__cur.release());
}

async function typeQuery(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(30 + Math.random() * 50); // 30-80ms/char
  }
}

// ---------------------------------------------------------------------------
// Staging: spotlight one widget on a #f8f9fa field, hide everything else,
// never clone (the widget IIFEs bind handlers to the original nodes).
// ---------------------------------------------------------------------------

async function stage(page, widgetSel, extraCss = '') {
  const css = `
    * { cursor: none !important; scrollbar-width: none !important; }
    *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    html, body { overflow: hidden !important; background: #f8f9fa !important; margin: 0 !important; padding: 0 !important; }
    /* Spotlight: ancestors' own backgrounds/borders must not paint (they
       otherwise leave a collapsed strip at the top of the canvas). */
    body { visibility: hidden !important; }
    ${widgetSel}, #__hero_cursor { visibility: visible !important; }
    .hero-hidden { display: none !important; }
    .hero-flat { margin: 0 !important; padding: 0 !important; }
    ${widgetSel} {
      position: fixed !important;
      inset: 0 !important;
      margin: auto !important;
      width: 900px !important;
      max-width: 900px !important;
      height: fit-content !important;
      max-height: 100vh !important;
      z-index: 2147483000 !important;
    }
    ${extraCss}
  `;

  await page.evaluate(
    ({ widgetSel, css, alwaysHide }) => {
      document.querySelectorAll('details.cs-prototype').forEach((d) => { d.open = true; });

      let styleTag = document.getElementById('stage-css');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'stage-css';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = css; // replaced per scene, not appended

      document.querySelectorAll('.hero-hidden').forEach((el) => el.classList.remove('hero-hidden'));
      document.querySelectorAll('.hero-flat').forEach((el) => el.classList.remove('hero-flat'));

      const widget = document.querySelector(widgetSel);
      if (!widget) throw new Error('stage(): widget not found for selector ' + widgetSel);

      let node = widget;
      while (node && node !== document.body) {
        const parent = node.parentElement;
        if (!parent) break;
        Array.from(parent.children).forEach((sib) => {
          if (sib !== node && sib.id !== '__hero_cursor') sib.classList.add('hero-hidden');
        });
        parent.classList.add('hero-flat');
        node = parent;
      }

      alwaysHide.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.classList.add('hero-hidden'));
      });
    },
    { widgetSel, css, alwaysHide: ALWAYS_HIDE }
  );
}

async function boxOf(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error('Element not found: ' + selector);
  const box = await el.boundingBox();
  if (!box) throw new Error('No bounding box for: ' + selector);
  return box;
}

function center(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function waitFor(page, selector, { timeout = 10000 } = {}, label = selector) {
  try {
    return await page.waitForSelector(selector, { timeout });
  } catch (err) {
    throw new Error(
      `Timed out waiting for "${label}" (selector: ${selector}, timeout: ${timeout}ms): ${err.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Scenes -- each returns { scene, startMs, endMs } relative to t0.
// Scene 1's widget is already staged+settled by main() (that settle is what
// defines t0), so it does not restage itself.
// ---------------------------------------------------------------------------

async function sceneType(page, t0) {
  const startMs = Date.now() - t0;

  const cardBox = await boxOf(page, '#sol-w1');
  await cur(page, cardBox.x + cardBox.width - 60, cardBox.y + cardBox.height - 30, 300);

  const inputBox = await boxOf(page, '#sol-w1-input');
  const tx = inputBox.x + 40;
  const ty = inputBox.y + 24; // caret lands at line start
  await cur(page, tx, ty, 500);
  await click(page, tx, ty);

  await typeQuery(page, 'arm robotics market');
  await page.waitForTimeout(400);

  const submitBox = await boxOf(page, '#sol-w1-submit');
  const sc = center(submitBox);
  await cur(page, sc.x, sc.y, 500);
  // Press animation only — NO real click. w1's resolved state would paint on
  // the very next frame and ghost through the dissolve into the clarify
  // scene (which stages independently and reads as the system's response).
  await page.evaluate(() => window.__cur.press());
  await page.waitForTimeout(150);
  const endMs = Date.now() - t0;
  await page.evaluate(() => window.__cur.release());

  return { scene: 'type', startMs, endMs };
}

async function sceneClarify(page, t0) {
  await stage(page, '#sol-w2');
  await page.waitForTimeout(350);
  const startMs = Date.now() - t0;
  await page.waitForTimeout(500); // let the viewer read the clarify copy

  const chipBox = await boxOf(page, '.sol-w2-chip[data-focus="Market landscape"]');
  const cc = center(chipBox);
  await cur(page, cc.x, cc.y, 500);
  await click(page, cc.x, cc.y);
  await page.waitForTimeout(600);

  const submitBox = await boxOf(page, '#sol-w2-submit');
  const sc = center(submitBox);
  await cur(page, sc.x, sc.y, 500);
  await click(page, sc.x, sc.y);

  await waitFor(page, '#sol-w2-queued', { timeout: 10000 }, 'w2 queued panel');
  await page.waitForTimeout(900);

  return { scene: 'clarify', startMs, endMs: Date.now() - t0 };
}

async function sceneGenerate(page, t0) {
  // Widen the panel for this scene only so the title never wraps, and hide
  // the Completed chip: in the film the loading panel dissolves straight
  // into the finished report — the chip is the widget's own terminal state,
  // not this cut's. Wait on the sequencer's is-finished class instead.
  await stage(
    page,
    '#sol-w3',
    '#sol-w3 .w3-panel { max-width: 680px !important; } #sol-w3 .w3-complete { display: none !important; }'
  );
  await page.waitForTimeout(350);
  const startMs = Date.now() - t0;

  await page.evaluate(() => window.__cur.move(-100, -100)); // park offscreen
  await page.evaluate(() => document.querySelector('.w3-replay')?.click());

  try {
    await page.waitForSelector('#sol-w3 .w3-panel.is-finished', { state: 'attached', timeout: 30000 });
  } catch (err) {
    throw new Error(`Timed out waiting for w3 sequence to finish: ${err.message}`);
  }
  await page.waitForTimeout(500);

  return { scene: 'generate', startMs, endMs: Date.now() - t0 };
}

async function sceneCite(page, t0) {
  // Top-align the report so its title lands where the generating panel's
  // title sits — the 3→4 dissolve becomes a match-dissolve on the shared
  // title instead of a double-title ghost.
  await stage(page, '#sol-w4', '#sol-w4 { inset: 48px auto auto 45px !important; margin: 0 !important; }');
  await page.waitForTimeout(350);
  const startMs = Date.now() - t0;

  // Let the dissolve from the loading panel land on a readable report beat
  // before the cursor starts moving.
  await page.waitForTimeout(500);

  const citeBox = await boxOf(page, '.sol-w4-cite[data-cite="2"]');
  const cc = center(citeBox);
  await cur(page, cc.x, cc.y, 300); // hover only, no click
  await page.waitForTimeout(150); // clear the 120ms hover-intent delay

  const posterMs = Date.now() - t0 + 800;
  const waitToPoster = posterMs - (Date.now() - t0);
  if (waitToPoster > 0) await page.waitForTimeout(waitToPoster);

  const elapsed = Date.now() - t0 - startMs;
  const remaining = 2000 - elapsed;
  if (remaining > 0) await page.waitForTimeout(remaining);

  return { scene: 'cite', startMs, endMs: Date.now() - t0, posterMs };
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function runFfmpeg(args, label) {
  const res = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed (${label}): ${res.stderr?.toString() || res.error}`);
  }
  return res;
}

function probeDuration(filePath) {
  const res = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  if (res.status !== 0) {
    throw new Error(`ffprobe failed: ${res.stderr?.toString() || res.error}`);
  }
  const d = parseFloat(res.stdout.toString().trim());
  if (!Number.isFinite(d)) throw new Error(`ffprobe returned a non-numeric duration for ${filePath}`);
  return d;
}

function locateRawVideo() {
  const files = readdirSync(REC_DIR).filter((f) => f.endsWith('.webm'));
  if (!files.length) throw new Error('No recorded .webm found in ' + REC_DIR);
  files.sort((a, b) => statSync(path.join(REC_DIR, b)).mtimeMs - statSync(path.join(REC_DIR, a)).mtimeMs);
  return path.join(REC_DIR, files[0]);
}

function encode(timeline, posterMs) {
  const rawPath = locateRawVideo();
  const scene1 = timeline.find((s) => s.scene === 'type');
  const scene4 = timeline.find((s) => s.scene === 'cite');

  // Cross-dissolves between scenes instead of hard cuts. The loading→report
  // dissolve carries meaning (the wait becomes the artifact), so it gets the
  // system's slow duration; the others get a soft standard dissolve.
  // NOTE: playwright's webm is VFR — each segment must be CFR-ized before
  // xfade or the offsets drift (see memory: VFR webm breaks xfade directly).
  const FADES = [0.3, 0.3, 0.42];

  // Playwright's video starts recording before the page is ready, so its
  // head offset is unknown. Anchor from the tail: the raw file ends roughly
  // when scene 4 ends.
  const D = probeDuration(rawPath);
  const rawStartSec = Math.max(0, D - (scene4.endMs - scene1.startMs) / 1000);

  mkdirSync(path.dirname(OUT_MP4), { recursive: true });

  // 1. Cut each scene into a CFR intermediate (inter-scene restage gaps are
  //    dropped here — they never reach the final cut).
  const segs = timeline.map((s, i) => {
    const segPath = path.join(REC_DIR, `seg_${i}.mp4`);
    const start = rawStartSec + (s.startMs - scene1.startMs) / 1000;
    const dur = (s.endMs - s.startMs) / 1000;
    runFfmpeg(
      [
        '-y', '-i', rawPath,
        '-ss', String(start), '-t', String(dur),
        '-vf', 'fps=30,scale=1070:602',
        '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an',
        segPath,
      ],
      `segment ${i} (${s.scene})`
    );
    return { path: segPath, dur: probeDuration(segPath) };
  });

  // 2. Chain xfades. offset_k = sum(dur_0..k) - sum(fade_0..k).
  const inputs = segs.flatMap((s) => ['-i', s.path]);
  let filter = '';
  let prevLabel = '0:v';
  let offset = 0;
  for (let i = 1; i < segs.length; i++) {
    const fade = FADES[i - 1];
    offset += segs[i - 1].dur - fade;
    const outLabel = i === segs.length - 1 ? 'vout' : `v${i}`;
    filter += `[${prevLabel}][${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[${outLabel}];`;
    prevLabel = outLabel;
  }
  filter = filter.replace(/;$/, '');

  const masterPath = path.join(REC_DIR, 'master.mp4');
  runFfmpeg(
    [
      '-y', ...inputs,
      '-filter_complex', filter, '-map', '[vout]',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an',
      masterPath,
    ],
    'xfade master'
  );

  // 3. Final encodes from the master.
  runFfmpeg(
    [
      '-y', '-i', masterPath,
      '-c:v', 'libx264', '-crf', '26', '-preset', 'slow',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
      OUT_MP4,
    ],
    'mp4'
  );

  runFfmpeg(
    [
      '-y', '-i', masterPath,
      '-c:v', 'libvpx-vp9', '-crf', '42', '-b:v', '0', '-an',
      OUT_WEBM,
    ],
    'webm'
  );

  // Poster lives inside scene 4: its master-timeline position is the last
  // xfade offset plus the poster's offset within the scene.
  const posterTimeSec = offset + (posterMs - timeline[timeline.length - 1].startMs) / 1000;
  runFfmpeg(
    ['-y', '-i', masterPath, '-ss', String(posterTimeSec), '-frames:v', '1', '-q:v', '3', OUT_POSTER],
    'poster'
  );

  const sizeOf = (p) => statSync(p).size;
  const sizes = { mp4: sizeOf(OUT_MP4), webm: sizeOf(OUT_WEBM), poster: sizeOf(OUT_POSTER) };

  return {
    scenes: timeline,
    durations: { rawSec: D, masterSec: probeDuration(masterPath), segments: segs.map((s) => s.dur) },
    outputs: { mp4: OUT_MP4, webm: OUT_WEBM, poster: OUT_POSTER },
    sizes: { ...sizes, combinedBytes: sizes.mp4 + sizes.webm + sizes.poster },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(REC_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let exitCode = 0;

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      recordVideo: { dir: REC_DIR, size: VIEWPORT },
    });
    await context.addInitScript(cursorInit);

    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(300);

    // Scene 1 stages first; the clock starts once that stage has settled.
    await stage(page, '#sol-w1');
    await page.waitForTimeout(350);
    const t0 = Date.now();

    const timeline = [];
    timeline.push(await sceneType(page, t0));
    timeline.push(await sceneClarify(page, t0));
    timeline.push(await sceneGenerate(page, t0));
    const cite = await sceneCite(page, t0);
    timeline.push(cite);

    await context.close(); // finalizes the .webm

    const summary = encode(timeline, cite.posterMs);
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('[record-hero] FAILED:', err.message);
    exitCode = 1;
  } finally {
    await browser.close();
  }

  process.exit(exitCode);
}

main();
