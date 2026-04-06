import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { getSubdivision } from "@/lib/actions/subdivision";
import { redirect } from "next/navigation";

export default async function MeetingsPage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  const subdivision = await getSubdivision(subdivisionId);
  if (!subdivision) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader title="Meetings" subtitle={subdivision.name} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-base font-medium text-foreground">No meetings yet</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Meeting creation, notices, agendas, and minutes will be available here soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
