/** The admin menu (shared by the sidebar and the admin home page). */
import type { AdminCounts } from "@/server/adminHome";

type Item = { href: string; label: string; count?: keyof AdminCounts };
export const ADMIN_GROUPS: { title: string; items: Item[] }[] = [
  { title: "", items: [{ href: "/admin", label: "Home" }] },
  { title: "Customers", items: [{ href: "/admin/users", label: "Users" }] },
  {
    title: "Money",
    items: [
      { href: "/admin/payments", label: "Payments to confirm", count: "payments" },
      { href: "/admin/withdrawals", label: "Withdrawals to pay", count: "withdrawals" },
      { href: "/admin/sell", label: "Gift cards & crypto bought", count: "sell" },
      { href: "/admin/money", label: "Earnings & balances" },
      { href: "/admin/insights", label: "Visitors & sales" },
    ],
  },
  {
    title: "What you sell",
    items: [
      { href: "/admin/switches", label: "Services on/off" },
      { href: "/admin/instant", label: "Gift cards · Airtime · Travel eSIMs", count: "instantStuck" },
      { href: "/admin/esim", label: "US eSIMs", count: "esim" },
      { href: "/admin/verify", label: "Verification codes" },
      { href: "/admin/shipping", label: "Package delivery" },
      { href: "/admin/shop", label: "Shop", count: "shop" },
      { href: "/admin/services", label: "Boost: services" },
      { href: "/admin/pricing", label: "Boost: prices" },
      { href: "/admin/providers", label: "Boost: providers" },
    ],
  },
  {
    title: "P2P marketplace",
    items: [
      { href: "/admin/disputes", label: "Disputes", count: "disputes" },
      { href: "/admin/sellers", label: "Seller applications", count: "sellers" },
      { href: "/admin/listings", label: "Ads to review", count: "listings" },
      { href: "/admin/p2p-categories", label: "Categories" },
    ],
  },
  { title: "Website", items: [{ href: "/admin/referrals", label: "Invite friends" }, { href: "/admin/legal", label: "Privacy & Terms" }] },
];
