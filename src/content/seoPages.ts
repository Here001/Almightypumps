/**
 * Public service pages for search engines and AI assistants (/services/<slug>).
 * Plain, honest copy: no invented reviews, ratings, customer counts or prices (prices change; the dashboard shows them).
 * Each page: title (≤60 chars), description (≤160), h1, intro, steps, points, FAQs, where it lives in the dashboard.
 */
export type SeoPage = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string[];
  steps: string[];
  points: string[];
  faqs: { q: string; a: string }[];
  cta: string;
  /** Dashboard section the customer lands in after signing up / logging in. */
  section: string;
  category: string;
  related: string[];
};

const WALLET = "Pay from your Naira wallet. Top up by card, bank transfer or crypto.";

export const SEO_PAGES: SeoPage[] = [
  {
    slug: "buy-instagram-followers-nigeria",
    category: "Social media growth",
    title: "Buy Instagram Followers, Likes & Views in Nigeria",
    description: "Grow your Instagram with followers, likes, views and reel plays. Pay in Naira, only charged for what's delivered. Start in minutes on Almighty Pumps.",
    h1: "Instagram followers, likes and views, paid in Naira",
    intro: [
      "Almighty Pumps helps Nigerian creators, brands and small businesses grow on Instagram. Choose followers, likes, reel views, story views or comments, paste your profile or post link, and the order starts automatically.",
      "Your money is set aside when you order and only taken for what is actually delivered. If an order is only partly delivered, the rest goes back to your wallet.",
    ],
    steps: ["Create a free account and top up your Naira wallet.", "Open Boost Account → Instagram and pick a service.", "Paste your username or post link, choose the quantity, and order."],
    points: ["Followers, likes, reel views, story views, saves and more", "Services with refill guarantees are clearly marked", "Track every order's progress in your dashboard", WALLET],
    faqs: [
      { q: "Do I need to give my Instagram password?", a: "No. You only paste your username or the link to the post. Never share your password with anyone." },
      { q: "How fast does delivery start?", a: "Most orders start within minutes. Each service shows its own speed, and you can follow progress in My orders." },
      { q: "What if the order isn't fully delivered?", a: "You're only charged for what's delivered. Anything not delivered is refunded to your wallet automatically." },
      { q: "Does my account need to be public?", a: "Yes, keep the account or post public while the order runs, so the service can reach it." },
    ],
    cta: "Grow my Instagram",
    section: "boost",
    related: ["buy-tiktok-followers-nigeria", "smm-panel-nigeria", "youtube-views-subscribers-nigeria"],
  },
  {
    slug: "buy-tiktok-followers-nigeria",
    category: "Social media growth",
    title: "Buy TikTok Followers, Likes & Views in Nigeria",
    description: "Boost your TikTok with followers, likes, views and shares, paid in Naira from your wallet. Only charged for what's delivered. Start on Almighty Pumps.",
    h1: "TikTok followers, likes and views for Nigerian creators",
    intro: [
      "Give your TikTok videos a push with views, likes, shares, saves and followers. Paste your profile or video link, choose an amount and order. It starts automatically.",
      "Pay-on-delivery: the price is held when you order and only taken for what's delivered, with automatic refunds for anything that isn't.",
    ],
    steps: ["Sign up free and add money to your Naira wallet.", "Go to Boost Account → TikTok and choose a service.", "Paste your TikTok link, set the quantity, and place the order."],
    points: ["Followers, likes, views, shares, saves and live viewers", "Many services start within minutes", "Clear minimums and maximums on every service", WALLET],
    faqs: [
      { q: "Is it safe for my TikTok account?", a: "We never ask for your password. Orders only need your public profile or video link." },
      { q: "Can I split one order across videos?", a: "Each order goes to one link. Place separate orders for each video you want to boost." },
      { q: "Where do I see my order progress?", a: "In your dashboard under Orders, with the current status and how much is left to deliver." },
    ],
    cta: "Boost my TikTok",
    section: "boost",
    related: ["buy-instagram-followers-nigeria", "smm-panel-nigeria", "facebook-likes-followers-nigeria"],
  },
  {
    slug: "youtube-views-subscribers-nigeria",
    category: "Social media growth",
    title: "YouTube Views, Subscribers & Likes in Nigeria",
    description: "Promote your YouTube channel with views, subscribers, likes and watch time, paid in Naira. Only pay for what's delivered on Almighty Pumps.",
    h1: "YouTube views, subscribers and likes, paid in Naira",
    intro: [
      "Help your videos get discovered with YouTube views, likes, subscribers and more. Paste your video or channel link, choose a service and order from your Naira wallet.",
      "You see the price per 1,000 before you order, and you're refunded automatically for anything that isn't delivered.",
    ],
    steps: ["Create a free account and fund your wallet.", "Open Boost Account → YouTube.", "Paste your video or channel link and order."],
    points: ["Views, likes, subscribers, comments and shorts views", "Price shown per 1,000 before you order", "Automatic refunds for undelivered amounts", WALLET],
    faqs: [
      { q: "Do I need to share my Google login?", a: "No. Only the public link to your video or channel is needed." },
      { q: "How long do orders take?", a: "It depends on the service and the amount; each service lists its expected speed." },
    ],
    cta: "Promote my YouTube",
    section: "boost",
    related: ["buy-instagram-followers-nigeria", "buy-tiktok-followers-nigeria", "smm-panel-nigeria"],
  },
  {
    slug: "facebook-likes-followers-nigeria",
    category: "Social media growth",
    title: "Facebook Page Likes & Followers in Nigeria",
    description: "Grow your Facebook page with likes, followers, post reactions and video views. Pay in Naira, only for what's delivered. Start on Almighty Pumps.",
    h1: "Facebook page likes, followers and reactions",
    intro: [
      "Build social proof for your business page with Facebook page likes, followers, post reactions and video views, paid from your Naira wallet.",
      "Orders start automatically after you paste your page or post link, and you're only charged for what's delivered.",
    ],
    steps: ["Sign up free and top up your wallet.", "Open Boost Account → Facebook.", "Paste the page or post link, choose an amount and order."],
    points: ["Page likes, followers, reactions and video views", "Orders start automatically", "Refunds go straight back to your wallet", WALLET],
    faqs: [
      { q: "Does my page need to be public?", a: "Yes, the page or post must be public while the order runs." },
      { q: "Can I use this for my business page?", a: "Yes. Many small businesses use it to give new pages a head start." },
    ],
    cta: "Grow my Facebook page",
    section: "boost",
    related: ["buy-instagram-followers-nigeria", "twitter-x-followers-nigeria", "smm-panel-nigeria"],
  },
  {
    slug: "twitter-x-followers-nigeria",
    category: "Social media growth",
    title: "X (Twitter) Followers, Likes & Reposts in Nigeria",
    description: "Grow on X (Twitter) with followers, likes, reposts and views, paid in Naira from your wallet. Only charged for what's delivered.",
    h1: "X (Twitter) followers, likes and reposts",
    intro: [
      "Get more reach on X with followers, likes, reposts and post views. Paste your profile or post link, choose a service and order in Naira.",
      "Every order is pay-on-delivery, with automatic refunds for anything not delivered.",
    ],
    steps: ["Create a free account and fund your wallet.", "Go to Boost Account → X / Twitter.", "Paste your link and order."],
    points: ["Followers, likes, reposts and views", "Clear prices per 1,000", "Track every order in your dashboard", WALLET],
    faqs: [
      { q: "Do you need my X password?", a: "No, only the public profile or post link." },
    ],
    cta: "Grow on X",
    section: "boost",
    related: ["facebook-likes-followers-nigeria", "buy-instagram-followers-nigeria", "smm-panel-nigeria"],
  },
  {
    slug: "smm-panel-nigeria",
    category: "Social media growth",
    title: "SMM Panel Nigeria: Pay in Naira, With a Reseller API",
    description: "A Nigerian SMM panel with thousands of services for Instagram, TikTok, YouTube, Facebook, X and more. Naira wallet, pay-on-delivery and a reseller API.",
    h1: "A Nigerian SMM panel with a Naira wallet and reseller API",
    intro: [
      "Almighty Pumps is an SMM panel built for Nigeria: thousands of social media services across 30+ platforms, all priced and paid in Naira.",
      "Resellers can connect their own panel or app to our standard API (v2) and sell our services to their customers.",
    ],
    steps: ["Create a free account and fund your Naira wallet.", "Order in the dashboard, or create an API key in Settings.", "Connect your panel using the standard SMM API (v2)."],
    points: ["Instagram, TikTok, YouTube, Facebook, X, Telegram, Spotify and more", "Pay-on-delivery with automatic partial refunds", "Standard API v2 for resellers (services, add, status, balance)", WALLET],
    faqs: [
      { q: "Do you have an API?", a: "Yes. Create an API key in Settings; the API follows the common SMM panel v2 format, so most panels and scripts can connect." },
      { q: "Which currency are prices in?", a: "Naira. You can switch the display to US dollars, but your wallet and charges stay in Naira." },
      { q: "What happens if an order fails?", a: "The money held for it returns to your wallet automatically." },
    ],
    cta: "Open a free account",
    section: "boost",
    related: ["buy-instagram-followers-nigeria", "buy-tiktok-followers-nigeria", "youtube-views-subscribers-nigeria"],
  },
  {
    slug: "us-number-for-verification-nigeria",
    category: "Verification numbers",
    title: "US Number for WhatsApp & App Verification in Nigeria",
    description: "Get a temporary US phone number to receive SMS verification codes for WhatsApp, Telegram, Google and more. Pay in Naira, only if the code arrives.",
    h1: "Temporary US numbers for SMS verification codes",
    intro: [
      "Need a US number to receive a one-time code? Pick the app (WhatsApp, Telegram, Google, Facebook and thousands more), get a US mobile number, and the code appears in your dashboard.",
      "You only pay if the code arrives. If no code comes or you cancel, your money goes straight back to your wallet.",
    ],
    steps: ["Sign up free and top up your wallet in Naira.", "Open Get Verification Code and choose the app.", "Enter the US number in the app; the code shows on your screen within minutes."],
    points: ["Thousands of apps and websites supported", "Real US mobile numbers", "Pay only when the code arrives", WALLET],
    faqs: [
      { q: "Is the number mine to keep?", a: "No. It's a temporary number for receiving one verification code. For a long-term US line, see our US eSIMs." },
      { q: "What if the code never comes?", a: "You're not charged. The number expires and your money returns to your wallet automatically." },
      { q: "Can I use it for anything?", a: "Use it lawfully and only for your own accounts. Fraud or impersonation is not allowed." },
    ],
    cta: "Get a verification code",
    section: "verify",
    related: ["us-esim-nigeria", "travel-esim-data", "buy-gift-cards-nigeria"],
  },
  {
    slug: "us-esim-nigeria",
    category: "eSIMs",
    title: "US eSIM in Nigeria: Get a Real US Phone Line",
    description: "Get a US phone line as an eSIM, paid in Naira: talk, text and data on a US network. New number or keep your existing US number.",
    h1: "A US phone line on your phone, as an eSIM",
    intro: [
      "Get a real US mobile line delivered as an eSIM: talk, text and data on a major US network. Choose a data plan and length, enter your phone's IMEI, and we set it up for you.",
      "Keep your existing US number or get a new one. The money is held when you order and only taken when your eSIM is delivered.",
    ],
    steps: ["Create a free account and top up your wallet.", "Open eSIMs → US phone line and choose your data and plan length.", "Enter your phone's IMEI (dial *#06#); you get a QR code to install."],
    points: ["New US number or keep your existing one", "Plans by the month, with savings on longer plans", "QR code, one-tap iPhone install and manual codes", WALLET],
    faqs: [
      { q: "Does my phone need to support eSIM?", a: "Yes, and it must be unlocked. Most recent iPhones, Pixels and Samsung Galaxy phones support eSIM." },
      { q: "How do I find my IMEI?", a: "Dial *#06# on your phone. The eSIM only works on the phone whose IMEI you enter." },
      { q: "How long does delivery take?", a: "Our team sets it up after you order; you'll see your number and QR code in the dashboard when it's ready." },
    ],
    cta: "Get a US eSIM",
    section: "esim",
    related: ["travel-esim-data", "us-number-for-verification-nigeria", "airtime-data-nigeria"],
  },
  {
    slug: "travel-esim-data",
    category: "eSIMs",
    title: "Travel eSIM: Mobile Data in 190+ Countries, Paid in Naira",
    description: "Buy a travel data eSIM for the UK, USA, Dubai, Europe and 190+ countries. Instant QR code, no roaming charges, paid in Naira.",
    h1: "Travel data eSIMs for 190+ countries, delivered instantly",
    intro: [
      "Travelling to the UK, US, Dubai, Canada or Europe? Buy a data eSIM before you go and get online the moment you land, without roaming charges.",
      "Pick your country, choose the data and number of days, pay in Naira, and your QR code appears in seconds.",
    ],
    steps: ["Sign up free and fund your wallet.", "Open eSIMs → Travel data and search your destination.", "Pay and scan the QR code (or tap Install on iPhone)."],
    points: ["Single-country and multi-country plans (e.g. Europe)", "Instant delivery with QR code and iPhone one-tap install", "Check how much data you've used", WALLET],
    faqs: [
      { q: "When does the plan start?", a: "Days start counting when the eSIM first connects to a network at your destination, so you can install it before you travel." },
      { q: "Can I make calls?", a: "These are data plans. Use WhatsApp or other apps for calls and messages." },
      { q: "Will it work on my phone?", a: "Your phone must support eSIM and be unlocked (iPhone XS or newer, Pixel 3 or newer, Samsung S20 or newer, and most new phones)." },
    ],
    cta: "Get a travel eSIM",
    section: "esim",
    related: ["us-esim-nigeria", "buy-gift-cards-nigeria", "airtime-data-nigeria"],
  },
  {
    slug: "buy-gift-cards-nigeria",
    category: "Gift cards",
    title: "Buy Gift Cards in Nigeria with Naira: Amazon, Apple, Steam",
    description: "Buy official digital gift cards (Amazon, Apple, Google Play, PlayStation, Steam and more) with Naira. Codes delivered instantly to your dashboard.",
    h1: "Buy digital gift cards with Naira, delivered instantly",
    intro: [
      "Buy official digital gift cards and subscription vouchers for the US, UK, Canada and Nigeria: Amazon, Apple, Google Play, PlayStation, Steam, Xbox and more.",
      "Pay from your Naira wallet and the code shows in your dashboard within seconds. If a card can't be delivered, you're refunded.",
    ],
    steps: ["Create a free account and top up your wallet.", "Open Gift Cards & Subscriptions, pick a country and brand.", "Choose the value and buy; your code appears instantly."],
    points: ["Official digital codes from well-known brands", "Instant delivery to your dashboard", "Redeem instructions included with every card", WALLET],
    faqs: [
      { q: "Are the gift cards genuine?", a: "Yes. They're official digital codes supplied through a licensed gift card distributor." },
      { q: "How fast do I get the code?", a: "Usually within seconds. It appears under My gift cards." },
      { q: "Can I return a code?", a: "Codes can't be refunded once shown, unless the code doesn't work and the supplier confirms it." },
    ],
    cta: "Buy a gift card",
    section: "giftcards",
    related: ["sell-gift-cards-for-naira", "airtime-data-nigeria", "travel-esim-data"],
  },
  {
    slug: "airtime-data-nigeria",
    category: "Airtime & data",
    title: "Buy MTN, Airtel, Glo & 9mobile Airtime and Data Online",
    description: "Recharge MTN, Airtel, Glo and 9mobile airtime and data bundles instantly from your Naira wallet. Any amount from ₦50, sent in seconds.",
    h1: "Instant airtime and data for MTN, Airtel, Glo and 9mobile",
    intro: [
      "Top up any Nigerian line in seconds: airtime from ₦50 to ₦50,000, or data bundles for MTN, Airtel, Glo and 9mobile.",
      "Type the number, we detect the network (you can change it), pick an amount or plan, and it's sent instantly. If it can't be delivered, the money returns to your wallet.",
    ],
    steps: ["Sign up free and fund your wallet.", "Open Airtime & Data and enter the phone number.", "Choose airtime or a data plan and send."],
    points: ["MTN, Airtel, Glo and 9mobile", "Airtime from ₦50, plus daily, weekly and monthly data plans", "Sent instantly, refunded if it fails", WALLET],
    faqs: [
      { q: "Can I top up someone else's number?", a: "Yes, any Nigerian mobile number." },
      { q: "What if I ported my number to another network?", a: "Just pick the correct network before sending; we only guess it from the number." },
    ],
    cta: "Buy airtime or data",
    section: "airtime",
    related: ["buy-gift-cards-nigeria", "travel-esim-data", "us-number-for-verification-nigeria"],
  },
  {
    slug: "sell-gift-cards-for-naira",
    category: "Sell to us",
    title: "Sell Gift Cards for Naira in Nigeria",
    description: "Sell your Amazon, Apple, Steam and other gift cards for Naira. See the rate first, submit the code or photos, and get paid to your wallet once confirmed.",
    h1: "Sell your gift cards for Naira",
    intro: [
      "Turn unused gift cards into Naira. Pick your card, see today's rate for physical cards or e-codes, enter the value and submit the code or photos.",
      "Our team checks the card and pays you into your Almighty Pumps wallet, which you can withdraw to your Nigerian bank account.",
    ],
    steps: ["Create a free account.", "Open Sell Gift Cards & Crypto → Sell gift cards.", "Pick the card, enter the value, add the code or photos and submit."],
    points: ["See the rate and what you'll get before you submit", "Physical cards and e-codes", "Paid to your wallet, withdraw to your bank", "Only lawfully owned, unused cards are accepted"],
    faqs: [
      { q: "How long does it take?", a: "Most trades are checked within an hour during working hours (9am–9pm)." },
      { q: "What if my card is rejected?", a: "You'll see the reason in your dashboard and by email. Used, invalid or stolen cards are rejected." },
    ],
    cta: "Sell a gift card",
    section: "sell",
    related: ["buy-gift-cards-nigeria", "p2p-escrow-marketplace-nigeria", "airtime-data-nigeria"],
  },
  {
    slug: "p2p-escrow-marketplace-nigeria",
    category: "P2P marketplace",
    title: "P2P Marketplace with Escrow in Nigeria",
    description: "Buy from verified sellers with escrow: your money is held until you confirm you received what you paid for. Disputes handled by our team.",
    h1: "Buy and sell safely with escrow",
    intro: [
      "The Almighty Pumps P2P marketplace connects buyers with verified sellers. When you buy, your payment is held in escrow; the seller only gets paid after you confirm delivery.",
      "Sellers have 72 hours to deliver or you can cancel for a refund. After delivery you have 48 hours to confirm or open a dispute, which our team reviews.",
    ],
    steps: ["Create a free account and fund your wallet.", "Open the P2P tab and choose an ad from a verified seller.", "Pay into escrow, receive your item, then confirm."],
    points: ["Verified sellers only", "Money held in escrow until you confirm", "72-hour delivery deadline and 48-hour inspection window", "Disputes resolved by our team"],
    faqs: [
      { q: "How do I become a seller?", a: "Apply in Settings → Become a seller. We verify your details before you can post ads." },
      { q: "What does it cost sellers?", a: "A 7% fee on each completed sale, taken from the payout." },
      { q: "What can't be sold?", a: "Counterfeit goods, fake documents, social media or gaming accounts, stolen cards or data, weapons, drugs and anything illegal in Nigeria." },
    ],
    cta: "Browse the marketplace",
    section: "trades",
    related: ["sell-gift-cards-for-naira", "buy-gift-cards-nigeria", "smm-panel-nigeria"],
  },
];

export const seoPage = (slug: string) => SEO_PAGES.find((p) => p.slug === slug);
