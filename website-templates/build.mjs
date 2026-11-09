/**
 * Builds the WordPress themes in themes/*.mjs into dist/<slug>/ and dist/<slug>.zip, plus a static preview
 * (dist/<slug>-preview/index.html) used for screenshot.png and shop pictures.
 *
 *   node build.mjs            build every theme
 *   node build.mjs ap-ignite  build one
 *   node build.mjs --shots    also take screenshots (needs Playwright + Chromium)
 */
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as b from "./lib/blocks.mjs";
import { accountPatterns, footerPart, functionsPhp, headerPart, patternPhp, readme, styleCss, templates, themeJson } from "./lib/theme.mjs";
import { previewHtml } from "./lib/preview.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const args = process.argv.slice(2);
const shots = args.includes("--shots");
const only = args.filter((a) => !a.startsWith("--"));

const write = (file, content) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content); };

async function build(t) {
  t = { ...t, patterns: [...t.patterns, ...accountPatterns(t)] };
  const out = join(dist, t.slug);
  rmSync(out, { recursive: true, force: true });
  rmSync(join(dist, `${t.slug}.zip`), { force: true });

  // ---- theme files (WordPress mode) ----
  Object.assign(b.ctx, { mode: "wp", slug: t.slug });
  const json = themeJson(t);
  write(join(out, "style.css"), styleCss(t));
  write(join(out, "theme.json"), JSON.stringify(json, null, "\t") + "\n");
  write(join(out, "functions.php"), functionsPhp(t));
  write(join(out, "readme.txt"), readme(t));
  write(join(out, "parts/header.html"), headerPart(t));
  write(join(out, "parts/footer.html"), footerPart(t));
  for (const [name, html] of Object.entries(templates(t))) write(join(out, "templates", name), html);
  for (const p of t.patterns) write(join(out, "patterns", `${p.slug}.php`), patternPhp(t, p, p.render()));
  for (const [name, svg] of Object.entries(t.images)) write(join(out, "assets/images", name), svg);
  for (const [name, svg] of Object.entries(t.icons)) write(join(out, "assets/images/icons", name), svg);
  cpSync(join(root, "lib/ap-3d.js"), join(out, "assets/js/ap-3d.js"));
  for (const f of Object.values(t.fonts)) {
    for (const file of [...f.files, f.license]) cpSync(join(root, "fonts", file), join(out, "assets/fonts", file));
  }

  // ---- preview (static HTML) ----
  Object.assign(b.ctx, { mode: "preview", previewPosts: t.previewPosts, previewSiteTitle: t.name });
  const pv = join(dist, `${t.slug}-preview`);
  rmSync(pv, { recursive: true, force: true });
  cpSync(join(out, "assets"), join(pv, "assets"), { recursive: true });
  const home = headerPart(t) + `<main class="wp-block-group">${t.home.map((slug) => t.patterns.find((p) => p.slug === slug).render()).join("")}</main>` + footerPart(t);
  write(join(pv, "index.html"), previewHtml(t, json, home, styleCss(t)));
  for (const p of t.patterns.filter((x) => x.page)) write(join(pv, `${p.slug}.html`), previewHtml(t, json, headerPart(t) + `<main class="wp-block-group">${p.render()}</main>` + footerPart(t), styleCss(t)));
  b.ctx.mode = "wp";

  if (shots) {
    const { chromium } = createRequire(import.meta.url)("playwright"); // installed globally in this sandbox
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await page.goto(`file://${join(pv, "index.html")}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, "screenshot.png") }); // WordPress theme picture (1200×900)
    const big = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await big.goto(`file://${join(pv, "index.html")}`);
    await big.waitForTimeout(400);
    await big.screenshot({ path: join(dist, `${t.slug}-full.png`), fullPage: true });
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    await phone.goto(`file://${join(pv, "index.html")}`);
    await phone.waitForTimeout(400);
    await phone.screenshot({ path: join(dist, `${t.slug}-phone.png`), fullPage: true });
    await browser.close();
  }

  // ---- zip (folder name = theme slug, as WordPress expects) ----
  execFileSync("zip", ["-qr", `${t.slug}.zip`, t.slug], { cwd: dist });
  console.log(`built ${t.slug} → dist/${t.slug}.zip`);
}

const files = readdirSync(join(root, "themes")).filter((f) => f.endsWith(".mjs"));
for (const f of files) {
  const t = (await import(`./themes/${f}`)).default;
  if (only.length && !only.includes(t.slug)) continue;
  await build(t);
}
