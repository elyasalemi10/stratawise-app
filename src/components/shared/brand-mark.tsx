// The StrataWise mark, as inline SVG.
//
// A redraw of public/stratawise-favicon.png, not the file itself. That PNG is
// navy on a gold square with no alpha channel, so it cannot be recoloured or
// sat on another background: any loading state using it would be a gold tile,
// not our icon. Drawn in currentColor it inherits whatever colour it is put
// in and scales without a second asset.
//
// Five stacked chevrons: the building.

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 691"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      {/* Each band is a ribbon: a chevron top edge, the same edge dropped by
          the band's thickness for the bottom. */}
      <path d="M115 152 L380 30 L610 152 L610 224 L380 102 L115 224 Z" />
      <path d="M38 282 L380 168 L500 213 L500 285 L380 240 L38 354 Z" />
      <path d="M163 352 L380 300 L672 352 L672 424 L380 372 L163 424 Z" />
      <path d="M48 468 L380 428 L612 468 L612 540 L380 500 L48 540 Z" />
      <path d="M88 568 L668 568 L668 645 L88 645 Z" />
    </svg>
  );
}

/**
 * The mark, pulsing, centred in whatever it is put in.
 *
 * Replaces the "Opening…" text and the half-rendered page underneath it. A
 * document that paints top-down as it decodes reads as broken; a mark that
 * pulses reads as working, and the document then appears whole.
 */
export function BrandLoader({
  className,
  size = "h-10 w-10",
}: {
  className?: string;
  size?: string;
}) {
  return (
    <div className={`flex items-center justify-center ${className ?? ""}`}>
      <BrandMark className={`${size} animate-pulse text-muted-foreground/50`} />
    </div>
  );
}
