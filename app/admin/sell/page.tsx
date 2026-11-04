import { adminOrRedirect } from "@/server/adminPage";
import { AdminSell } from "@/components/AdminSell";

export const dynamic = "force-dynamic";

export default async function SellAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Gift cards & crypto bought</h1>
        <p className="muted">Customers sell you gift cards and crypto here. Check each one, then approve to pay their wallet or reject with a reason. Set the cards and coins you buy and your rates below.</p>
      </div>
      <AdminSell />
    </>
  );
}
