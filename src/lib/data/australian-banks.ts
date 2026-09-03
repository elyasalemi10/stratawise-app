export interface BankOption {
  id: string;
  name: string;
  logo: string | null;
  /** Macquarie has DEFT auto-reconciliation , surface a recommendation badge. */
  recommended?: boolean;
}

export const AUSTRALIAN_BANKS: BankOption[] = [
  { id: "macquarie", name: "Macquarie Bank", logo: "/bank-logos/macquarie.webp", recommended: true },
  { id: "anz", name: "ANZ", logo: "/bank-logos/anz.webp" },
  { id: "cba", name: "Commonwealth Bank", logo: "/bank-logos/cba.webp" },
  { id: "nab", name: "NAB", logo: "/bank-logos/nab.webp" },
  { id: "westpac", name: "Westpac", logo: "/bank-logos/westpac.webp" },
  { id: "bendigo", name: "Bendigo Bank", logo: "/bank-logos/bendigo.webp" },
  { id: "bankwest", name: "Bankwest", logo: "/bank-logos/bankwest.webp" },
  { id: "suncorp", name: "Suncorp", logo: "/bank-logos/suncorp.webp" },
  { id: "stgeorge", name: "St.George", logo: "/bank-logos/stgeorge.webp" },
  { id: "bankofmelb", name: "Bank of Melbourne", logo: "/bank-logos/bankofmelb.webp" },
  { id: "banksa", name: "BankSA", logo: "/bank-logos/banksa.svg" },
  { id: "ing", name: "ING", logo: "/bank-logos/ing.webp" },
  { id: "hsbc", name: "HSBC", logo: "/bank-logos/hsbc.webp" },
  { id: "me", name: "ME Bank", logo: "/bank-logos/me.webp" },
  { id: "ubank", name: "UBank", logo: "/bank-logos/ubank.svg" },
  { id: "bankofqld", name: "Bank of Queensland", logo: "/bank-logos/bankofqld.webp" },
  { id: "amp", name: "AMP Bank", logo: "/bank-logos/amp.webp" },
  { id: "cuscal", name: "Cuscal", logo: "/bank-logos/cuscal.svg" },
  { id: "teachersmutual", name: "Teachers Mutual", logo: "/bank-logos/teachersmutual.webp" },
  { id: "heritage", name: "Heritage Bank", logo: "/bank-logos/heritage.webp" },
];

// A BSB already says which bank the account is at , the first two digits are
// the institution. So asking a manager to pick the bank from a list was
// asking for a fact we hold, and one they could get wrong.
//
// The mapping is by BSB prefix as published by AusPayNet. Only the banks we
// carry a logo for are listed; anything else resolves to null and the UI
// falls back to a generic account icon, which is fine , the account still
// works, it just has no badge.
const BSB_PREFIX_TO_BANK: Record<string, string> = {
  "01": "anz",
  "03": "westpac",
  "06": "cba",
  "08": "nab",
  "11": "stgeorge",
  "12": "bankwest",
  "18": "macquarie",
  "19": "bankofmelb",
  "63": "bankofmelb",
  "73": "westpac",
  "76": "banksa",
  "63x": "bankofmelb",
  "92": "suncorp",
  "93": "bankofqld",
  "63y": "bendigo",
  "633": "bendigo",
  "923": "ing",
  "942": "amp",
  "944": "me",
  "512": "hsbc",
};

/** Resolve the bank from a BSB, if we recognise it. */
export function bankFromBsb(bsb: string | null | undefined): BankOption | null {
  const digits = (bsb ?? "").replace(/\D/g, "");
  if (digits.length < 2) return null;
  const id =
    BSB_PREFIX_TO_BANK[digits.slice(0, 3)] ?? BSB_PREFIX_TO_BANK[digits.slice(0, 2)];
  if (!id) return null;
  return AUSTRALIAN_BANKS.find((b) => b.id === id) ?? null;
}
