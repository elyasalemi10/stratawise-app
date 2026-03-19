export interface BankOption {
  id: string;
  name: string;
  logo: string | null;
}

export const AUSTRALIAN_BANKS: BankOption[] = [
  { id: "anz", name: "ANZ", logo: "/bank-logos/anz.svg" },
  { id: "cba", name: "Commonwealth Bank", logo: "/bank-logos/cba.svg" },
  { id: "nab", name: "NAB", logo: "/bank-logos/nab.svg" },
  { id: "westpac", name: "Westpac", logo: "/bank-logos/westpac.svg" },
  { id: "macquarie", name: "Macquarie Bank", logo: "/bank-logos/macquarie.svg" },
  { id: "bendigo", name: "Bendigo Bank", logo: "/bank-logos/bendigo.svg" },
  { id: "bankwest", name: "Bankwest", logo: "/bank-logos/bankwest.svg" },
  { id: "suncorp", name: "Suncorp", logo: "/bank-logos/suncorp.svg" },
  { id: "stgeorge", name: "St.George", logo: "/bank-logos/stgeorge.svg" },
  { id: "bom", name: "Bank of Melbourne", logo: "/bank-logos/bom.svg" },
  { id: "banksa", name: "BankSA", logo: "/bank-logos/banksa.svg" },
  { id: "ing", name: "ING", logo: "/bank-logos/ing.svg" },
  { id: "hsbc", name: "HSBC", logo: "/bank-logos/hsbc.svg" },
  { id: "mebank", name: "ME Bank", logo: "/bank-logos/mebank.svg" },
  { id: "ubank", name: "UBank", logo: "/bank-logos/ubank.svg" },
  { id: "boq", name: "Bank of Queensland", logo: "/bank-logos/boq.svg" },
  { id: "amp", name: "AMP Bank", logo: "/bank-logos/amp.svg" },
  { id: "cuscal", name: "Cuscal", logo: "/bank-logos/cuscal.svg" },
  { id: "teachers", name: "Teachers Mutual", logo: "/bank-logos/teachers.svg" },
  { id: "heritage", name: "Heritage Bank", logo: "/bank-logos/heritage.svg" },
  { id: "other", name: "Other", logo: null },
];
