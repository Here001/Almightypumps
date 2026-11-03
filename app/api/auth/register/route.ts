import { getDb } from "@/server/db";
import { register, registerSchema, startSession } from "@/server/auth";
import { body, route } from "@/server/http";

export const POST = route(async (req: Request) => {
  const input = await body(req, registerSchema);
  const user = await register(getDb(), input);
  await startSession(user.id);
  return user;
});
