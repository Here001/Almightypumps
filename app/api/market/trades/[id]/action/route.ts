import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { act, answerCancel, reportSeller, requestCancel } from "@/server/market";
import { rateLimit } from "@/server/rateLimit";

// System and admin-only actions are not accepted here.
const schema = z.object({
  action: z.enum(["SHIP", "CONFIRM", "DISPUTE", "CANCEL", "REQUEST_CANCEL", "ACCEPT_CANCEL", "REJECT_CANCEL", "REPORT"]),
  note: z.string().max(2000).optional(),
  reason: z.string().max(200).optional(),
  deliveryProof: z.string().max(2000).optional(),
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await requireUser();
  await rateLimit(getDb(), "tradeAction", user.id);
  const input = await body(req, schema);
  const db = getDb();
  switch (input.action) {
    case "REQUEST_CANCEL": return requestCancel(db, id, user.id, input.note ?? "");
    case "ACCEPT_CANCEL": return answerCancel(db, id, user.id, true);
    case "REJECT_CANCEL": return answerCancel(db, id, user.id, false, input.note);
    case "REPORT": return reportSeller(db, id, user.id, input.reason ?? "", input.note ?? "");
    default: return act(db, id, input.action, { userId: user.id }, { note: input.note, deliveryProof: input.deliveryProof });
  }
});
