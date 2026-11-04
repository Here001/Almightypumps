import type { Metadata, Viewport } from "next";
import "./landing.css";
import "./app.css";
import { Tracker } from "@/components/Tracker";
import { THEME_BOOT_SCRIPT, ThemeSync } from "@/components/Theme";
import { SITE_NAME, SITE_URL, isIndexable } from "@/core/site";

const FONTS = "https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800&family=Space+Grotesk:wght@500;700&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap";

const TITLE = "Almighty Pumps: Social Media Growth, US Numbers, eSIMs & Gift Cards in Nigeria";
const DESCRIPTION = "Buy Instagram, TikTok and YouTube followers, likes and views, get US numbers for verification codes, US and travel eSIMs, gift cards, airtime and data. One Naira wallet, pay-on-delivery.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["SMM panel Nigeria", "buy Instagram followers Nigeria", "buy TikTok followers Nigeria", "US number for WhatsApp verification", "virtual number Nigeria", "US eSIM Nigeria", "travel eSIM", "buy gift cards with Naira", "sell gift cards Nigeria", "MTN airtime", "escrow marketplace Nigeria"],
  openGraph: { type: "website", siteName: SITE_NAME, title: TITLE, description: DESCRIPTION, url: "/", locale: "en_NG" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  // Previews (test site) are never indexed; the live site is.
  robots: isIndexable() ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } } : { index: false, follow: false },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  formatDetection: { telephone: false },
};

// Fit the screen on load; pinch-zoom stays available (blocking it hurts partially-sighted customers).
export const viewport: Viewport = { themeColor: "#04050A", width: "device-width", initialScale: 1, minimumScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Fonts load without blocking the first paint (text shows in a system font for a moment). */}
        <link rel="preload" as="style" href={FONTS} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){var l=document.createElement('link');l.rel='stylesheet';l.href=${JSON.stringify(FONTS)};document.head.appendChild(l);})();` }} />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={FONTS} />
        </noscript>
      </head>
      <body>
        {children}
        <Tracker />
        <ThemeSync />
      </body>
    </html>
  );
}
