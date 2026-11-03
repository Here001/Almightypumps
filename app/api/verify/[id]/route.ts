import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { notFound } from "@/server/errors";
import { cancelVerification, myVerification } from "@/server/smsVerify";

export const dynamic = "force-dynamic";

const uuid = (id: string) => { if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Verification"); return id; };

/** Poll: checks the provider for the code while it's waiting. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  return myVerification(getDb(), user.id, uuid((await params).id));
});

/** { action: "cancel" } → cancel and refund (only if no code has arrived). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  await body(req, z.object({ action: z.literal("cancel") }));
  return cancelVerification(getDb(), user.id, uuid((await params).id));
});
