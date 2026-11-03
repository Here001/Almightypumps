import type { Metadata, Viewport } from "next";
import "./landing.css";
import "./app.css";
import { Tracker } from "@/components/Tracker";
import { THEME_BOOT_SCRIPT, ThemeSync } from "@/components/Theme";

const FONTS = "https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap";

export const metadata: Metadata = {
  title: "Almighty Pumps",
  description: "Mockups, invoices and websites without code. Escrow-protected buying and selling. Social growth in minutes. One Naira wallet.",
};

export const viewport: Viewport = { themeColor: "#04050A", width: "device-width", initialScale: 1, viewportFit: "cover" };

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
