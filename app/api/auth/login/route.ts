import { getDb } from "@/server/db";
import { login, loginSchema, startSession } from "@/server/auth";
import { body, route } from "@/server/http";

export const POST = route(async (req: Request) => {
  const input = await body(req, loginSchema);
  const user = await login(getDb(), input);
  await startSession(user.id);
  return user;
});
