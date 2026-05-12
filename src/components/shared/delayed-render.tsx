"use client";

import { useEffect, useState } from "react";

interface DelayedRenderProps {
  delay?: number;
  children: React.ReactNode;
}

// Renders nothing for the first `delay` ms after mount, then renders
// children. Used to wrap loading.tsx skeletons so fast navigations (data
// arrives in < delay ms) never flash a skeleton at all — only longer
// loads ever show one.
export function DelayedRender({ delay = 200, children }: DelayedRenderProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return show ? <>{children}</> : null;
}
