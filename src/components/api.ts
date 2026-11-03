/** Small client-side helper for calling our JSON API. */
export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message: string; details?: unknown } } | null;
  if (!json || !json.ok) {
    const details = json?.error?.details;
    const extra = Array.isArray(details) ? ` ${details.join(" ")}` : "";
    throw new Error((json?.error?.message ?? "Something went wrong. Please try again.") + extra);
  }
  return json.data as T;
}

export function naira(kobo: number): string {
  return "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
