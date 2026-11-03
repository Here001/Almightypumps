"use client";

import { useEffect } from "react";

/** Starts the WebGL world, smooth scrolling and scroll animations after the markup mounts. */
export default function LandingEffects() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("@/landing/effects").then(({ initLanding }) => {
      if (!cancelled) cleanup = initLanding();
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
  return null;
}
