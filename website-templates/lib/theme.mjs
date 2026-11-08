/**
 * Turns a theme config (themes/*.mjs) into the files of a WordPress block theme: style.css, theme.json, functions.php,
 * templates, template parts, patterns, readme. Every theme shares this structure; only colours, fonts, images and the
 * section patterns differ.
 */
import * as b from "./blocks.mjs";

export const SPACING = [
  ["10", "0.5rem"], ["20", "0.75rem"], ["30", "1rem"], ["40", "1.5rem"], ["50", "2.25rem"], ["60", "3.25rem"],
  ["70", "4.5rem"], ["80", "clamp(4rem, 8vw, 7rem)"],
];
export const FONT_SIZES = [
  { slug: "small", name: "Small", size: "0.875rem", fluid: false },
  { slug: "medium", name: "Medium", size: "1.0625rem", fluid: false },
  { slug: "large", name: "Large", size: "1.375rem", fluid: { min: "1.2rem", max: "1.375rem" } },
  { slug: "x-large", name: "Extra large", size: "2.125rem", fluid: { min: "1.625rem", max: "2.125rem" } },
  { slug: "xx-large", name: "Huge", size: "3.25rem", fluid: { min: "2.25rem", max: "3.25rem" } },
  { slug: "giant", name: "Giant", size: "4.5rem", fluid: { min: "2.75rem", max: "4.5rem" } },
];
// Preview needs the computed clamp() the way WordPress writes it.
const fluid = (f) => (f.fluid ? `clamp(${f.fluid.min}, calc(${f.fluid.min} + ((1vw - 0.2rem) * ${((parseFloat(f.fluid.max) - parseFloat(f.fluid.min)) * 16 / 10.2).toFixed(3)})), ${f.fluid.max})` : f.size);

export function themeJson(t) {
  const fam = (key) => {
    const f = t.fonts[key];
    return {
      fontFamily: `"${f.name}", ${f.fallback ?? "system-ui, sans-serif"}`, name: f.name, slug: key,
      fontFace: f.files.map((file) => ({ fontFamily: f.name, fontStyle: file.includes("italic") ? "italic" : "normal", fontWeight: f.weight ?? "200 800", fontDisplay: "swap", src: [`file:./assets/fonts/${file}`] })),
    };
  };
  const palette = Object.entries(t.palette).map(([slug, color]) => ({ slug, color, name: slug.replace(/(^|-)\w/g, (m) => m.replace("-", " ").toUpperCase()) }));
  return {
    $schema: "https://schemas.wp.org/wp/6.5/theme.json",
    version: 2,
    settings: {
      appearanceTools: true,
      useRootPaddingAwareAlignments: true,
      layout: { contentSize: "760px", wideSize: "1200px" },
      color: { palette, gradients: t.gradients, defaultPalette: false, defaultGradients: false, defaultDuotone: false },
      typography: {
        fluid: true, defaultFontSizes: false, fontFamilies: [fam("heading"), fam("body")],
        fontSizes: FONT_SIZES.map(({ slug, name, size, fluid: fl }) => ({ slug, name, size, fluid: fl })),
      },
      spacing: { units: ["px", "em", "rem", "%", "vh", "vw"], spacingSizes: SPACING.map(([slug, size], i) => ({ slug, size, name: String(i + 1) })) },
      custom: { radius: t.radius ?? "16px" },
    },
    styles: {
      color: { background: "var(--wp--preset--color--base)", text: "var(--wp--preset--color--contrast)" },
      typography: { fontFamily: "var(--wp--preset--font-family--body)", fontSize: "var(--wp--preset--font-size--medium)", lineHeight: "1.65" },
      spacing: { blockGap: "1.25rem", padding: { left: "var(--wp--preset--spacing--40)", right: "var(--wp--preset--spacing--40)" } },
      elements: {
        heading: { typography: { fontFamily: "var(--wp--preset--font-family--heading)", fontWeight: t.fonts.heading.boldWeight ?? "750", lineHeight: "1.12", letterSpacing: t.fonts.heading.tracking ?? "-0.02em" }, color: { text: "var(--wp--preset--color--heading)" } },
        h1: { typography: { fontSize: "var(--wp--preset--font-size--giant)" } },
        h2: { typography: { fontSize: "var(--wp--preset--font-size--xx-large)" } },
        h3: { typography: { fontSize: "var(--wp--preset--font-size--large)" } },
        h4: { typography: { fontSize: "var(--wp--preset--font-size--medium)" } },
        link: { color: { text: "var(--wp--preset--color--primary)" }, ":hover": { typography: { textDecoration: "none" } } },
        button: {
          color: { background: "var(--wp--preset--color--primary)", text: "var(--wp--preset--color--on-primary)" },
          typography: { fontFamily: "var(--wp--preset--font-family--heading)", fontWeight: "650", fontSize: "var(--wp--preset--font-size--medium)" },
          border: { radius: t.buttonRadius ?? "999px" },
          spacing: { padding: { top: "0.85rem", bottom: "0.85rem", left: "1.6rem", right: "1.6rem" } },
          ":hover": { color: { background: "var(--wp--preset--color--primary-dark)" } },
        },
      },
      blocks: {
        "core/navigation": { typography: { fontSize: "var(--wp--preset--font-size--small)", fontWeight: "550" } },
        "core/site-title": { typography: { fontFamily: "var(--wp--preset--font-family--heading)", fontWeight: "800", fontSize: "1.25rem" }, elements: { link: { color: { text: "var(--wp--preset--color--heading)" }, typography: { textDecoration: "none" } } } },
        "core/post-title": { elements: { link: { color: { text: "var(--wp--preset--color--heading)" }, typography: { textDecoration: "none" } } } },
        "core/separator": { color: { text: "var(--wp--preset--color--border)" } },
        "core/details": { border: { bottom: { color: "var(--wp--preset--color--border)", width: "1px", style: "solid" } }, spacing: { padding: { top: "1rem", bottom: "1rem" } } },
      },
    },
    templateParts: [{ name: "header", title: "Header", area: "header" }, { name: "footer", title: "Footer", area: "footer" }],
    customTemplates: [
      { name: "page-landing", title: "Full-width page (no title)", postTypes: ["page"] },
      { name: "page-wide", title: "Wide page with title", postTypes: ["page"] },
    ],
  };
}

