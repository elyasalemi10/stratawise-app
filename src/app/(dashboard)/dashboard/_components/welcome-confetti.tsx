"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";

// Full-screen rainbow confetti shower + a "Welcome to StrataWise" overlay
// that slides up and fades out. Fires once when /dashboard mounts with
// ?welcome=1. Strips the query param afterwards so a refresh doesn't replay.

const RAINBOW = [
  "#FF4D4D", // red
  "#FF9F1C", // orange
  "#FFD60A", // yellow
  "#34C759", // green
  "#0AA1FF", // blue
  "#5E5CE6", // indigo
  "#BF5AF2", // violet
];

export function WelcomeConfetti() {
  const fired = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const welcome = searchParams.get("welcome");
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayState, setOverlayState] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    if (welcome !== "1") return;
    if (fired.current) return;
    fired.current = true;

    // Fire on the next frame so the canvas is mounted, with no perceptible
    // wait , the celebration should feel instant on arriving at the dashboard.
    const startTimer = setTimeout(() => fireCelebration(), 0);

    function fireCelebration() {
    // Less confetti, bigger pieces. ~1.6s total. Two side cannons + a
    // sparse top sprinkle so it feels celebratory but not overwhelming.
    confetti({
      particleCount: 35,
      angle: 60,
      spread: 65,
      origin: { x: 0, y: 0.65 },
      colors: RAINBOW,
      startVelocity: 55,
      scalar: 1.6,
      ticks: 220,
      gravity: 0.8,
    });
    confetti({
      particleCount: 35,
      angle: 120,
      spread: 65,
      origin: { x: 1, y: 0.65 },
      colors: RAINBOW,
      startVelocity: 55,
      scalar: 1.6,
      ticks: 220,
      gravity: 0.8,
    });

    // Sparse top sprinkle over ~1.4s
    const sprinkleEnd = Date.now() + 1400;
    const tick = () => {
      confetti({
        particleCount: 2,
        startVelocity: 22,
        spread: 360,
        ticks: 180,
        origin: { x: Math.random(), y: Math.random() * 0.2 },
        colors: RAINBOW,
        scalar: 1.5,
        gravity: 0.7,
      });
      if (Date.now() < sprinkleEnd) requestAnimationFrame(tick);
    };
    tick();

      // 2) Welcome overlay: slide-up + fade-in for 100ms, hold 1.4s, then
      //    fade-out + slide-down for 600ms. Total ~2.1s.
      setShowOverlay(true);
      setOverlayState("enter");
      setTimeout(() => setOverlayState("exit"), 1500);
      setTimeout(() => setShowOverlay(false), 2100);
    }

    // 3) Strip the query param so refresh doesn't replay the animation
    const params = new URLSearchParams(searchParams.toString());
    params.delete("welcome");
    const next = params.toString();
    router.replace(`/dashboard${next ? `?${next}` : ""}`, { scroll: false });

    return () => {
      clearTimeout(startTimer);
    };
  }, [welcome, router, searchParams]);

  if (!showOverlay) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
      aria-hidden
    >
      <div
        className={
          overlayState === "enter"
            ? "animate-welcome-in text-center"
            : "animate-welcome-out text-center"
        }
      >
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary/80">
          Welcome to
        </p>
        <h1 className="mt-2 text-6xl md:text-7xl font-bold tracking-tight text-foreground drop-shadow-sm">
          StrataWise
        </h1>
      </div>
    </div>
  );
}
