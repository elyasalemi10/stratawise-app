import Image from "next/image";
import { WaitlistForm } from "./_components/waitlist-form";

// Pre-launch landing page: waitlist capture only. Sign-in / sign-up are
// intentionally hidden — the auth flow is closed to the public during the
// waitlist period. Submissions are persisted to waitlist_signups, an
// operator notification is dispatched to SEND_TO, and (if configured) the
// contact is added to the Resend audience identified by RESEND_AUDIENCE_ID.

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-foreground text-white">
      {/* Decorative brand mark — large, low-opacity icon behind the hero. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Image
          src="/stratawise-favicon.webp"
          alt=""
          aria-hidden
          width={900}
          height={520}
          priority={false}
          className="w-[min(80vw,900px)] opacity-[0.04] blur-[1px]"
        />
      </div>

      <header className="relative z-10 flex items-center px-6 py-5 lg:px-12">
        <Image
          src="/stratawise-logo.webp"
          alt="StrataWise"
          width={180}
          height={40}
          priority
          className="h-9 w-auto invert"
        />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Modern software for Victorian strata managers.
          </h1>
          <p className="mt-6 text-lg text-white/70 leading-relaxed">
            Levy generation, arrears chase, document search, trust account
            reconciliation, committee comms — built for how managers actually
            work, not how software vendors imagine they do.
          </p>
          <p className="mt-4 text-sm text-white/50 leading-relaxed">
            Built in Melbourne. Designed around the Owners Corporations Act.
            Early access opening soon.
          </p>
        </div>

        <div className="mt-10 w-full max-w-md">
          <WaitlistForm />
        </div>
      </main>

      <footer className="relative z-10 px-6 py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} StrataWise · Melbourne, Australia
      </footer>
    </div>
  );
}
