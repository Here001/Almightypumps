import { adminOrRedirect } from "@/server/adminPage";
import { AdminUserDetail } from "@/components/AdminUserDetail";

export const dynamic = "force-dynamic";

export default async function UserAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await adminOrRedirect();
  const { id } = await params;
  return <AdminUserDetail id={id} meId={me.id} />;
}
