// Rewrite the BSB prefix table in src/lib/data/australian-banks.ts from the
// published AusPayNet directory.
//
// The table used to be written from memory and was wrong: 942 was labelled
// AMP when the directory says LBA, seven of the prefixes listed were never
// allocated at all, and a two-digit fallback guessed the institution for
// anything unmatched. Since add-bank-account-drawer stores the result as
// bank_accounts.bank_name, those guesses became records.
//
//   npm run bsb:refresh
//
// AusPayNet republish on the first business day of each month. Re-running
// this is the only supported way to change the table; hand-editing it is how
// it went wrong the first time.

import { readFileSync, writeFileSync } from "node:fs";

const DIRECTORY_URL =
  "https://auspaynetbsbpublic.blob.core.windows.net/bsb-reports/BSBDirectoryFull.csv";
const TARGET = "src/lib/data/australian-banks.ts";

// Our bank id -> the AusPayNet mnemonic(s) that institution issues under.
// HSBC has two: HBA is the Australian retail bank, HSB the corporate branch.
//
// Cuscal (CUS, 702-707) and the credit-union range (CRU, 800-809) are
// deliberately absent. They are settlement institutions standing behind
// hundreds of separate brands, so the prefix says who settles the payment,
// not whose account it is.
const MNEMONICS = {
  anz: ["ANZ"],
  westpac: ["WBC"],
  cba: ["CBA"],
  nab: ["NAB"],
  banksa: ["BSA"],
  stgeorge: ["STG"],
  bankofqld: ["BQL"],
  macquarie: ["MBL"],
  bankofmelb: ["BOM"],
  bankwest: ["BWA"],
  hsbc: ["HBA", "HSB"],
  suncorp: ["MET"],
  bendigo: ["BBL"],
  heritage: ["HBS"],
  ubank: ["YOU"],
  ing: ["ING"],
  amp: ["AMP"],
  me: ["MEB"],
};

const START = "const BSB_PREFIX_TO_BANK: Record<string, string> = {";
const END = "};";

/** The directory is quoted CSV with no embedded quotes or newlines in the
 *  fields we read, so a split is enough and avoids a dependency. */
function parse(csv) {
  const byMnemonic = new Map();
  const seen = new Map();
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split('","').map((c) => c.replace(/^"|"$/g, ""));
    const [bsb, mnemonic] = cells;
    const digits = (bsb ?? "").replace(/\D/g, "");
    if (digits.length !== 6) continue;
    const prefix = digits.slice(0, 3);
    if (!byMnemonic.has(mnemonic)) byMnemonic.set(mnemonic, new Set());
    byMnemonic.get(mnemonic).add(prefix);
    // Guard the assumption the whole design rests on.
    const already = seen.get(prefix);
    if (already && already !== mnemonic) {
      throw new Error(
        `Prefix ${prefix} maps to both ${already} and ${mnemonic}. Three ` +
          `digits is no longer unique and bankFromBsb needs rethinking.`,
      );
    }
    seen.set(prefix, mnemonic);
  }
  return byMnemonic;
}

const res = await fetch(DIRECTORY_URL);
if (!res.ok) throw new Error(`Directory download failed: ${res.status}`);
const byMnemonic = parse(await res.text());

const lines = [];
let count = 0;
for (const [bank, mnemonics] of Object.entries(MNEMONICS)) {
  const prefixes = [
    ...new Set(mnemonics.flatMap((m) => [...(byMnemonic.get(m) ?? [])])),
  ].sort();
  if (prefixes.length === 0) {
    throw new Error(`No prefixes found for ${bank} (${mnemonics.join("/")}).`);
  }
  count += prefixes.length;
  lines.push(`  // ${bank} (${mnemonics.join("/")})`);
  let row = "";
  for (const p of prefixes) {
    const entry = `"${p}": "${bank}",`;
    if (row.length + entry.length + 1 > 72) {
      lines.push("  " + row.trimEnd());
      row = "";
    }
    row += entry + " ";
  }
  if (row.trim()) lines.push("  " + row.trimEnd());
}

const source = readFileSync(TARGET, "utf8");
const from = source.indexOf(START);
const to = source.indexOf(`\n${END}`, from);
if (from === -1 || to === -1) throw new Error(`Could not find the table in ${TARGET}.`);
writeFileSync(
  TARGET,
  source.slice(0, from + START.length) + "\n" + lines.join("\n") + source.slice(to),
);
console.log(`Wrote ${count} prefixes across ${Object.keys(MNEMONICS).length} banks.`);
