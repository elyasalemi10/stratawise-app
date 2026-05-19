import Link from "next/link";
import { ShieldCheck, LogOut } from "lucide-react";

// Top-level chrome for the super admin surface. Each page owns its own
// gate (evaluateSuperAdminGate for /admin, requireSuperAdminAal1OrAbove
// for /admin/mfa-*) — having the layout enforce a gate would loop the
// redirect when the destination of the gate is also inside this layout.

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-[color:var(--brand-gold)]" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            StrataWise · Super Admin
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/admin"
            className="text-muted-foreground hover:text-foreground"
          >
            Overview
          </Link>
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground"
            title="Open the regular dashboard"
          >
            App view
          </Link>
          <form action="/logout" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
