import Image from "next/image";
import { WaitlistForm } from "./_components/waitlist-form";

// Pre-launch landing page: waitlist capture only. Sign-in / sign-up are
// intentionally hidden — the auth flow is closed to the public during the
// waitlist period. Submissions are persisted to waitlist_signups and an
// operator notification is dispatched to SEND_TO.

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
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/70">
          Coming soon
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Strata management,
            <br />
            on autopilot.
          </h1>
          <p className="mt-5 text-lg text-white/60 leading-relaxed">
            Levies, meetings, reconciliation, communications — handled. Built in
            Melbourne for Australian strata managers. Join the waitlist to be
            first in line when we open up.
          </p>
        </div>

        <div className="mt-10 w-full max-w-md">
          <WaitlistForm />
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} StrataWise · Melbourne, Australia
      </footer>
    </div>
  );
}
