"use client";

// ============================================================================
// CollisionResolutionDialog — three-way resolution + race-aware reducer
// ----------------------------------------------------------------------------
// Single dialog component for both "remember-payer" collision flows:
//   - flow="reconcile_remember_payer" → submits via resolvePayerMappingCollision
//   - flow="mapping_reactivate"       → submits via resolveMappingCollision
//
// State-machine per D-2 plan:
//   idle → choosing → submitting → done
//                              ↓→ raced (with refreshed payload)   → choosing
//                              ↓→ raced_with_deletion              → choosing_post_deletion
//                                                                     → submitting_post_deletion → done
//                              ↓→ error → submitting (retry)
//
// Addition 3: on `mapping_deleted` race, the dialog enters
// `choosing_post_deletion` and prompts the user with [Create new] / [Skip]
// rather than silently terminating, eliminating the "what did the system
// actually do?" ambiguity.
// ============================================================================

import { useEffect, useReducer } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  resolvePayerMappingCollision,
  resolveMappingCollision,
  createMappingDirectAction,
  type MappingCollisionPayload,
} from "@/lib/actions/reconciliation";

export type CollisionFlow = "reconcile_remember_payer" | "mapping_reactivate";

export type Resolution = "update" | "keep_existing" | "remove";

type DivergenceType =
  | "mapping_changed"
  | "mapping_deleted"
  | "new_active_mapping_appeared";

type ResolveContext =
  | { flow: "reconcile_remember_payer"; bankTransactionId: string }
  | { flow: "mapping_reactivate" };

// ─── Reducer ──────────────────────────────────────────────────────────────

type State =
  | { phase: "idle" }
  | { phase: "choosing"; payload: MappingCollisionPayload }
  | {
      phase: "submitting";
      payload: MappingCollisionPayload;
      resolution: Resolution;
    }
  | {
      phase: "raced";
      divergence: "mapping_changed" | "new_active_mapping_appeared";
      payload: MappingCollisionPayload; // last known payload (kept for context)
      details: { expected: string[]; current: string[] };
    }
  | {
      phase: "raced_with_deletion";
      payload: MappingCollisionPayload;
    }
  | {
      phase: "choosing_post_deletion";
      payload: MappingCollisionPayload;
    }
  | {
      phase: "submitting_post_deletion";
      payload: MappingCollisionPayload;
    }
  | {
      phase: "error";
      payload: MappingCollisionPayload;
      resolution: Resolution | "create_post_deletion";
      message: string;
    }
  | {
      phase: "done";
      outcome: {
        resolution_applied?: Resolution;
        mapping_id?: string | null;
        created_post_deletion?: boolean;
      };
    };

type Event =
  | { type: "OPEN"; payload: MappingCollisionPayload }
  | { type: "CHOOSE"; resolution: Resolution }
  | { type: "SUBMIT_OK"; mapping_id: string | null; resolution: Resolution }
  | {
      type: "SUBMIT_RACE_REFRESH";
      divergence: "mapping_changed" | "new_active_mapping_appeared";
      details: { expected: string[]; current: string[] };
    }
  | { type: "SUBMIT_RACE_DELETED" }
  | { type: "ACK_RACE_RETRY" }
  | { type: "POST_DELETION_CREATE" }
  | { type: "POST_DELETION_OK"; mapping_id: string }
  | { type: "POST_DELETION_SKIP" }
  | {
      type: "SUBMIT_ERROR";
      message: string;
      resolution: Resolution | "create_post_deletion";
    }
  | { type: "RETRY_ERROR" }
  | { type: "CLOSE" };

