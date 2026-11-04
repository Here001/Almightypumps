import { adminOrRedirect } from "@/server/adminPage";
import { AdminEsim } from "@/components/AdminEsim";

export const dynamic = "force-dynamic";

export default async function EsimAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>eSIMs</h1>
        <p className="muted">Set your eSIM plans and prices, then deliver each order: buy the eSIM from your supplier with the customer&apos;s IMEI and enter the number and activation code. The customer pays when they order; the money is only taken when you deliver, and refunded if you can&apos;t.</p>
      </div>
      <AdminEsim />
    </>
  );
}
