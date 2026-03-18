import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backLink?: {
    href: string;
    label: string;
  };
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, backLink, badge, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {backLink && (
        <Link
          href={backLink.href}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backLink.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
