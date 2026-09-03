import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { EmailTab } from "../email-tab";
import { getEmailSettings } from "../data";

export default async function Page() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/settings/profile");
  const s = await getEmailSettings();
  return (
    <EmailTab
      initial={s.mailProvider}
      oauthClientId={s.gmailOauthClientId}
      initialMailboxPrefix={s.initialMailboxPrefix}
      stratawiseFallbackEmail={s.stratawiseFallbackEmail}
      dwdRevoked={s.dwdRevoked}
      mailboxIntegrationError={s.mailboxIntegrationError}
    />
  );
}
