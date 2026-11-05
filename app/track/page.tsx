import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { TrackParcel } from "@/components/TrackParcel";
import { SITE_NAME } from "@/core/site";

const TITLE = "Track a package";
export const metadata: Metadata = {
  title: { absolute: `${TITLE} · ${SITE_NAME}` },
  description: "Follow a package sent with Almighty Pumps: enter the tracking number to see where it is and when it will arrive.",
  alternates: { canonical: "/track" },
};

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <PublicShell>
      <section className="pub-hero glass">
        <span className="pub-kicker">Package tracking</span>
        <h1>Track a package</h1>
        <p className="pub-lead">Enter the tracking number you were given (it starts with AP), or the courier&apos;s tracking number.</p>
        <TrackParcel initial={(code ?? "").slice(0, 40)} />
      </section>
    </PublicShell>
  );
}
