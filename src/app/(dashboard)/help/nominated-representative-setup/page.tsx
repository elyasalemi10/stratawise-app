import { ExternalLink } from "lucide-react";

// In-app mirror of docs/help/nominated-representative-setup.md. Keep the
// two files in sync; the docs/ copy lives in the repo for maintainers and
// static-file consumers, while this route renders the same content inside
// the authenticated dashboard shell.

const BANK_LINKS: Array<{ name: string; url: string }> = [
  { name: "Commonwealth Bank", url: "https://www.commbank.com.au/personal/support.data-sharing.html" },
  { name: "NAB", url: "https://www.nab.com.au/about-us/security/data-sharing" },
  { name: "ANZ", url: "https://www.anz.com.au/security/data-security/cdr/" },
  { name: "Westpac", url: "https://www.westpac.com.au/security/data-sharing/" },
  { name: "Macquarie", url: "https://www.macquarie.com.au/help/personal/data-sharing" },
  { name: "ING", url: "https://www.ing.com.au/help-centre/data-sharing.html" },
  { name: "Bendigo & Adelaide", url: "https://www.bendigobank.com.au/security/data-sharing" },
];

export default function NominatedRepresentativeSetupPage() {
  return (
    <div className="max-w-3xl space-y-6 text-sm text-foreground">
      <section>
        <h2 className="text-lg font-semibold">What this is</h2>
        <p className="mt-2 leading-relaxed">
          The Australian Consumer Data Right (CDR) framework requires every
          business or trust account to nominate a representative before a
          third party (like your strata software) can receive bank
          transaction data.
        </p>
        <p className="mt-2 leading-relaxed">
          As the strata manager, you register yourself as the nominated
          representative with your bank once. Afterwards, you can complete
          the &ldquo;Connect bank feed&rdquo; flow in My Strata Management
          and your OC&apos;s transactions sync automatically.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">How to set up</h2>
        <p className="mt-2 leading-relaxed">
          Before clicking &ldquo;Connect bank feed&rdquo;:
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed">
          <li>
            Log in to your bank&apos;s internet banking as someone with full
            online banking access to the account.
          </li>
          <li>
            Look for <strong>Data sharing</strong> or <strong>CDR</strong>{" "}
            settings (usually under Security or Profile).
          </li>
          <li>
            Add yourself as a nominated representative for this OC&apos;s
            account.
          </li>
          <li>
            Confirm via SMS or email — banks almost always send a
            verification.
          </li>
          <li>
            Some banks require you to call them to enable sharing on trust
            or business accounts. If the setting isn&apos;t available in
            online banking, call your bank&apos;s business support line.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Per-bank quick links</h2>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          These links are best-known at time of writing. Each bank
          occasionally restructures its help pages. If a link is broken,
          search your bank&apos;s website for &ldquo;data sharing&rdquo; or
          visit{" "}
          <a
            className="text-primary hover:underline"
            href="https://www.cdr.gov.au/"
            target="_blank"
            rel="noreferrer"
          >
            cdr.gov.au
          </a>{" "}
          for the official CDR consumer dashboard list.
        </p>
        <ul className="mt-3 space-y-1.5">
          {BANK_LINKS.map((b) => (
            <li key={b.name}>
              <a
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                href={b.url}
                target="_blank"
                rel="noreferrer"
              >
                {b.name}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Consent duration</h2>
        <p className="mt-2 leading-relaxed">
          Once granted, consent lasts 12 months. My Strata Management will
          remind you 30, 14, 7, 3, and 1 day before expiry — click the
          &ldquo;Reauthorise&rdquo; button to extend.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">If something goes wrong</h2>
        <p className="mt-2 leading-relaxed">
          If the bank&apos;s CDR page says you&apos;re already the nominated
          representative but MSM still shows &ldquo;Not connected&rdquo;,
          check that the bank account BSB and account number in MSM exactly
          match the account you nominated for sharing. Mismatches are the
          most common cause of silent failures.
        </p>
      </section>
    </div>
  );
}
