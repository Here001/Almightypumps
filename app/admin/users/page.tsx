import { adminOrRedirect } from "@/server/adminPage";
import { AdminUsers } from "@/components/AdminUsers";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Users</h1>
        <p className="muted">Every customer account. Search by name, email, phone or invite code, then tap a customer to see their wallet and activity and take action.</p>
      </div>
      <AdminUsers />
    </>
  );
}
