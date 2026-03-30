"use client";

import dynamic from "next/dynamic";

// Must dynamically import because @react-pdf/renderer uses browser APIs
const LevyTestPage = dynamic(() => import("./levy-test"), { ssr: false });

export default function TestPage() {
  return <LevyTestPage />;
}
