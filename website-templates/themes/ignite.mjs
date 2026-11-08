/** Ignite: startup / tech company template. */
import * as b from "../lib/blocks.mjs";

const P = {
  base: "#FFFFFF", surface: "#F6F7FB", tint: "#EEF0FF", border: "#E3E6F0",
  contrast: "#3A4157", heading: "#0B1026", muted: "#6B7285",
  primary: "#4F46E5", "primary-dark": "#4338CA", "on-primary": "#FFFFFF",
  accent: "#10B981", dark: "#0B1026", "on-dark": "#C9CEE6",
};

/* ---------- illustrations (original, editable SVG) ---------- */
const hero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" fill="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6D66F2"/><stop offset="1" stop-color="#4F46E5"/></linearGradient>
<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4F46E5" stop-opacity=".35"/><stop offset="1" stop-color="#4F46E5" stop-opacity="0"/></linearGradient></defs>
<rect x="20" y="30" width="600" height="420" rx="24" fill="#fff" stroke="#E3E6F0"/>
<rect x="20" y="30" width="600" height="52" rx="24" fill="#F6F7FB"/><rect x="20" y="58" width="600" height="24" fill="#F6F7FB"/>
<circle cx="52" cy="56" r="6" fill="#F87171"/><circle cx="72" cy="56" r="6" fill="#FBBF24"/><circle cx="92" cy="56" r="6" fill="#34D399"/>
<rect x="20" y="82" width="120" height="368" fill="#F9FAFD"/><rect x="40" y="108" width="80" height="10" rx="5" fill="#C7CBF8"/>
<rect x="40" y="136" width="64" height="8" rx="4" fill="#E3E6F0"/><rect x="40" y="158" width="72" height="8" rx="4" fill="#E3E6F0"/><rect x="40" y="180" width="56" height="8" rx="4" fill="#E3E6F0"/>
<rect x="164" y="104" width="134" height="80" rx="14" fill="url(#g)"/><rect x="180" y="122" width="60" height="8" rx="4" fill="#fff" opacity=".7"/><rect x="180" y="142" width="88" height="18" rx="6" fill="#fff"/>
<rect x="312" y="104" width="134" height="80" rx="14" fill="#F6F7FB" stroke="#E3E6F0"/><rect x="328" y="122" width="56" height="8" rx="4" fill="#C9CDDC"/><rect x="328" y="142" width="80" height="18" rx="6" fill="#0B1026"/>
<rect x="460" y="104" width="136" height="80" rx="14" fill="#F6F7FB" stroke="#E3E6F0"/><rect x="476" y="122" width="56" height="8" rx="4" fill="#C9CDDC"/><rect x="476" y="142" width="72" height="18" rx="6" fill="#10B981"/>
<rect x="164" y="200" width="432" height="228" rx="16" fill="#fff" stroke="#E3E6F0"/>
<path d="M184 390 L240 350 L296 366 L352 300 L408 318 L464 262 L520 280 L576 236 L576 410 L184 410 Z" fill="url(#a)"/>
<path d="M184 390 L240 350 L296 366 L352 300 L408 318 L464 262 L520 280 L576 236" stroke="#4F46E5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="464" cy="262" r="7" fill="#fff" stroke="#4F46E5" stroke-width="4"/>
<rect x="184" y="220" width="120" height="10" rx="5" fill="#0B1026"/><rect x="184" y="240" width="80" height="8" rx="4" fill="#C9CDDC"/>
</svg>`;

const phone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 480" fill="none">
<rect x="40" y="40" width="480" height="400" rx="32" fill="#EEF0FF"/>
<rect x="190" y="70" width="180" height="350" rx="30" fill="#0B1026"/><rect x="200" y="82" width="160" height="326" rx="22" fill="#fff"/>
<rect x="250" y="90" width="60" height="8" rx="4" fill="#0B1026"/>
<rect x="216" y="118" width="128" height="72" rx="14" fill="#4F46E5"/><rect x="230" y="134" width="56" height="8" rx="4" fill="#fff" opacity=".7"/><rect x="230" y="152" width="84" height="16" rx="6" fill="#fff"/>
<rect x="216" y="204" width="128" height="40" rx="12" fill="#F6F7FB"/><circle cx="238" cy="224" r="10" fill="#10B981"/><rect x="256" y="216" width="70" height="7" rx="3.5" fill="#C9CDDC"/><rect x="256" y="229" width="44" height="7" rx="3.5" fill="#E3E6F0"/>
<rect x="216" y="252" width="128" height="40" rx="12" fill="#F6F7FB"/><circle cx="238" cy="272" r="10" fill="#F59E0B"/><rect x="256" y="264" width="64" height="7" rx="3.5" fill="#C9CDDC"/><rect x="256" y="277" width="50" height="7" rx="3.5" fill="#E3E6F0"/>
<rect x="216" y="300" width="128" height="40" rx="12" fill="#F6F7FB"/><circle cx="238" cy="320" r="10" fill="#4F46E5"/><rect x="256" y="312" width="74" height="7" rx="3.5" fill="#C9CDDC"/><rect x="256" y="325" width="40" height="7" rx="3.5" fill="#E3E6F0"/>
<rect x="216" y="356" width="128" height="34" rx="17" fill="#4F46E5"/>
<rect x="64" y="150" width="120" height="70" rx="16" fill="#fff" stroke="#E3E6F0"/><rect x="80" y="168" width="60" height="8" rx="4" fill="#C9CDDC"/><rect x="80" y="186" width="84" height="16" rx="6" fill="#10B981"/>
<rect x="380" y="260" width="128" height="70" rx="16" fill="#fff" stroke="#E3E6F0"/><rect x="396" y="278" width="64" height="8" rx="4" fill="#C9CDDC"/><rect x="396" y="296" width="90" height="16" rx="6" fill="#4F46E5"/>
</svg>`;

