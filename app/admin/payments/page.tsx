import { adminOrRedirect } from "@/server/adminPage";
import { AdminPayments } from "@/components/AdminPayments";
import { AdminBankTransfer } from "@/components/AdminBankTransfer";

export const dynamic = "force-dynamic";

export default async function PaymentsAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Bank transfer & crypto payments</h1>
        <p className="muted">Set where customers can pay you directly. When someone taps &ldquo;I have made payment&rdquo; you get an email; check it arrived, then confirm to fund their wallet.</p>
      </div>
      <AdminBankTransfer />
      <AdminPayments />
    </>
  );
}
