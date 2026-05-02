"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

import {
  submitOwnerPaymentClaimSchema,
  OWNER_CLAIM_PAYMENT_METHODS,
  OWNER_CLAIM_PAYMENT_METHOD_LABELS,
  type MyPaymentClaimRow,
} from "@/lib/validations/owner-payment-claims";
import { submitOwnerPaymentClaim } from "@/lib/actions/owner-payment-claims";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface OwnerLot {
  id: string;
  lot_number: number | null;
  unit_number: string | null;
}

interface Props {
  subdivisionId: string;
  ownerLots: OwnerLot[];
  claims: MyPaymentClaimRow[];
}

type FormInput = z.input<typeof submitOwnerPaymentClaimSchema>;

function lotLabel(lot: OwnerLot): string {
  const base = lot.lot_number !== null ? `Lot ${lot.lot_number}` : "Lot ?";
  return lot.unit_number ? `${base} (Unit ${lot.unit_number})` : base;
}

function statusBadge(status: MyPaymentClaimRow["claim_status"]) {
  switch (status) {
    case "pending":
      return <Badge className="rounded-full bg-amber-100 text-amber-900 hover:bg-amber-100">Pending review</Badge>;
    case "matched":
      return <Badge className="rounded-full bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Matched</Badge>;
    case "rejected":
      return <Badge className="rounded-full bg-rose-100 text-rose-900 hover:bg-rose-100">Rejected</Badge>;
  }
}

export function MyPaymentsContent({ subdivisionId, ownerLots, claims }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormInput>({
    resolver: zodResolver(submitOwnerPaymentClaimSchema),
    defaultValues: {
      subdivision_id: subdivisionId,
      lot_id: ownerLots.length === 1 ? ownerLots[0].id : "",
      amount: 0,
      claim_date: new Date().toISOString().slice(0, 10),
      payment_method: "eft",
      reference: "",
      notes: "",
    },
  });

  const onSubmit = async (data: FormInput) => {
    setIsSubmitting(true);
    try {
      const result = await submitOwnerPaymentClaim({
        ...data,
        reference: data.reference?.trim() || null,
        notes: data.notes?.trim() || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payment claim submitted. Your strata manager will review it.");
      form.reset({
        subdivision_id: subdivisionId,
        lot_id: ownerLots.length === 1 ? ownerLots[0].id : "",
        amount: 0,
        claim_date: new Date().toISOString().slice(0, 10),
        payment_method: "eft",
        reference: "",
        notes: "",
      });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit claim";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (ownerLots.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold text-foreground">My payments</h1>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              You&apos;re not registered as an owner on any lot in this subdivision yet. Once your strata manager
              records you as a lot owner, you&apos;ll be able to report payments here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">My payments</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide">
            Report a payment
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Tell your strata manager about a payment you&apos;ve made. They&apos;ll review it and match it to
            your ledger once it appears in the bank feed.
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {ownerLots.length > 1 && (
                <FormField
                  control={form.control}
                  name="lot_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lot</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a lot" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ownerLots.map((lot) => (
                            <SelectItem key={lot.id} value={lot.id}>
                              {lotLabel(lot)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (AUD)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="claim_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment date</FormLabel>
                      <Popover>
                        <PopoverTrigger
                          className={cn(
                            "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="h-4 w-4" />
                          {field.value
                            ? format(new Date(`${field.value}T00:00:00`), "d MMM yyyy")
                            : "Select a date"}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ? new Date(`${field.value}T00:00:00`) : undefined}
                            onSelect={(date) => {
                              if (date) field.onChange(format(date, "yyyy-MM-dd"));
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {OWNER_CLAIM_PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {OWNER_CLAIM_PAYMENT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. LEV-12, transaction ID"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Anything that might help your manager identify this payment"
                        rows={3}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting…" : "Submit claim"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide">My recent claims</CardTitle>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              You haven&apos;t submitted any payment claims yet. Use the form above to report your first one.
            </p>
          ) : (
            <div className="divide-y divide-border -mx-5">
              {claims.map((claim) => (
                <div key={claim.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tabular-nums">
                          {formatCurrency(claim.amount)}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{claim.lot_label}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(`${claim.claim_date}T00:00:00`), "d MMM yyyy")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {OWNER_CLAIM_PAYMENT_METHOD_LABELS[claim.payment_method]}
                        {claim.reference ? ` · Ref: ${claim.reference}` : ""}
                      </div>
                      {claim.notes && (
                        <div className="text-xs text-muted-foreground italic">{claim.notes}</div>
                      )}
                      {claim.claim_status === "rejected" && claim.rejection_reason && (
                        <div className="text-xs text-rose-700 mt-1">
                          <span className="font-medium">Reason: </span>
                          {claim.rejection_reason}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">{statusBadge(claim.claim_status)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
