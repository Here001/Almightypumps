/** eSIM ordering rules (no dependencies; tested). */

/** IMEI: 14–16 digits; a 15-digit IMEI must pass the Luhn check (catches typos). */
export function checkImei(raw: string): { imei: string } | { error: string } {
  const imei = raw.replace(/[\s-]/g, "");
  if (!/^\d{14,16}$/.test(imei)) return { error: "Enter the IMEI: 14 to 16 digits. Dial *#06# on the phone to see it." };
  if (imei.length === 15 && !luhn(imei)) return { error: "That IMEI has a typo. Dial *#06# and copy it again." };
  return { imei };
}

export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** US phone number to 10 digits, or null. Accepts +1, spaces, dashes, brackets. */
export function usNumber(raw: string): string | null {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : null;
}

export const formatUs = (d: string) => (d.length === 10 ? `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d);

/**
 * eSIM activation code as carriers give it: "LPA:1$smdp.example.com$MATCHING-ID" (the QR content),
 * or an SM-DP+ address and activation code typed separately.
 */
export function buildLpa(input: { lpa?: string; smdp?: string; code?: string }): string | null {
  const lpa = (input.lpa ?? "").trim();
  if (lpa) return /^LPA:1\$[^$\s]+\$[^$\s]*(\$.*)?$/i.test(lpa) ? lpa.replace(/^lpa:/i, "LPA:") : null;
  const smdp = (input.smdp ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const code = (input.code ?? "").trim();
  if (!smdp || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(smdp)) return null;
  return `LPA:1$${smdp}$${code}`;
}

/** Split an LPA string for phones that ask for the SM-DP+ address and code separately. */
export function splitLpa(lpa: string): { smdp: string; code: string } | null {
  const m = /^LPA:1\$([^$]+)\$([^$]*)/i.exec(lpa.trim());
  return m ? { smdp: m[1], code: m[2] } : null;
}

/** iPhone (iOS 17.4+) one-tap install link for an LPA code. */
export const appleInstallUrl = (lpa: string) => `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`;

export const monthsLabel = (m: number) => (m === 1 ? "1 month" : `${m} months`);

/**
 * Put the Almighty Pumps mark in the middle of a QR code SVG (as made by the `qrcode` library). The code must be
 * generated with error correction "H" so the covered centre (about a fifth of the width) doesn't stop it scanning.
 */
export function brandQrSvg(svg: string): string {
  const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  if (!m || !svg.includes("</svg>")) return svg;
  const n = Number(m[1]);
  const box = n * 0.22, pad = box * 0.1, at = (n - box) / 2, k = (box - pad * 2) / 200;
  const mark = `<g shape-rendering="geometricPrecision"><rect x="${at - pad}" y="${at - pad}" width="${box + pad * 2}" height="${box + pad * 2}" rx="${box * 0.2}" fill="#ffffff"/>`
    + `<rect x="${at}" y="${at}" width="${box}" height="${box}" rx="${box * 0.18}" fill="#0E1116"/>`
    + `<g transform="translate(${at + pad} ${at + pad}) scale(${k})"><polygon points="20,175 120,20 120,175" fill="#F4F2EE"/>`
    + `<path d="M120 20 H145 A50 50 0 0 1 145 120 H120 Z M120 46 H145 A24 24 0 0 1 145 94 H120 Z" fill="#F4F2EE" fill-rule="evenodd"/>`
    + `<polyline points="52,162 82,124 112,162" fill="none" stroke="#FF5A1F" stroke-width="13" stroke-linejoin="miter"/></g></g>`;
  return svg.replace("</svg>", `${mark}</svg>`);
}

/** US states (and DC) a customer can ask for their new number to come from. */
export const US_STATES: [code: string, name: string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"],
  ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];
export const usStateName = (code: string | null | undefined) => US_STATES.find(([c]) => c === code)?.[1] ?? null;
