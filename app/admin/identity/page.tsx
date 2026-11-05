import { adminOrRedirect } from "@/server/adminPage";
import { AdminIdentity } from "@/components/AdminIdentity";

export const dynamic = "force-dynamic";

export default async function IdentityAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await adminOrRedirect();
  const { tab } = await searchParams;
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Identity & name checks</h1>
        <p className="muted">Customers must pass an identity check before their first withdrawal, and name changes wait for you. Approve, reject, or ask them for more information.</p>
      </div>
      <AdminIdentity initialTab={tab === "names" ? "names" : "identity"} />
    </>
  );
}
