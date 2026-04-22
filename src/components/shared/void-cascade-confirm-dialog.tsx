"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import type { VoidCascadePreview } from "@/lib/validations/reconciliation";

export const DESTRUCTIVE_VOID_LOT_THRESHOLD = 3;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cascadePreview: VoidCascadePreview | null;
  isSubmitting?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function VoidCascadeConfirmDialog({
  open,
  onOpenChange,
  cascadePreview,
  isSubmitting = false,
  onConfirm,
}: Props) {
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const affectedLots = new Set([
    ...(cascadePreview?.matches_to_unlink || []).map((m) => m.lot_number),
    ...(cascadePreview?.credits_to_void || []).map((c) => c.lot_number),
    ...(cascadePreview?.undeposited_receipts_to_reopen || []).map((r) => r.lot_number),
  ]).size;

  const needsTypedConfirmation = affectedLots >= DESTRUCTIVE_VOID_LOT_THRESHOLD;

  const formSchema = z.object({
    reason: z
      .string()
      .trim()
      .min(10, "Reason must be at least 10 characters")
      .max(1000, "Reason must be under 1000 characters"),
    typedConfirmation: needsTypedConfirmation
      ? z
          .string()
          .refine((v) => v === "VOID", "Type VOID (all caps) to confirm")
      : z.string().optional(),
  });

  type FormInput = z.infer<typeof formSchema>;

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: "",
      typedConfirmation: "",
    },
  });

  const onSubmit = async (data: FormInput) => {
    setLocalSubmitting(true);
    try {
      await onConfirm(data.reason);
      toast.success("Transaction voided successfully");
      form.reset();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to void transaction";
      toast.error(message);
    } finally {
      setLocalSubmitting(false);
    }
  };

  if (!cascadePreview) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Void this transaction?</DialogTitle>
          <DialogDescription>
            This will mark the transaction as voided and remove it from the reconciliation queue.
            The transaction record stays for audit but won&apos;t be reconciled.
          </DialogDescription>
        </DialogHeader>

        {/* Cascade preview */}
        <div className="space-y-4">
          {affectedLots > 0 && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <div className="font-medium text-amber-900 mb-2">
                    This will affect {affectedLots} lot{affectedLots !== 1 ? "s" : ""}
                  </div>
                  {cascadePreview.matches_to_unlink.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs font-medium text-amber-800 mb-1">
                        Unmatched entries:
                      </div>
                      {cascadePreview.matches_to_unlink.map((m, i) => (
                        <div key={i} className="text-xs text-amber-700">
                          Lot {m.lot_number}: {formatCurrency(m.amount)}
                          {m.levy_reference && ` (${m.levy_reference})`}
                        </div>
                      ))}
                    </div>
                  )}
                  {cascadePreview.credits_to_void.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs font-medium text-amber-800 mb-1">
                        Voided credits:
                      </div>
                      {cascadePreview.credits_to_void.map((c, i) => (
                        <div key={i} className="text-xs text-amber-700">
                          Lot {c.lot_number}: {formatCurrency(c.amount)} ({c.category})
                        </div>
                      ))}
                    </div>
                  )}
                  {cascadePreview.undeposited_receipts_to_reopen.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-amber-800 mb-1">
                        Reopened receipts:
                      </div>
                      {cascadePreview.undeposited_receipts_to_reopen.map((r, i) => (
                        <div key={i} className="text-xs text-amber-700">
                          Lot {r.lot_number}: {formatCurrency(r.amount)} (#{r.receipt_number})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Reason */}
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for voiding</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="E.g. Duplicate, incorrect entry, reversal request..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <div className="text-xs text-muted-foreground mt-1">
                      {field.value.length}/{1000} characters (minimum 10)
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Typed confirmation (if needed) */}
              {needsTypedConfirmation && (
                <FormField
                  control={form.control}
                  name="typedConfirmation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type VOID to confirm this action</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="VOID"
                          {...field}
                          className="font-mono"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={localSubmitting || isSubmitting}
                  variant="destructive"
                >
                  {localSubmitting || isSubmitting ? "Voiding..." : "Void transaction"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
