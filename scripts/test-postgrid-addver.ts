// Probe PostGrid's address-verification API with the local test key and
// log the raw response shape so we can lock the TypeScript types.
//
// Usage:
//   npx tsx scripts/test-postgrid-addver.ts
//
// Reads POSTGRID_TEST_API_KEY (and POSTGRID_ADDVER_TEST_API_KEY if set)
// from .env.local. Tries the two documented base URLs PostGrid uses for
// address verification + tries the Print Mail base as a fallback so we
// can tell which endpoint actually accepts the test key.

import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const KEY = (process.env.POSTGRID_ADDVER_TEST_API_KEY ?? process.env.POSTGRID_TEST_API_KEY ?? "").trim();
if (!KEY) {
  console.error("No POSTGRID test key found in .env.local");
  process.exit(1);
}

// Known PostGrid verification endpoint candidates. Per their docs the
// Verify product lives at addressverification.postgrid.com; Print Mail
// has its own subdomain. If the key is print-only the first will 401.
const CANDIDATES: Array<{ label: string; url: string }> = [
  { label: "api.postgrid.com /addver/v1/verifications",      url: "https://api.postgrid.com/addver/v1/verifications" },
  { label: "api.postgrid.com /v1/addver/verifications",      url: "https://api.postgrid.com/v1/addver/verifications" },
  { label: "api.postgrid.com /v1/verifications",             url: "https://api.postgrid.com/v1/verifications" },
  { label: "api.postgrid.com /addverification/v1/verifications", url: "https://api.postgrid.com/addverification/v1/verifications" },
  { label: "api.postgrid.com /av/v1/verifications",          url: "https://api.postgrid.com/av/v1/verifications" },
  { label: "addressvalidation.postgrid.com /v1/verifications", url: "https://addressvalidation.postgrid.com/v1/verifications" },
];

// PostGrid expects the address wrapped in an `address` key, NOT flat.
// US/CA goes to /v1/addver/...; intl (incl. AU) goes to /v1/intl_addver/...
const AU_BODY = {
  address: {
    line1: "1 Spring Street",
    city: "Melbourne",
    provinceOrState: "VIC",
    postalOrZip: "3000",
    country: "AU",
  },
};

const INTL_CANDIDATES: Array<{ label: string; url: string }> = [
  { label: "api.postgrid.com /v1/intl_addver/verifications", url: "https://api.postgrid.com/v1/intl_addver/verifications" },
  { label: "api.postgrid.com /v1/addver/verifications (AU body)", url: "https://api.postgrid.com/v1/addver/verifications" },
];

async function probe(url: string, label: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`POST ${url}`);
  const t0 = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": KEY,
      },
      body: JSON.stringify(AU_BODY),
    });
    const ms = Date.now() - t0;
    const text = await resp.text();
    console.log(`HTTP ${resp.status} (${ms}ms)`);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log(JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.log("network error:", err instanceof Error ? err.message : err);
  }
}

(async () => {
  for (const c of INTL_CANDIDATES) {
    await probe(c.url, c.label);
  }
})();
