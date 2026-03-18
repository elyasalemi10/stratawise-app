import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        {children}
      </div>
    </div>
  );
}
