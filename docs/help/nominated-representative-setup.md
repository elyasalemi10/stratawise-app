# Nominated representative — Consumer Data Right (CDR) setup

## What this is

The Australian Consumer Data Right (CDR) framework requires every
business or trust account to nominate a representative before a third
party (like your strata software) can receive bank transaction data.

As the strata manager, you register yourself as the nominated
representative with your bank once. Afterwards, you can complete the
"Connect bank feed" flow in Strata Wise and your OC's
transactions sync automatically.

## How to set up

Before clicking "Connect bank feed":

1. Log in to your bank's internet banking as someone with full online
   banking access to the account.
2. Look for **Data sharing** or **CDR** settings (usually under
   Security or Profile).
3. Add yourself as a nominated representative for this OC's account.
4. Confirm via SMS or email — banks almost always send a verification.
5. Some banks require you to call them to enable sharing on trust or
   business accounts. If the setting isn't available in online
   banking, call your bank's business support line.

## Per-bank quick links

Note: these links are best-known at time of writing. Each bank
occasionally restructures its help pages. If a link is broken, search
your bank's website for "data sharing" or visit
[cdr.gov.au](https://www.cdr.gov.au/) for the official CDR consumer
dashboard list.

- **CBA** — https://www.commbank.com.au/personal/support.data-sharing.html  <!-- TODO(pre-launch): verify -->
- **NAB** — https://www.nab.com.au/about-us/security/data-sharing  <!-- TODO(pre-launch): verify -->
- **ANZ** — https://www.anz.com.au/security/data-security/cdr/  <!-- TODO(pre-launch): verify -->
- **Westpac** — https://www.westpac.com.au/security/data-sharing/  <!-- TODO(pre-launch): verify -->
- **Macquarie** — https://www.macquarie.com.au/help/personal/data-sharing  <!-- TODO(pre-launch): verify -->
- **ING** — https://www.ing.com.au/help-centre/data-sharing.html  <!-- TODO(pre-launch): verify -->
- **Bendigo & Adelaide** — https://www.bendigobank.com.au/security/data-sharing  <!-- TODO(pre-launch): verify -->

## Consent duration

Once granted, consent lasts 12 months. Strata Wise will remind
you 30, 14, 7, 3, and 1 day before expiry — click the
"Reauthorise" button to extend.

## If something goes wrong

If the bank's CDR page says you're already the nominated representative
but Strata Wise still shows "Not connected", check that the bank account BSB
and account number in Strata Wise exactly match the account you nominated for
sharing. Mismatches are the most common cause of silent failures.
