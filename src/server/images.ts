/** Photos sent by the browser as data URLs (already shrunk client-side). Checks the real file type, not just the label. */
import { badRequest } from "./errors";

export function decodeImage(dataUrl: string, maxBytes = 520_000) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw badRequest("Please upload a photo (JPEG, PNG or WebP).");
  const buf = Buffer.from(m[2], "base64");
  const magic = buf.subarray(0, 12).toString("hex");
  const ok = m[1] === "image/jpeg" ? magic.startsWith("ffd8ff") : m[1] === "image/png" ? magic.startsWith("89504e47") : buf.subarray(8, 12).toString() === "WEBP";
  if (!ok || buf.length > maxBytes) throw badRequest("One of the pictures couldn't be read. Please take it again.");
  return { contentType: m[1], data: buf };
}
