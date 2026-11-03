import { adminOrRedirect } from "@/server/adminPage";
import { AdminSellers } from "@/components/AdminSellers";

export const dynamic = "force-dynamic";

export default async function SellersPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Seller applications</h1>
        <p className="muted">Check each applicant&apos;s ID and that the bank account name matches before approving. Approved sellers can post ads on the P2P marketplace.</p>
      </div>
      <AdminSellers />
    </>
  );
}
