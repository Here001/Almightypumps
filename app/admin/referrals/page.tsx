import { adminOrRedirect } from "@/server/adminPage";
import { AdminReferrals } from "@/components/AdminReferrals";

export const dynamic = "force-dynamic";

export default async function ReferralsAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Invite friends</h1>
        <p className="muted">Customers share their invite link. When a friend they invited has spent the minimum on orders, you pay both of them a bonus into their wallet, automatically.</p>
      </div>
      <AdminReferrals />
    </>
  );
}
