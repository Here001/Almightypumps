import type { Metadata } from "next";
import { ForgotPassword } from "@/components/ForgotPassword";

export const metadata: Metadata = { title: "Reset password · Almighty Pumps" };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
