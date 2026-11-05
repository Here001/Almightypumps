import { adminOrRedirect } from "@/server/adminPage";
import { AdminSwitches } from "@/components/AdminSwitches";

export const dynamic = "force-dynamic";

export default async function SwitchesAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Services: order &amp; on/off</h1>
        <p className="muted">Set the order of the tiles on your customers&apos; Services page. Switch any service off and its tile disappears for customers straight away, and no new orders can be placed. Orders already in progress still finish. Switch it back on any time.</p>
      </div>
      <AdminSwitches />
    </>
  );
}
