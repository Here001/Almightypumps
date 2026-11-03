import { adminOrRedirect } from "@/server/adminPage";
import { AdminWithdrawals } from "@/components/AdminMoney";

export const dynamic = "force-dynamic";

export default async function Page() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Withdrawals</h1>
        <p className="muted">Send each payout by bank transfer from your banking app, then tap “mark paid”. Rejecting returns the money to the customer&apos;s wallet.</p>
      </div>
      <AdminWithdrawals />
    </>
  );
}
