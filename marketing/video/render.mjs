#!/usr/bin/env node
/**
 * Almighty Pumps video maker: turns an ad script (ads/<name>.json) into MP4s.
 *
 *   node marketing/video/render.mjs ads/brand.json                 # 9:16, 1:1 and 16:9
 *   node marketing/video/render.mjs ads/boost.json --formats 9x16  # just one size
 *   node marketing/video/render.mjs ads/brand.json --music song.mp3
 *   node marketing/video/render.mjs ads/brand.json --still 4.5     # PNG of one moment (quick check)
 *   node marketing/video/render.mjs --all                          # every script in ads/
 *
 * Needs Node 18+, ffmpeg and Playwright's Chromium (see README.md).
 * Output goes to marketing/video/out/ (not committed to git).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright"); // require() also finds a global install
const HERE = dirname(fileURLToPath(import.meta.url));
const FORMATS = { "9x16": [1080, 1920], "1x1": [1080, 1080], "16x9": [1920, 1080] };

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(`--${name}`);
const valueFlags = new Set(["--formats", "--music", "--still", "--fps", "--out"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1]));

const fps = Number(opt("fps", 30));
const formats = opt("formats", Object.keys(FORMATS).join(",")).split(",").map((f) => f.trim().replace(":", "x"));
const music = opt("music");
const still = opt("still");
const outDir = resolve(opt("out", join(HERE, "out")));

for (const f of formats) if (!FORMATS[f]) die(`Unknown format "${f}". Use 9x16, 1x1 or 16x9.`);
if (music && !existsSync(music)) die(`Music file not found: ${music}`);

let scripts = positional.map((p) => (existsSync(p) ? p : join(HERE, p)));
if (flag("all")) scripts = readdirSync(join(HERE, "ads")).filter((f) => f.endsWith(".json")).map((f) => join(HERE, "ads", f));
if (!scripts.length) die("Give an ad script, e.g. node marketing/video/render.mjs ads/brand.json (or --all).");

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const file of scripts) {
    const ad = JSON.parse(readFileSync(file, "utf8"));
    const name = ad.name || basename(file, ".json");
    for (const f of formats) await renderOne(ad, name, f);
  }
} finally {
  await browser.close();
}

async function renderOne(ad, name, format) {
  const [width, height] = FORMATS[format];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[page] ${e.message}`));
  await page.goto(pathToFileURL(join(HERE, "player", "player.html")).href);
  const duration = await page.evaluate(([a, f]) => window.loadAd(a, f), [ad, format]);
  await page.evaluate(() => document.fonts.ready);

  if (still !== undefined) {
    const file = join(outDir, `${name}-${format}-at-${still}s.png`);
    await page.evaluate((t) => window.seek(t), Number(still));
    await page.screenshot({ path: file });
    console.log(`✓ ${file}`);
    await page.close();
    return;
  }

  const frames = Math.round(duration * fps);
  const file = join(outDir, `${name}-${format}.mp4`);
  const audio = music
    ? ["-i", music]
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]; // silent track: some apps reject videos without audio
  const fadeOut = Math.max(0, duration - 1.5).toFixed(2);
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    ...audio,
    "-map", "0:v", "-map", "1:a", "-t", duration.toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps),
    "-c:a", "aac", "-b:a", "160k", ...(music ? ["-af", `afade=t=in:d=0.3,afade=t=out:st=${fadeOut}:d=1.5`] : []),
    "-movflags", "+faststart", file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => ff.on("close", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited with ${c}`)))));

  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.seek(t), i / fps);
    const png = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % fps === 0) process.stdout.write(`\r${name} ${format}: ${Math.round((i / frames) * 100)}%`);
  }
  ff.stdin.end();
  await done;
  await page.close();
  console.log(`\r✓ ${file} (${duration.toFixed(1)} s, ${((Date.now() - t0) / 1000).toFixed(0)} s to render)`);
}

function die(msg) { console.error(msg); process.exit(1); }
