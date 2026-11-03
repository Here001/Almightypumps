import type { Metadata, Viewport } from "next";
import "./landing.css";
import "./app.css";
import { Tracker } from "@/components/Tracker";

export const metadata: Metadata = {
  title: "Almighty Pumps",
  description: "Mockups, invoices and websites without code. Escrow-protected buying and selling. Social growth in minutes. One Naira wallet.",
};

export const viewport: Viewport = { themeColor: "#04050A", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        {children}
        <Tracker />
      </body>
    </html>
  );
}
