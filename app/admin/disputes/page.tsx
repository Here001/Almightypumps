import { adminOrRedirect } from "@/server/adminPage";
import { AdminDisputes } from "@/components/AdminMoney";

export const dynamic = "force-dynamic";

export default async function Page() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Disputes</h1>
        <p className="muted">P2P trades where the buyer reported a problem. Read both sides, then refund the buyer or pay the seller.</p>
      </div>
      <AdminDisputes />
    </>
  );
}
