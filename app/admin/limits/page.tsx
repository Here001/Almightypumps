import { adminOrRedirect } from "@/server/adminPage";
import { AdminLimits } from "@/components/AdminLimits";

export const dynamic = "force-dynamic";

export default async function LimitsAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Limits & usage</h1>
        <p className="muted">Speed limits and daily quotas that protect the site from abuse, bots and surprise costs. Normal customers never reach them. Change a number and it applies within a minute.</p>
      </div>
      <AdminLimits />
    </>
  );
}
