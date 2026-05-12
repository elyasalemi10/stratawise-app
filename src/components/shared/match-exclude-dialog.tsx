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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { excludeTransactionSchema, type ExcludeTransactionInput } from "@/lib/validations/reconciliation";
import { excludeTransaction } from "@/lib/actions/reconciliation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankTxnId: string;
  ocId: string;
  onSuccess: () => void;
}

const MIN_REASON_LEN = 10;

export function MatchExcludeDialog({
  open,
  onOpenChange,
  bankTxnId,
  ocId,
  onSuccess,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ExcludeTransactionInput>({
    resolver: zodResolver(excludeTransactionSchema),
    defaultValues: {
      oc_id: ocId,
      bank_transaction_id: bankTxnId,
      reason: "",
    },
  });

  const onSubmit = async (data: ExcludeTransactionInput) => {
    setIsSubmitting(true);
    try {
      await excludeTransaction(data);
      toast.success("Transaction excluded from reconciliation");
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to exclude transaction";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exclude this transaction</DialogTitle>
          <DialogDescription>
            This transaction won&apos;t appear in the reconciliation queue. You can restore it later.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for exclusion</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="E.g. Internal transfer, duplicate, test transaction..."
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
              <Button type="submit" disabled={isSubmitting} variant="destructive">
                {isSubmitting ? "Excluding..." : "Exclude transaction"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
