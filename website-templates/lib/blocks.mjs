/**
 * Tiny helpers that write WordPress block markup (the exact HTML the block editor saves, so blocks open without
 * "unexpected content" warnings). The same functions also render a static PREVIEW of each pattern (used for the
 * theme screenshot and shop pictures): in preview mode they add the layout classes WordPress adds when it renders
 * a page, swap PHP image paths for relative ones, and draw dynamic blocks (site title, menu, latest posts) as samples.
 */

export const ctx = { mode: "wp", slug: "theme", previewPosts: [] };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Text inside blocks: escaped, but allows <strong>, <em>, <br>, <a href> written by us. */
export const txt = (s) => esc(s).replace(/&lt;(\/?)(strong|em|br\s*\/?)&gt;/g, "<$1$2>")
  .replace(/&lt;a href="([^"]*)"&gt;/g, '<a href="$1">').replace(/&lt;\/a&gt;/g, "</a>");
const json = (o) => (o && Object.keys(o).length ? " " + JSON.stringify(o) : "");
const cls = (...c) => c.flat().filter(Boolean).join(" ");
const spacing = (v) => (String(v).startsWith("var:") ? `var(--wp--preset--spacing--${String(v).split("|").pop()})` : v);
const sp = (n) => `var:preset|spacing|${n}`;
const preview = () => ctx.mode === "preview";

/** Image URL: in the theme a PHP call, in the preview a relative path. */
export const img = (file) => (preview() ? `assets/images/${file}` : `<?php echo esc_url( get_theme_file_uri( 'assets/images/${file}' ) ); ?>`);
/** Link that buyers change (phone, WhatsApp, email). */
export const link = (href) => href;

function padStyle(pad) {
  if (!pad) return { style: undefined, css: "" };
  const p = typeof pad === "object" && !Array.isArray(pad) ? pad : { top: pad?.[0] ?? pad, bottom: pad?.[1] ?? pad?.[0] ?? pad };
  const out = {}; let css = "";
  for (const side of ["top", "right", "bottom", "left"]) {
    if (p[side] === undefined) continue;
    out[side] = typeof p[side] === "number" ? sp(p[side]) : p[side];
    css += `padding-${side}:${spacing(out[side])};`;
  }
  return { style: out, css };
}

const layoutClass = (layout) => {
  if (!preview() || !layout) return [];
  if (layout.type === "constrained") return ["is-layout-constrained"];
  if (layout.type === "flex") {
    return ["is-layout-flex", layout.orientation === "vertical" ? "is-vertical" : "",
      layout.justifyContent ? `is-content-justification-${layout.justifyContent}` : "",
      layout.flexWrap === "nowrap" ? "is-nowrap" : "", layout.verticalAlignment ? `is-vertically-aligned-${layout.verticalAlignment}` : ""];
  }
  if (layout.type === "grid") return ["is-layout-grid", `ap-grid-${layout.columnCount ?? 3}`];
  return [];
};

/**
 * Group block. o: { align, bg, gradient, color, pad (number | [top,bottom] | {top,right,bottom,left}), layout, className, tag,
 * radius, minHeight, gap }
 */
export function group(o = {}, inner = "") {
  const attrs = {};
  if (o.tag) attrs.tagName = o.tag;
  if (o.anchor) attrs.anchor = o.anchor;
  if (o.align) attrs.align = o.align;
  const style = {};
  const { style: pad, css: padCss } = padStyle(o.pad);
  if (pad) style.spacing = { padding: pad };
  if (o.gap !== undefined) style.spacing = { ...(style.spacing ?? {}), blockGap: typeof o.gap === "number" ? sp(o.gap) : o.gap };
  if (o.minHeight) style.dimensions = { minHeight: o.minHeight };
  if (o.radius) style.border = { radius: o.radius };
  if (Object.keys(style).length) attrs.style = style;
  if (o.bg) attrs.backgroundColor = o.bg;
  if (o.gradient) attrs.gradient = o.gradient;
  if (o.color) attrs.textColor = o.color;
  if (o.className) attrs.className = o.className;
  attrs.layout = o.layout ?? { type: "constrained" };
  const classes = cls("wp-block-group", o.align && `align${o.align}`, o.className,
    o.color && [`has-${o.color}-color`, "has-text-color"],
    o.bg && [`has-${o.bg}-background-color`], o.gradient && [`has-${o.gradient}-gradient-background`], (o.bg || o.gradient) && "has-background",
    layoutClass(attrs.layout));
  let css = (o.radius ? `border-radius:${o.radius};` : "") + padCss + (o.minHeight ? `min-height:${o.minHeight};` : "");
  if (preview() && o.gap !== undefined) css += `--ap-gap:${spacing(attrs.style.spacing.blockGap)};`;
  const tag = o.tag ?? "div";
  return `<!-- wp:group${json(attrs)} -->\n<${tag}${o.anchor ? ` id="${o.anchor}"` : ""} class="${classes}"${css ? ` style="${css}"` : ""}>${inner}</${tag}>\n<!-- /wp:group -->\n`;
}

