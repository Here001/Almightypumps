import { adminOrRedirect } from "@/server/adminPage";
import { AdminServices } from "@/components/AdminServices";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Services</h1>
        <p className="muted">Everything your providers offer. Flip the switch to turn a service on or off, or switch a whole platform or type at once.</p>
      </div>
      <AdminServices />
    </>
  );
}
