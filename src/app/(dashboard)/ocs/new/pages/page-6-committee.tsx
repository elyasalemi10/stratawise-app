"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Users, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import { saveStep, type DraftJson, type DraftCommitteeMember } from "../actions";

// Wizard step 6 — Committee snapshot.
//
// Two paths driven by the top toggle:
//   has_active_committee = true  → capture chair / secretary / treasurer
//   has_active_committee = false → skip role assignment entirely;
//                                  small OCs without an elected
//                                  committee are valid.
//
// Also captures last_agm_date so the platform can fire "AGM due in
// X days" reminders — VIC OC Act requires AGMs within 15 months of
// the previous, so this drives the warning calendar.

type RoleKey = "chairperson" | "secretary" | "treasurer";
const ROLES: Array<{ key: RoleKey; label: string; hint: string }> = [
  { key: "chairperson", label: "Chairperson", hint: "Runs meetings, signs off on resolutions." },
  { key: "secretary", label: "Secretary", hint: "Keeps minutes, issues notices on behalf of the OC." },
  { key: "treasurer", label: "Treasurer", hint: "Oversees finances; co-signs payments above thresholds." },
];

export function Page6Committee({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: () => void;
}) {
  const [hasCommittee, setHasCommittee] = useState<boolean>(
    initialDraft.has_active_committee ?? true,
  );
  const [lastAgmDate, setLastAgmDate] = useState<string>(
    initialDraft.last_agm_date ?? "",
  );

  // Seed each role with an empty entry so the inputs render without the
  // manager having to click "Add". Existing draft state takes precedence.
  const initialMembers: Record<RoleKey, DraftCommitteeMember> = {
    chairperson: findMember(initialDraft.committee_members, "chairperson"),
    secretary: findMember(initialDraft.committee_members, "secretary"),
    treasurer: findMember(initialDraft.committee_members, "treasurer"),
  };
  const [members, setMembers] = useState<Record<RoleKey, DraftCommitteeMember>>(initialMembers);
  const [memberErrors, setMemberErrors] = useState<Record<RoleKey, { name?: boolean }>>({
    chairperson: {}, secretary: {}, treasurer: {},
  });

  // The lot owner list from page 4 — if the manager already typed in
  // owners, we offer them as a "Pick from lot owners" shortcut so they
  // don't retype name + email three times.
  const ownerOptions = (initialDraft.lots ?? [])
    .filter((l) => (l.owner_name ?? "").trim())
    .map((l) => ({
      lot_number: l.lot_number,
      name: l.owner_name!,
      email: l.owner_email ?? "",
      phone: l.owner_phone ?? "",
    }));

  const [pending, setPending] = useState(false);

  function updateMember(role: RoleKey, patch: Partial<DraftCommitteeMember>) {
    setMembers((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
    if (memberErrors[role]?.name && "name" in patch) {
      setMemberErrors((prev) => ({ ...prev, [role]: { ...prev[role], name: false } }));
    }
  }

  function pickFromOwners(role: RoleKey, lotNumber: string) {
    const lot = parseInt(lotNumber, 10);
    if (!Number.isFinite(lot)) return;
    const owner = ownerOptions.find((o) => o.lot_number === lot);
    if (!owner) return;
    updateMember(role, {
      name: owner.name,
      email: owner.email,
      phone: owner.phone,
      lot_number: owner.lot_number,
    });
  }

  async function onContinue() {
    setPending(true);
    if (hasCommittee) {
      // Validate. Name is required on every role; email + phone are
      // optional. We let one role be empty IF the manager genuinely
      // hasn't filled it yet (some small OCs share roles or rotate),
      // but the moment a manager touches anything in a role we expect
      // a name.
      const errors: Record<RoleKey, { name?: boolean }> = { chairperson: {}, secretary: {}, treasurer: {} };
      const problems: string[] = [];
      for (const role of ROLES) {
        const m = members[role.key];
        const touched = (m.name ?? "").trim() || (m.email ?? "").trim() || (m.phone ?? "").trim();
        if (touched && !(m.name ?? "").trim()) {
          problems.push(`${role.label}: name is required.`);
          errors[role.key].name = true;
        }
      }
      setMemberErrors(errors);
      if (problems.length) {
        toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
        setPending(false);
        return;
      }
    }

    // Save. When has_active_committee is false we explicitly clear the
    // members array so a manager who flips Yes → No mid-wizard doesn't
    // leave ghost entries behind.
    const r = await saveStep(draftId, {
      has_active_committee: hasCommittee,
      last_agm_date: lastAgmDate || undefined,
      committee_members: hasCommittee
        ? ROLES
            .map((role) => ({ ...members[role.key], role: role.key }))
            .filter((m) => (m.name ?? "").trim())
        : [],
    }, 7);
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Committee snapshot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Who's on the elected committee right now — and the date of the last AGM.
        </p>
      </div>

      {/* Top-level toggle. Tiles match the Comms step's pattern. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setHasCommittee(true)}
          className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
            hasCommittee ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">This OC has an active committee</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Capture the chairperson, secretary, and treasurer below. Drives "who can authorise this?" rules and notice signatures.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setHasCommittee(false)}
          className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
            !hasCommittee ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">No active committee</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Common for small OCs. The OC just has lot owners + manager — committee features stay hidden until a committee is elected.
          </p>
        </button>
      </div>

      {/* Per-role inputs. Only render when has_active_committee is true. */}
      {hasCommittee && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Roles</h3>
          {ROLES.map((role) => {
            const m = members[role.key];
            const errs = memberErrors[role.key] ?? {};
            return (
              <div key={role.key} className="rounded-md border border-border bg-card p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{role.label}</p>
                    <p className="text-xs text-muted-foreground">{role.hint}</p>
                  </div>
                  {ownerOptions.length > 0 && (
                    <div className="w-48 shrink-0">
                      <Select
                        value={m.lot_number ? String(m.lot_number) : ""}
                        onValueChange={(v) => pickFromOwners(role.key, v ?? "")}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Pick from owners…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ownerOptions.map((o) => (
                            <SelectItem key={o.lot_number} value={String(o.lot_number)}>
                              Lot {o.lot_number} — {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`comm-${role.key}-name`}>Name</Label>
                    <Input
                      id={`comm-${role.key}-name`}
                      placeholder="Full name"
                      value={m.name ?? ""}
                      onChange={(e) => updateMember(role.key, { name: e.target.value })}
                      aria-invalid={errs.name || undefined}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`comm-${role.key}-email`}>Email</Label>
                    <Input
                      id={`comm-${role.key}-email`}
                      type="email"
                      placeholder="email@example.com"
                      value={m.email ?? ""}
                      onChange={(e) => updateMember(role.key, { email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`comm-${role.key}-phone`}>Phone</Label>
                    <Input
                      id={`comm-${role.key}-phone`}
                      placeholder="+61 …"
                      value={m.phone ?? ""}
                      onChange={(e) => updateMember(role.key, { phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Last AGM date — drives the "AGM due in X days" cron. Empty
          when this is a brand-new OC that hasn't held its first AGM
          yet (legitimate for newly-registered plans). */}
      <div className="space-y-1.5">
        <Label>Last AGM date</Label>
        <DatePicker value={lastAgmDate} onChange={(v) => setLastAgmDate(v)} />
        <p className="text-xs text-muted-foreground">
          Drives the &quot;AGM due&quot; reminder. VIC OC Act requires AGMs within 15 months of the previous one.
          Leave empty for a brand-new OC that hasn&apos;t held its first AGM yet.
        </p>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}

function findMember(list: DraftCommitteeMember[] | undefined, role: RoleKey): DraftCommitteeMember {
  return list?.find((m) => m.role === role) ?? { role, name: "" };
}
