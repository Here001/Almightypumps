import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FF6A2B", color: "#0B0D14", fontSize: 76, fontWeight: 900, letterSpacing: -2 }}>AP</div>,
    size,
  );
}
