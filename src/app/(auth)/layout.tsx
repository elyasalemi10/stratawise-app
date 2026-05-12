import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — hero image, hidden on mobile */}
      <div className="hidden lg:block lg:w-1/2 relative bg-foreground">
        <Image
          src="/login-hero.webp"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </div>

      {/* Right panel — white bg, centred logo near top + auth content */}
      <div className="flex w-full lg:w-1/2 flex-col items-center bg-card px-6 pt-16 pb-12">
        <Image
          src="/stratawise-logo.webp"
          alt="Strata Wise"
          width={260}
          height={56}
          priority
          className="mb-12 h-14 w-auto"
        />
        <div className="flex w-full flex-1 flex-col items-center justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}
