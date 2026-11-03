import { adminOrRedirect } from "@/server/adminPage";
import { AdminVerify } from "@/components/AdminVerify";

export const dynamic = "force-dynamic";

export default async function VerifyAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Verification codes</h1>
        <p className="muted">One-time SMS numbers from TextVerified. Set your markup, check your TextVerified balance, and hide apps you don&apos;t want to offer.</p>
      </div>
      <AdminVerify />
    </>
  );
}
