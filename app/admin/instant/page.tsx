import { adminOrRedirect } from "@/server/adminPage";
import { AdminInstant } from "@/components/AdminInstant";

export const dynamic = "force-dynamic";

export default async function InstantAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Gift cards, airtime & travel eSIMs</h1>
        <p className="muted">Delivered instantly by Reloadly and eSIM Access. Set your markups, pause sales, check your provider balances and orders.</p>
      </div>
      <AdminInstant />
    </>
  );
}