const ic = (path) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="14" fill="#EEF0FF"/><g stroke="#4F46E5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${path}</g></svg>`;
const icons = {
  "bolt.svg": ic('<path d="M26 12 16 27h8l-2 9 10-15h-8l2-9Z"/>'),
  "shield.svg": ic('<path d="M24 12 14 16v7c0 6.5 4.3 11.3 10 13 5.7-1.7 10-6.5 10-13v-7l-10-4Z"/><path d="m20 24 3 3 5-6"/>'),
  "chart.svg": ic('<path d="M14 34h20"/><path d="M17 30v-6M23 30V16M29 30v-9"/>'),
  "users.svg": ic('<circle cx="20" cy="19" r="4"/><path d="M13 33c0-4 3-7 7-7s7 3 7 7"/><circle cx="30" cy="20" r="3"/><path d="M29 26c3.5 0 6 2.6 6 6"/>'),
  "plug.svg": ic('<path d="M20 13v6M28 13v6M16 19h16v5a8 8 0 0 1-16 0v-5Z"/><path d="M24 32v4"/>'),
  "globe.svg": ic('<circle cx="24" cy="24" r="11"/><path d="M13 24h22M24 13c3 3.2 4.5 6.8 4.5 11S27 31.8 24 35c-3-3.2-4.5-6.8-4.5-11S21 16.2 24 13Z"/>'),
  "check.svg": ic('<circle cx="24" cy="24" r="10"/><path d="m19.5 24 3 3 6-6"/>'),
  "quote.svg": ic('<path d="M17 28c0-5 2-8 6-9M27 28c0-5 2-8 6-9"/><path d="M17 28h5v5h-5zM27 28h5v5h-5z"/>'),
};
const avatar = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${c}"/><circle cx="48" cy="40" r="16" fill="#fff" opacity=".9"/><path d="M20 84c4-16 15-24 28-24s24 8 28 24" fill="#fff" opacity=".9"/></svg>`;
const cover = (c1, c2) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="800" height="450" fill="url(#c)"/><circle cx="640" cy="90" r="120" fill="#fff" opacity=".12"/><circle cx="160" cy="400" r="170" fill="#fff" opacity=".08"/><rect x="250" y="160" width="300" height="130" rx="22" fill="#fff" opacity=".9"/><rect x="280" y="190" width="150" height="14" rx="7" fill="${c2}"/><rect x="280" y="220" width="220" height="10" rx="5" fill="#C9CDDC"/><rect x="280" y="242" width="180" height="10" rx="5" fill="#E3E6F0"/></svg>`;

/* ---------- sections ---------- */
const heroP = () => b.section(
  b.columns([
    { width: "52%", inner: b.stack(
      b.eyebrow("New: launch your product in days, not months")
      + b.heading("Software your customers will love to use", { level: 1 })
      + b.para("Tell visitors in one or two sentences what your product does and who it is for. Keep it simple, clear and focused on the result they get.", { size: "large", className: "ap-muted" })
      + b.buttons([{ text: "Start free trial", href: "#pricing" }, { text: "Book a demo", href: "#contact", outline: true }])
      + b.para("✓ No credit card needed  ·  ✓ Set up in 5 minutes", { size: "small", className: "ap-muted" }), { gap: 30 }) },
    { width: "48%", inner: b.image(b.img("hero.svg"), "Product dashboard preview", { className: "is-style-soft-shadow" }) },
  ], { align: "wide", valign: "center" }),
  { gradient: "hero", pad: [80, 80] });

const featuresP = () => b.section(
  b.stack(b.eyebrow("Features", { align: "center" }) + b.heading("Everything your team needs in one place", { align: "center" })
    + b.para("Describe the main benefit of your product. Each card below explains one feature in a single short sentence.", { align: "center", className: "ap-muted" }), { gap: 20, justify: "center" })
  + b.spacer("16px")
  + b.grid([
    ["bolt.svg", "Fast setup", "Get started in minutes with simple onboarding and helpful defaults."],
    ["shield.svg", "Secure by default", "Your data is encrypted and protected with modern security practices."],
    ["chart.svg", "Clear reports", "See what is working at a glance with live dashboards and exports."],
    ["users.svg", "Built for teams", "Invite your team, set roles and work together in real time."],
    ["plug.svg", "Integrations", "Connect the tools you already use, from payments to email."],
    ["globe.svg", "Works anywhere", "Use it on your phone, tablet or computer, wherever you are."],
  ].map(([i, h, p]) => b.card(b.icon(i) + b.heading(h, { level: 3 }) + b.para(p, { className: "ap-muted" }))).join(""), { align: "wide", cols: 3, gap: 40 }),
  { pad: [80, 80], anchor: "features" });

const howP = () => b.section(
  b.stack(b.eyebrow("How it works", { align: "center" }) + b.heading("Up and running in three steps", { align: "center" }), { gap: 20, justify: "center" })
  + b.spacer("16px")
  + b.columns([
    ["1", "Create your account", "Sign up with your email. It takes less than a minute."],
    ["2", "Set up your workspace", "Add your team, connect your tools and import your data."],
    ["3", "Grow your business", "Track results, automate busy work and focus on customers."],
  ].map(([n, h, p]) => b.stack(b.para(n, { className: "ap-step" }) + b.heading(h, { level: 3 }) + b.para(p, { className: "ap-muted" }), { gap: 20 })), { align: "wide" }),
  { bg: "surface", pad: [80, 80] });

const showcaseP = () => b.section(
  b.columns([
    { inner: b.image(b.img("phone.svg"), "Mobile app preview") },
    { inner: b.stack(
      b.eyebrow("Mobile ready")
      + b.heading("Manage everything from your phone")
      + b.para("Explain a key feature in more detail here. Focus on how it saves your customer time or money.", { className: "ap-muted" })
      + b.list(["Real-time notifications for important updates", "Works offline and syncs when you are back online", "Available on Android and iPhone"], { className: "ap-checks" })
      + b.buttons([{ text: "See all features", href: "#features", outline: true }]), { gap: 30 }) },
  ], { align: "wide", valign: "center" }),
  { pad: [80, 80] });

const tier = (name, price, per, desc, items, featured) => b.card(
  (featured ? b.eyebrow("Most popular") : "")
  + b.heading(name, { level: 3 })
  + b.para(`<strong>${price}</strong>${per ? ` ${per}` : ""}`, { size: "x-large", className: "ap-price" })
  + b.para(desc, { className: "ap-muted" })
  + b.list(items, { className: "ap-checks" })
  + b.buttons([{ text: featured ? "Start free trial" : "Get started", href: "#contact", outline: !featured }]),
  { className: featured ? "ap-featured" : "" });

const pricingP = () => b.section(
  b.stack(b.eyebrow("Pricing", { align: "center" }) + b.heading("Simple prices that grow with you", { align: "center" })
    + b.para("Replace these sample plans and prices with your own.", { align: "center", className: "ap-muted" }), { gap: 20, justify: "center" })
  + b.spacer("16px")
  + b.grid(
    tier("Starter", "₦0", "/ month", "For individuals trying it out.", ["1 user", "Basic reports", "Email support"])
    + tier("Growth", "₦15,000", "/ month", "For small teams that are growing.", ["Up to 10 users", "Advanced reports", "Integrations", "Priority support"], true)
    + tier("Business", "Custom", "", "For larger companies with special needs.", ["Unlimited users", "Dedicated manager", "Custom setup", "Service agreement"]),
    { align: "wide", cols: 3, gap: 40 }),
  { bg: "surface", pad: [80, 80], anchor: "pricing" });

const quote = (q, who, role, c) => b.card(b.icon("quote.svg") + b.para(q, { size: "large" })
  + b.row(b.image(b.img(`avatar-${c}.svg`), "", { className: "ap-avatar" }) + b.stack(b.para(`<strong>${who}</strong>`) + b.para(role, { size: "small", className: "ap-muted" }), { gap: 10 }), { wrap: false, gap: 30 }));

const testimonialsP = () => b.section(
  b.stack(b.eyebrow("Customers", { align: "center" }) + b.heading("What our customers say", { align: "center" })
    + b.para("Add real quotes from real customers (with their permission). Never use made-up reviews.", { align: "center", className: "ap-muted" }), { gap: 20, justify: "center" })
  + b.spacer("16px")
  + b.grid(quote("“Put a short, real quote from a happy customer here. Say what changed for them after using your product.”", "Customer name", "Role, Company", 1)
    + quote("“A second customer quote works best when it mentions a specific result, like time saved or sales gained.”", "Customer name", "Role, Company", 2)
    + quote("“Keep quotes short and honest. One or two sentences is enough to build trust with new visitors.”", "Customer name", "Role, Company", 3),
    { align: "wide", cols: 3, gap: 40 }),
  { pad: [80, 80] });

const faqP = () => b.section(
  b.stack(b.eyebrow("FAQ", { align: "center" }) + b.heading("Questions? We have answers", { align: "center" }), { gap: 20, justify: "center" })
  + b.spacer("8px")
  + [["How long does it take to get started?", "Most customers are set up in less than a day. Write your own answer here."],
    ["Can I change my plan later?", "Yes. You can upgrade, downgrade or cancel at any time from your account settings."],
    ["Is my data safe?", "Explain how you protect customer data, where it is stored and who can see it."],
    ["Do you offer support?", "Tell visitors how to reach you: email, WhatsApp, phone or live chat, and your working hours."],
    ["Can I pay in Naira?", "List the payment methods you accept, such as card, bank transfer or USSD."]].map(([q, a]) => b.details(q, a)).join(""),
  { pad: [80, 80] });

const ctaP = () => b.section(
  b.group({ align: "wide", gradient: "glow", color: "base", radius: "28px", pad: { top: 70, bottom: 70, left: 50, right: 50 }, layout: { type: "constrained" } },
    b.heading("Ready to get started?", { align: "center", size: "xx-large" })
    + b.para("Join businesses already growing with your product. Start your free trial today.", { align: "center", color: "on-dark", size: "large" })
    + b.buttons([{ text: "Start free trial", href: "#pricing" }, { text: "Talk to us", href: "#contact", outline: true }], { justify: "center" })),
  { pad: [70, 80] });

const postsP = () => b.section(
  b.row(b.heading("From the blog") + b.buttons([{ text: "All articles", href: "/blog", outline: true }]), { align: "wide", justify: "space-between" })
  + b.latestPosts(3), { pad: [80, 80], bg: "surface" });

const contactP = () => b.section(
  b.columns([
    { inner: b.stack(b.eyebrow("Contact") + b.heading("Let’s talk") + b.para("Have a question or want a demo? Send us a message and we will reply within one working day.", { className: "ap-muted" }), { gap: 20 }) },
    { inner: b.card(
      b.para("<strong>Email</strong><br>hello@yourcompany.com")
      + b.para("<strong>Phone</strong><br>+234 800 000 0000")
      + b.para("<strong>Office</strong><br>Your street address, Lagos, Nigeria")
      + b.buttons([{ text: "Chat on WhatsApp", href: "https://wa.me/2348000000000" }, { text: "Send an email", href: "mailto:hello@yourcompany.com", outline: true }])) },
  ], { align: "wide", valign: "center" }),
  { pad: [80, 80], anchor: "contact" });

/* ---------- full pages (offered when creating a new page) ---------- */
const pageHead = (eb, title, sub) => b.section(b.stack(b.eyebrow(eb, { align: "center" }) + b.heading(title, { level: 1, align: "center" }) + b.para(sub, { align: "center", size: "large", className: "ap-muted" }), { gap: 20, justify: "center" }), { gradient: "hero", pad: [80, 60] });
const member = (n, c) => b.stack(b.image(b.img(`avatar-${c}.svg`), "", { className: "ap-avatar-lg" }) + b.heading(n, { level: 3 }) + b.para("Role and one line about them", { className: "ap-muted" }), { gap: 10 });

const aboutPage = () => pageHead("About us", "We help businesses work smarter", "Tell your story: why you started, the problem you solve and who you serve.")
  + b.section(b.columns([
    b.heading("Our mission") + b.para("Write one short paragraph about what you are building and why it matters to your customers."),
    b.heading("Our story") + b.para("Share how the company started, key milestones and what makes your team different."),
  ], { align: "wide" }), { pad: [70, 70] })
  + b.section(b.heading("Meet the team", { align: "center" }) + b.spacer("16px") + b.grid([1, 2, 3, 1].map((c, i) => member(`Team member ${i + 1}`, c)).join(""), { align: "wide", cols: 4, gap: 40 }), { bg: "surface", pad: [70, 70] })
  + ctaP();

const contactPage = () => pageHead("Contact", "Get in touch", "We usually reply within one working day.") + contactP()
  + b.section(b.para("Tip: install the free WPForms Lite or Contact Form 7 plugin and add its form here.", { align: "center", className: "ap-muted", size: "small" }), { pad: [10, 60] });

const pricingPage = () => pageHead("Pricing", "Plans for every stage", "Start free, upgrade when you are ready.") + pricingP() + faqP() + ctaP();

export default {
  slug: "ap-ignite",
  name: "Ignite",
  niche: "Startup & tech",
  version: "1.0.0",
  description: "Ignite is a modern block theme for startups, apps and software companies: product hero, features, how it works, pricing, FAQ, blog and contact sections, all editable in the WordPress site editor.",
  fonts: {
    heading: { name: "Plus Jakarta Sans", files: ["plus-jakarta-sans-latin-wght-normal.woff2"], weight: "200 800", copyright: "2020 The Plus Jakarta Sans Project Authors", license: "OFL-plus-jakarta-sans.txt" },
    body: { name: "Inter", files: ["inter-latin-wght-normal.woff2", "inter-latin-wght-italic.woff2"], weight: "100 900", copyright: "2016 The Inter Project Authors", license: "OFL-inter.txt" },
  },
  palette: P,
  gradients: [
    { slug: "hero", name: "Soft hero", gradient: "linear-gradient(180deg, #EEF0FF 0%, #FFFFFF 85%)" },
    { slug: "glow", name: "Night glow", gradient: "radial-gradient(120% 120% at 50% 0%, #2B2F8F 0%, #0B1026 60%)" },
  ],
  radius: "18px",
  nav: ["Features", "Pricing", "Blog", "Contact"],
  headerCta: { text: "Get started", href: "#pricing" },
  footer: {
    about: "One sentence about your company. Software that helps businesses grow.",
    columns: [
      { title: "Product", lines: ['<a href="#features">Features</a>', '<a href="#pricing">Pricing</a>', '<a href="/blog">Blog</a>'] },
      { title: "Company", lines: ['<a href="/about">About</a>', '<a href="/contact">Contact</a>', '<a href="/privacy-policy">Privacy policy</a>'] },
      { title: "Contact", lines: ["hello@yourcompany.com", "+234 800 000 0000", "Lagos, Nigeria"] },
    ],
    copyright: "All rights reserved.",
  },
  css: `.ap-step { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: var(--wp--preset--color--primary); color: #fff; font-weight: 800; font-family: var(--wp--preset--font-family--heading); }
.ap-checks { list-style: none; padding-left: 0; }
.ap-checks li { padding-left: 1.8rem; position: relative; margin: .4rem 0; }
.ap-checks li::before { content: ""; position: absolute; left: 0; top: .35em; width: 1.1rem; height: 1.1rem; border-radius: 50%; background: var(--wp--preset--color--tint) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m4.5 8.2 2.2 2.2 4.8-4.8' fill='none' stroke='%234F46E5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 80% no-repeat; }
.ap-avatar img { width: 44px; height: 44px; border-radius: 50%; }
.ap-avatar-lg img { width: 96px; height: 96px; border-radius: 50%; }
.ap-avatar, .ap-avatar-lg { margin: 0; }`,
  images: { "hero.svg": hero, "phone.svg": phone, "avatar-1.svg": avatar("#4F46E5"), "avatar-2.svg": avatar("#10B981"), "avatar-3.svg": avatar("#F59E0B"),
    "blog-1.svg": cover("#6D66F2", "#4338CA"), "blog-2.svg": cover("#34D399", "#059669"), "blog-3.svg": cover("#FBBF24", "#D97706") },
  icons,
  previewPosts: [
    { title: "How to choose the right software for your team", excerpt: "A short summary of the article goes here. Keep it to two lines.", img: "blog-1.svg" },
    { title: "5 ways to save time every week", excerpt: "A short summary of the article goes here. Keep it to two lines.", img: "blog-2.svg" },
    { title: "Our product roadmap for this year", excerpt: "A short summary of the article goes here. Keep it to two lines.", img: "blog-3.svg" },
  ],
  patterns: [
    { slug: "hero", title: "Hero: product headline", render: heroP },
    { slug: "features", title: "Features grid", render: featuresP },
    { slug: "how-it-works", title: "How it works (3 steps)", render: howP },
    { slug: "showcase", title: "Product showcase with list", render: showcaseP },
    { slug: "pricing", title: "Pricing (3 plans)", render: pricingP },
    { slug: "testimonials", title: "Customer quotes", render: testimonialsP },
    { slug: "faq", title: "FAQ", render: faqP },
    { slug: "latest-posts", title: "Latest blog posts", render: postsP },
    { slug: "cta", title: "Call to action band", render: ctaP },
    { slug: "contact", title: "Contact details", render: contactP },
    { slug: "page-about", title: "About page", render: aboutPage, page: true, categories: ["ap-ignite-pages"] },
    { slug: "page-contact", title: "Contact page", render: contactPage, page: true, categories: ["ap-ignite-pages"] },
    { slug: "page-pricing", title: "Pricing page", render: pricingPage, page: true, categories: ["ap-ignite-pages"] },
  ],
  home: ["hero", "features", "how-it-works", "showcase", "pricing", "testimonials", "faq", "latest-posts", "cta", "contact"],
};
