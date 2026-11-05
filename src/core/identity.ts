/**
 * Name matching for withdrawals and identity checks. Nigerian banks often show "SURNAME FIRSTNAME MIDDLENAME", so word
 * order doesn't matter. Titles and punctuation are ignored. Two names match when they share at least two words and
 * every word of the shorter name appears in the longer one (initials like "A." match a word starting with that letter).
 */
const TITLES = new Set(["mr", "mrs", "miss", "ms", "dr", "chief", "alhaji", "alhaja", "engr", "pastor", "prof", "sir", "hon", "barr", "mallam", "evang", "rev"]);

export function nameWords(name: string): string[] {
  return name
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z\s.-]/g, " ").replace(/[.-]/g, " ")
    .split(/\s+/).filter((w) => w && !TITLES.has(w));
}

export function namesMatch(a: string, b: string): boolean {
  const x = nameWords(a), y = nameWords(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const pool = [...long];
  let full = 0;
  for (const w of short) {
    let i = pool.indexOf(w);
    if (i >= 0) full++;
    else if (w.length === 1) i = pool.findIndex((p) => p.startsWith(w));
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return full >= 2;
}

export const IDENTITY_ID_TYPES = [
  { id: "nin", label: "NIN slip or National ID card", pattern: /^\d{11}$/, hint: "11-digit NIN" },
  { id: "bvn", label: "BVN (with any photo ID)", pattern: /^\d{11}$/, hint: "11-digit BVN" },
  { id: "drivers_license", label: "Driver's licence", pattern: /^[A-Z0-9]{8,15}$/i, hint: "8–15 letters or digits" },
  { id: "passport", label: "International passport", pattern: /^[A-Z]\d{8}$/i, hint: "1 letter + 8 digits" },
  { id: "voters_card", label: "Voter's card (PVC)", pattern: /^[A-Z0-9]{19}$|^[A-Z0-9]{9,10}$/i, hint: "VIN on your card" },
] as const;
export type IdentityIdType = (typeof IDENTITY_ID_TYPES)[number]["id"];
