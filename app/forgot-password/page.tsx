import type { Metadata } from "next";
import { ForgotPassword } from "@/components/ForgotPassword";

export const metadata: Metadata = { title: { absolute: "Reset password · Almighty Pumps" }, robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
