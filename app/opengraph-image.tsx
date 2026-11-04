import { ImageResponse } from "next/og";

export const alt = "Almighty Pumps: boost, verify and trade, all in Naira";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview picture shown when someone shares the site on WhatsApp, X, Facebook, etc. */
export default function OgImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #04050A 0%, #1a0f0a 55%, #3a1606 100%)", color: "#F4F5F8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: "#FF6A2B", color: "#0B0D14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 900 }}>AP</div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 4 }}>ALMIGHTY PUMPS</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.02 }}>Boost. Verify. Trade.</div>
        <div style={{ fontSize: 34, color: "#C9CCD6", lineHeight: 1.3 }}>Social media growth, US numbers & eSIMs, gift cards, airtime and escrow, all in one Naira wallet.</div>
      </div>
      <div style={{ display: "flex", fontSize: 28, color: "#FF8A57" }}>almightypumps.com · Lagos, Nigeria</div>
    </div>,
    size,
  );
}
