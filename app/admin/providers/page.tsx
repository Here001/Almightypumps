import { count, eq, max } from "drizzle-orm";
import { getDb } from "@/server/db";
import { smmProviders, smmServices } from "@/server/db/schema";
import { adminOrRedirect } from "@/server/adminPage";
import { ProviderCard } from "@/components/AdminProviders";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  await adminOrRedirect();
  const db = getDb();
  const providers = await db
    .select({
      id: smmProviders.id, name: smmProviders.name, apiUrl: smmProviders.apiUrl, currency: smmProviders.currency,
      markupBps: smmProviders.markupBps, active: smmProviders.active, apiKeyEnv: smmProviders.apiKeyEnv,
      services: count(smmServices.id), lastSync: max(smmServices.updatedAt),
    })
    .from(smmProviders)
    .leftJoin(smmServices, eq(smmServices.providerId, smmProviders.id))
    .groupBy(smmProviders.id)
    .orderBy(smmProviders.createdAt);

  return (
    <>
      <div>
        <h1 style={{ fontSize: 28 }}>Growth providers</h1>
        <p className="muted">The panels you buy followers, likes and views from. Your markup is added on top of their price.</p>
      </div>
      {providers.length === 0 ? <div className="empty">No providers yet.</div> : providers.map((p) => (
        <ProviderCard
          key={p.id}
          p={{ ...p, keySet: Boolean(process.env[p.apiKeyEnv]), lastSync: p.lastSync ? p.lastSync.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : null }}
        />
      ))}
    </>
  );
}
