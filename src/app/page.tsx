import Link from "next/link";
import Image from "next/image";

// Note: signed-in users are bounced to /dashboard by the middleware before
// this page is ever rendered (see src/middleware.ts SIGNED_IN_REDIRECT_AWAY).

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-foreground text-white">
      <header className="flex items-center justify-between px-6 py-5 lg:px-12">
        <Image
          src="/stratawise-logo.webp"
          alt="StrataWise"
          width={180}
          height={40}
          priority
          className="h-9 w-auto invert"
        />
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/sign-in"
            className="rounded-md px-3 py-1.5 text-white/80 hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Strata management,
          <br />
          on autopilot.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/60 leading-relaxed">
          Levies, meetings, reconciliation, communications — handled.
          Built in Melbourne for Australian strata managers.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-up"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Get started &rarr;
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-11 items-center rounded-md border border-white/15 px-6 text-sm font-medium text-white hover:bg-white/5"
          >
            Sign in
          </Link>
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} StrataWise · Melbourne, Australia
      </footer>
    </div>
  );
}