export function styleCss(t) {
  return `/*
Theme Name: ${t.name}
Theme URI: https://almightypumps.com/services
Author: Almighty Pumps
Author URI: https://almightypumps.com
Description: ${t.description}
Requires at least: 6.4
Tested up to: 6.8
Requires PHP: 7.4
Version: ${t.version}
License: GNU General Public License v2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Text Domain: ${t.slug}
Tags: block-patterns, full-site-editing, one-column, wide-blocks, custom-colors, custom-logo, editor-style, threaded-comments, translation-ready
*/

${SHARED_CSS}
${t.css ?? ""}`;
}

/** Extra CSS every theme gets: block styles registered in functions.php, small polish, accessibility. */
const SHARED_CSS = `/* Block styles: Card, Eyebrow, Icon, Soft shadow */
.is-style-card {
  background: var(--wp--preset--color--surface);
  border: 1px solid var(--wp--preset--color--border);
  border-radius: var(--wp--custom--radius);
  padding: clamp(1.25rem, 3vw, 2rem);
  transition: transform .2s ease, box-shadow .2s ease;
}
.is-style-card:hover { transform: translateY(-2px); box-shadow: 0 18px 40px -24px rgb(0 0 0 / .35); }
.is-style-eyebrow {
  display: inline-block; width: fit-content;
  padding: .3rem .85rem; border-radius: 999px;
  background: var(--wp--preset--color--tint); color: var(--wp--preset--color--primary);
  font-size: var(--wp--preset--font-size--small); font-weight: 650; letter-spacing: .02em;
}
.has-text-align-center.is-style-eyebrow { margin-left: auto; margin-right: auto; }
.is-style-icon img { width: 48px; height: 48px; }
.is-style-icon { margin: 0; }
.is-style-soft-shadow img { border-radius: var(--wp--custom--radius); box-shadow: 0 40px 80px -40px rgb(0 0 0 / .45); }
.wp-block-image.is-style-rounded-img img { border-radius: var(--wp--custom--radius); }

/* Sections with their own text colour (e.g. dark bands): headings and links follow it */
.has-text-color :is(h1, h2, h3, h4, h5, h6) { color: inherit; }
.has-text-color > .wp-block-buttons .is-style-outline > .wp-block-button__link { color: inherit; }
html { scroll-behavior: smooth; scroll-padding-top: 90px; }
/* No gaps between header, page and footer (sections carry their own spacing) */
.wp-site-blocks > * { margin-block-start: 0; }

/* Prices and tags */
.ap-price { font-family: var(--wp--preset--font-family--heading); font-weight: 800; letter-spacing: -0.02em; }
.ap-muted, .ap-muted a { color: var(--wp--preset--color--muted); }
.ap-featured { border-color: var(--wp--preset--color--primary) !important; box-shadow: 0 0 0 1px var(--wp--preset--color--primary); }

/* Buttons */
.wp-block-button .wp-block-button__link { transition: background-color .2s ease, transform .2s ease; }
.wp-block-button .wp-block-button__link:hover { transform: translateY(-1px); }
.wp-block-button.is-style-outline > .wp-block-button__link { border: 1.5px solid currentColor; background: transparent; color: inherit; }
.wp-block-button.is-style-outline > .wp-block-button__link:hover { background: var(--wp--preset--color--tint); }

/* FAQ */
.wp-block-details summary { cursor: pointer; font-weight: 650; font-family: var(--wp--preset--font-family--heading); list-style: none; display: flex; justify-content: space-between; gap: 1rem; }
.wp-block-details summary::-webkit-details-marker { display: none; }
.wp-block-details summary::after { content: "+"; font-size: 1.4em; line-height: 1; color: var(--wp--preset--color--primary); }
.wp-block-details[open] summary::after { content: "–"; }
.wp-block-details > p { color: var(--wp--preset--color--muted); }

/* Header */
.ap-header { position: sticky; top: 0; z-index: 50; backdrop-filter: saturate(160%) blur(10px); }
.admin-bar .ap-header { top: 32px; }
@media (max-width: 782px) { .admin-bar .ap-header { top: 46px; } .ap-header-cta { display: none; } }

/* Card grids: 2 columns on tablets, 1 on phones (WordPress keeps a fixed column count otherwise) */
@media (max-width: 1000px) { .wp-block-group.is-layout-grid, .wp-block-post-template.is-layout-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
@media (max-width: 640px) { .wp-block-group.is-layout-grid, .wp-block-post-template.is-layout-grid { grid-template-columns: 1fr !important; } }

/* Accessibility */
:where(a, button, summary, input, select, textarea):focus-visible { outline: 2px solid var(--wp--preset--color--primary); outline-offset: 3px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

export function functionsPhp(t) {
  const fn = t.slug.replace(/-/g, "_");
  return `<?php
