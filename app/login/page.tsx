import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = { title: { absolute: "Log in · Almighty Pumps" }, alternates: { canonical: "/login" }, robots: { index: false, follow: true } };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