function reduce(state: State, event: Event): State {
  switch (event.type) {
    case "OPEN":
      return { phase: "choosing", payload: event.payload };
    case "CLOSE":
      return { phase: "idle" };

    case "CHOOSE":
      if (state.phase === "choosing") {
        return {
          phase: "submitting",
          payload: state.payload,
          resolution: event.resolution,
        };
      }
      return state;

    case "SUBMIT_OK":
      return {
        phase: "done",
        outcome: {
          resolution_applied: event.resolution,
          mapping_id: event.mapping_id,
        },
      };

    case "SUBMIT_RACE_REFRESH":
      if (state.phase === "submitting") {
        return {
          phase: "raced",
          divergence: event.divergence,
          payload: state.payload,
          details: event.details,
        };
      }
      return state;

    case "SUBMIT_RACE_DELETED":
      if (state.phase === "submitting") {
        return { phase: "raced_with_deletion", payload: state.payload };
      }
      return state;

    case "ACK_RACE_RETRY":
      if (state.phase === "raced") {
        return { phase: "choosing", payload: state.payload };
      }
      if (state.phase === "raced_with_deletion") {
        return { phase: "choosing_post_deletion", payload: state.payload };
      }
      return state;

    case "POST_DELETION_CREATE":
      if (state.phase === "choosing_post_deletion") {
        return { phase: "submitting_post_deletion", payload: state.payload };
      }
      return state;

    case "POST_DELETION_OK":
      return {
        phase: "done",
        outcome: {
          mapping_id: event.mapping_id,
          created_post_deletion: true,
        },
      };

    case "POST_DELETION_SKIP":
      return {
        phase: "done",
        outcome: { created_post_deletion: false },
      };

    case "SUBMIT_ERROR":
      if (
        state.phase === "submitting" ||
        state.phase === "submitting_post_deletion"
      ) {
        return {
          phase: "error",
          payload: state.payload,
          resolution: event.resolution,
          message: event.message,
        };
      }
      return state;

    case "RETRY_ERROR":
      if (state.phase === "error") {
        if (state.resolution === "create_post_deletion") {
          return {
            phase: "submitting_post_deletion",
            payload: state.payload,
          };
        }
        return {
          phase: "submitting",
          payload: state.payload,
          resolution: state.resolution,
        };
      }
      return state;
  }
  return state;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const RACE_LABEL: Record<DivergenceType, string> = {
  mapping_changed:
    "Another user changed the conflicting mapping while you were deciding.",
  new_active_mapping_appeared:
    "A new active mapping for the same payer appeared while you were deciding.",
  mapping_deleted:
    "The conflicting mapping was deleted while you were deciding.",
};

// ─── Component ────────────────────────────────────────────────────────────

type CollisionResolutionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: MappingCollisionPayload | null;
  flow: CollisionFlow;
  ocId: string;
  /** Required when flow="reconcile_remember_payer". */
  bankTransactionId?: string;
  onResolved?: (outcome: {
    resolution_applied?: Resolution;
    mapping_id?: string | null;
    created_post_deletion?: boolean;
  }) => void;
};

