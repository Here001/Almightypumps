import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: { absolute: "Create a free account · Almighty Pumps" },
  description: "Join Almighty Pumps free: one Naira wallet for social media growth, US verification numbers, eSIMs, gift cards, airtime and escrow trading.",
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
