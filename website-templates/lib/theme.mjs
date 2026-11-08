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

/* ---------- Customer area ---------- */
.ap-account-link { display: inline-block; padding: .55rem 1.1rem; border-radius: 999px; border: 1.5px solid var(--wp--preset--color--border); color: var(--wp--preset--color--heading); text-decoration: none; font-weight: 600; font-size: var(--wp--preset--font-size--small); white-space: nowrap; }
.ap-account-link:hover { border-color: var(--wp--preset--color--primary); color: var(--wp--preset--color--primary); }
.ap-account-link.is-signed-in { background: var(--wp--preset--color--primary); border-color: var(--wp--preset--color--primary); color: var(--wp--preset--color--on-primary); }
.ap-header-account p { margin: 0; }
.ap-account { max-width: 460px; margin: 0 auto; background: var(--wp--preset--color--base); border: 1px solid var(--wp--preset--color--border); border-radius: var(--wp--custom--radius); padding: clamp(1.5rem, 4vw, 2.5rem); box-shadow: 0 30px 60px -40px rgb(0 0 0 / .35); }
.ap-account > * + * { margin-top: .9rem; }
.ap-account-title { font-size: var(--wp--preset--font-size--x-large); margin: 0 0 1rem; }
.ap-account-muted { color: var(--wp--preset--color--muted); font-size: var(--wp--preset--font-size--small); }
.ap-account-grid { display: grid; gap: .75rem; margin-top: 1.25rem; }
.ap-account-tile { display: flex; flex-direction: column; padding: 1rem 1.2rem; border: 1px solid var(--wp--preset--color--border); border-radius: 14px; text-decoration: none; color: var(--wp--preset--color--heading); }
.ap-account-tile span { color: var(--wp--preset--color--muted); font-size: var(--wp--preset--font-size--small); }
.ap-account-tile:hover { border-color: var(--wp--preset--color--primary); }
/* Log in form (WordPress) and all WooCommerce account forms */
.ap-account form p, .woocommerce form .form-row { margin: 0 0 1rem; }
.ap-account label, .woocommerce form .form-row label { display: block; font-weight: 600; font-size: var(--wp--preset--font-size--small); margin-bottom: .35rem; color: var(--wp--preset--color--heading); }
.ap-account input[type=text], .ap-account input[type=password], .ap-account input[type=email],
.woocommerce form .input-text, .woocommerce form select, .woocommerce-page form .input-text {
  width: 100%; box-sizing: border-box; padding: .8rem 1rem; font: inherit; color: var(--wp--preset--color--heading);
  background: var(--wp--preset--color--base); border: 1.5px solid var(--wp--preset--color--border); border-radius: 12px;
}
.ap-account input:focus, .woocommerce form .input-text:focus { outline: none; border-color: var(--wp--preset--color--primary); box-shadow: 0 0 0 3px var(--wp--preset--color--tint); }
.ap-account .login-remember label { display: flex; gap: .5rem; align-items: center; font-weight: 500; }
.ap-account input[type=submit], .woocommerce button.button, .woocommerce a.button, .woocommerce .woocommerce-Button {
  background: var(--wp--preset--color--primary) !important; color: var(--wp--preset--color--on-primary) !important; border: 0 !important;
  border-radius: 999px !important; padding: .85rem 1.6rem !important; font-family: var(--wp--preset--font-family--heading); font-weight: 650; cursor: pointer;
}
.ap-account input[type=submit] { width: 100%; }
.ap-account input[type=submit]:hover, .woocommerce button.button:hover, .woocommerce a.button:hover { background: var(--wp--preset--color--primary-dark) !important; }
/* WooCommerce My account */
.woocommerce-account .woocommerce { display: grid; grid-template-columns: 240px 1fr; gap: clamp(1.5rem, 4vw, 3rem); align-items: start; }
.woocommerce-account .woocommerce > .woocommerce-notices-wrapper, .woocommerce-account .woocommerce > .u-columns, .woocommerce-account .woocommerce > h2, .woocommerce-account .woocommerce > form { grid-column: 1 / -1; }
.woocommerce-MyAccount-navigation ul { list-style: none; margin: 0; padding: .5rem; border: 1px solid var(--wp--preset--color--border); border-radius: var(--wp--custom--radius); background: var(--wp--preset--color--surface); }
.woocommerce-MyAccount-navigation li a { display: block; padding: .7rem 1rem; border-radius: 10px; text-decoration: none; color: var(--wp--preset--color--heading); font-weight: 550; }
.woocommerce-MyAccount-navigation li.is-active a, .woocommerce-MyAccount-navigation li a:hover { background: var(--wp--preset--color--base); color: var(--wp--preset--color--primary); box-shadow: 0 6px 16px -10px rgb(0 0 0 / .3); }
.woocommerce-MyAccount-content { min-width: 0; }
.woocommerce-account .u-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
.woocommerce-account .u-columns > div { float: none; width: auto; }
.woocommerce-form-login, .woocommerce-form-register { border: 1px solid var(--wp--preset--color--border) !important; border-radius: var(--wp--custom--radius) !important; padding: clamp(1.25rem, 3vw, 2rem) !important; margin: 0 !important; }
.woocommerce table.shop_table { border-radius: 14px; border-collapse: separate; overflow: hidden; }
@media (max-width: 781px) {
  .woocommerce-account .woocommerce, .woocommerce-account .u-columns { grid-template-columns: 1fr; }
  .ap-header-account { display: none; }
}

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

