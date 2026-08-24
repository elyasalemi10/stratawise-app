import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors create-budget-form.tsx.
//
// The form opens on financial year and fund selection, both fixed labels
// with real controls. Only the fund list depends on the server. The old
// version was a four-column Code / Account / Paying lots / Annual amount
// table skeleton, which is the line-items screen further down the form and
// never what you see first.

export default function Loading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="space-y-1.5">
            <Label>Financial year</Label>
            <Select disabled>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Financial year" />
              </SelectTrigger>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Funds</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
