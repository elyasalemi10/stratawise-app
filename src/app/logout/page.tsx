"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export default function LogoutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    signOut({ redirectUrl: "/" });
  }, [signOut]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Signing out...</p>
    </div>
  );
}
