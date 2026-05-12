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

    // 1) Full-screen confetti shower over ~2.5s, mixing edge bursts with a
    //    continuous fall so it covers the whole viewport.
    const duration = 2800;
    const end = Date.now() + duration;

    const tick = () => {
      // Random bursts from the top edge so particles fall across the screen
      confetti({
        particleCount: 4,
        startVelocity: 30,
        spread: 360,
        ticks: 200,
        origin: { x: Math.random(), y: Math.random() * 0.3 },
        colors: RAINBOW,
        scalar: 0.9,
        gravity: 0.7,
      });
      if (Date.now() < end) requestAnimationFrame(tick);
    };
    tick();

    // Initial side cannons for impact
    confetti({
      particleCount: 100,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.6 },
      colors: RAINBOW,
      startVelocity: 60,
    });
    confetti({
      particleCount: 100,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.6 },
      colors: RAINBOW,
      startVelocity: 60,
    });

    // 2) Welcome overlay: slide-up + fade-in for 100ms, hold 1.4s, then
    //    fade-out + slide-down for 600ms. Total ~2.1s.
    setShowOverlay(true);
    setOverlayState("enter");
    const exitAt = setTimeout(() => setOverlayState("exit"), 1500);
    const hideAt = setTimeout(() => setShowOverlay(false), 2100);

    // 3) Strip the query param so refresh doesn't replay the animation
    const params = new URLSearchParams(searchParams.toString());
    params.delete("welcome");
    const next = params.toString();
    router.replace(`/dashboard${next ? `?${next}` : ""}`, { scroll: false });

    return () => {
      clearTimeout(exitAt);
      clearTimeout(hideAt);
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
