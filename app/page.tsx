import { LANDING_HTML } from "@/landing/markup";
import LandingEffects from "@/components/LandingEffects";

export default function HomePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
      <LandingEffects />
    </>
  );
}
