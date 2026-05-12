export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand panel, hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-foreground px-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white">
            Strata Wise
          </h1>
          <p className="mt-3 text-lg text-white/60">
            Professional strata management, automated.
          </p>
        </div>
      </div>

      {/* Right panel — auth content */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-background p-8">
        {children}
      </div>
    </div>
  );
}
