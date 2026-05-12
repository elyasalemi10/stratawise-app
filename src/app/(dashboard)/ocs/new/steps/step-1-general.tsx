"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { step1Schema, type Step1Values } from "@/lib/validations/oc-wizard";
import { createOCStep1, updateOCStep1 } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { StateSuburbSelect } from "@/components/shared/state-suburb-select";
import { DatePicker } from "@/components/shared/date-picker";
import { format } from "date-fns";

const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Step1General({
  onNext,
  onCancel,
  initialData,
}: {
  onNext: (ocId: string) => void;
  onCancel: () => void;
  initialData?: any;
}) {
  const [pending, setPending] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(initialData?.state ?? "VIC");
  const [suburb, setSuburb] = useState(initialData?.suburb ?? "");
  const [suburbError, setSuburbError] = useState("");
  const [postcode, setPostcode] = useState(initialData?.postcode ?? "");
  const [postcodeError, setPostcodeError] = useState("");
  const [startDate, setStartDate] = useState(initialData?.management_start_date ?? format(new Date(), "yyyy-MM-dd"));
  const [startDateError, setStartDateError] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Step1Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(step1Schema) as any,
    defaultValues: {
      plan_number: initialData?.plan_number ?? "",
      management_start_date: initialData?.management_start_date ?? format(new Date(), "yyyy-MM-dd"),
      name: initialData?.name ?? "",
      street_number: initialData?.street_number ?? "",
      street_name: initialData?.street_name ?? "",
      state: initialData?.state ?? "VIC",
      suburb: initialData?.suburb ?? "",
      postcode: initialData?.postcode ?? "",
      common_property_description: initialData?.common_property_description ?? "",
      abn: initialData?.abn ?? "",
      tfn: initialData?.tfn ?? "",
    },
  });

  async function onSubmit(data: Step1Values) {
    const problems: string[] = [];
    if (!suburb) {
      setSuburbError("Please select a suburb");
      problems.push("Select a suburb");
    } else {
      setSuburbError("");
    }
    if (!/^\d{4}$/.test(postcode)) {
      setPostcodeError("Postcode must be 4 digits");
      problems.push("Postcode must be 4 digits");
    } else {
      setPostcodeError("");
    }
    if (!startDate) {
      setStartDateError("Start date is required");
      problems.push("Start date is required");
    } else {
      setStartDateError("");
    }
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const formData = { ...data, suburb, postcode, management_start_date: startDate };

    // If we have initialData (editing), update instead of create
    const existingId = initialData?.id;
    const result = existingId
      ? await updateOCStep1(existingId, formData)
      : await createOCStep1(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.ocId) {
      onNext(result.ocId);
    }
  }

  const selectClass =
    "flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
      {/* Plan number */}
      <div className="space-y-1.5">
        <Label htmlFor="plan_number">
          Plan of subdivision number <span className="text-destructive">*</span>
        </Label>
        <Input
          id="plan_number"
          placeholder="PS123456A"
          autoComplete="off"
          className="uppercase"
          aria-invalid={!!errors.plan_number}
          {...register("plan_number")}
          onChange={(e) => {
            e.target.value = e.target.value.toUpperCase();
            register("plan_number").onChange(e);
          }}
        />
        {errors.plan_number && (
          <p className="text-xs text-destructive mt-1">{errors.plan_number.message}</p>
        )}
      </div>

      {/* Start date — shadcn Calendar picker */}
      <div className="space-y-1.5">
        <Label>
          Management start date <span className="text-destructive">*</span>
        </Label>
        <DatePicker
          value={startDate}
          onChange={(val) => {
            setStartDate(val);
            setValue("management_start_date", val);
            setStartDateError("");
          }}
          error={!!startDateError}
        />
        {startDateError && (
          <p className="text-xs text-destructive mt-1">{startDateError}</p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">
          OC name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          placeholder="Riverside Townhouses"
          autoComplete="off"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
        )}
      </div>

      {/* Street number + name */}
      <div className="grid grid-cols-[120px_1fr] gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="street_number">
            Street no. <span className="text-destructive">*</span>
          </Label>
          <Input
            id="street_number"
            placeholder="56-58"
            autoComplete="off"
            aria-invalid={!!errors.street_number}
            {...register("street_number")}
          />
          {errors.street_number && (
            <p className="text-xs text-destructive mt-1">{errors.street_number.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="street_name">
            Street name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="street_name"
            placeholder="Test Road"
            autoComplete="off"
            aria-invalid={!!errors.street_name}
            {...register("street_name")}
          />
          {errors.street_name && (
            <p className="text-xs text-destructive mt-1">{errors.street_name.message}</p>
          )}
        </div>
      </div>

      {/* Suburb + state + postcode (single row) */}
      <div className="grid grid-cols-[1fr_120px_140px] gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="suburb">
            Suburb <span className="text-destructive">*</span>
          </Label>
          <StateSuburbSelect
            state={selectedState}
            value={suburb}
            onChange={(val) => {
              setSuburb(val);
              setValue("suburb", val);
              setSuburbError("");
            }}
            error={!!suburbError || !!errors.suburb}
            id="suburb"
          />
          {(suburbError || errors.suburb) && (
            <p className="text-xs text-destructive mt-1">{suburbError || errors.suburb?.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">
            State <span className="text-destructive">*</span>
          </Label>
          <select
            id="state"
            className={selectClass}
            {...register("state", {
              onChange: (e) => {
                setSelectedState(e.target.value || null);
                setSuburb("");
                setValue("suburb", "");
              },
            })}
          >
            {STATES.map((s) => (
              <option key={s} value={s} disabled={s !== "VIC"}>
                {s}{s !== "VIC" ? " (soon)" : ""}
              </option>
            ))}
          </select>
          {errors.state && (
            <p className="text-xs text-destructive mt-1">{errors.state.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postcode">
            Postcode <span className="text-destructive">*</span>
          </Label>
          <Input
            id="postcode"
            placeholder="3000"
            inputMode="numeric"
            maxLength={4}
            value={postcode}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPostcode(v);
              setValue("postcode", v);
              if (postcodeError) setPostcodeError("");
            }}
            aria-invalid={!!postcodeError || !!errors.postcode}
          />
          {(postcodeError || errors.postcode) && (
            <p className="text-xs text-destructive mt-1">{postcodeError || errors.postcode?.message}</p>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe the common property..."
          rows={3}
          {...register("common_property_description")}
        />
      </div>

      {/* ABN + TFN */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="abn">ABN</Label>
          <Input id="abn" placeholder="12 345 678 901" autoComplete="off" {...register("abn")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tfn">TFN</Label>
          <Input id="tfn" placeholder="123 456 789" autoComplete="off" {...register("tfn")} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending ? <><Spinner className="mr-2" /> Continue</> : "Continue"}
        </Button>
      </div>
    </form>
  );
}
