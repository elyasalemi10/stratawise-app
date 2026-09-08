"use client";

// The page's own heading.
//
// It was briefly "Parkinson's Documents", naming the OC on every page. That
// reads as a label the app invented rather than the name of the thing you are
// looking at, and the OC is already established by the swapper, the
// breadcrumb and the URL, so the possessive was paying for context nobody was
// missing. "Documents" is what the page is.

export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-semibold tracking-tight text-foreground">{children}</h1>
  );
}

/**
 * Heading for a page inside an OC.
 *
 * Still its own component rather than a bare <h1> at each call site, because
 * the page and its skeleton both render it and they have to agree: a skeleton
 * without the heading followed by a page with one is a layout shift.
 */
export function OCPageTitle({ page }: { page: string }) {
  return <PageTitle>{page}</PageTitle>;
}
