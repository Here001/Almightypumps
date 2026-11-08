/**
 * Name matching for withdrawals (bank account name vs. the customer's name). Nigerian banks often show "SURNAME FIRSTNAME MIDDLENAME", so word
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

