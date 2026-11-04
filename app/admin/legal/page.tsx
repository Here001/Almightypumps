import { adminOrRedirect } from "@/server/adminPage";
import { AdminLegal } from "@/components/AdminLegal";

export const dynamic = "force-dynamic";

export default async function LegalAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Legal pages</h1>
        <p className="muted">Edit your Privacy Policy and Terms of Service. Saving updates the live page straight away and sets “Last updated” to today.</p>
      </div>
      <AdminLegal />
    </>
  );
}
