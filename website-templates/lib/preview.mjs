/**
 * A static HTML preview of a theme's home page, close to what WordPress renders (same block HTML, WordPress block
 * styles, and the theme's colours/fonts/layout written out as WordPress would). Used for screenshot.png and shop
 * pictures. It is NOT part of the theme zip.
 */
import { readFileSync } from "node:fs";
import { FONT_SIZES, SPACING } from "./theme.mjs";

const core = readFileSync(new URL("./preview-core.css", import.meta.url), "utf8");

const fluid = (f) => (f.fluid ? `clamp(${f.fluid.min}, ${f.fluid.min} + ((1vw - 3.2px) * ${((parseFloat(f.fluid.max) - parseFloat(f.fluid.min)) * 16 / 11.2 * 100 / 100).toFixed(3)}), ${f.fluid.max})` : f.size);

export function globalCss(t, json) {
  const s = json.styles;
  const vars = [
    ...Object.entries(t.palette).map(([k, v]) => `--wp--preset--color--${k}:${v}`),
    ...t.gradients.map((g) => `--wp--preset--gradient--${g.slug}:${g.gradient}`),
    ...FONT_SIZES.map((f) => `--wp--preset--font-size--${f.slug}:${fluid(f)}`),
    ...Object.keys(t.fonts).map((k) => `--wp--preset--font-family--${k}:"${t.fonts[k].name}", system-ui, sans-serif`),
    ...SPACING.map(([k, v]) => `--wp--preset--spacing--${k}:${v}`),
    `--wp--style--global--content-size:760px`, `--wp--style--global--wide-size:1200px`,
    `--wp--style--root--padding-left:var(--wp--preset--spacing--40)`, `--wp--style--root--padding-right:var(--wp--preset--spacing--40)`,
    `--wp--custom--radius:${t.radius ?? "16px"}`,
  ];
  const faces = Object.values(t.fonts).flatMap((f) => f.files.map((file) => `@font-face{font-family:"${f.name}";font-style:${file.includes("italic") ? "italic" : "normal"};font-weight:${f.weight ?? "200 800"};font-display:swap;src:url(assets/fonts/${file}) format("woff2")}`));
  const helpers = [
    ...Object.keys(t.palette).map((k) => `.has-${k}-color{color:var(--wp--preset--color--${k}) !important}.has-${k}-background-color{background-color:var(--wp--preset--color--${k}) !important}`),
    ...t.gradients.map((g) => `.has-${g.slug}-gradient-background{background:var(--wp--preset--gradient--${g.slug}) !important}`),
    ...FONT_SIZES.map((f) => `.has-${f.slug}-font-size{font-size:var(--wp--preset--font-size--${f.slug}) !important}`),
  ];
  const el = s.elements;
  const btn = el.button;
  return `${faces.join("\n")}
:root{${vars.join(";")}}
body{margin:0;background:${s.color.background};color:${s.color.text};font-family:${s.typography.fontFamily};font-size:${s.typography.fontSize};line-height:${s.typography.lineHeight};-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,h5,h6{font-family:${el.heading.typography.fontFamily};font-weight:${el.heading.typography.fontWeight};line-height:${el.heading.typography.lineHeight};letter-spacing:${el.heading.typography.letterSpacing};color:${el.heading.color.text};margin:0}
h1{font-size:${el.h1.typography.fontSize}}h2{font-size:${el.h2.typography.fontSize}}h3{font-size:${el.h3.typography.fontSize}}h4{font-size:${el.h4.typography.fontSize}}
p{margin:0}a{color:${el.link.color.text}}
.wp-element-button,.wp-block-button__link{background:${btn.color.background};color:${btn.color.text};font-family:${btn.typography.fontFamily};font-weight:${btn.typography.fontWeight};font-size:${btn.typography.fontSize};border-radius:${btn.border.radius};padding:${btn.spacing.padding.top} ${btn.spacing.padding.right};text-decoration:none;display:inline-block}
.wp-site-blocks{padding:0}
.is-layout-flow>*,.is-layout-constrained>*{margin-block-start:var(--ap-gap,1.25rem);margin-block-end:0}
.is-layout-flow>:first-child,.is-layout-constrained>:first-child{margin-block-start:0}
.is-layout-constrained>:where(:not(.alignleft):not(.alignright):not(.alignfull)){max-width:var(--wp--style--global--content-size);margin-left:auto!important;margin-right:auto!important}
.is-layout-constrained>.alignwide{max-width:var(--wp--style--global--wide-size)}
.wp-block-group.alignfull.is-layout-constrained{padding-left:var(--wp--style--root--padding-left);padding-right:var(--wp--style--root--padding-right)}
.is-layout-flex{display:flex;flex-wrap:wrap;align-items:center;gap:var(--ap-gap,1.25rem)}
.is-layout-flex>*{margin:0}
.is-layout-flex.is-vertical{flex-direction:column;align-items:flex-start}
.is-layout-flex.is-vertical.is-content-justification-center{align-items:center}
.is-content-justification-space-between{justify-content:space-between}.is-content-justification-center{justify-content:center}.is-content-justification-right{justify-content:flex-end}
.is-nowrap{flex-wrap:nowrap}
.is-layout-grid{display:grid;gap:var(--ap-gap,1.25rem);grid-template-columns:repeat(3,minmax(0,1fr))}
.is-layout-grid>*{margin:0}.ap-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.wp-block-columns{gap:2rem 3.5rem;margin:0}
.wp-block-buttons{gap:.75rem}
.wp-block-image{margin:0}.wp-block-image img{max-width:100%;height:auto;display:block}
main.wp-block-group>*{margin-block-start:0 !important}
.ap-nav{display:flex;gap:var(--wp--preset--spacing--40);font-size:var(--wp--preset--font-size--small);font-weight:550}.ap-nav a{color:inherit;text-decoration:none}
.wp-block-site-title{font-family:var(--wp--preset--font-family--heading);font-weight:800;font-size:1.25rem;margin:0}.wp-block-site-title a{color:var(--wp--preset--color--heading);text-decoration:none}
.ap-logo-dot{display:block;width:34px;height:34px;border-radius:10px;background:var(--wp--preset--color--primary)}
.ap-posts .ap-post-img{aspect-ratio:16/9;border-radius:14px;background-size:cover;margin-bottom:1rem}.ap-posts h3{margin-bottom:.5rem}
${helpers.join("\n")}`;
}

export function previewHtml(t, json, body, themeCss) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.name} preview</title>
<style>${core}</style>
<style>${globalCss(t, json)}</style>
<style>${themeCss}</style>
</head><body><div class="wp-site-blocks">${body}</div><script src="assets/js/ap-3d.js"></script></body></html>`;
}
