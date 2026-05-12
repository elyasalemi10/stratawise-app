"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";

// Fires a brand-coloured burst of confetti when the dashboard mounts with
// ?welcome=1 (set by the onboarding redirect after a manager creates their
// company). Strips the query param afterwards so a refresh doesn't re-fire.

const COLOURS = [
  "#CFA753", // gold (primary)
  "#0E314C", // midnight (foreground)
  "#FAF7F0", // cream (page bg)
  "#E5E0D3", // stone (border)
  "#FFFFFF", // paper
];

export function WelcomeConfetti() {
  const fired = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const welcome = searchParams.get("welcome");

  useEffect(() => {
    if (welcome !== "1") return;
    if (fired.current) return;
    fired.current = true;

    // Two staggered bursts from opposite sides for fullness
    const fire = (originX: number, angle: number) =>
      confetti({
        particleCount: 60,
        spread: 70,
        angle,
        origin: { x: originX, y: 0.7 },
        colors: COLOURS,
        startVelocity: 45,
        scalar: 0.9,
        ticks: 200,
      });

    fire(0.2, 60);
    fire(0.8, 120);
    setTimeout(() => {
      fire(0.5, 90);
    }, 220);

    // Strip the query param so refresh doesn't replay the animation
    const params = new URLSearchParams(searchParams.toString());
    params.delete("welcome");
    const next = params.toString();
    router.replace(`/dashboard${next ? `?${next}` : ""}`, { scroll: false });
  }, [welcome, router, searchParams]);

  return null;
}
