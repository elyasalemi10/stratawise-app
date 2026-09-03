import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { UserPlus } from "lucide-react";

// One skeleton per settings section, rendered by BOTH the route boundary and
// the client while it fetches, so the two frames are the same frame.
//
// Only values shimmer. Every field label, section heading and button on these
// pages is fixed copy the app already knows, so it renders for real , a
// shimmering "First name" is a worse loading state than the words themselves.

/** A labelled input whose value has not arrived. */
function FieldSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div className={className}>
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div>
          <div className="flex gap-2">
            <Button disabled>Change image</Button>
            <Button variant="secondary" disabled>Remove image</Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            We accept PNG, JPG, GIF and WebP under 2MB.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSkeleton label="First name" />
        <FieldSkeleton label="Last name" />
      </div>

      <div>
        <h3 className="mb-6 border-b border-border pb-3 text-lg font-semibold text-foreground">
          Account Security
        </h3>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <FieldSkeleton label="Email" className="w-full max-w-sm" />
            <Button variant="secondary" className="ml-auto" disabled>Change email</Button>
          </div>
          <div className="flex items-end gap-3">
            <FieldSkeleton label="Password" className="w-full max-w-sm" />
            <Button variant="secondary" className="ml-auto" disabled>Change password</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompanySkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Company logo</h3>
          <Skeleton className="h-16 w-48 rounded" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Brand colours</h3>
          <div className="flex gap-6">
            <Skeleton className="h-9 w-40 rounded-md" />
            <Skeleton className="h-9 w-40 rounded-md" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Authorised signature</h3>
          <Skeleton className="h-12 w-48 rounded" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Company details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSkeleton label="Company name" />
            <FieldSkeleton label="Registered name" />
            <FieldSkeleton label="Trading name" />
            <FieldSkeleton label="ABN" />
            <FieldSkeleton label="Phone" />
            <FieldSkeleton label="Email" />
            <FieldSkeleton label="Address" className="sm:col-span-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function TeamSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-20" />
        <Button disabled>
          <UserPlus className="size-4" />
          Invite team member
        </Button>
      </div>
      <TableSkeleton
        rows={4}
        columns={[
          { label: "Name", cell: "w-40" },
          { label: "Email", cell: "w-48" },
          { label: "Role", pill: true },
        ]}
      />
    </div>
  );
}

export function EmailSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <FieldSkeleton label="Mail provider" />
        <FieldSkeleton label="Sending address" />
        <FieldSkeleton label="Mailbox prefix" />
      </CardContent>
    </Card>
  );
}
