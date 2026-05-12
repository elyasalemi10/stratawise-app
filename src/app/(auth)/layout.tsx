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

      {/* Right panel — white bg, centred logo + auth content */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-card px-6 py-12">
        <Image
          src="/stratawise-logo.webp"
          alt="Strata Wise"
          width={180}
          height={40}
          priority
          className="mb-8 h-9 w-auto"
        />
        {children}
      </div>
    </div>
  );
}
