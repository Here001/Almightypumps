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
