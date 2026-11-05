"use client";

/** Shrink a photo in the browser (max 1600px, JPEG) so uploads stay small. */
export async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55]) { const d = c.toDataURL("image/jpeg", q); if (d.length < 650_000) return d; }
    return c.toDataURL("image/jpeg", 0.45);
  } finally { URL.revokeObjectURL(url); }
}
