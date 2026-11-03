import { notFound, redirect } from "next/navigation";
import { currentUser, type SessionUser } from "./auth";

/** For admin pages: logged-out visitors go to login, non-admins get a 404. */
export async function adminOrRedirect(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") notFound();
  return user;
}
