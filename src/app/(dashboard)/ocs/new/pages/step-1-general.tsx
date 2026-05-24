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
import { WizardActions } from "./_components/wizard-actions";

// Wizard Step 1 sub-step 1 , General.

const PS_MAX = 20; // Spec: allow PS Number up to 20 chars (was 9).

function InlineYesNoToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  // Toggle circle on the LEFT, Yes/No text on the right. Reads as a
  // sentence next to the field's label (which sits to the left of this
  // button in the row).
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-2.5 rounded-md border px-3 h-9 cursor-pointer transition-colors w-[120px] ${
        value ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40"
      }`}
    >
      <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-border"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
      <span className="text-sm">{value ? "Yes" : "No"}</span>
    </button>
  );
}

export function Step1General({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: (patch?: Partial<DraftJson>) => void;
}) {
  const [planNumber, setPlanNumber] = useState(initialDraft.plan_number ?? "");
  const [planNumberInvalid, setPlanNumberInvalid] = useState(false);
  const [ocNumber, setOcNumber] = useState<string>(
    initialDraft.oc_number != null ? String(initialDraft.oc_number) : "",
  );
  const [ocNumberInvalid, setOcNumberInvalid] = useState(false);

  const [buildingName, setBuildingName] = useState(
    initialDraft.building_name ?? initialDraft.trading_name ?? "",
  );

  const [address, setAddress] = useState<ParsedAddress>({
    street_number: initialDraft.street_number ?? "",
    street_name: initialDraft.street_name ?? "",
    suburb: initialDraft.suburb ?? "",
    state: "VIC",
    postcode: initialDraft.postcode ?? "",
    formatted: initialDraft.address ?? "",
  });
  const [addressInvalid, setAddressInvalid] = useState(false);

  const [managementStartDate, setManagementStartDate] = useState<string>(
    initialDraft.manager_appointment_date ?? "",
  );
  const [managementStartDateInvalid, setManagementStartDateInvalid] = useState(false);

  const [gstRegistered, setGstRegistered] = useState<boolean>(initialDraft.gst_registered ?? false);
  const [abn, setAbn] = useState<string>(initialDraft.abn ?? "");
  const [abnInvalid, setAbnInvalid] = useState(false);
  const [tfn, setTfn] = useState<string>(initialDraft.tfn ?? "");
  const [tfnInvalid, setTfnInvalid] = useState(false);

  const [pending, setPending] = useState(false);

  async function onContinue() {
    const problems: string[] = [];

    if (!planNumber.trim()) {
      problems.push("PS Number is required.");
      setPlanNumberInvalid(true);
    } else if (planNumber.trim().length > PS_MAX) {
      problems.push(`PS Number must be ${PS_MAX} characters or fewer.`);
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

    // Background save , fire the saveStep without awaiting so the next
    // step renders instantly. The same patch is merged into the wizard's
    // local draft via onNext(patch) so the next step's initialDraft is
    // fresh without a re-fetch. Errors surface via toast; the auto-save
    // heartbeat in WizardActions catches any dropped write.
    const patch = {
      plan_number: planNumber.toUpperCase(),
      oc_number: ocNumberParsed,
      building_name: buildingName.trim() || undefined,
      trading_name: buildingName.trim() || undefined,
      address: address.formatted,
      street_number: address.street_number,
      street_name: address.street_name,
      suburb: address.suburb,
      state: "VIC" as const,
      postcode: address.postcode,
      manager_appointment_date: managementStartDate,
      gst_registered: gstRegistered,
      abn: abnDigits || undefined,
      tfn: gstRegistered ? (tfn.replace(/\s+/g, "") || undefined) : undefined,
    };
    void saveStep(draftId, patch, 1, 2).then((r) => {
      if (r.error) toast.error(r.error);
    });
    onNext(patch);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">General</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_140px] gap-4">
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
              maxLength={PS_MAX}
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
              invalid={ocNumberInvalid}
              prefix="OC-"
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="management-start-date">
            Management start date <span className="text-destructive">*</span>
          </Label>
          <DatePicker
            id="management-start-date"
            value={managementStartDate}
            onChange={(v) => { setManagementStartDate(v); if (managementStartDateInvalid) setManagementStartDateInvalid(false); }}
            error={managementStartDateInvalid}
          />
        </div>

        {/* GST as a flat inline-toggle row (matching other fields), then ABN +
            TFN as their own labelled inputs in the grid below. */}
        <div className="flex items-center gap-3">
          <Label htmlFor="gst-toggle">GST Registered</Label>
          <InlineYesNoToggle value={gstRegistered} onChange={setGstRegistered} />
        </div>

        <div className="grid grid-cols-2 gap-4">
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
        </div>
      </div>

      <WizardActions
        draftId={draftId}
        onBack={onBack}
        onContinue={onContinue}
        continuePending={pending}
        getCurrentPatch={() => ({
          plan_number: planNumber.trim() ? planNumber.toUpperCase() : undefined,
          oc_number: ocNumber.trim() ? parseInt(ocNumber, 10) : undefined,
          building_name: buildingName.trim() || undefined,
          trading_name: buildingName.trim() || undefined,
          address: address.formatted,
          street_number: address.street_number,
          street_name: address.street_name,
          suburb: address.suburb,
          state: "VIC",
          postcode: address.postcode,
          manager_appointment_date: managementStartDate || undefined,
          gst_registered: gstRegistered,
          abn: abn.replace(/\s+/g, "").trim() || undefined,
          tfn: gstRegistered ? (tfn.replace(/\s+/g, "") || undefined) : undefined,
        })}
      />
    </div>
  );
}
