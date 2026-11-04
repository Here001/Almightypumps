import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/BrandMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iPhone home-screen icon: the AP monogram on the dark brand square. */
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0E1116" }}>
      <BrandMark size={128} stroke={16} />
    </div>,
    size,
  );
}
