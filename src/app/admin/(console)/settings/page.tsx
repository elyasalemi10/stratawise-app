import { redirect } from "next/navigation";
import { evaluateSuperAdminGate } from "@/lib/admin-auth";
import { getCurrentProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default async function AdminSettingsPage() {
  const gate = await evaluateSuperAdminGate();
  if (gate.kind === "redirect") redirect(gate.to);

  const profile = await getCurrentProfile();
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Super Admin";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Your StrataWise super-admin account.</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between border-b border-border/50 py-2">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium text-foreground">{name}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border/50 py-2">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium text-foreground">{profile?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Multi-factor authentication</span>
            <span className="text-sm font-medium text-foreground">Enabled (TOTP)</span>
          </div>
        </CardContent>
      </Card>

      <form action="/logout" method="post">
        <Button type="submit" variant="secondary">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </form>
    </div>
  );
}
