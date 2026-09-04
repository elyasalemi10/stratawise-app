import Link from "next/link";
import { Button } from "@/components/ui/button";

// The 404. Next's default is an unstyled black-on-white "404 | This page
// could not be found", which looks like the app fell over rather than like
// a link being wrong.
//
// No sidebar and no header: this file sits at the app root, so it renders
// outside every layout, and a chrome-less page is honest about the fact
// that we do not know where you were trying to be.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <svg
        width="140"
        height="112"
        viewBox="0 0 120 96"
        fill="none"
        role="presentation"
        aria-hidden="true"
      >
        <ellipse cx="60" cy="84" rx="42" ry="6" fill="var(--muted)" />
        <rect x="26" y="26" width="52" height="52" rx="5" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <path d="M36 42h32M36 54h32M36 66h20" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="82" cy="38" r="15" fill="var(--card)" stroke="var(--brand-gold)" strokeWidth="3" />
        <path d="M93 49l8 8" stroke="var(--brand-gold)" strokeWidth="3" strokeLinecap="round" />
      </svg>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
        We can&apos;t find that page
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The link may be out of date, or the Owners Corporation it pointed at
        may have been renamed.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href="/dashboard">
          <Button>Go to your dashboard</Button>
        </Link>
        <Link href="/ocs">
          <Button variant="secondary">Browse OCs</Button>
        </Link>
      </div>
    </main>
  );
}
