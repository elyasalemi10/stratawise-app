import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth";

export default async function LandingPage() {
  const userId = await getAuthUserId();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-foreground">
      <div className="text-center">
        <Image
          src="/stratawise-logo.webp"
          alt="Strata Wise"
          width={220}
          height={48}
          priority
          className="mx-auto h-12 w-auto invert"
        />
        <p className="mt-4 text-lg text-white/60">
          Professional strata management, automated.
        </p>
        <Link
          href="/sign-in"
          className="mt-8 inline-flex h-10 items-center rounded-md bg-primary px-6 text-sm font-medium text-white shadow-sm hover:bg-primary/90 transition-colors duration-150"
        >
          Sign in &rarr;
        </Link>
      </div>
    </div>
  );
}
