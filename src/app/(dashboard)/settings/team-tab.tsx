"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserMinus, Shield, Eye, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  updateMemberRole,
  removeMember,
  type TeamMember,
} from "@/lib/actions/team";

const ROLE_CONFIG = {
  admin: { label: "Admin", variant: "info" as const, icon: Shield, description: "Full access. Can manage roles and company settings." },
  manager: { label: "Manager", variant: "success" as const, icon: Pencil, description: "Can manage ocs, levies, and documents." },
  viewer: { label: "Viewer", variant: "neutral" as const, icon: Eye, description: "Read-only access to all ocs." },
};

function MemberRow({
  member,
  isCurrentUser,
  isAdmin,
  onRoleChanged,
  onRemoved,
}: {
  member: TeamMember;
  isCurrentUser: boolean;
  isAdmin: boolean;
  onRoleChanged: (id: string, role: "admin" | "manager" | "viewer") => void;
  onRemoved: (id: string) => void;
}) {
  const [changingRole, setChangingRole] = useState(false);
  const [removing, setRemoving] = useState(false);

  const role = member.company_role ?? "manager";
  const config = ROLE_CONFIG[role];
  const initials = [member.first_name?.[0], member.last_name?.[0]].filter(Boolean).join("").toUpperCase() || member.email[0].toUpperCase();

  async function handleRoleChange(newRole: "admin" | "manager" | "viewer") {
    if (newRole === role) return;
    setChangingRole(true);
    const result = await updateMemberRole(member.id, newRole);
    setChangingRole(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Role updated to ${ROLE_CONFIG[newRole].label}`);
      onRoleChanged(member.id, newRole);
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove ${member.email} from the team? They will lose access to all ocs.`)) return;
    setRemoving(true);
    const result = await removeMember(member.id);
    setRemoving(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Member removed");
      onRemoved(member.id);
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-3">
        <UserAvatar src={member.avatar_url} initials={initials} />
        <div>
          <p className="text-sm font-medium text-foreground">
            {member.first_name && member.last_name
              ? `${member.first_name} ${member.last_name}`
              : member.email}
            {isCurrentUser && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
          </p>
          <p className="text-xs text-muted-foreground">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isAdmin && !isCurrentUser ? (
          <>
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value as "admin" | "manager" | "viewer")}
              disabled={changingRole}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleRemove}
              disabled={removing}
            >
              <UserMinus className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Badge variant={config.variant}>{config.label}</Badge>
        )}
      </div>
    </div>
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

  function handleRoleChanged(id: string, newRole: "admin" | "manager" | "viewer") {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, company_role: newRole } : m))
    );
  }

  function handleRemoved(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Team members</h3>
            <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No team members found.</p>
          ) : (
            members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isCurrentUser={member.id === currentUserId}
                isAdmin={isAdmin}
                onRoleChanged={handleRoleChanged}
                onRemoved={handleRemoved}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Role descriptions */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Roles</h3>
          <div className="space-y-3">
            {Object.entries(ROLE_CONFIG).map(([key, config]) => (
              <div key={key} className="flex items-start gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted shrink-0 mt-0.5">
                  <config.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{config.label}</p>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
