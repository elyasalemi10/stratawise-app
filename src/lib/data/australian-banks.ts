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
// GENERATED FROM THE AUSPAYNET BSB DIRECTORY, not from memory. Regenerate
// with `npm run bsb:refresh` (scripts/refresh-bsb-prefixes.mjs), which pulls
// the published directory and rewrites the table below. AusPayNet republish
// on the first business day of each month; new prefixes are rare and an
// unrecognised one degrades to no badge, so this does not need chasing.
//
// EXACT THREE-DIGIT PREFIXES. In the directory every one of the 280 issued
// three-digit prefixes maps to exactly one institution, so three digits is
// always enough and never ambiguous. Two is not: 23 of the 74 two-digit
// prefixes span more than one institution, which is why the old two-digit
// fallback was mislabelling accounts.
//
// AGGREGATOR PREFIXES ARE DELIBERATELY ABSENT. Cuscal (702-707) and the
// credit-union range (800-809) are settlement institutions standing behind
// hundreds of separate brands, so the prefix identifies who settles the
// payment and not whose account it is. Teachers Mutual sits inside 802, and
// badging a member credit union's account as Cuscal would be wrong in a way
// a missing badge is not.
//
// This matters more than a logo: add-bank-account-drawer STORES the result
// as bank_accounts.bank_name, so a guess becomes a record.
const BSB_PREFIX_TO_BANK: Record<string, string> = {
  // anz (ANZ)
  "012": "anz", "013": "anz", "014": "anz", "015": "anz", "016": "anz",
  "017": "anz",
  // westpac (WBC)
  "032": "westpac", "033": "westpac", "034": "westpac", "035": "westpac",
  "036": "westpac", "037": "westpac", "042": "westpac", "043": "westpac",
  "044": "westpac", "045": "westpac", "046": "westpac", "047": "westpac",
  "732": "westpac", "733": "westpac", "734": "westpac", "735": "westpac",
  "736": "westpac", "737": "westpac",
  // cba (CBA)
  "062": "cba", "063": "cba", "064": "cba", "065": "cba", "066": "cba",
  "067": "cba", "762": "cba", "763": "cba", "764": "cba", "765": "cba",
  "766": "cba", "767": "cba",
  // nab (NAB)
  "082": "nab", "083": "nab", "084": "nab", "085": "nab", "086": "nab",
  "087": "nab",
  // banksa (BSA)
  "102": "banksa", "103": "banksa", "104": "banksa", "105": "banksa",
  "106": "banksa",
  // stgeorge (STG)
  "112": "stgeorge", "113": "stgeorge", "114": "stgeorge",
  "115": "stgeorge", "116": "stgeorge", "117": "stgeorge",
  "118": "stgeorge", "119": "stgeorge",
  // bankofqld (BQL)
  "122": "bankofqld", "123": "bankofqld", "124": "bankofqld",
  "125": "bankofqld", "126": "bankofqld", "127": "bankofqld",
  // macquarie (MBL)
  "182": "macquarie", "183": "macquarie", "184": "macquarie",
  "185": "macquarie", "186": "macquarie", "187": "macquarie",
  // bankofmelb (BOM)
  "192": "bankofmelb", "193": "bankofmelb", "194": "bankofmelb",
  "195": "bankofmelb", "196": "bankofmelb", "197": "bankofmelb",
  // bankwest (BWA)
  "302": "bankwest", "303": "bankwest", "304": "bankwest",
  "305": "bankwest", "306": "bankwest",
  // hsbc (HBA/HSB)
  "342": "hsbc", "343": "hsbc", "344": "hsbc", "345": "hsbc",
  "346": "hsbc", "985": "hsbc",
  // suncorp (MET)
  "482": "suncorp", "483": "suncorp", "484": "suncorp",
  // bendigo (BBL)
  "633": "bendigo",
  // heritage (HBS)
  "638": "heritage", "880": "heritage",
  // ubank (YOU)
  "670": "ubank",
  // ing (ING)
  "923": "ing",
  // amp (AMP)
  "939": "amp",
  // me (MEB)
  "944": "me",
};

/** Resolve the bank from a BSB, if the exact three-digit prefix is one we
 *  recognise. Returns null rather than guessing: the row then shows no badge
 *  at all, which is honest, where the wrong bank's logo is not. */
export function bankFromBsb(bsb: string | null | undefined): BankOption | null {
  const digits = (bsb ?? "").replace(/\D/g, "");
  if (digits.length < 3) return null;
  const id = BSB_PREFIX_TO_BANK[digits.slice(0, 3)];
  if (!id) return null;
  return AUSTRALIAN_BANKS.find((b) => b.id === id) ?? null;
}
