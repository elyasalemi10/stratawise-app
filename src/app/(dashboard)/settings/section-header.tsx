// Every settings section is titled, with a rule under it.
//
// This is the one place in the app an H1-ish heading earns its keep despite
// the no-duplicate-titles rule: the breadcrumb says "Settings", which names
// the area, not which of seven sections you are looking at. The rail shows
// the active item, but the panel beside it needs its own anchor , otherwise
// the content starts with no indication of what it is.

export function SectionHeader({
  title,
  children,
}: {
  title: string;
  /** Optional actions, right-aligned on the same line. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}