/** Horizontal row (flex group). */
export const row = (inner, o = {}) => group({ ...o, layout: { type: "flex", flexWrap: o.wrap === false ? "nowrap" : undefined, justifyContent: o.justify, verticalAlignment: o.valign } }, inner);
/** Vertical stack (flex column). */
export const stack = (inner, o = {}) => group({ ...o, layout: { type: "flex", orientation: "vertical", justifyContent: o.justify } }, inner);
/** Grid of cards (needs WP 6.3+). */
export const grid = (inner, o = {}) => group({ ...o, layout: { type: "grid", columnCount: o.cols ?? 3, minimumColumnWidth: o.min ?? null } }, inner);

/** Section: full-width band with constrained content. */
export const section = (inner, o = {}) => group({ align: "full", pad: o.pad ?? [80, 80], ...o, layout: { type: "constrained" } }, inner);

export function heading(text, o = {}) {
  const level = o.level ?? 2;
  const attrs = {};
  if (o.align) attrs.textAlign = o.align;
  if (level !== 2) attrs.level = level;
  if (o.className) attrs.className = o.className;
  if (o.color) attrs.textColor = o.color;
  if (o.size) attrs.fontSize = o.size;
  const classes = cls("wp-block-heading", o.align && `has-text-align-${o.align}`, o.className, o.color && [`has-${o.color}-color`, "has-text-color"], o.size && `has-${o.size}-font-size`);
  return `<!-- wp:heading${json(attrs)} -->\n<h${level} class="${classes}">${txt(text)}</h${level}>\n<!-- /wp:heading -->\n`;
}

export function para(text, o = {}) {
  const attrs = {};
  if (o.align) attrs.align = o.align;
  if (o.className) attrs.className = o.className;
  if (o.color) attrs.textColor = o.color;
  if (o.size) attrs.fontSize = o.size;
  const classes = cls(o.align && `has-text-align-${o.align}`, o.className, o.color && [`has-${o.color}-color`, "has-text-color"], o.size && `has-${o.size}-font-size`);
  return `<!-- wp:paragraph${json(attrs)} -->\n<p${classes ? ` class="${classes}"` : ""}>${txt(text)}</p>\n<!-- /wp:paragraph -->\n`;
}

/** Small pill label above headings (block style "eyebrow"). */
export const eyebrow = (text, o = {}) => para(text, { ...o, className: cls("is-style-eyebrow", o.className) });

/** Buttons. items: [{ text, href, outline }] */
export function buttons(items, o = {}) {
  const attrs = {};
  if (o.justify) attrs.layout = { type: "flex", justifyContent: o.justify };
  const inner = items.map((b) => {
    const a = b.outline ? { className: "is-style-outline" } : {};
    return `<!-- wp:button${json(a)} -->\n<div class="${cls("wp-block-button", b.outline && "is-style-outline")}"><a class="wp-block-button__link wp-element-button" href="${b.href ?? "#"}">${txt(b.text)}</a></div>\n<!-- /wp:button -->\n`;
  }).join("");
  return `<!-- wp:buttons${json(attrs)} -->\n<div class="${cls("wp-block-buttons", preview() && layoutClass({ type: "flex", justifyContent: o.justify }))}">${inner}</div>\n<!-- /wp:buttons -->\n`;
}

export function image(src, alt, o = {}) {
  const attrs = { sizeSlug: "full", linkDestination: "none" };
  if (o.className) attrs.className = o.className;
  if (o.align) attrs.align = o.align;
  const classes = cls("wp-block-image", o.align && `align${o.align}`, "size-full", o.className);
  return `<!-- wp:image${json(attrs)} -->\n<figure class="${classes}"><img src="${src}" alt="${esc(alt)}"/></figure>\n<!-- /wp:image -->\n`;
}

/** Small icon image (SVG from assets/images/icons). */
export const icon = (file, alt = "") => image(img(`icons/${file}`), alt, { className: "is-style-icon" });

