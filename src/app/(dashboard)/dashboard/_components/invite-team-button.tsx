"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InviteTeamDialog } from "@/components/shared/invite-team-dialog";

export function InviteTeamButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" />
        Invite team member
      </Button>
      <InviteTeamDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
