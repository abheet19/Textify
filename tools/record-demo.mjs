/**
 * Textify — hero demo recorder.
 *
 * Drives the real, running Textify app with Playwright and writes a numbered
 * sequence of PNG frames. `tools/build-demo-gif.py` then assembles those frames
 * into docs/demo/textify-demo.gif.
 *
 * Every frame is a real screenshot of the real app doing the real thing: a
 * document is uploaded, TextRank runs server-side, and the resulting Summary /
 * Glossary / Quiz tabs are the app's own output. Nothing is mocked, and the
 * only editing is on time — waiting is cut, interesting moments are held.
 *
 * Usage (Playwright is a dev-only tool, deliberately not a dependency of this
 * Flask app — run it from a scratch directory outside the repo):
 *
 *   mkdir /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright
 *   npx playwright install chromium
 *   node /path/to/Textify/tools/record-demo.mjs
 *
 * Environment:
 *   TEXTIFY_URL   base URL to record against (default: the live Fly.io app)
 *   FRAME_DIR     where PNG frames are written (default: ./frames)
 */

import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve Playwright from the *working* directory, so this script can live in
// the repo while the dependency lives in a throwaway directory outside it.
const require = createRequire(import.meta.url);
const pw = await import(
  pathToFileURL(require.resolve('playwright', { paths: [process.cwd()] })).href
);
const { chromium } = pw.default ?? pw;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TEXTIFY_URL || 'https://textify-abheet19.fly.dev';
const FRAME_DIR = process.env.FRAME_DIR || path.resolve(process.cwd(), 'frames');
const DOC = path.join(HERE, 'demo-assets', 'antikythera-mechanism.txt');

// Capture at 2x the README width so downscaling keeps the type crisp.
const VIEWPORT = { width: 1280, height: 760 };

let n = 0;
async function shoot(page) {
  await page.screenshot({
    path: path.join(FRAME_DIR, `f${String(n++).padStart(4, '0')}.png`),
  });
}

/** Hold the current state for `frames` frames (the GIF plays at 8fps). */
async function hold(page, frames) {
  for (let i = 0; i < frames; i++) await shoot(page);
}

/** Scroll smoothly to `y`, capturing a frame per step. */
async function scrollTo(page, y, steps = 6) {
  const from = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i++) {
    const to = from + ((y - from) * i) / steps;
    await page.evaluate((v) => window.scrollTo(0, v), to);
    await shoot(page);
  }
}

async function main() {
  await rm(FRAME_DIR, { recursive: true, force: true });
  await mkdir(FRAME_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });

  // Wake the scale-to-zero Fly machine and warm the font/CSS cache before the
  // first frame, so the recording never opens on a cold start.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.goto(`${BASE}/PDF`, { waitUntil: 'networkidle' });

  // --- 1. Landing page -----------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await hold(page, 10);

  // --- 2. Into the upload flow --------------------------------------------
  await page.getByRole('link', { name: /Upload a file/i }).click();
  await page.waitForURL('**/PDF');
  await page.waitForTimeout(500);
  await hold(page, 8);

  // --- 3. Choose a real document ------------------------------------------
  await page.setInputFiles('#file', DOC);
  await page.waitForTimeout(300);
  await hold(page, 14); // hold on "Ready to summarize"

  // --- 4. Run it (real server-side TextRank; the wait is cut, not faked) ----
  await Promise.all([
    page.waitForURL('**/PDF_result', { waitUntil: 'networkidle' }),
    page.getByRole('button', { name: /Summarize/i }).click(),
  ]);
  await page.waitForSelector('.tab-btn');
  await page.waitForTimeout(500);

  // --- 5. Summary tab ------------------------------------------------------
  await hold(page, 16);
  await scrollTo(page, 320, 6);
  await hold(page, 10);
  await scrollTo(page, 0, 4);

  // --- 6. Glossary tab -----------------------------------------------------
  await page.locator('.tab-btn[data-tab="glossary"]').click();
  await page.waitForTimeout(350);
  await hold(page, 14);
  await scrollTo(page, 300, 6);
  await hold(page, 10);
  await scrollTo(page, 0, 4);

  // --- 7. Quiz tab, with an answer actually revealed -----------------------
  await page.locator('.tab-btn[data-tab="quiz"]').click();
  await page.waitForTimeout(350);
  await hold(page, 12);
  await scrollTo(page, 150, 4);

  const questions = page.locator('.quiz-item');
  await questions.nth(0).locator('summary').click();
  await page.waitForTimeout(250);
  await hold(page, 14);

  await questions.nth(1).locator('summary').click();
  await page.waitForTimeout(250);
  await hold(page, 18);

  // --- 8. Land back on Summary so the loop closes where it opened ----------
  await questions.nth(0).locator('summary').click();
  await questions.nth(1).locator('summary').click();
  await scrollTo(page, 0, 4);
  await page.locator('.tab-btn[data-tab="summary"]').click();
  await page.waitForTimeout(350);
  await hold(page, 8);

  await browser.close();
  console.log(`captured ${n} frames -> ${FRAME_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
