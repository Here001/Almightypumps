import { adminOrRedirect } from "@/server/adminPage";
import { AdminShipping } from "@/components/AdminShipping";

export const dynamic = "force-dynamic";

export default async function ShippingAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Package delivery</h1>
        <p className="muted">Customers send packages within Nigeria or from the USA to Nigeria through Terminal Africa&apos;s couriers. You pay the courier from your Terminal Africa wallet; customers pay the courier price plus your markup.</p>
      </div>
      <AdminShipping />
    </>
  );
}
