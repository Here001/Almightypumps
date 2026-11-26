#!/usr/bin/env node
/**
 * Almighty Pumps video maker: turns an ad script (ads/<name>.json) into HD MP4s with 3D, effects and sound.
 *
 *   node render.mjs ads/01-brand.json                  # 9:16, 1:1 and 16:9
 *   node render.mjs ads/01-brand.json --formats 9x16   # one size
 *   node render.mjs --all                              # every script in ads/
 *   node render.mjs ads/01-brand.json --still 4.5      # PNG of one moment (quick check)
 *   node render.mjs ads/01-brand.json --music song.mp3 # your own music under the sound effects
 *   options: --fps 30|60, --scale 2 (4K-ish: 2160 wide), --no-sound, --footage <folder with app recordings>
 *
 * Needs Node 18+, ffmpeg and Playwright's Chromium (see README.md). Output: out/ (not saved in git).
 */
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve, basename, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAudio } from "./audio.mjs";

const { chromium } = createRequire(import.meta.url)("playwright"); // require() also finds a global install
const HERE = dirname(fileURLToPath(import.meta.url));
const FORMATS = { "9x16": [1080, 1920], "1x1": [1080, 1080], "16x9": [1920, 1080] };

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(`--${name}`);
const valueFlags = new Set(["--formats", "--music", "--still", "--fps", "--out", "--scale", "--footage", "--from", "--to"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1]));

const fps = Number(opt("fps", 30));
const scale = Number(opt("scale", 1));
const formats = opt("formats", Object.keys(FORMATS).join(",")).split(",").map((f) => f.trim().replace(":", "x"));
const music = opt("music");
const still = opt("still");
const outDir = resolve(opt("out", join(HERE, "out")));
const footageDir = resolve(opt("footage", join(HERE, "footage")));
const cacheDir = join(HERE, "out", ".cache");

for (const f of formats) if (!FORMATS[f]) die(`Unknown format "${f}". Use 9x16, 1x1 or 16x9.`);
if (music && !existsSync(music)) die(`Music file not found: ${music}`);

let scripts = positional.map((p) => (existsSync(p) ? p : join(HERE, p)));
if (flag("all")) scripts = readdirSync(join(HERE, "ads")).filter((f) => f.endsWith(".json")).sort().map((f) => join(HERE, "ads", f));
if (!scripts.length) die("Give an ad script, e.g. node render.mjs ads/01-brand.json (or --all).");

mkdirSync(outDir, { recursive: true });
const server = await serve(HERE);
const port = server.address().port;
const browser = await chromium.launch({ args: ["--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
try {
  for (const file of scripts) {
    const ad = JSON.parse(readFileSync(file, "utf8"));
    const name = ad.name || basename(file, ".json");
    const clips = prepareClips(ad);
    for (const f of formats) await renderOne(ad, name, f, clips);
  }
} finally {
  await browser.close();
  server.close();
}

async function renderOne(ad, name, format, clips) {
  const [w, h] = FORMATS[format];
  const page = await browser.newPage({ viewport: { width: w * scale, height: h * scale }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[page] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.error(`[page ${m.type()}] ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/${ad.player === "toon" ? "player-toon" : "player"}/index.html`);
  await page.waitForFunction(() => typeof window.loadAd === "function");
  const { duration, cues } = await page.evaluate(([a, f, c]) => window.loadAd(a, f, { clips: c }), [ad, format, clips]);

  if (still !== undefined) {
    for (const s of String(still).split(",")) {
      const file = join(outDir, `${name}-${format}-at-${s}s.png`);
      await page.evaluate((t) => window.seek(t), Number(s));
      await page.screenshot({ path: file });
      console.log(`✓ ${file}`);
    }
    await page.close();
    return;
  }

  const from = Number(opt("from", 0)), to = Math.min(duration, Number(opt("to", duration)));
  const frames = Math.round((to - from) * fps);
  const file = join(outDir, `${name}-${format}.mp4`);
  const audioIn = [];
  if (!flag("no-sound")) {
    mkdirSync(cacheDir, { recursive: true });
    const wav = join(cacheDir, `${name}.wav`);
    writeFileSync(wav, renderAudio({ duration, cues, bpm: ad.sound?.bpm || 100, beat: music ? false : ad.sound?.beat !== false, key: ad.sound?.key || 45, seed: hash(name), padLevel: music ? 0.4 : 1 }));
    audioIn.push("-i", wav);
    if (music) audioIn.push("-i", music);
  }
  const fadeOut = Math.max(0, to - from - 1.2).toFixed(2);
  const audioArgs = !audioIn.length
    ? ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-map", "0:v", "-map", "1:a"]
    : music
      ? ["-filter_complex", `[2:a]volume=0.75,afade=t=in:d=0.4,afade=t=out:st=${fadeOut}:d=1.2[m];[1:a]atrim=start=${from},asetpts=PTS-STARTPTS[s];[m][s]amix=inputs=2:normalize=0[a]`, "-map", "0:v", "-map", "[a]"]
      : ["-filter_complex", `[1:a]atrim=start=${from},asetpts=PTS-STARTPTS[a]`, "-map", "0:v", "-map", "[a]"];
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    ...audioIn,
    ...audioArgs,
    "-t", (to - from).toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-maxrate", "16M", "-bufsize", "32M", "-pix_fmt", "yuv420p", "-r", String(fps), "-profile:v", "high",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => ff.on("close", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited with ${c}`)))));

  // Capturing through the DevTools protocol is ~10x faster than page.screenshot(); two animation
  // frames after each seek make sure the new picture is on screen before it is captured.
  const cdp = await page.context().newCDPSession(page);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(async (t) => { await window.seek(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, from + i / fps);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 95, optimizeForSpeed: true });
    const img = Buffer.from(data, "base64");
    if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % fps === 0) process.stdout.write(`\r${name} ${format}: ${Math.round((i / frames) * 100)}%   `);
  }
  ff.stdin.end();
  await done;
  await page.close();
  console.log(`\r✓ ${file} (${duration.toFixed(1)} s, rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

/** Cut app recordings used by phone scenes into numbered JPEG frames (cached). */
function prepareClips(ad) {
  const counts = {};
  for (const s of ad.scenes) {
    if (!s.clip || counts[s.clip] !== undefined) continue;
    const src = join(footageDir, s.clip);
    if (!existsSync(src)) { console.warn(`! App recording not found: ${src} (the phone will show a blank screen)`); counts[s.clip] = 0; continue; }
    const dir = join(cacheDir, "frames", s.clip);
    const stamp = join(dir, ".done");
    if (!existsSync(stamp) || statSync(stamp).mtimeMs < statSync(src).mtimeMs) {
      mkdirSync(dir, { recursive: true });
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", "fps=30,scale=720:-2", "-q:v", "3", join(dir, "%05d.jpg")]);
      writeFileSync(stamp, "");
    }
    counts[s.clip] = readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
  }
  return counts;
}

/** Tiny static file server so the page can load three.js modules, fonts and frames. */
function serve(root) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
      if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
      res.end(readFileSync(path));
    });
    s.listen(0, "127.0.0.1", () => ok(s));
  });
}

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function die(msg) { console.error(msg); process.exit(1); }
