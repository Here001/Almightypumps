import { adminOrRedirect } from "@/server/adminPage";
import { AdminWallet } from "@/components/AdminMoney";

export const dynamic = "force-dynamic";

export default async function Page() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Money</h1>
        <p className="muted">Your platform wallet: what the business has earned, customer money you hold, and what&apos;s waiting to be paid out.</p>
      </div>
      <AdminWallet />
    </>
  );
}
