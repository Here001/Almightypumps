import { adminOrRedirect } from "@/server/adminPage";
import { AdminNameChanges } from "@/components/AdminNameChanges";

export const dynamic = "force-dynamic";

export default async function NameChangesAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Name changes</h1>
        <p className="muted">Customers can&apos;t change their name themselves: withdrawals only go to bank accounts in their name. Approve, reject, or ask them for more information (they can reply with photos).</p>
      </div>
      <AdminNameChanges />
    </>
  );
}
