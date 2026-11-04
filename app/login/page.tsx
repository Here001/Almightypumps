import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";
import { captchaSiteKey } from "@/server/captcha";

export const metadata: Metadata = { title: "Log in · Almighty Pumps" };
// Read the captcha key when the page is requested (it can be added in Vercel without a rebuild).
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <AuthForm mode="login" captchaSiteKey={captchaSiteKey()} />;
}
