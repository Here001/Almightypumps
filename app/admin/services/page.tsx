import { adminOrRedirect } from "@/server/adminPage";
import { AdminServices } from "@/components/AdminServices";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Services</h1>
        <p className="muted">Everything your providers offer. Hide anything you don&apos;t want customers to see; unhide it any time.</p>
      </div>
      <AdminServices />
    </>
  );
}