export function list(items, o = {}) {
  const attrs = o.className ? { className: o.className } : {};
  const li = items.map((t) => `<!-- wp:list-item -->\n<li>${txt(t)}</li>\n<!-- /wp:list-item -->\n`).join("");
  return `<!-- wp:list${json(attrs)} -->\n<ul${o.className ? ` class="${o.className}"` : ""}>${li}</ul>\n<!-- /wp:list -->\n`;
}

export const details = (q, a) => `<!-- wp:details -->\n<details class="wp-block-details"><summary>${txt(q)}</summary>${para(a)}</details>\n<!-- /wp:details -->\n`;
export const spacer = (h = "32px") => `<!-- wp:spacer {"height":"${h}"} -->\n<div style="height:${h}" aria-hidden="true" class="wp-block-spacer"></div>\n<!-- /wp:spacer -->\n`;
export const separator = () => `<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->\n`;

/** Columns. cols: array of inner markup, or { inner, width, className }. */
export function columns(cols, o = {}) {
  const attrs = {};
  if (o.align) attrs.align = o.align;
  if (o.valign) attrs.verticalAlignment = o.valign;
  if (o.className) attrs.className = o.className;
  const inner = cols.map((c) => {
    const col = typeof c === "string" ? { inner: c } : c;
    const a = {};
    if (o.valign) a.verticalAlignment = o.valign;
    if (col.width) a.width = col.width;
    if (col.className) a.className = col.className;
    const classes = cls("wp-block-column", o.valign && `is-vertically-aligned-${o.valign}`, col.className, preview() && "is-layout-flow");
    return `<!-- wp:column${json(a)} -->\n<div class="${classes}"${col.width ? ` style="flex-basis:${col.width}"` : ""}>${col.inner}</div>\n<!-- /wp:column -->\n`;
  }).join("");
  const classes = cls("wp-block-columns", o.align && `align${o.align}`, o.valign && `are-vertically-aligned-${o.valign}`, o.className, preview() && "is-layout-flex");
  return `<!-- wp:columns${json(attrs)} -->\n<div class="${classes}">${inner}</div>\n<!-- /wp:columns -->\n`;
}

/** Card = group with the "card" block style. */
export const card = (inner, o = {}) => stack(inner, { ...o, className: cls("is-style-card", o.className), gap: o.gap ?? 20 });

/* ---------- dynamic blocks (rendered by WordPress; samples in the preview) ---------- */

export function siteTitle() {
  return preview() ? `<p class="wp-block-site-title"><a href="#">${esc(ctx.previewSiteTitle ?? "Your Brand")}</a></p>` : `<!-- wp:site-title {"level":0} /-->\n`;
}
export function siteLogo() {
  return preview() ? `<div class="wp-block-site-logo"><span class="ap-logo-dot"></span></div>` : `<!-- wp:site-logo {"width":36,"shouldSyncIcon":true} /-->\n`;
}
export function navigation(items = ["Home", "About", "Services", "Contact"]) {
  if (preview()) return `<nav class="wp-block-navigation ap-nav">${items.map((i) => `<a href="#">${esc(i)}</a>`).join("")}</nav>`;
  return `<!-- wp:navigation {"overlayMenu":"mobile","layout":{"type":"flex","justifyContent":"right"},"style":{"spacing":{"blockGap":"var:preset|spacing|40"}}} /-->\n`;
}
export function latestPosts(n = 3) {
  if (preview()) {
    const posts = ctx.previewPosts.slice(0, n);
    return `<div class="ap-posts alignwide wp-block-group is-layout-grid ap-grid-${n}">${posts.map((p) => `<div class="ap-post"><div class="ap-post-img" style="background-image:url(assets/images/${p.img})"></div><h3 class="has-large-font-size">${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></div>`).join("")}</div>`;
  }
  return `<!-- wp:query {"queryId":${n + 10},"query":{"perPage":${n},"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false},"align":"wide"} -->
<div class="wp-block-query alignwide"><!-- wp:post-template {"layout":{"type":"grid","columnCount":${n}}} -->
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9","style":{"border":{"radius":"14px"}}} /-->
<!-- wp:post-title {"isLink":true,"fontSize":"large"} /-->
<!-- wp:post-excerpt {"excerptLength":22} /-->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p>Your latest articles will appear here once you publish your first post.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results --></div>
<!-- /wp:query -->\n`;
}
export function copyright(text) {
  return preview() ? `<p class="has-small-font-size">© ${new Date().getFullYear()} ${esc(ctx.previewSiteTitle ?? "Your Brand")}. ${esc(text)}</p>` : para(text, { size: "small" });
}
