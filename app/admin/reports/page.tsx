import { adminOrRedirect } from "@/server/adminPage";
import { AdminReports } from "@/components/AdminReports";

export const dynamic = "force-dynamic";

export default async function Page() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Seller reports</h1>
        <p className="muted">Buyers who reported a seller from the trade room. Money is not affected: use Disputes for that.</p>
      </div>
      <AdminReports />
    </>
  );
}
