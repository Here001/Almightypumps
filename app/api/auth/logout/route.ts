import { endSession } from "@/server/auth";
import { route } from "@/server/http";

export const POST = route(async () => {
  await endSession();
  return { loggedOut: true };
});