/* ---------------- Customer area ----------------
 * Works on its own (WordPress log in + "Anyone can register"), and uses WooCommerce's My account when WooCommerce is active.
 * Pages: create "My account" (slug my-account) and "Sign up" (slug sign-up) from the "${t.name} full pages" designs.
 */

/** Where "My account" lives: WooCommerce's page, else a page with the slug my-account, else the profile screen. */
function ${fn}_account_url() {
	if ( function_exists( 'wc_get_page_permalink' ) ) {
		return wc_get_page_permalink( 'myaccount' );
	}
	$page = get_page_by_path( 'my-account' );
	return $page ? get_permalink( $page ) : admin_url( 'profile.php' );
}

/** Sign-up link: WooCommerce account page (it has the sign-up form), our sign-up page, or the WordPress one. */
function ${fn}_signup_url() {
	if ( function_exists( 'wc_get_page_permalink' ) ) {
		return wc_get_page_permalink( 'myaccount' );
	}
	$page = get_page_by_path( 'sign-up' );
	return $page ? get_permalink( $page ) : wp_registration_url();
}

/** [ap_account_link] header button: "Log in" for visitors, "My account" when signed in. */
function ${fn}_account_link() {
	if ( is_user_logged_in() ) {
		return '<a class="ap-account-link is-signed-in" href="' . esc_url( ${fn}_account_url() ) . '">' . esc_html__( 'My account', '${t.slug}' ) . '</a>';
	}
	$url = ( function_exists( 'wc_get_page_permalink' ) || get_page_by_path( 'my-account' ) ) ? ${fn}_account_url() : wp_login_url( home_url( '/' ) );
	return '<a class="ap-account-link" href="' . esc_url( $url ) . '">' . esc_html__( 'Log in', '${t.slug}' ) . '</a>';
}

/** [ap_account] the customer area: WooCommerce My account, or log in form / simple account panel. */
function ${fn}_account() {
	if ( shortcode_exists( 'woocommerce_my_account' ) ) {
		return do_shortcode( '[woocommerce_my_account]' );
	}
	ob_start();
	echo '<div class="ap-account">';
	if ( is_user_logged_in() ) {
		$user = wp_get_current_user();
		/* translators: %s: customer name */
		echo '<h2 class="ap-account-title">' . esc_html( sprintf( __( 'Hello, %s', '${t.slug}' ), $user->display_name ) ) . '</h2>';
		echo '<p class="ap-account-muted">' . esc_html__( 'You are signed in. Manage your details below.', '${t.slug}' ) . '</p>';
		echo '<div class="ap-account-grid">';
		echo '<a class="ap-account-tile" href="' . esc_url( admin_url( 'profile.php' ) ) . '"><strong>' . esc_html__( 'Profile', '${t.slug}' ) . '</strong><span>' . esc_html__( 'Name, email and password', '${t.slug}' ) . '</span></a>';
		echo '<a class="ap-account-tile" href="' . esc_url( home_url( '/' ) ) . '"><strong>' . esc_html__( 'Home', '${t.slug}' ) . '</strong><span>' . esc_html__( 'Back to the website', '${t.slug}' ) . '</span></a>';
		echo '<a class="ap-account-tile" href="' . esc_url( wp_logout_url( home_url( '/' ) ) ) . '"><strong>' . esc_html__( 'Log out', '${t.slug}' ) . '</strong><span>' . esc_html__( 'Sign out of this device', '${t.slug}' ) . '</span></a>';
		echo '</div>';
	} else {
		echo '<h2 class="ap-account-title">' . esc_html__( 'Log in to your account', '${t.slug}' ) . '</h2>';
		wp_login_form(
			array(
				'redirect'       => ${fn}_account_url(),
				'label_username' => __( 'Email or username', '${t.slug}' ),
				'label_log_in'   => __( 'Log in', '${t.slug}' ),
			)
		);
		echo '<p class="ap-account-muted"><a href="' . esc_url( wp_lostpassword_url( ${fn}_account_url() ) ) . '">' . esc_html__( 'Forgot your password?', '${t.slug}' ) . '</a></p>';
		if ( get_option( 'users_can_register' ) ) {
			echo '<p class="ap-account-muted">' . esc_html__( 'New here?', '${t.slug}' ) . ' <a href="' . esc_url( ${fn}_signup_url() ) . '">' . esc_html__( 'Create an account', '${t.slug}' ) . '</a></p>';
		}
	}
	echo '</div>';
	return ob_get_clean();
}