export function CollisionResolutionDialog({
  open,
  onOpenChange,
  payload,
  flow,
  ocId,
  bankTransactionId,
  onResolved,
}: CollisionResolutionDialogProps) {
  const [state, dispatch] = useReducer(reduce, { phase: "idle" });

  // OPEN → choosing whenever a fresh payload arrives.
  useEffect(() => {
    if (open && payload) {
      dispatch({ type: "OPEN", payload });
    } else if (!open) {
      dispatch({ type: "CLOSE" });
    }
  }, [open, payload]);

  // Side-effect: dispatch resolution to the right server action based on
  // the active phase.
  useEffect(() => {
    if (state.phase === "submitting") {
      const ctx: ResolveContext =
        flow === "reconcile_remember_payer"
          ? { flow, bankTransactionId: bankTransactionId ?? "" }
          : { flow };
      submitResolution(state.payload, state.resolution, ctx, ocId)
        .then((outcome) => {
          if (outcome.race) {
            if (outcome.race.divergence_type === "mapping_deleted") {
              dispatch({ type: "SUBMIT_RACE_DELETED" });
            } else {
              dispatch({
                type: "SUBMIT_RACE_REFRESH",
                divergence: outcome.race.divergence_type,
                details: outcome.race.details,
              });
            }
          } else if (outcome.error) {
            dispatch({
              type: "SUBMIT_ERROR",
              message: outcome.error,
              resolution: state.resolution,
            });
          } else {
            dispatch({
              type: "SUBMIT_OK",
              mapping_id: outcome.mapping_id ?? null,
              resolution: state.resolution,
            });
          }
        })
        .catch((e) => {
          dispatch({
            type: "SUBMIT_ERROR",
            message: (e as Error).message,
            resolution: state.resolution,
          });
        });
    } else if (state.phase === "submitting_post_deletion") {
      // "Create new" after mapping_deleted: call createMappingDirectAction.
      const p = state.payload;
      void (async () => {
        const result = await createMappingDirectAction({
          oc_id: ocId,
          canonical_sender_name: p.canonical_sender_name,
          lot_id: p.proposed_lot_id,
        });
        if (result.error) {
          dispatch({
            type: "SUBMIT_ERROR",
            message: result.error,
            resolution: "create_post_deletion",
          });
          return;
        }
        if (result.success?.mappingCollision) {
          // Fresh collision appeared between deletion-detection and our
          // create call. Treat as a new collision flow, drop back to
          // choosing.
          toast.warning(
            "A new conflicting mapping appeared. Please re-decide.",
          );
          dispatch({ type: "OPEN", payload: result.success.mappingCollision });
          return;
        }
        if (result.success?.mapping_id) {
          dispatch({
            type: "POST_DELETION_OK",
            mapping_id: result.success.mapping_id,
          });
        }
      })();
    } else if (state.phase === "raced_with_deletion") {
      // Auto-transition into the post-deletion choice phase.
      dispatch({ type: "ACK_RACE_RETRY" });
    } else if (state.phase === "done") {
      onResolved?.(state.outcome);
      // Toast a friendly summary.
      if (state.outcome.created_post_deletion === true) {
        toast.success("New mapping created (conflicting mapping was deleted)");
      } else if (state.outcome.created_post_deletion === false) {
        toast.success("Match committed without remembering payer");
      } else if (state.outcome.resolution_applied === "update") {
        toast.success("Existing mapping disabled; new mapping created");
      } else if (state.outcome.resolution_applied === "keep_existing") {
        toast.success("Existing mapping kept");
      } else if (state.outcome.resolution_applied === "remove") {
        toast.success("Both mappings disabled");
      }
      // Close the dialog after the success toast.
      onOpenChange(false);
    }
  }, [
    state,
    flow,
    bankTransactionId,
    ocId,
    onOpenChange,
    onResolved,
  ]);

  if (!payload && state.phase === "idle") return null;

  // The visible payload is whichever phase we're in — fall back to the
  // initial payload prop while we wait for OPEN.
  const visiblePayload =
    "payload" in state ? state.payload : payload ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {state.phase === "done" ? (
          // Brief render between SUBMIT_OK and the parent clearing the
          // payload. Render an inert success indicator instead of falling
          // through to ChoosingView (which would flash the choice UI for
          // one frame before unmount).
          <DoneFlashView />
        ) : state.phase === "raced" ? (
          <RacedView
            divergence={state.divergence}
            onAck={() => dispatch({ type: "ACK_RACE_RETRY" })}
            onClose={() => onOpenChange(false)}
          />
        ) : state.phase === "choosing_post_deletion" ? (
          <PostDeletionView
            payload={state.payload}
            onCreate={() => dispatch({ type: "POST_DELETION_CREATE" })}
            onSkip={() => dispatch({ type: "POST_DELETION_SKIP" })}
          />
        ) : state.phase === "submitting_post_deletion" ? (
          <PostDeletionSubmittingView />
        ) : state.phase === "error" ? (
          <ErrorView
            message={state.message}
            onRetry={() => dispatch({ type: "RETRY_ERROR" })}
            onClose={() => onOpenChange(false)}
          />
        ) : visiblePayload ? (
          <ChoosingView
            payload={visiblePayload}
            submitting={state.phase === "submitting"}
            chosenResolution={
              state.phase === "submitting" ? state.resolution : null
            }
            onChoose={(resolution) =>
              dispatch({ type: "CHOOSE", resolution })
            }
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────

function ChoosingView({
  payload,
  submitting,
  chosenResolution,
  onChoose,
  onCancel,
}: {
  payload: MappingCollisionPayload;
  submitting: boolean;
  chosenResolution: Resolution | null;
  onChoose: (r: Resolution) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Resolve payer mapping conflict</DialogTitle>
        <DialogDescription>
          <strong>{payload.canonical_sender_name}</strong> is already mapped to
          another lot. Choose how to resolve.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 my-2">
        <div className="rounded-md border border-border p-3 space-y-1 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Existing mapping{payload.colliding_mappings.length > 1 ? "s" : ""}
          </div>
          {payload.colliding_mappings.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <Badge variant="warning">ambiguous</Badge>
              <span className="font-medium">{m.lot_label}</span>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Proposed mapping
          </div>
          <div className="flex items-center gap-2">
            <Badge>active</Badge>
            <span className="font-medium">{payload.proposed_lot_label}</span>
          </div>
        </div>
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ChoiceButton
            label="Update"
            description="Disable existing, create new"
            onClick={() => onChoose("update")}
            loading={submitting && chosenResolution === "update"}
            disabled={submitting}
            variant="primary"
          />
          <ChoiceButton
            label="Keep existing"
            description="Don't create new"
            onClick={() => onChoose("keep_existing")}
            loading={submitting && chosenResolution === "keep_existing"}
            disabled={submitting}
            variant="secondary"
          />
          <ChoiceButton
            label="Remove"
            description="Disable existing, skip new"
            onClick={() => onChoose("remove")}
            loading={submitting && chosenResolution === "remove"}
            disabled={submitting}
            variant="destructive"
          />
        </div>
        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function ChoiceButton({
  label,
  description,
  onClick,
  loading,
  disabled,
  variant,
}: {
  label: string;
  description: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  variant: "primary" | "secondary" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border p-3 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "border-primary/30 bg-primary/5 hover:bg-primary/10",
        variant === "secondary" &&
          "border-border bg-background hover:bg-muted",
        variant === "destructive" &&
          "border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
      )}
    >
      <div className="font-medium text-foreground">
        {loading && <Loader2 className="size-4 animate-spin" />}
        {label}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

function RacedView({
  divergence,
  onAck,
  onClose,
}: {
  divergence: "mapping_changed" | "new_active_mapping_appeared";
  onAck: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[hsl(38,92%,35%)]" />
          State changed
        </DialogTitle>
        <DialogDescription>{RACE_LABEL[divergence]}</DialogDescription>
      </DialogHeader>
      <p className="text-sm text-muted-foreground my-2">
        We&apos;ve refreshed the conflict for you. Please re-decide on the
        next screen.
      </p>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onAck}>Re-decide</Button>
      </DialogFooter>
    </>
  );
}

function PostDeletionView({
  payload,
  onCreate,
  onSkip,
}: {
  payload: MappingCollisionPayload;
  onCreate: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[hsl(38,92%,35%)]" />
          {RACE_LABEL.mapping_deleted}
        </DialogTitle>
        <DialogDescription>
          Create a new mapping for{" "}
          <strong>{payload.canonical_sender_name}</strong> →{" "}
          <strong>{payload.proposed_lot_label}</strong>?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={onSkip}>
          <X className="mr-2 h-3.5 w-3.5" />
          Skip
        </Button>
        <Button onClick={onCreate}>
          <Check className="mr-2 h-3.5 w-3.5" />
          Create new
        </Button>
      </DialogFooter>
    </>
  );
}

function PostDeletionSubmittingView() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Creating mapping...</DialogTitle>
        <DialogDescription>
          Please wait while we create the new mapping.
        </DialogDescription>
      </DialogHeader>
    </>
  );
}

function DoneFlashView() {
  // Single-frame placeholder rendered between the reducer reaching `done`
  // and the parent clearing the dialog's `open` prop. Intentionally minimal.
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Check className="h-5 w-5 text-[hsl(160,100%,37%)]" />
          Saved
        </DialogTitle>
      </DialogHeader>
    </>
  );
}

function ErrorView({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Couldn&apos;t resolve mapping
        </DialogTitle>
        <DialogDescription className="break-words">
          {message}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onRetry}>Retry</Button>
      </DialogFooter>
    </>
  );
}

// ─── Submit dispatcher ────────────────────────────────────────────────────

type ResolveOutcome = {
  resolution_applied?: Resolution;
  mapping_id?: string | null;
  race?: { divergence_type: DivergenceType; details: { expected: string[]; current: string[] } };
  error?: string;
};

async function submitResolution(
  payload: MappingCollisionPayload,
  resolution: Resolution,
  ctx: ResolveContext,
  ocId: string,
): Promise<ResolveOutcome> {
  if (ctx.flow === "reconcile_remember_payer") {
    if (!ctx.bankTransactionId) {
      return {
        error:
          "Internal error: bankTransactionId required for reconcile flow",
      };
    }
    const result = await resolvePayerMappingCollision({
      oc_id: ocId,
      bank_transaction_id: ctx.bankTransactionId,
      proposed_lot_id: payload.proposed_lot_id,
      resolution,
      expected_collisions: payload.colliding_mappings.map((m) => ({
        id: m.id,
        lot_id: m.lot_id,
        previous_status: m.previous_status,
        current_status: m.current_status,
      })),
    });
    if (result.error) return { error: result.error };
    if (result.success?.race) {
      return {
        race: {
          divergence_type: result.success.race.divergence_type,
          details: result.success.race.details,
        },
      };
    }
    return {
      resolution_applied: result.success?.resolution_applied,
      mapping_id: result.success?.mapping_id ?? null,
    };
  }

  // mapping_reactivate flow
  const result = await resolveMappingCollision({
    oc_id: ocId,
    canonical_sender_name: payload.canonical_sender_name,
    proposed_lot_id: payload.proposed_lot_id,
    resolution,
    expected_collisions: payload.colliding_mappings.map((m) => ({
      id: m.id,
      lot_id: m.lot_id,
      previous_status: m.previous_status,
      current_status: m.current_status,
    })),
  });
  if (result.error) return { error: result.error };
  if (result.success?.race) {
    return {
      race: {
        divergence_type: result.success.race.divergence_type,
        details: result.success.race.details,
      },
    };
  }
  return {
    resolution_applied: result.success?.resolution_applied,
    mapping_id: result.success?.mapping_id ?? null,
  };
}
