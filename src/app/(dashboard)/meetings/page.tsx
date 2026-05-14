import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";

export default async function MeetingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-base font-medium text-foreground">No meetings yet</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Meeting notices, agendas, and minutes will appear here once your strata manager schedules them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
