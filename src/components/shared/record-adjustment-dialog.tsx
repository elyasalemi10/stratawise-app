"use client";

import { useState, useEffect } from "react";
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
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/shared/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordAdjustment } from "@/lib/actions/ledger";
import { getOCLotsForAllocation } from "@/lib/actions/reconciliation";
import { ledgerAdjustmentSchema } from "@/lib/validations/ledger";

type FormInput = z.infer<typeof ledgerAdjustmentSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ocId: string;
  defaultLotId?: string;
  onSuccess: () => void;
}

export function RecordAdjustmentDialog({
  open,
  onOpenChange,
  ocId,
  defaultLotId,
  onSuccess,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [lots, setLots] = useState<Awaited<ReturnType<typeof getOCLotsForAllocation>>>([]);
  const [lotOpen, setLotOpen] = useState(false);

  const form = useForm<FormInput>({
    resolver: zodResolver(ledgerAdjustmentSchema),
    defaultValues: {
      oc_id: ocId,
      lot_id: defaultLotId ?? "",
      fund_type: "administrative",
      entry_type: "credit",
      category: "adjustment_credit",
      amount: 0,
      entry_date: new Date().toISOString().slice(0, 10),
      description: "",
    },
  });

  const selectedLotId = form.watch("lot_id");
  const selectedLot = lots.find((l) => l.id === selectedLotId);
  const lotLabel = selectedLot
    ? `Lot ${selectedLot.lot_number}${selectedLot.unit_number ? ` — Unit ${selectedLot.unit_number}` : ""}`
    : "Select a lot";

  const entryType = form.watch("entry_type");
  useEffect(() => {
    form.setValue("category", entryType === "credit" ? "adjustment_credit" : "adjustment_debit");
  }, [entryType, form]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, ocId]);

  const onSubmit = async (data: FormInput) => {
    setIsSubmitting(true);
    try {
      await recordAdjustment(data);
      toast.success("Adjustment recorded successfully");
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record adjustment";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record adjustment</DialogTitle>
          <DialogDescription>
            Add a credit or debit adjustment to a lot&apos;s account.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Lot select */}
            <FormField
              control={form.control}
              name="lot_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lot</FormLabel>
                  <Popover open={lotOpen} onOpenChange={setLotOpen}>
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
                        {lotLabel}
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
                                  field.onChange(currentValue === field.value ? "" : currentValue);
                                  setLotOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === lot.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                Lot {lot.lot_number}
                                {lot.unit_number && ` — Unit ${lot.unit_number}`}
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

            {/* Fund type */}
            <FormField
              control={form.control}
              name="fund_type"
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

            {/* Entry type */}
            <FormField
              control={form.control}
              name="entry_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="credit">Credit (reduce balance owed)</SelectItem>
                      <SelectItem value="debit">Debit (increase balance owed)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Entry date */}
            <FormField
              control={form.control}
              name="entry_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <NumberInput
                      thousandsSeparator
                      placeholder="Amount"
                      prefix="$"
                      value={field.value != null ? String(field.value) : ""}
                      onChange={(v) => field.onChange(v ? parseFloat(v) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for adjustment</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="E.g. Meter reading correction, reversal of previous entry..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <div className="text-xs text-muted-foreground mt-1">
                    {field.value.length}/{500} characters (minimum 10)
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Recording..." : "Record adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
