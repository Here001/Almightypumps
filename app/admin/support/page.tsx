import { adminOrRedirect } from "@/server/adminPage";
import { AdminSupport } from "@/components/AdminSupport";

export const dynamic = "force-dynamic";

export default async function SupportAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Support chat</h1>
        <p className="muted">Messages from customers. Unread ones are at the top. Customers get an email when you reply.</p>
      </div>
      <AdminSupport />
    </>
  );
}
