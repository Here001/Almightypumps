import { adminOrRedirect } from "@/server/adminPage";
import { AdminP2PCategories } from "@/components/AdminP2PCategories";

export const dynamic = "force-dynamic";

export default async function P2PCategoriesPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>P2P categories</h1>
        <p className="muted">The categories sellers post ads in. Give each one its own questions; sellers answer them and buyers see the answers.</p>
      </div>
      <AdminP2PCategories />
    </>
  );
}
