import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { RichText } from "@/components/RichText";
import { getDb } from "@/server/db";
import { formatLegalDate, getLegal } from "@/server/legal";

export const metadata: Metadata = {
  title: "Terms of Service · Almighty Pumps",
  description: "The rules for using Almighty Pumps: accounts, wallet, services, the P2P marketplace, refunds and more.",
};
// Text is edited in Admin → Legal pages, so read it on every visit.
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const doc = await getLegal(getDb(), "terms");
  return (
    <LegalPage title="Terms of Service" updated={formatLegalDate(doc.updated)}>
      <RichText text={doc.body} />
    </LegalPage>
  );
}
