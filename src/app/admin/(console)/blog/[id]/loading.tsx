import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the post editor: fixed field labels, only the values load.
export default function Loading() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-5">
          {["Title", "Slug", "Excerpt"].map((label) => (
            <div key={label} className="space-y-1.5">
              <Label>{label}</Label>
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Skeleton className="h-64 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
