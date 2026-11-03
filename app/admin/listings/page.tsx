import { adminOrRedirect } from "@/server/adminPage";
import { AdminListings } from "@/components/AdminListings";

export const dynamic = "force-dynamic";

export default async function ListingsReviewPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Listings to review</h1>
        <p className="muted">Marketplace ads that need a quick check before going live: gift cards, crypto and unclear wording. Approve to publish, or decline with a short reason for the seller.</p>
      </div>
      <AdminListings />
    </>
  );
}
