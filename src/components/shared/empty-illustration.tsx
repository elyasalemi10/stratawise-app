import * as React from "react";

// Empty-state illustrations.
//
// An icon at 48px says "here is a category". An illustration says "there is
// nothing here yet, and that is a normal state to be in" , which is what an
// empty page actually means, and it is the difference between a screen that
// looks broken and one that looks new.
//
// Drawn inline rather than shipped as files: they are a few hundred bytes
// each, they must follow the palette (a raster asset would be stuck in one
// theme), and there is nothing to 404.
//
// Palette contract, so a new one matches the set:
//   - the ground plane / container is `--muted`
//   - line work is `--border` at full strength
//   - ONE accent element per drawing in `--brand-gold`, and only ever one:
//     the gold is what your eye lands on, so two of them is no focal point
//   - never `--primary`: navy at this size reads as a filled control

export type IllustrationName =
  | "documents"
  | "people"
  | "money"
  | "calendar"
  | "building"
  | "inbox"
  | "search"
  | "checklist";

const SIZE = { width: 120, height: 96 } as const;

const ground = "var(--muted)";
const line = "var(--border)";
const gold = "var(--brand-gold)";
const paper = "var(--card)";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      {...SIZE}
      viewBox="0 0 120 96"
      fill="none"
      role="presentation"
      aria-hidden="true"
    >
      {/* Ground plane. Everything sits on it, so the drawings share a
          baseline and read as one family rather than five sketches. */}
      <ellipse cx="60" cy="84" rx="42" ry="6" fill={ground} />
      {children}
    </svg>
  );
}

const DRAWINGS: Record<IllustrationName, React.ReactNode> = {
  documents: (
    <>
      <rect x="30" y="18" width="46" height="60" rx="4" fill={paper} stroke={line} strokeWidth="2" />
      <rect x="44" y="26" width="46" height="52" rx="4" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M53 40h28M53 50h28M53 60h18" stroke={line} strokeWidth="2" strokeLinecap="round" />
      <circle cx="84" cy="28" r="9" fill={gold} />
      <path d="M80.5 28l2.5 2.5 4.5-5" stroke={paper} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  people: (
    <>
      <circle cx="44" cy="36" r="11" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M26 78c0-10 8-18 18-18s18 8 18 18" fill={paper} stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="76" cy="42" r="9" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M61 78c0-8 7-15 15-15s15 7 15 15" fill={paper} stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="93" cy="24" r="8" fill={gold} />
      <path d="M93 20v8M89 24h8" stroke={paper} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  money: (
    <>
      <rect x="24" y="34" width="72" height="44" rx="5" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M24 48h72" stroke={line} strokeWidth="2" />
      <rect x="34" y="60" width="22" height="6" rx="3" fill={ground} />
      <circle cx="80" cy="24" r="12" fill={gold} />
      <path d="M80 18v12M77 21.5h5a2.5 2.5 0 010 5h-4a2.5 2.5 0 000 5h5" stroke={paper} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  calendar: (
    <>
      <rect x="26" y="24" width="68" height="54" rx="5" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M26 40h68" stroke={line} strokeWidth="2" />
      <path d="M42 18v10M78 18v10" stroke={line} strokeWidth="2" strokeLinecap="round" />
      <rect x="36" y="48" width="10" height="8" rx="2" fill={ground} />
      <rect x="55" y="48" width="10" height="8" rx="2" fill={ground} />
      <rect x="74" y="48" width="10" height="8" rx="2" fill={gold} />
      <rect x="36" y="62" width="10" height="8" rx="2" fill={ground} />
      <rect x="55" y="62" width="10" height="8" rx="2" fill={ground} />
    </>
  ),
  building: (
    <>
      <rect x="28" y="26" width="38" height="52" rx="4" fill={paper} stroke={line} strokeWidth="2" />
      <rect x="66" y="42" width="30" height="36" rx="4" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M38 38h6M50 38h6M38 50h6M50 50h6M38 62h6M50 62h6M76 54h6M76 66h6" stroke={line} strokeWidth="2" strokeLinecap="round" />
      <path d="M47 18l10 8H37l10-8z" fill={gold} />
    </>
  ),
  inbox: (
    <>
      <path d="M24 48l10-22h52l10 22v26a4 4 0 01-4 4H28a4 4 0 01-4-4V48z" fill={paper} stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 48h22l4 8h20l4-8h22" stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="88" cy="26" r="9" fill={gold} />
      <path d="M84 26l3 3 5-6" stroke={paper} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  search: (
    <>
      <rect x="26" y="26" width="52" height="52" rx="5" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M36 42h32M36 54h32M36 66h20" stroke={line} strokeWidth="2" strokeLinecap="round" />
      <circle cx="82" cy="38" r="15" fill={paper} stroke={gold} strokeWidth="3" />
      <path d="M93 49l8 8" stroke={gold} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  checklist: (
    <>
      <rect x="30" y="20" width="60" height="58" rx="5" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M52 36h24M52 50h24M52 64h16" stroke={line} strokeWidth="2" strokeLinecap="round" />
      <rect x="40" y="32" width="8" height="8" rx="2" fill={gold} />
      <rect x="40" y="46" width="8" height="8" rx="2" fill={ground} />
      <rect x="40" y="60" width="8" height="8" rx="2" fill={ground} />
    </>
  ),
};

export function EmptyIllustration({ name }: { name: IllustrationName }) {
  return <Frame>{DRAWINGS[name]}</Frame>;
}
