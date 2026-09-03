import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel , hero image, hidden on mobile.
      
          Sticky and exactly one viewport tall. It used to be a plain flex
          child, so it stretched to whatever the form beside it needed: a
          short sign-in gave a screen-height hero, a long onboarding step
          gave a much taller one, and the same photograph was a different
          size on every page. Pinned to the viewport it is the constant the
          form moves against. */}
      <div className="hidden lg:block lg:w-1/2">
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-foreground">
          <Image
            src="/login-hero.webp"
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover"
          />
          {/* Subtle midnight gradient overlay , darker at top, fades down. */}
          <div className="absolute inset-0 bg-gradient-to-b from-foreground/40 via-foreground/15 to-foreground/30 pointer-events-none" />
        </div>
      </div>

      {/* Right panel , white bg. The favicon + form sit in a single
          horizontally-centred, vertically-centred block. */}
      <div className="flex min-h-screen w-full lg:w-1/2 flex-col items-center justify-center bg-card px-6 py-12">
        <div className="flex w-full max-w-lg flex-col items-center">
          <Image
            src="/stratawise-icon.webp"
            alt="StrataWise"
            width={129}
            height={145}
            priority
            className="mb-8 h-16 w-auto"
          />
          {children}
        </div>
      </div>
    </div>
  );
}