/** [ap_signup] sign-up box: sends people to the right sign-up form, or explains why sign-ups are closed. */
function ${fn}_signup() {
	if ( is_user_logged_in() ) {
		return '<div class="ap-account"><h2 class="ap-account-title">' . esc_html__( 'You are already signed in', '${t.slug}' ) . '</h2><p><a class="ap-account-link is-signed-in" href="' . esc_url( ${fn}_account_url() ) . '">' . esc_html__( 'Go to my account', '${t.slug}' ) . '</a></p></div>';
	}
	if ( shortcode_exists( 'woocommerce_my_account' ) ) {
		return do_shortcode( '[woocommerce_my_account]' );
	}
	if ( get_option( 'users_can_register' ) ) {
		return '<div class="ap-account"><h2 class="ap-account-title">' . esc_html__( 'Create your free account', '${t.slug}' ) . '</h2><p class="ap-account-muted">' . esc_html__( 'Choose a username and enter your email. We will email you a link to set your password.', '${t.slug}' ) . '</p><p><a class="ap-account-link is-signed-in" href="' . esc_url( wp_registration_url() ) . '">' . esc_html__( 'Sign up', '${t.slug}' ) . '</a></p><p class="ap-account-muted">' . esc_html__( 'Already have an account?', '${t.slug}' ) . ' <a href="' . esc_url( ${fn}_account_url() ) . '">' . esc_html__( 'Log in', '${t.slug}' ) . '</a></p></div>';
	}
	if ( current_user_can( 'manage_options' ) ) {
		return '<div class="ap-account"><p>' . esc_html__( 'Admin note: sign-ups are switched off. Turn on Settings > General > "Anyone can register", or install WooCommerce.', '${t.slug}' ) . '</p></div>';
	}
	return '<div class="ap-account"><p>' . esc_html__( 'Sign-ups are closed at the moment. Please contact us.', '${t.slug}' ) . '</p></div>';
}

function ${fn}_shortcodes() {
	add_shortcode( 'ap_account_link', '${fn}_account_link' );
	add_shortcode( 'ap_account', '${fn}_account' );
	add_shortcode( 'ap_signup', '${fn}_signup' );
}
add_action( 'init', '${fn}_shortcodes' );

/** Customers (not staff) don't see the black WordPress admin bar on the website. */
function ${fn}_admin_bar( $show ) {
	return current_user_can( 'edit_posts' ) ? $show : false;
}
add_filter( 'show_admin_bar', '${fn}_admin_bar' );

add_action(
	'after_setup_theme',
	function () {
		add_theme_support( 'woocommerce' );
	}
);

/** The WordPress log in / sign up screen in the theme's colours, with the site logo. */
function ${fn}_login_style() {
	$logo = has_custom_logo() ? wp_get_attachment_image_url( get_theme_mod( 'custom_logo' ), 'medium' ) : '';
	$css  = 'body.login{background:${t.palette.surface};font-family:system-ui,sans-serif}'
		. '.login form{border:1px solid ${t.palette.border};border-radius:18px;box-shadow:0 24px 48px -32px rgba(0,0,0,.35);padding:28px}'
		. '.login .button-primary{background:${t.palette.primary};border-color:${t.palette.primary};border-radius:999px;padding:4px 22px;font-weight:600}'
		. '.login .button-primary:hover,.login .button-primary:focus{background:${t.palette["primary-dark"]};border-color:${t.palette["primary-dark"]}}'
		. '.login input[type=text],.login input[type=password],.login input[type=email]{border-radius:10px;border-color:${t.palette.border}}'
		. '.login input:focus{border-color:${t.palette.primary};box-shadow:0 0 0 1px ${t.palette.primary}}'
		. '.login #nav a,.login #backtoblog a,.login a{color:${t.palette.primary}}'
		. ( $logo ? '.login h1 a{background-image:url(' . esc_url( $logo ) . ');background-size:contain;width:180px;height:80px}' : '.login h1 a{background:none;text-indent:0;width:auto;height:auto;font-size:26px;font-weight:800;color:${t.palette.heading};text-decoration:none}' );
	wp_add_inline_style( 'login', $css );
}
add_action( 'login_enqueue_scripts', '${fn}_login_style' );
add_filter( 'login_headerurl', function () { return home_url( '/' ); } );
add_filter( 'login_headertext', function () { return get_bloginfo( 'name' ); } );
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

