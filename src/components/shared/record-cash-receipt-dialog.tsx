"use client";

import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordCashReceiptSchema, type RecordCashReceiptInput } from "@/lib/validations/reconciliation";
import { recordCashReceipt, getOCLotsForAllocation } from "@/lib/actions/reconciliation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ocId: string;
  bankAccountId: string;
  bankAccountName: string;
  fundType: "administrative" | "capital_works" | "maintenance_plan";
  defaultLotId?: string;
  onSuccess: () => void;
}

export function RecordCashReceiptDialog({
  open,
  onOpenChange,
  ocId,
  bankAccountId,
  bankAccountName,
  fundType,
  defaultLotId,
  onSuccess,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [lots, setLots] = useState<Awaited<ReturnType<typeof getOCLotsForAllocation>>>([]);
  const [lotOpen, setLotOpen] = useState(false);

  const form = useForm<RecordCashReceiptInput>({
    resolver: zodResolver(recordCashReceiptSchema),
    defaultValues: {
      oc_id: ocId,
      lot_id: defaultLotId ?? "",
      bank_account_id: bankAccountId,
      fund_type: fundType,
      amount: undefined,
      received_date: new Date().toISOString().slice(0, 10),
      payment_method: "cash",
      cheque_number: null,
      description: null,
    },
  });

  const paymentMethod = form.watch("payment_method");

  const onSubmit = async (data: RecordCashReceiptInput) => {
    setIsSubmitting(true);
    try {
      await recordCashReceipt(data);
      toast.success("Receipt recorded successfully");
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record receipt";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const selectedLotId = form.watch("lot_id");
  const selectedLot = lots.find((l) => l.id === selectedLotId);
  const lotLabel = selectedLot ? `Lot ${selectedLot.lot_number}${selectedLot.unit_number ? ` — Unit ${selectedLot.unit_number}` : ""}` : "Select a lot";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record cash/cheque receipt</DialogTitle>
          <DialogDescription>
            Log cash or cheque received from a lot owner.
            Account: <span className="font-medium">{bankAccountName}</span>
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

            {/* Date */}
            <FormField
              control={form.control}
              name="received_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date received</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Payment method */}
            <FormField
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment method</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cheque number (conditional) */}
            {paymentMethod === "cheque" && (
              <FormField
                control={form.control}
                name="cheque_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cheque number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 123456" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
                      <NumberInput
                        placeholder="Amount"
                        className="pl-6"
                        value={field.value != null ? String(field.value) : ""}
                        onChange={(v) => field.onChange(v ? parseFloat(v) : undefined)}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Recording..." : "Record receipt"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
