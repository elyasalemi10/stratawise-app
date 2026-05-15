"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/shared/date-picker";
import { VicAddressAutocomplete, type ParsedAddress } from "@/components/shared/vic-address-autocomplete";
import { saveStep, type DraftJson } from "../actions";

// Wizard Step 1 — General.
//
// Captures the OC's identity (plan + OC number + building name), site
// address, management contract start date, and tax registration state
// (GST / ABN / TFN). Sub-step 1.1 (Management fee) is rendered by its
// own file; this step advances to (step=1, sub=1) on Continue.

const PS_REGEX = /^PS\d{6}[A-Z]$/;

export function Step1General({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: () => void;
}) {
  // PS / OC number.
  const [planNumber, setPlanNumber] = useState(initialDraft.plan_number ?? "");
  const [planNumberInvalid, setPlanNumberInvalid] = useState(false);
  const [ocNumber, setOcNumber] = useState<string>(
    initialDraft.oc_number != null ? String(initialDraft.oc_number) : "",
  );
  const [ocNumberInvalid, setOcNumberInvalid] = useState(false);

  // Building name (was Title / trading_name).
  const [buildingName, setBuildingName] = useState(
    initialDraft.building_name ?? initialDraft.trading_name ?? "",
  );

  // Address — VicAddressAutocomplete auto-picks `manual` mode when the value
  // already has any address part populated (i.e. AI prefilled). Otherwise it
  // starts in search mode with an "Enter manually" link to reveal the 5
  // fields. Matches the spec exactly without us having to add a prop.
  const [address, setAddress] = useState<ParsedAddress>({
    street_number: initialDraft.street_number ?? "",
    street_name: initialDraft.street_name ?? "",
    suburb: initialDraft.suburb ?? "",
    state: "VIC",
    postcode: initialDraft.postcode ?? "",
    formatted: initialDraft.address ?? "",
  });
  const [addressInvalid, setAddressInvalid] = useState(false);

  // Management start date — required.
  const [managementStartDate, setManagementStartDate] = useState<string>(
    initialDraft.manager_appointment_date ?? "",
  );
  const [managementStartDateInvalid, setManagementStartDateInvalid] = useState(false);

  // GST toggle. Defaults No. When Yes, ABN + TFN are both required.
  const [gstRegistered, setGstRegistered] = useState<boolean>(initialDraft.gst_registered ?? false);

  // ABN — digits + spaces while typing; normalised to 11 digits on submit.
  const [abn, setAbn] = useState<string>(initialDraft.abn ?? "");
  const [abnInvalid, setAbnInvalid] = useState(false);

  // TFN — digits only; stored as plaintext on the draft, encrypted on the
  // OC row at completeWizard time (pgcrypto). 8 or 9 digits per ATO.
  const [tfn, setTfn] = useState<string>(initialDraft.tfn ?? "");
  const [tfnInvalid, setTfnInvalid] = useState(false);

  const [pending, setPending] = useState(false);

  async function onContinue() {
    const problems: string[] = [];

    if (!planNumber.trim()) {
      problems.push("PS Number is required.");
      setPlanNumberInvalid(true);
    } else if (!PS_REGEX.test(planNumber.toUpperCase())) {
      problems.push('PS Number format is "PS" + 6 digits + 1 letter (e.g. PS812345X).');
      setPlanNumberInvalid(true);
    } else {
      setPlanNumberInvalid(false);
    }

    const ocNumberParsed = parseInt(ocNumber, 10);
    if (!ocNumber.trim() || !Number.isFinite(ocNumberParsed) || ocNumberParsed < 1) {
      problems.push("OC Number is required.");
      setOcNumberInvalid(true);
    } else {
      setOcNumberInvalid(false);
    }

    const a = address;
    const missingAddressParts: string[] = [];
    if (!a.street_number?.trim()) missingAddressParts.push("street number");
    if (!a.street_name?.trim()) missingAddressParts.push("street name");
    if (!a.suburb?.trim()) missingAddressParts.push("suburb");
    if (!a.postcode?.trim()) missingAddressParts.push("postcode");
    if (missingAddressParts.length > 0) {
      problems.push(`Address is missing: ${missingAddressParts.join(", ")}.`);
      setAddressInvalid(true);
    } else {
      setAddressInvalid(false);
    }

    if (!managementStartDate) {
      problems.push("Management start date is required.");
      setManagementStartDateInvalid(true);
    } else {
      setManagementStartDateInvalid(false);
    }

    const abnDigits = abn.replace(/\s+/g, "").trim();
    if (gstRegistered) {
      if (abnDigits.length === 0) {
        problems.push("ABN is required when the OC is registered for GST.");
        setAbnInvalid(true);
      } else if (!/^\d{11}$/.test(abnDigits)) {
        problems.push("ABN must be 11 digits.");
        setAbnInvalid(true);
      } else {
        setAbnInvalid(false);
      }
      const tfnDigits = tfn.replace(/\s+/g, "");
      if (!tfnDigits) {
        problems.push("TFN is required when the OC is registered for GST.");
        setTfnInvalid(true);
      } else if (!/^\d{8,9}$/.test(tfnDigits)) {
        problems.push("TFN must be 8 or 9 digits.");
        setTfnInvalid(true);
      } else {
        setTfnInvalid(false);
      }
    } else {
      // Not GST-registered: validate ABN shape only if typed.
      if (abnDigits.length > 0 && !/^\d{11}$/.test(abnDigits)) {
        problems.push("ABN must be 11 digits.");
        setAbnInvalid(true);
      } else {
        setAbnInvalid(false);
      }
      setTfnInvalid(false);
    }

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const r = await saveStep(draftId, {
      plan_number: planNumber.toUpperCase(),
      oc_number: ocNumberParsed,
      building_name: buildingName.trim() || undefined,
      trading_name: buildingName.trim() || undefined,
      address: address.formatted,
      street_number: address.street_number,
      street_name: address.street_name,
      suburb: address.suburb,
      state: "VIC",
      postcode: address.postcode,
      manager_appointment_date: managementStartDate,
      gst_registered: gstRegistered,
      abn: abnDigits || undefined,
      tfn: gstRegistered ? (tfn.replace(/\s+/g, "") || undefined) : undefined,
    }, 1, 1); // Advance to sub-step 1.1 (Management fee).
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">General</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ps-number">
              PS Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ps-number"
              placeholder="Plan-of-subdivision number"
              value={planNumber}
              onChange={(e) => {
                setPlanNumber(e.target.value.toUpperCase());
                if (planNumberInvalid) setPlanNumberInvalid(false);
              }}
              maxLength={9}
              aria-invalid={planNumberInvalid || undefined}
              className="uppercase placeholder:normal-case"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oc-number">
              OC Number <span className="text-destructive">*</span>
            </Label>
            <NumberInput
              id="oc-number"
              allowDecimal={false}
              value={ocNumber}
              onChange={(v) => { setOcNumber(v); if (ocNumberInvalid) setOcNumberInvalid(false); }}
              placeholder="Owners Corporation number"
              invalid={ocNumberInvalid}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="building-name">Building name</Label>
          <Input
            id="building-name"
            placeholder="Friendly building or development name"
            value={buildingName}
            onChange={(e) => setBuildingName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">
            Address <span className="text-destructive">*</span>
          </Label>
          <VicAddressAutocomplete
            id="address"
            value={address}
            onChange={(v) => { setAddress(v); if (addressInvalid) setAddressInvalid(false); }}
            error={addressInvalid}
          />
          {addressInvalid && (
            <p className="text-xs text-destructive">
              Address must include street number, street name, suburb, and postcode.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="management-start-date">
            Management start date <span className="text-destructive">*</span>
          </Label>
          <DatePicker
            value={managementStartDate}
            onChange={(v) => { setManagementStartDate(v); if (managementStartDateInvalid) setManagementStartDateInvalid(false); }}
            error={managementStartDateInvalid}
          />
        </div>

        {/* GST toggle + dependent ABN / TFN. Same pill pattern used elsewhere
            in the wizard for boolean attestations. */}
        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">GST registered</p>
            </div>
            <button
              type="button"
              onClick={() => setGstRegistered((v) => !v)}
              className={`flex items-center justify-between rounded-md border px-3 h-9 cursor-pointer transition-colors min-w-[180px] ${
                gstRegistered ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              <span className="text-sm">{gstRegistered ? "Yes" : "No"}</span>
              <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${gstRegistered ? "bg-primary" : "bg-border"}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${gstRegistered ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tfn">
                TFN {gstRegistered && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="tfn"
                placeholder="Tax file number"
                value={tfn}
                onChange={(e) => {
                  setTfn(e.target.value.replace(/[^\d ]/g, ""));
                  if (tfnInvalid) setTfnInvalid(false);
                }}
                inputMode="numeric"
                maxLength={12}
                aria-invalid={tfnInvalid || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="abn">
                ABN {gstRegistered && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="abn"
                placeholder="11-digit ABN"
                value={abn}
                onChange={(e) => {
                  setAbn(e.target.value.replace(/[^\d ]/g, ""));
                  if (abnInvalid) setAbnInvalid(false);
                }}
                inputMode="numeric"
                maxLength={14}
                aria-invalid={abnInvalid || undefined}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
