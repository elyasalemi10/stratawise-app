import { redirect } from "next/navigation";

// The chart of accounts moved under Settings, where the rest of the firm-wide
// configuration lives. Kept as a redirect so bookmarks and any link still in
// the wild land in the right place instead of a 404.
export default function ChartOfAccountsRedirect() {
  redirect("/settings/chart-of-accounts");
}
