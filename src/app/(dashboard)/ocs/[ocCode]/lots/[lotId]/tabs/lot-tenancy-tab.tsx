"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/shared/phone-input";
import { EditSheet } from "@/components/shared/edit-sheet";
import { Home, Users, DoorOpen } from "lucide-react";
import {
  updateTenant,
  updateOccupancyStatus,
} from "@/lib/actions/lot-edit";
import type { LotActivityEntry } from "@/lib/actions/lot-overview";

// Tenancy tab (Item 14). One Edit button per state opens a right-side drawer
// (navbar width). No per-field pencil popovers anywhere.

type Occupancy = "owner_occupied" | "tenanted" | "vacant";

interface Props {
  lotOwnerId: string | null;
  occupancyStatus: Occupancy;
  tenantName: string | null;
  tenantEmail: string | null;
  tenantPhone: string | null;
  activity: LotActivityEntry[];
}

export function LotTenancyTab(props: Props) {
  const router = useRouter();
  const { lotOwnerId, occupancyStatus, tenantName, tenantEmail, tenantPhone, activity } = props;

  // Optimistic view of the tenant + occupancy. The Edit drawer patches this
  // on save so the card updates instantly; rolled back on failure.
  const [view, setView] = React.useState({
    occupancy: occupancyStatus,
    name: tenantName ?? "",
    email: tenantEmail ?? "",
    phone: tenantPhone ?? "",
  });

  React.useEffect(() => {
    setView({
      occupancy: occupancyStatus,
      name: tenantName ?? "",
      email: tenantEmail ?? "",
      phone: tenantPhone ?? "",
    });
  }, [occupancyStatus, tenantName, tenantEmail, tenantPhone]);

  const pastTenants = activity.filter((row) => row.entity_type === "tenant");

  return (
    <div className="space-y-6">
      {view.occupancy === "owner_occupied" && (
        <EmptyState
          icon={Home}
          title="This lot is owner-occupied"
          description="The owner lives in the lot themselves , no tenant on file."
          action={
            <TenancyEditSheet
              lotOwnerId={lotOwnerId}
              initial={view}
              triggerLabel="Add tenant"
              title="Add tenant"
              onPatch={(p) => setView((v) => ({ ...v, ...p }))}
              onRollback={() =>
                setView({
                  occupancy: occupancyStatus,
                  name: tenantName ?? "",
                  email: tenantEmail ?? "",
                  phone: tenantPhone ?? "",
                })
              }
              onSaved={() => router.refresh()}
            />
          }
        />
      )}

      {view.occupancy === "vacant" && (
        <EmptyState
          icon={DoorOpen}
          title="This lot is currently vacant"
          description="No tenant on file."
          action={
            <TenancyEditSheet
              lotOwnerId={lotOwnerId}
              initial={view}
              triggerLabel="Add new tenant"
              title="Add new tenant"
              onPatch={(p) => setView((v) => ({ ...v, ...p }))}
              onRollback={() =>
                setView({
                  occupancy: occupancyStatus,
                  name: tenantName ?? "",
                  email: tenantEmail ?? "",
                  phone: tenantPhone ?? "",
                })
              }
              onSaved={() => router.refresh()}
            />
          }
        />
      )}

      {view.occupancy === "tenanted" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Current tenant</h3>
              </div>
              <TenancyEditSheet
                lotOwnerId={lotOwnerId}
                initial={view}
                triggerLabel="Edit"
                title="Edit tenant"
                onPatch={(p) => setView((v) => ({ ...v, ...p }))}
                onRollback={() =>
                  setView({
                    occupancy: occupancyStatus,
                    name: tenantName ?? "",
                    email: tenantEmail ?? "",
                    phone: tenantPhone ?? "",
                  })
                }
                onSaved={() => router.refresh()}
              />
            </div>

            <dl className="divide-y divide-border">
              <KvRow label="Name" value={view.name} />
              <KvRow label="Email" value={view.email} />
              <KvRow label="Phone" value={view.phone} />
            </dl>
          </CardContent>
        </Card>
      )}

      {pastTenants.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Past tenants &amp; changes</h3>
            <ol className="divide-y divide-border">
              {pastTenants.slice(0, 10).map((row) => (
                <li key={row.id} className="py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{humaniseTenantEvent(row)}</p>
                      {(row.before_state || row.after_state) && (
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {summariseDiff(row.before_state, row.after_state)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {formatShort(row.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function humaniseTenantEvent(row: LotActivityEntry): string {
  if (row.action === "create") return "Tenant added";
  if (row.action === "delete") return "Tenant removed";
  return "Tenant details updated";
}

function summariseDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  const keys = new Set<string>();
  Object.keys(before ?? {}).forEach((k) => keys.add(k));
  Object.keys(after ?? {}).forEach((k) => keys.add(k));
  return Array.from(keys)
    .map((k) => k.replace(/_/g, " "))
    .join(", ");
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground text-right max-w-[60%] truncate">
        {value || <span className="text-muted-foreground italic">,</span>}
      </dd>
    </div>
  );
}

// ─── Edit sheet ─────────────────────────────────────────────────────────────
// Bundles occupancy + tenant fields into a single right-side drawer. The same
// component handles "Add tenant" (occupancy=owner_occupied/vacant) and "Edit
// tenant" (occupancy=tenanted) , the occupancy selector lets the manager flip
// state inline (e.g. mark vacant) without leaving the drawer.

interface TenantView {
  occupancy: Occupancy;
  name: string;
  email: string;
  phone: string;
}

function TenancyEditSheet({
  lotOwnerId,
  initial,
  triggerLabel,
  title,
  onPatch,
  onRollback,
  onSaved,
}: {
  lotOwnerId: string | null;
  initial: TenantView;
  triggerLabel: string;
  title: string;
  onPatch: (next: Partial<TenantView>) => void;
  onRollback: () => void;
  onSaved: () => void;
}) {
  const [occupancy, setOccupancy] = React.useState<Occupancy>(
    initial.occupancy === "tenanted" ? "tenanted" : "tenanted",
  );
  const [name, setName] = React.useState(initial.name);
  const [email, setEmail] = React.useState(initial.email);
  const [phone, setPhone] = React.useState(initial.phone);
  const [reason, setReason] = React.useState("");

  return (
    <EditSheet
      label={title}
      description="Tenant details are logged to the activity history."
      triggerLabel={triggerLabel}
      triggerVariant={initial.occupancy === "tenanted" ? "secondary" : "default"}
      onOpenChange={(open) => {
        if (open) {
          setOccupancy(initial.occupancy === "owner_occupied" ? "tenanted" : initial.occupancy === "vacant" ? "tenanted" : "tenanted");
          setName(initial.name);
          setEmail(initial.email);
          setPhone(initial.phone);
          setReason("");
        }
      }}
      onSave={async () => {
        if (!lotOwnerId) return { ok: false as const, error: "Owner row missing" };

        if (occupancy === "tenanted" && !name.trim()) {
          return { ok: false as const, error: "Tenant name is required when the lot is tenanted." };
        }

        // Step 1 , flip occupancy if it changed (vacant / owner_occupied resets
        // the tenant fields server-side via updateOccupancyStatus).
        if (occupancy !== initial.occupancy) {
          const occRes = await updateOccupancyStatus({
            lot_owner_id: lotOwnerId,
            occupancy_status: occupancy,
            reason: reason.trim() || null,
          });
          if (!occRes.ok) {
            onRollback();
            return { ok: false as const, error: occRes.error };
          }
        }

        // Step 2 , write tenant details only when the lot ends up tenanted.
        if (occupancy === "tenanted") {
          const tenantRes = await updateTenant({
            lot_owner_id: lotOwnerId,
            tenant_name: name.trim() || null,
            tenant_email: email.trim() || null,
            tenant_phone: phone || null,
          });
          if (!tenantRes.ok) {
            onRollback();
            return { ok: false as const, error: tenantRes.error };
          }
        }

        onPatch({
          occupancy,
          name: occupancy === "tenanted" ? name.trim() : "",
          email: occupancy === "tenanted" ? email.trim() : "",
          phone: occupancy === "tenanted" ? phone : "",
        });
        onSaved();
        return { ok: true as const };
      }}
    >
      <div className="space-y-1.5">
        <Label>Occupancy</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { value: "tenanted" as const, label: "Tenanted" },
            { value: "vacant" as const, label: "Vacant" },
            { value: "owner_occupied" as const, label: "Owner-occupied" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOccupancy(opt.value)}
              className={`h-9 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                occupancy === opt.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {occupancy === "tenanted" && (
        <>
          <div className="space-y-1.5">
            <Label>
              Tenant name <span className="text-destructive">*</span>
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tenant name" />
          </div>
          <div className="space-y-1.5">
            <Label>Tenant email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Tenant email"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tenant phone</Label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>
        </>
      )}

      {occupancy !== "tenanted" && (
        <div className="space-y-1.5">
          <Label>Reason (optional)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={occupancy === "vacant" ? "e.g. lease ended 12 May" : "e.g. owner moving back in"}
            rows={3}
          />
        </div>
      )}
    </EditSheet>
  );
}