/**
 * ${t.name} theme setup. Everything else (colours, fonts, layout) lives in theme.json.
 *
 * @package ${t.slug}
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Theme stylesheet on the site and in the editor. */
function ${fn}_setup() {
	add_theme_support( 'wp-block-styles' );
	add_theme_support( 'editor-styles' );
	add_editor_style( 'style.css' );
	load_theme_textdomain( '${t.slug}', get_template_directory() . '/languages' );
}
add_action( 'after_setup_theme', '${fn}_setup' );

function ${fn}_styles() {
	wp_enqueue_style( '${t.slug}-style', get_stylesheet_uri(), array(), wp_get_theme()->get( 'Version' ) );
}
add_action( 'wp_enqueue_scripts', '${fn}_styles' );

/** Pattern categories and the extra block styles the patterns use. */
function ${fn}_register() {
	register_block_pattern_category( '${t.slug}', array( 'label' => __( '${t.name} sections', '${t.slug}' ) ) );
	register_block_pattern_category( '${t.slug}-pages', array( 'label' => __( '${t.name} full pages', '${t.slug}' ) ) );

	register_block_style( 'core/group', array( 'name' => 'card', 'label' => __( 'Card', '${t.slug}' ) ) );
	register_block_style( 'core/paragraph', array( 'name' => 'eyebrow', 'label' => __( 'Label', '${t.slug}' ) ) );
	register_block_style( 'core/image', array( 'name' => 'icon', 'label' => __( 'Icon', '${t.slug}' ) ) );
	register_block_style( 'core/image', array( 'name' => 'soft-shadow', 'label' => __( 'Soft shadow', '${t.slug}' ) ) );
	register_block_style( 'core/image', array( 'name' => 'rounded-img', 'label' => __( 'Rounded corners', '${t.slug}' ) ) );
}
add_action( 'init', '${fn}_register' );
`;
}

export function patternPhp(t, p, markup) {
  const cats = (p.categories ?? [t.slug]).join(", ");
  return `<?php
