export interface BankOption {
  id: string;
  name: string;
  logo: string | null;
  /** Macquarie has DEFT auto-reconciliation — surface a recommendation badge. */
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
