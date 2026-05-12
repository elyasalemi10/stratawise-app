import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-foreground">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">
          Strata Wise
        </h1>
        <p className="mt-3 text-lg text-white/60">
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
