import { redirect } from "next/navigation";
import { evaluateSuperAdminGate } from "@/lib/admin-auth";
import { getCurrentProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { SettingsTabs } from "./settings-tabs";

export default async function AdminSettingsPage() {
  const gate = await evaluateSuperAdminGate();
  if (gate.kind === "redirect") redirect(gate.to);

  const profile = await getCurrentProfile();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Your StrataWise super-admin account.</p>
      </div>

      <SettingsTabs
        profile={{
          firstName: profile?.first_name ?? "",
          lastName: profile?.last_name ?? "",
          email: profile?.email ?? "",
          avatarUrl: profile?.avatar_url ?? "",
        }}
      />

      <form action="/logout" method="post">
        <Button type="submit" variant="secondary">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </form>
    </div>
  );
}
