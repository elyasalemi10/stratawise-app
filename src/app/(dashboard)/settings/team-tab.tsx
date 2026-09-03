"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { invalidateCached } from "@/lib/use-cached-data";
import { UserAvatar } from "@/components/shared/user-avatar";
import { InviteTeamDialog } from "@/components/shared/invite-team-dialog";
import {
  updateMemberRole,
  removeMember,
  type TeamMember,
} from "@/lib/actions/team";

type TeamRole = "admin" | "manager" | "viewer";

const ROLE_LABEL: Record<TeamRole, string> = {
  admin: "Admin",
  manager: "Manager",
  viewer: "Viewer",
};

const ROLE_VARIANT = {
  admin: "info",
  manager: "success",
  viewer: "neutral",
} as const;

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as TeamRole[]).map((value) => ({
  value,
  label: ROLE_LABEL[value],
}));

function memberName(member: TeamMember): string {
  return member.first_name && member.last_name
    ? `${member.first_name} ${member.last_name}`
    : member.email;
}

function MemberRow({
  member,
  isCurrentUser,
  isAdmin,
  onRoleChanged,
  onRemove,
}: {
  member: TeamMember;
  isCurrentUser: boolean;
  isAdmin: boolean;
  onRoleChanged: (id: string, role: TeamRole) => void;
  onRemove: (member: TeamMember) => void;
}) {
  const [changingRole, setChangingRole] = useState(false);

  const role = (member.company_role ?? "manager") as TeamRole;
  const initials =
    [member.first_name?.[0], member.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
    member.email[0].toUpperCase();

  async function handleRoleChange(newRole: TeamRole) {
    if (newRole === role) return;
    setChangingRole(true);
    const result = await updateMemberRole(member.id, newRole);
    setChangingRole(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Role updated to ${ROLE_LABEL[newRole]}`);
    onRoleChanged(member.id, newRole);
    invalidateCached("settings:team");
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <UserAvatar src={member.avatar_url} initials={initials} />
          <span className="font-medium text-foreground">
            {memberName(member)}
            {isCurrentUser && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
            )}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{member.email}</TableCell>
      <TableCell>
        {isAdmin && !isCurrentUser ? (
          <Select
            value={role}
            onValueChange={(v) => handleRoleChange((v ?? "manager") as TeamRole)}
            disabled={changingRole}
          >
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue>{ROLE_LABEL[role]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={ROLE_VARIANT[role]}>{ROLE_LABEL[role]}</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {isAdmin && !isCurrentUser ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(member)}
            aria-label={`Remove ${memberName(member)}`}
          >
            <UserMinus className="size-4" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function TeamTab({
  members: initialMembers,
  currentUserId,
  isAdmin,
}: {
  members: TeamMember[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [inviting, setInviting] = useState(false);
  // The member the admin is about to remove, or null. Held here rather than
  // per row so one AlertDialog serves the whole table.
  const [pendingRemoval, setPendingRemoval] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);

  function handleRoleChanged(id: string, newRole: TeamRole) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, company_role: newRole } : m)),
    );
  }

  async function confirmRemove() {
    if (!pendingRemoval) return;
    setRemoving(true);
    const result = await removeMember(pendingRemoval.id);
    setRemoving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Member removed");
    setMembers((prev) => prev.filter((m) => m.id !== pendingRemoval.id));
    invalidateCached("settings:team");
    setPendingRemoval(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </p>
        {isAdmin && (
          <Button onClick={() => setInviting(true)}>
            <UserPlus className="size-4" />
            Invite team member
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No team members yet"
          description="Invite a colleague to give them access to your OCs."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isCurrentUser={member.id === currentUserId}
                  isAdmin={isAdmin}
                  onRoleChanged={handleRoleChanged}
                  onRemove={setPendingRemoval}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <InviteTeamDialog open={inviting} onClose={() => setInviting(false)} />

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoval(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval ? memberName(pendingRemoval) : "This person"} will lose
              access to every OC in this company.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmRemove(); }}
              disabled={removing}
              loading={removing}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