/* ---------------- customer area pages (added to every theme) ---------------- */

const LOGIN_SAMPLE = `<div class="ap-account"><h2 class="ap-account-title">Log in to your account</h2><form><p><label>Email or username</label><input type="text"></p><p><label>Password</label><input type="password"></p><p class="login-remember"><label><input type="checkbox"> Remember me</label></p><p><input type="submit" value="Log in"></p></form><p class="ap-account-muted"><a href="#">Forgot your password?</a></p><p class="ap-account-muted">New here? <a href="#">Create an account</a></p></div>`;
const SIGNUP_SAMPLE = `<div class="ap-account"><h2 class="ap-account-title">Create your free account</h2><p class="ap-account-muted">Choose a username and enter your email. We will email you a link to set your password.</p><p><a class="ap-account-link is-signed-in" href="#">Sign up</a></p><p class="ap-account-muted">Already have an account? <a href="#">Log in</a></p></div>`;

export function accountPatterns(t) {
  const head = (title, sub) => b.stack(b.heading(title, { level: 1, align: "center", size: "xx-large" }) + b.para(sub, { align: "center", className: "ap-muted" }), { gap: 20, justify: "center" });
  const pageCat = [`${t.slug}-pages`];
  return [
    { slug: "page-account", title: "My account page (log in + customer area)", page: true, categories: pageCat,
      description: "Use on a page with the slug my-account. Shows the log in form to visitors and the customer area when signed in (WooCommerce My account if WooCommerce is active).",
      render: () => b.section(head("My account", "Log in to see your orders, details and more.") + b.spacer("16px") + b.shortcode("ap_account", LOGIN_SAMPLE), { bg: "surface", pad: [80, 80] }) },
    { slug: "page-signup", title: "Sign up page", page: true, categories: pageCat,
      description: "Use on a page with the slug sign-up. Turn on Settings > General > Anyone can register (or install WooCommerce).",
      render: () => b.section(b.columns([
        { inner: b.stack(b.eyebrow("Free account") + b.heading("Join us in less than a minute", { level: 1, size: "xx-large" })
          + b.para("Tell visitors what they get with an account. Edit this list:", { className: "ap-muted" })
          + b.list(["Track your orders and bookings", "Save your details for faster checkout", "Get member-only offers"], { className: "ap-checks" }), { gap: 20 }) },
        { inner: b.shortcode("ap_signup", SIGNUP_SAMPLE) },
      ], { align: "wide", valign: "center" }), { bg: "surface", pad: [80, 80] }) },
  ];
}

/* ---------------- template parts and templates ---------------- */

export function headerPart(t) {
  return b.group({ align: "full", className: "ap-header", bg: "base", pad: [20, 20], layout: { type: "constrained" } },
    b.row(
      b.row(b.siteLogo() + b.siteTitle(), { wrap: false, gap: 20 })
      + b.row(b.navigation(t.nav)
        + b.group({ className: "ap-header-account", layout: { type: "flex" } }, b.shortcode("ap_account_link", '<a class="ap-account-link" href="#">Log in</a>'))
        + (t.headerCta ? b.group({ className: "ap-header-cta", layout: { type: "flex" } }, b.buttons([t.headerCta])) : ""), { wrap: false, gap: 40 }),
      { align: "wide", justify: "space-between" },
    ));
}

export function footerPart(t) {
  const f = t.footer;
  const col = (title, lines) => b.stack(b.heading(title, { level: 4, size: "medium" }) + lines.map((l) => b.para(l, { className: "ap-muted", size: "small" })).join(""), { gap: 10 });
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

== Customer accounts (log in, sign up, My account) ==

The header has a "Log in" button that becomes "My account" once a customer is signed in.

Selling online? Install WooCommerce. It creates the "My account" page (orders, downloads, addresses, password)
and this theme styles it automatically. To let customers sign up: WooCommerce > Settings > Accounts & Privacy >
tick "Allow customers to create an account on the My account page".

Not using WooCommerce?
1. Settings > General: tick "Anyone can register" and set New User Default Role to "Subscriber".
2. Pages > Add New: title "My account" (the address must end in /my-account), choose the "My account page" design.
3. Pages > Add New: title "Sign up" (address /sign-up), choose the "Sign up page" design.
The WordPress log in screen is also styled in your theme colours and shows your logo (Appearance > Editor > Site logo).
Customers never see the WordPress admin bar on your website.

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
