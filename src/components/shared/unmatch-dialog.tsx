"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { unmatchTransactionSchema, type UnmatchTransactionInput } from "@/lib/validations/reconciliation";
import { unmatchTransaction } from "@/lib/actions/reconciliation";

interface Match {
  id: string;
  lot_number: string;
  amount_matched: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankTxnId: string;
  ocId: string;
  matches: Match[];
  prefillMatchId?: string | null;
  onSuccess: () => void;
}

const MIN_REASON_LEN = 10;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function UnmatchDialog({
  open,
  onOpenChange,
  bankTxnId,
  ocId,
  matches,
  prefillMatchId,
  onSuccess,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<string[]>(
    prefillMatchId ? [prefillMatchId] : []
  );

  const form = useForm<UnmatchTransactionInput>({
    resolver: zodResolver(unmatchTransactionSchema),
    defaultValues: {
      oc_id: ocId,
      bank_transaction_id: bankTxnId,
      match_ids: prefillMatchId ? [prefillMatchId] : [],
      reason: "",
    },
  });

  const toggleMatch = (matchId: string) => {
    const updated = selectedMatches.includes(matchId)
      ? selectedMatches.filter((id) => id !== matchId)
      : [...selectedMatches, matchId];
    setSelectedMatches(updated);
    form.setValue("match_ids", updated);
  };

  const onSubmit = async (data: UnmatchTransactionInput) => {
    if (!selectedMatches.length) {
      toast.error("Select at least one match to unlink");
      return;
    }
    setIsSubmitting(true);
    try {
      await unmatchTransaction({ ...data, match_ids: selectedMatches });
      toast.success("Match(es) unlinked successfully");
      form.reset();
      setSelectedMatches([]);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unlink matches";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlink matches</DialogTitle>
          <DialogDescription>
            Select which matches to reverse. The bank transaction will return to unmatched.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Match list */}
            <div className="border border-border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
              {matches.length === 0 ? (
                <div className="text-xs text-muted-foreground">No matches to unlink</div>
              ) : (
                matches.map((match) => (
                  <label
                    key={match.id}
                    className="flex items-center gap-2 cursor-pointer p-2 hover:bg-muted rounded"
                  >
                    <Checkbox
                      checked={selectedMatches.includes(match.id)}
                      onCheckedChange={() => toggleMatch(match.id)}
                    />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">Lot {match.lot_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(match.amount_matched)}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for unlinking</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="E.g. Wrong lot, duplicate match, manager error..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <div className="text-xs text-muted-foreground mt-1">
                    {field.value.length}/{1000} characters (minimum {MIN_REASON_LEN})
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || selectedMatches.length === 0}
                variant="destructive"
              >
                {isSubmitting ? "Unlinking..." : "Unlink selected"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
