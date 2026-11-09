import { adminOrRedirect } from "@/server/adminPage";
import { AdminWhatsApp } from "@/components/AdminWhatsApp";

export const dynamic = "force-dynamic";

export default async function WhatsAppAdminPage() {
  await adminOrRedirect();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>WhatsApp agent</h1>
        <p className="muted">An AI assistant on your WhatsApp number. It answers questions, shows customers their balance and orders, and lets linked customers buy airtime, data, Boost, gift cards and travel eSIMs from their wallet. Nothing is bought until the customer replies YES.</p>
      </div>
      <AdminWhatsApp />
    </>
  );
}
