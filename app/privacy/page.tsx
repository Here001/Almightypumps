import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { RichText } from "@/components/RichText";
import { getDb } from "@/server/db";
import { formatLegalDate, getLegal } from "@/server/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · Almighty Pumps",
  description: "How Almighty Pumps collects, uses, shares and protects your personal data.",
};
// Text is edited in Admin → Legal pages, so read it on every visit.
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const doc = await getLegal(getDb(), "privacy");
  return (
    <LegalPage title="Privacy Policy" updated={formatLegalDate(doc.updated)}>
      <RichText text={doc.body} />
    </LegalPage>
  );
}
