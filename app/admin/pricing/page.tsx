import { adminOrRedirect } from "@/server/adminPage";
import { AdminPricing } from "@/components/AdminPricing";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Pricing</h1>
        <p className="muted">Set your markup per platform and per type (Followers, Likes, Views…), and the smallest order customers can place.</p>
      </div>
      <AdminPricing />
    </>
  );
}
