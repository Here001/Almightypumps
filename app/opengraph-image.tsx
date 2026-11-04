import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/BrandMark";

export const alt = "Almighty Pumps: boost, verify and trade, all in Naira";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview picture shown when someone shares the site on WhatsApp, X, Facebook, etc. */
export default function OgImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0E1116", color: "#F4F2EE" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <BrandMark size={84} />
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 8 }}>ALMIGHTY PUMPS</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.02 }}>Boost. Verify. Trade.</div>
        <div style={{ fontSize: 34, color: "#C9CCD6", lineHeight: 1.3 }}>Social media growth, US numbers & eSIMs, gift cards, airtime and escrow, all in one Naira wallet.</div>
      </div>
      <div style={{ display: "flex", fontSize: 28, color: "#FF5A1F" }}>almightypumps.com · Lagos, Nigeria</div>
    </div>,
    size,
  );
}
