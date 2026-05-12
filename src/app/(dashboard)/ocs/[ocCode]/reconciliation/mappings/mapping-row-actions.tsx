"use client";

// ============================================================================
// MappingRowActions — per-row dropdown for the mappings management table
// ----------------------------------------------------------------------------
// View details / Disable / Re-activate / Delete (admin-only). Re-activate
// re-runs the partial-active UNIQUE-index collision check server-side and
// surfaces a `mappingCollision` payload to the parent if a competitor exists;
// the parent opens `CollisionResolutionDialog` (D-5-C) and routes the
// resolution through `resolveMappingCollision`.
// ============================================================================

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Eye, Power, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  disableMappingAction,
  reactivateMappingAction,
  deleteMappingAction,
  type MappingCollisionPayload,
  type MappingListRow,
} from "@/lib/actions/reconciliation";

type MappingRowActionsProps = {
  ocId: string;
  mapping: MappingListRow;
  canDelete: boolean;
  onView: (mappingId: string) => void;
  onCollision: (payload: MappingCollisionPayload) => void;
  onChange: () => void; // refresh the list after a successful mutation
};

export function MappingRowActions({
  ocId,
  mapping,
  canDelete,
  onView,
  onCollision,
  onChange,
}: MappingRowActionsProps) {
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canDisable = mapping.status !== "disabled";
  const canReactivate = mapping.status !== "active";

  async function handleDisable() {
    setPending(true);
    const result = await disableMappingAction({
      mapping_id: mapping.id,
      oc_id: ocId,
    });
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Mapping disabled");
    startTransition(onChange);
  }

  async function handleReactivate() {
    setPending(true);
    const result = await reactivateMappingAction({
      mapping_id: mapping.id,
      oc_id: ocId,
    });
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.success?.mappingCollision) {
      onCollision(result.success.mappingCollision);
      return;
    }
    toast.success("Mapping re-activated");
    startTransition(onChange);
  }

  async function handleDelete() {
    setPending(true);
    const result = await deleteMappingAction({
      mapping_id: mapping.id,
      oc_id: ocId,
    });
    setPending(false);
    setConfirmDelete(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Mapping deleted");
    startTransition(onChange);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={pending}
            />
          }
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Row actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onView(mapping.id)}>
            <Eye className="mr-2 h-3.5 w-3.5" />
            View details
          </DropdownMenuItem>
          {canDisable && (
            <DropdownMenuItem onClick={handleDisable}>
              <Power className="mr-2 h-3.5 w-3.5" />
              Disable
            </DropdownMenuItem>
          )}
          {canReactivate && (
            <DropdownMenuItem onClick={handleReactivate}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Re-activate
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmDelete(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the mapping for{" "}
              <strong>{mapping.canonical_sender_name}</strong> on{" "}
              <strong>{mapping.lot_label}</strong>. The audit trail is
              preserved. The mapping cannot be restored after deletion —
              you would have to re-create it from a future manual match.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
