/**
 * Per-category questions sellers answer when posting an ad (set up by admins in
 * /admin/p2p-categories). Answers are shown to buyers on the ad.
 */
export const QUESTION_TYPES = ["text", "textarea", "number", "select", "yesno"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type Question = {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: string[]; // for "select"
  help?: string;
};

export type Answers = Record<string, string>;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: "Short answer",
  textarea: "Long answer",
  number: "Number",
  select: "Pick from a list",
  yesno: "Yes / No",
};

/** Clean up questions from the admin form: trim, drop empties, give stable ids, cap sizes. */
export function normaliseQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  const out: Question[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 30)) {
    if (!r || typeof r !== "object") continue;
    const q = r as Record<string, unknown>;
    const label = String(q.label ?? "").trim().slice(0, 120);
    if (!label) continue;
    const type = (QUESTION_TYPES as readonly string[]).includes(String(q.type)) ? (String(q.type) as QuestionType) : "text";
    let id = String(q.id ?? "").trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
    if (!id || seen.has(id)) id = `q${out.length + 1}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20)}`;
    seen.add(id);
    const options = type === "select"
      ? [...new Set((Array.isArray(q.options) ? q.options : String(q.options ?? "").split(/\n|,/)).map((o) => String(o).trim().slice(0, 60)).filter(Boolean))].slice(0, 30)
      : undefined;
    if (type === "select" && (!options || options.length < 2)) throw new Error(`“${label}” needs at least two choices.`);
    const help = String(q.help ?? "").trim().slice(0, 200) || undefined;
    out.push({ id, label, type, required: Boolean(q.required), ...(options ? { options } : {}), ...(help ? { help } : {}) });
  }
  return out;
}

/** Check a seller's answers against the category's questions. Returns cleaned answers and any problems. */
export function checkAnswers(questions: Question[], raw: unknown): { answers: Answers; problems: string[] } {
  const given = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const answers: Answers = {};
  const problems: string[] = [];
  for (const q of questions) {
    const v = String(given[q.id] ?? "").trim();
    if (!v) {
      if (q.required) problems.push(`Answer “${q.label}”.`);
      continue;
    }
    if (q.type === "number" && !/^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ""))) { problems.push(`“${q.label}” must be a number.`); continue; }
    if (q.type === "select" && !(q.options ?? []).includes(v)) { problems.push(`Pick one of the choices for “${q.label}”.`); continue; }
    if (q.type === "yesno" && v !== "Yes" && v !== "No") { problems.push(`Answer Yes or No for “${q.label}”.`); continue; }
    answers[q.id] = v.slice(0, q.type === "textarea" ? 2000 : 200);
  }
  return { answers, problems };
}
