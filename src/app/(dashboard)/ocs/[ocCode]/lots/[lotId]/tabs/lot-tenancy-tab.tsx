"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/shared/phone-input";
import { EditPopover } from "@/components/shared/edit-popover";
import { Home, Users, DoorOpen } from "lucide-react";
import {
  updateTenant,
  updateOccupancyStatus,
} from "@/lib/actions/lot-edit";
import type { LotActivityEntry } from "@/lib/actions/lot-overview";

// Tenancy tab (Item 14). Three states driven by lot_owners.occupancy_status:
//   - owner_occupied: "This lot is owner-occupied" + Add tenant
//   - tenanted: current tenant card with EditPopovers + Change/Mark vacant
//   - vacant: "Lot is currently vacant" + Add new tenant
// All states surface past tenant entries by reading audit_log rows where
// entity_type='tenant' from the lot's activity feed.

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

  // Optimistic view of the tenant data + occupancy so saves feel instant
  // even before router.refresh() lands.
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
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center">
            <Home className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">This lot is owner-occupied.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The owner lives in the lot themselves — no tenant on file.
            </p>
            <div className="mt-4">
              <AddTenantPopover
                lotOwnerId={lotOwnerId}
                onSaved={() => router.refresh()}
                triggerLabel="Add tenant"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {view.occupancy === "vacant" && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center">
            <DoorOpen className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">This lot is currently vacant.</p>
            <p className="mt-1 text-xs text-muted-foreground">No tenant on file.</p>
            <div className="mt-4">
              <AddTenantPopover
                lotOwnerId={lotOwnerId}
                onSaved={() => router.refresh()}
                triggerLabel="Add new tenant"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {view.occupancy === "tenanted" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Current tenant</h3>
              </div>
              <div className="flex items-center gap-2">
                {/* Change tenant = same popover as add, prefilled with current */}
                <AddTenantPopover
                  lotOwnerId={lotOwnerId}
                  onSaved={() => router.refresh()}
                  triggerLabel="Change tenant"
                  initialValues={{ name: view.name, email: view.email, phone: view.phone }}
                />
                <MarkVacantPopover
                  lotOwnerId={lotOwnerId}
                  onSaved={() => router.refresh()}
                />
              </div>
            </div>

            <dl className="divide-y divide-border">
              <TenantRow
                label="Name"
                value={view.name}
                editLabel="Edit tenant name"
                onSave={async (next) => {
                  if (!lotOwnerId) return { ok: false as const, error: "Owner row missing" };
                  const previous = view.name;
                  setView((v) => ({ ...v, name: next }));
                  const res = await updateTenant({
                    lot_owner_id: lotOwnerId,
                    tenant_name: next || null,
                  });
                  if (!res.ok) setView((v) => ({ ...v, name: previous }));
                  if (res.ok) router.refresh();
                  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
                }}
                type="text"
              />
              <TenantRow
                label="Email"
                value={view.email}
                editLabel="Edit tenant email"
                onSave={async (next) => {
                  if (!lotOwnerId) return { ok: false as const, error: "Owner row missing" };
                  const previous = view.email;
                  setView((v) => ({ ...v, email: next }));
                  const res = await updateTenant({
                    lot_owner_id: lotOwnerId,
                    tenant_email: next || null,
                  });
                  if (!res.ok) setView((v) => ({ ...v, email: previous }));
                  if (res.ok) router.refresh();
                  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
                }}
                type="email"
              />
              <TenantPhoneRow
                value={view.phone}
                onSave={async (next) => {
                  if (!lotOwnerId) return { ok: false as const, error: "Owner row missing" };
                  const previous = view.phone;
                  setView((v) => ({ ...v, phone: next }));
                  const res = await updateTenant({
                    lot_owner_id: lotOwnerId,
                    tenant_phone: next || null,
                  });
                  if (!res.ok) setView((v) => ({ ...v, phone: previous }));
                  if (res.ok) router.refresh();
                  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
                }}
              />
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
                      <p className="font-medium text-foreground">
                        {humaniseTenantEvent(row)}
                      </p>
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

interface TenantRowProps {
  label: string;
  value: string;
  editLabel: string;
  onSave: (next: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  type: "text" | "email";
}

function TenantRow({ label, value, editLabel, onSave, type }: TenantRowProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-baseline justify-between gap-2 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-foreground truncate max-w-[280px]">
          {value || <span className="text-muted-foreground italic">—</span>}
        </span>
        <EditPopover
          label={editLabel}
          onSave={async () => onSave(inputRef.current?.value?.trim() ?? "")}
        >
          <Label>{label}</Label>
          <Input ref={inputRef} type={type} defaultValue={value} />
        </EditPopover>
      </dd>
    </div>
  );
}

function TenantPhoneRow({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <div className="flex items-baseline justify-between gap-2 py-2.5">
      <dt className="text-sm text-muted-foreground">Phone</dt>
      <dd className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-foreground truncate max-w-[280px]">
          {value || <span className="text-muted-foreground italic">—</span>}
        </span>
        <EditPopover
          label="Edit tenant phone"
          onSave={async () => onSave(draft)}
        >
          <Label>Phone</Label>
          <PhoneInput value={draft} onChange={setDraft} />
        </EditPopover>
      </dd>
    </div>
  );
}

interface AddTenantPopoverProps {
  lotOwnerId: string | null;
  onSaved: () => void;
  triggerLabel: string;
  initialValues?: { name: string; email: string; phone: string };
}

function AddTenantPopover({ lotOwnerId, onSaved, triggerLabel, initialValues }: AddTenantPopoverProps) {
  const [name, setName] = React.useState(initialValues?.name ?? "");
  const [email, setEmail] = React.useState(initialValues?.email ?? "");
  const [phone, setPhone] = React.useState(initialValues?.phone ?? "");

  return (
    <EditPopover
      label={triggerLabel}
      renderTrigger={() => (
        <Button size="sm" variant={initialValues ? "secondary" : "default"}>
          {triggerLabel}
        </Button>
      )}
      onSave={async () => {
        if (!lotOwnerId) return { ok: false as const, error: "Owner row missing" };
        if (!name.trim()) return { ok: false as const, error: "Tenant name is required" };
        // Two-step: set occupancy to tenanted, then write the details.
        const occ = await updateOccupancyStatus({
          lot_owner_id: lotOwnerId,
          occupancy_status: "tenanted",
        });
        if (!occ.ok) return { ok: false as const, error: occ.error };
        const res = await updateTenant({
          lot_owner_id: lotOwnerId,
          tenant_name: name.trim(),
          tenant_email: email.trim() || null,
          tenant_phone: phone || null,
        });
        if (res.ok) onSaved();
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <Label>Tenant name</Label>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tenant name" />
      <Label className="pt-1">Tenant email</Label>
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Tenant email"
      />
      <Label className="pt-1">Tenant phone</Label>
      <PhoneInput value={phone} onChange={setPhone} />
    </EditPopover>
  );
}

function MarkVacantPopover({
  lotOwnerId,
  onSaved,
}: {
  lotOwnerId: string | null;
  onSaved: () => void;
}) {
  const [reason, setReason] = React.useState("");
  return (
    <EditPopover
      label="Mark lot vacant"
      saveLabel="Mark vacant"
      renderTrigger={() => (
        <Button size="sm" variant="secondary">
          Mark vacant
        </Button>
      )}
      onSave={async () => {
        if (!lotOwnerId) return { ok: false as const, error: "Owner row missing" };
        const res = await updateOccupancyStatus({
          lot_owner_id: lotOwnerId,
          occupancy_status: "vacant",
          reason: reason.trim() || null,
        });
        if (res.ok) onSaved();
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
      }}
    >
      <p className="text-xs text-muted-foreground">
        This clears the current tenant from the lot and marks it as vacant. Past tenant info is kept in
        the activity log.
      </p>
      <Label>Reason (optional)</Label>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. lease ended 12 May"
        rows={2}
      />
    </EditPopover>
  );
}
