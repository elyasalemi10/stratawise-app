"use client";

import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { X, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  reconcileTransaction,
  type MappingCollisionPayload,
  type ProposalFlagPayload,
} from "@/lib/actions/reconciliation";
import { getOCLotsForAllocation } from "@/lib/actions/reconciliation";
import { FUND_TYPES } from "@/lib/validations/ledger";
import type { FundType } from "@/lib/validations/ledger";

const allocationSchema = z.object({
  lot_id: z.string().uuid("Select a lot"),
  fund_type: z.enum(FUND_TYPES),
  amount: z
    .number()
    .positive("Amount must be greater than zero")
    .finite("Amount must be a valid number"),
  levy_notice_id: z.string().uuid().nullable().optional(),
});

const formSchema = z.object({
  allocations: z
    .array(allocationSchema)
    .min(1, "At least one allocation required")
    .max(50, "Too many allocations"),
});

type FormInput = z.infer<typeof formSchema>;

interface LotOption {
  id: string;
  lot_number: string;
  unit_number: string | null;
  owner_display_name: string | null;
  owner_status: "member" | "pending_invitation" | "unowned";
  outstanding_levies: Array<{
    id: string;
    reference_number: string;
    amount_outstanding: number;
  }>;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export interface AllocateFormSuccess {
  allocated: number;
  mappingCollision?: MappingCollisionPayload;
  proposalFlag?: ProposalFlagPayload;
}

interface Props {
  bankTxnId: string;
  ocId: string;
  bankAccountFundType: FundType;
  transactionAmount: number;
  alreadyMatched: number;
  detectedReference: string | null;
  /** Optional pre-fill for the first allocation's lot_id (from FuzzyHintCell
   *  click on the queue page → `?prefill_lot=<lotId>` query param). */
  prefillLotId?: string | null;
  onSuccess: (result: AllocateFormSuccess) => void;
}

export function AllocateForm({
  bankTxnId,
  ocId,
  bankAccountFundType,
  transactionAmount,
  alreadyMatched,
  detectedReference,
  prefillLotId,
  onSuccess,
}: Props) {
  const [lots, setLots] = useState<LotOption[]>([]);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openComboboxes, setOpenComboboxes] = useState<Record<number, boolean>>({});
  const [rememberPayer, setRememberPayer] = useState(true);

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      allocations: [
        {
          lot_id: prefillLotId ?? "",
          fund_type: bankAccountFundType,
          amount: 0,
          levy_notice_id: null,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const allocations = form.watch("allocations");
  const totalAllocated = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  const remaining = transactionAmount - alreadyMatched - totalAllocated;
  const isFullyAllocated = remaining === 0;
  const canSave = totalAllocated > 0 && remaining >= 0 && form.formState.isValid;

  useEffect(() => {
    const loadLots = async () => {
      try {
        setLotsLoading(true);
        const data = await getOCLotsForAllocation(ocId);
        setLots(data);
      } catch {
        toast.error("Failed to load lots");
      } finally {
        setLotsLoading(false);
      }
    };
    loadLots();
  }, [ocId]);

  const onSubmit = async (data: FormInput) => {
    setIsSubmitting(true);
    try {
      const result = await reconcileTransaction({
        oc_id: ocId,
        bank_transaction_id: bankTxnId,
        allocations: data.allocations,
        match_method: detectedReference ? "auto_reference" : "manual",
        match_confidence: detectedReference ? "exact_reference" : "manual",
        remember_payer: rememberPayer,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onSuccess({
        allocated: totalAllocated,
        mappingCollision: result.success?.mappingCollision,
        proposalFlag: result.success?.proposalFlag,
      });
      form.reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save allocation";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLotLabel = (lotId: string) => {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) return "";
    const parts = [`Lot ${lot.lot_number}`];
    if (lot.unit_number) parts.push(`Unit ${lot.unit_number}`);
    if (lot.owner_display_name) {
      parts.push(lot.owner_display_name);
    } else if (lot.owner_status === "pending_invitation") {
      parts.push("Pending invitation");
    } else {
      parts.push("Unowned");
    }
    return parts.join(" — ");
  };

  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold mb-4">Allocate to lots</h3>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="p-4 border border-border rounded-lg bg-muted/20 space-y-3"
              >
                {/* Lot select */}
                <FormField
                  control={form.control}
                  name={`allocations.${index}.lot_id`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lot</FormLabel>
                      <Popover
                        open={openComboboxes[index] ?? false}
                        onOpenChange={(open) =>
                          setOpenComboboxes((prev) => ({
                            ...prev,
                            [index]: open,
                          }))
                        }
                      >
                        <PopoverTrigger>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={lotsLoading}
                          >
                            {field.value
                              ? getLotLabel(field.value)
                              : "Select a lot..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search lots..." />
                            <CommandEmpty>No lots found.</CommandEmpty>
                            <CommandList>
                              <CommandGroup>
                                {lots.map((lot) => (
                                  <CommandItem
                                    key={lot.id}
                                    value={lot.id}
                                    onSelect={(currentValue) => {
                                      field.onChange(
                                        currentValue === field.value ? "" : currentValue
                                      );
                                      setOpenComboboxes((prev) => ({
                                        ...prev,
                                        [index]: false,
                                      }));
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === lot.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {getLotLabel(lot.id)}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Fund type select */}
                <FormField
                  control={form.control}
                  name={`allocations.${index}.fund_type`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fund type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="administrative">Administrative</SelectItem>
                          <SelectItem value="capital_works">Capital works</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Amount input */}
                <FormField
                  control={form.control}
                  name={`allocations.${index}.amount`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <NumberInput
                          placeholder="Amount"
                          value={field.value != null ? String(field.value) : ""}
                          onChange={(v) => field.onChange(v ? parseFloat(v) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Apply to levy select */}
                <FormField
                  control={form.control}
                  name={`allocations.${index}.levy_notice_id`}
                  render={({ field }) => {
                    const selectedLot = lots.find(
                      (l) => l.id === allocations[index].lot_id
                    );
                    const outstandingLevies = selectedLot?.outstanding_levies ?? [];

                    return (
                      <FormItem>
                        <FormLabel>Apply to</FormLabel>
                        <Select
                          value={field.value ?? "none"}
                          onValueChange={(v) =>
                            field.onChange(v === "none" ? null : v)
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">
                              No specific levy (apply to oldest debts)
                            </SelectItem>
                            {outstandingLevies.map((levy) => (
                              <SelectItem key={levy.id} value={levy.id}>
                                {levy.reference_number} ({formatCurrency(levy.amount_outstanding)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                {/* Remove button */}
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => remove(index)}
                    className="w-full text-destructive"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Remove row
                  </Button>
                )}
              </div>
            ))}

            {/* Add another lot button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  lot_id: "",
                  fund_type: bankAccountFundType,
                  amount: 0,
                  levy_notice_id: null,
                })
              }
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add another lot
            </Button>

            {/* Remember-this-payer checkbox (PP4-D). Default checked: most
                manual matches benefit from a mapping; when a manager
                un-checks, the orchestrator's repeat-manual detector still
                fires after 3 matches in 30 days. */}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={rememberPayer}
                onChange={(e) => setRememberPayer(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
              />
              <span>
                <span className="font-medium">Remember this payer</span>
                <span className="block text-xs text-muted-foreground">
                  Auto-match future transactions from this sender to the
                  same lot. If a different mapping already exists you&apos;ll
                  be prompted to resolve.
                </span>
              </span>
            </label>

            {/* Save button */}
            <Button
              type="submit"
              disabled={!canSave || isSubmitting}
              className="w-full"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isFullyAllocated ? "Save matches" : "Save partial match"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
