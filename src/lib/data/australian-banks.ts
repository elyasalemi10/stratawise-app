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

// A BSB already says which bank the account is at, so asking a manager to
// pick one from a list was asking for a fact we hold and one they could get
// wrong.
//
// EXACT THREE-DIGIT PREFIXES ONLY. This used to fall back to the first TWO
// digits when three did not match, which is unsound: BSBs are allocated at
// three-digit granularity and several two-digit ranges are split between
// institutions, so the fallback confidently mislabelled accounts. It also
// carried entries keyed "63x" and "63y", which contain letters and therefore
// could never match anything, next to a "63" entry that shadowed the real
// 633 allocation.
//
// That mattered more than a wrong logo, because add-bank-account-drawer
// STORES this result as bank_accounts.bank_name. A guess became a record.
//
// So: no guessing. An unrecognised prefix returns null, the UI shows no
// badge, and the account works exactly the same. A missing logo is honest;
// the wrong bank's logo is not. Add a prefix here only when it has been
// checked against the AusPayNet BSB directory.
const BSB_PREFIX_TO_BANK: Record<string, string> = {
  // ANZ
  "012": "anz", "013": "anz", "014": "anz", "015": "anz", "016": "anz",
  "017": "anz", "018": "anz", "019": "anz",
  // Westpac
  "032": "westpac", "033": "westpac", "034": "westpac", "035": "westpac",
  "036": "westpac", "037": "westpac", "038": "westpac", "039": "westpac",
  "732": "westpac", "733": "westpac", "734": "westpac", "735": "westpac",
  "736": "westpac", "737": "westpac", "738": "westpac",
  // Commonwealth Bank
  "062": "cba", "063": "cba", "064": "cba", "065": "cba", "066": "cba",
  "067": "cba", "068": "cba",
  // NAB
  "082": "nab", "083": "nab", "084": "nab", "085": "nab", "086": "nab",
  "087": "nab", "088": "nab",
  // St.George / BankSA / Bank of Melbourne (Westpac group, own prefixes)
  "112": "stgeorge", "114": "stgeorge",
  "105": "banksa",
  "193": "bankofmelb",
  // Bendigo
  "633": "bendigo",
  // Macquarie
  "182": "macquarie", "183": "macquarie",
  // Others, single allocations
  "923": "ing",
  "942": "amp",
  "944": "me",
};

/** Resolve the bank from a BSB, if we recognise the exact prefix. Returns
 *  null rather than guessing , see the note above. */
export function bankFromBsb(bsb: string | null | undefined): BankOption | null {
  const digits = (bsb ?? "").replace(/\D/g, "");
  if (digits.length < 3) return null;
  const id = BSB_PREFIX_TO_BANK[digits.slice(0, 3)];
  if (!id) return null;
  return AUSTRALIAN_BANKS.find((b) => b.id === id) ?? null;
}