/**
 * Title: ${p.title}
 * Slug: ${t.slug}/${p.slug}
 * Categories: ${cats}
 * Description: ${p.description ?? ""}
 * Viewport Width: 1400${p.page ? `\n * Block Types: core/post-content\n * Post Types: page` : ""}${p.inserter === false ? "\n * Inserter: no" : ""}
 *
 * @package ${t.slug}
 */
?>
${markup.trim()}
`;
}

/* ---------------- template parts and templates ---------------- */

export function headerPart(t) {
  return b.group({ align: "full", className: "ap-header", bg: "base", pad: [20, 20], layout: { type: "constrained" } },
    b.row(
      b.row(b.siteLogo() + b.siteTitle(), { wrap: false, gap: 20 })
      + b.row(b.navigation(t.nav) + (t.headerCta ? b.group({ className: "ap-header-cta", layout: { type: "flex" } }, b.buttons([t.headerCta])) : ""), { wrap: false, gap: 50 }),
      { align: "wide", justify: "space-between" },
    ));
}

export function footerPart(t) {
  const f = t.footer;
  const col = (title, lines) => b.stack(b.heading(title, { level: 4, size: "medium" }) + lines.map((l) => b.para(l, { className: "ap-muted" })).join(""), { gap: 10 });
  return b.group({ align: "full", bg: f.bg ?? "surface", pad: [70, 50], layout: { type: "constrained" } },
    b.columns([
      { width: "40%", inner: b.stack(b.row(b.siteLogo() + b.siteTitle(), { wrap: false, gap: 20 }) + b.para(f.about, { className: "ap-muted" }), { gap: 30 }) },
      ...f.columns.map((c) => col(c.title, c.lines)),
    ], { align: "wide" })
    + b.spacer("24px") + b.separator()
    + b.row(b.copyright(f.copyright ?? "All rights reserved.") + b.para(f.small ?? "", { size: "small", className: "ap-muted" }), { align: "wide", justify: "space-between" }));
}

const part = (slug) => `<!-- wp:template-part {"slug":"${slug}","tagName":"${slug}"} /-->\n`;
const main = (inner, o = {}) => b.group({ tag: "main", pad: o.pad ?? [70, 80], layout: { type: "constrained" }, ...o }, inner);
const titleBlock = `<!-- wp:post-title {"level":1,"style":{"spacing":{"margin":{"bottom":"var:preset|spacing|50"}}}} /-->\n`;
const content = `<!-- wp:post-content {"layout":{"type":"constrained"}} /-->\n`;
const pattern = (t, slug) => `<!-- wp:pattern {"slug":"${t.slug}/${slug}"} /-->\n`;

export function templates(t) {
  const blogList = (heading) => main(
    (heading ?? `<!-- wp:query-title {"type":"archive"} /-->\n`)
    + `<!-- wp:query {"queryId":1,"query":{"perPage":9,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":true},"align":"wide"} -->
<div class="wp-block-query alignwide"><!-- wp:post-template {"layout":{"type":"grid","columnCount":3}} -->
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9","style":{"border":{"radius":"14px"}}} /-->
<!-- wp:post-date {"fontSize":"small"} /-->
<!-- wp:post-title {"isLink":true,"fontSize":"large"} /-->
<!-- wp:post-excerpt {"excerptLength":24} /-->
<!-- /wp:post-template -->
<!-- wp:query-pagination {"layout":{"type":"flex","justifyContent":"center"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p>Nothing here yet.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results --></div>
<!-- /wp:query -->\n`, { layout: { type: "constrained" } });
  return {
    "front-page.html": part("header") + b.group({ tag: "main", gap: "0", layout: { type: "default" } }, t.home.map((s) => pattern(t, s)).join("")) + part("footer"),
    "index.html": part("header") + blogList(b.heading("Latest news", { level: 1 })) + part("footer"),
    "home.html": part("header") + blogList(b.heading("Blog", { level: 1 })) + part("footer"),
    "archive.html": part("header") + blogList() + part("footer"),
    "search.html": part("header") + blogList(`<!-- wp:query-title {"type":"search"} /-->\n<!-- wp:search {"label":"Search","showLabel":false,"buttonText":"Search"} /-->\n`) + part("footer"),
    "page.html": part("header") + main(titleBlock + content) + part("footer"),
    "page-wide.html": part("header") + main(`<!-- wp:post-title {"level":1,"align":"wide"} /-->\n` + `<!-- wp:post-content {"align":"wide","layout":{"type":"constrained","contentSize":"1200px"}} /-->\n`) + part("footer"),
    "page-landing.html": part("header") + b.group({ tag: "main", gap: "0", layout: { type: "default" } }, `<!-- wp:post-content {"layout":{"type":"default"}} /-->\n`) + part("footer"),
    "single.html": part("header") + main(
      `<!-- wp:post-date {"fontSize":"small"} /-->\n` + titleBlock
      + `<!-- wp:post-featured-image {"aspectRatio":"16/9","style":{"border":{"radius":"18px"}}} /-->\n` + content
      + b.spacer("40px") + b.separator()
      + `<!-- wp:post-navigation-link {"type":"previous","label":"Previous"} /-->\n<!-- wp:post-navigation-link {"label":"Next"} /-->\n`
      + `<!-- wp:comments -->\n<div class="wp-block-comments"><!-- wp:comments-title /-->\n<!-- wp:comment-template -->\n<!-- wp:comment-author-name /-->\n<!-- wp:comment-date /-->\n<!-- wp:comment-content /-->\n<!-- wp:comment-reply-link /-->\n<!-- /wp:comment-template -->\n<!-- wp:post-comments-form /--></div>\n<!-- /wp:comments -->\n`) + part("footer"),
    "404.html": part("header") + main(b.heading("Page not found", { level: 1, align: "center" }) + b.para("Sorry, this page has moved or no longer exists. Try a search, or go back to the home page.", { align: "center" })
      + `<!-- wp:search {"label":"Search","showLabel":false,"buttonText":"Search"} /-->\n` + b.buttons([{ text: "Back to home", href: "/" }], { justify: "center" })) + part("footer"),
  };
}

export function readme(t) {
  return `=== ${t.name} ===
Contributors: Almighty Pumps
Requires at least: 6.4
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: ${t.version}
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

${t.description}

== Installation ==

1. In your WordPress dashboard go to Appearance > Themes > Add New Theme > Upload Theme.
2. Choose ${t.slug}.zip, click Install Now, then Activate.
3. Go to Appearance > Editor to change the home page, header and footer. Click any text or image to edit it.
4. Settings > General: set your Site Title (it shows in the header). Appearance > Editor > Styles lets you change colours and fonts for the whole site.
5. To add more pages: Pages > Add New, then pick one of the "${t.name} full pages" designs that pops up.

Replace every sample text, phone number, WhatsApp link, email, price and picture with your own before you publish.
Contact forms: install the free "WPForms Lite" or "Contact Form 7" plugin and paste its form block where you want it.

== Support ==

Need help setting it up? Order "We set it up for you" at https://almightypumps.com or email support@almightypumps.com.

== Copyright ==

${t.name} WordPress Theme, (C) ${new Date().getFullYear()} Almighty Pumps.
${t.name} is distributed under the terms of the GNU GPL v2 or later.

This theme bundles the following third-party resources:

${Object.values(t.fonts).map((f) => `${f.name} font, Copyright ${f.copyright}. License: SIL Open Font License 1.1 (assets/fonts/${f.license}).`).join("\n")}
Illustrations and icons: made for this theme, (C) Almighty Pumps, GPLv2 or later.
`;
}
