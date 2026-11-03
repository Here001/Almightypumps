import { adminOrRedirect } from "@/server/adminPage";
import { AdminShop } from "@/components/AdminShop";

export const dynamic = "force-dynamic";

export default async function ShopAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Shop</h1>
        <p className="muted">Create a category (e.g. eSIMs), add products to it and they go live for customers straight away.</p>
      </div>
      <AdminShop />
    </>
  );
}
