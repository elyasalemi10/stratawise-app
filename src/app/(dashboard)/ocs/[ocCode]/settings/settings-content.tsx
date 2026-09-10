"use client";

import { useState, useCallback } from "react";
import { EmailLog } from "@/components/shared/email-log";
import { TagSettings } from "@/components/shared/tag-settings";
import { getOCEmailLog } from "@/lib/actions/email-log";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LevyAutosendSchedule } from "@/lib/actions/levy-autosend";
import { Badge } from "@/components/ui/badge";
import { OCFollowupCard } from "./oc-followup-card";
import Link from "next/link";
import { useOCCode } from "@/lib/oc-context";
import { formatDateLong } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface OCData {
  id: string;
  name: string;
  address: string;
  plan_number: string;
  status: string;
  oc_tier: number | null;
  total_lots: number;
  common_property_description: string | null;
  rules_type: string;
  financial_year_start_month: number;
  billing_cycle: string;
  is_developer_period: boolean;
  abn?: string | null;
  tfn?: string | null;
  common_seal_text?: string | null;
  inspection_address?: string | null;
  // Wizard-redesign additions.
  annual_interest_rate_percent?: number | null;
  interest_free_period_days?: number | null;
  early_payment_incentive_percent?: number | null;
  arrears_action_threshold_cents?: number | null;
  levy_calculation_basis?: string | null;
  default_delivery_method?: string | null;
  meetings_postal_buffer_days?: number | null;
  levies_postal_buffer_days?: number | null;
  financial_postal_buffer_days?: number | null;
  /** When true, levy notice PDFs include an "arrears as of {bank import
   *  date}" line. Default false , managers opt in. */
  include_arrears_on_notice?: boolean | null;
  /** Per-OC auto multi-lot note. When on, owners with 2+ lots get an
   *  automatic note on each levy notice. */
  multilot_note_enabled?: boolean | null;
  multilot_note_text?: string | null;
  /** Banking , trust account details printed on EFT instructions. */
  bank_bsb?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
}

// "2026-08-01" -> "first of August 2026" , reads more like prose
// than ISO. Used in the auto-send "Next run will be on the X" line.
import type { OCSettingsSection } from "./nav";
import { OCField, OCReadonly, type OCFieldProps } from "./oc-field";

export function SettingsContent({
  section,
  oc: initial,
  autosend,
}: {
  section: OCSettingsSection;
  oc: OCData;
  autosend: LevyAutosendSchedule;
}) {
  const [oc, setOC] = useState(initial);

  // A saved field patches the local copy so the page reflects it without a
  // refetch. Booleans come back as booleans, everything else as a string.
  function patch(key: string, value: string | boolean) {
    setOC((prev) => ({ ...prev, [key]: value === "" ? null : value } as OCData));
  }

  const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
  const billingOptions = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "half_yearly", label: "Half-yearly" },
    { value: "annually", label: "Annually" },
  ];
  const rulesOptions = [
    { value: "model", label: "Model rules" },
    { value: "custom", label: "Custom rules" },
  ];
  const levyBasisOptions = [
    { value: "lot_liability", label: "Lot liability (standard)" },
    { value: "equal_per_lot", label: "Equal per lot" },
    { value: "custom_apportionment", label: "Custom apportionment" },
  ];
  const deliveryOptions = [
    { value: "postal", label: "Postal only" },
    { value: "mixed", label: "Mixed" },
    { value: "email", label: "Email by default" },
  ];

  // Which section shows is the URL's business, not this component's.
  const activeTab = section;

  // Stable across renders: EmailLog re-fetches whenever `load` changes, and
  // an inline arrow would make that every render.
  const loadOCEmailLog = useCallback(
    (page: number) => getOCEmailLog(oc.id, page),
    [oc.id],
  );

  const field = (props: Omit<OCFieldProps, "ocId" | "onSaved">) => (
    <OCField key={props.fieldKey} ocId={oc.id} onSaved={patch} {...props} />
  );

  return (
    <div className="space-y-6">
      {activeTab === "general" && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">General details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field({ fieldKey: "name", label: "Name", type: "text", value: oc.name })}
                {field({ fieldKey: "plan_number", label: "Plan number", type: "text", value: oc.plan_number })}
                {field({ fieldKey: "address", label: "Address", type: "text", value: oc.address, wide: true })}
                {field({ fieldKey: "abn", label: "ABN", type: "text", value: oc.abn })}
                {field({ fieldKey: "tfn", label: "TFN", type: "text", value: oc.tfn })}
                <OCReadonly label="OC Tier" value={oc.oc_tier ? `Tier ${oc.oc_tier}` : ""} />
                <OCReadonly label="Total lots" value={oc.total_lots ?? ""} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Certificate settings</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field({ fieldKey: "common_seal_text", label: "Common seal text", type: "textarea", value: oc.common_seal_text, wide: true })}
                {field({ fieldKey: "inspection_address", label: "Inspection address", type: "text", value: oc.inspection_address, wide: true })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Common property description</h3>
              {field({ fieldKey: "common_property_description", label: "Common property description", type: "textarea", value: oc.common_property_description, wide: true, hideLabel: true })}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "financial" && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Financial settings</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {field({ fieldKey: "financial_year_start_month", label: "Financial year starts", type: "select", value: String(oc.financial_year_start_month ?? 7), options: monthOptions })}
              {field({ fieldKey: "billing_cycle", label: "Billing cycle", type: "select", value: oc.billing_cycle, options: billingOptions })}
              {field({ fieldKey: "rules_type", label: "Rules type", type: "select", value: oc.rules_type, options: rulesOptions })}
              {field({ fieldKey: "levy_calculation_basis", label: "Levy calculation basis", type: "select", value: oc.levy_calculation_basis ?? "lot_liability", options: levyBasisOptions })}
              {field({ fieldKey: "early_payment_incentive_percent", label: "Early payment incentive", type: "number", value: oc.early_payment_incentive_percent ?? 0, suffix: "%" })}
              {field({ fieldKey: "annual_interest_rate_percent", label: "Annual interest rate", type: "number", value: oc.annual_interest_rate_percent ?? 0, suffix: "%" })}
              {field({ fieldKey: "interest_free_period_days", label: "Interest-free period", type: "number", value: oc.interest_free_period_days ?? 28, allowDecimal: false, suffix: "days" })}
              {field({ fieldKey: "arrears_action_threshold_cents", label: "Arrears action threshold", type: "number", value: oc.arrears_action_threshold_cents ?? 5000, allowDecimal: false, suffix: "cents" })}
              {field({ fieldKey: "include_arrears_on_notice", label: "Include arrears on levy notices", type: "boolean", value: !!oc.include_arrears_on_notice, wide: true })}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "communications" && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Delivery</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field({ fieldKey: "default_delivery_method", label: "Default delivery method", type: "select", value: oc.default_delivery_method ?? "postal", options: deliveryOptions })}
                {field({ fieldKey: "meetings_postal_buffer_days", label: "Meetings postal buffer", type: "number", value: oc.meetings_postal_buffer_days ?? 14, allowDecimal: false, suffix: "days" })}
                {field({ fieldKey: "levies_postal_buffer_days", label: "Levies postal buffer", type: "number", value: oc.levies_postal_buffer_days ?? 14, allowDecimal: false, suffix: "days" })}
                {field({ fieldKey: "financial_postal_buffer_days", label: "Financial documents postal buffer", type: "number", value: oc.financial_postal_buffer_days ?? 14, allowDecimal: false, suffix: "days" })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Levy notice content</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field({ fieldKey: "multilot_note_enabled", label: "Add note for multi-lot owners", type: "boolean", value: !!oc.multilot_note_enabled, wide: true })}
                {oc.multilot_note_enabled &&
                  field({ fieldKey: "multilot_note_text", label: "Multi-lot note text", type: "textarea", value: oc.multilot_note_text, wide: true })}
              </div>
            </CardContent>
          </Card>

          {/* Every message this OC has sent. It was all being recorded, and
              the provider was reporting delivery back through the webhook,
              but there was nowhere to read any of it: "did the owner get
              their notice" could only be answered from Resend's dashboard. */}
          {/* Tags are the firm's filing vocabulary, so they live with the
              firm's other settings rather than per OC. Managers can also
              create one from a document card, which is where filing
              actually happens; this is for seeing the whole list and
              clearing out duplicates. */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Document tags</h3>
              <TagSettings />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Email log</h3>
              <EmailLog
                load={loadOCEmailLog}
                emptyDescription="Nothing has been emailed for this Owners Corporation yet. Levy notices, meeting notices and reminders will appear here as they go out."
              />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "banking" && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Trust account details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {field({ fieldKey: "bank_account_name", label: "Account name", type: "text", value: oc.bank_account_name, wide: true })}
              {field({ fieldKey: "bank_bsb", label: "BSB", type: "text", value: oc.bank_bsb })}
              {field({ fieldKey: "bank_account_number", label: "Account number", type: "text", value: oc.bank_account_number })}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "automation" && (
        <AutomationsTab ocId={oc.id} autosend={autosend} />
      )}
    </div>
  );
}

// ─── Automation tab ────────────────────────────────────────────────
// The levy schedule used to be edited here, in a table with exactly one row
// and a generic label. It is not a setting: it decides when levy notices go
// out and from which budget, and the Levies page is the record of that
// having happened, so it is edited there, directly above the batches it
// produces. What stays here is the answer to "is it on?", which is a
// reasonable thing to ask of a settings page without it being the place you
// turn it on.
function AutomationsTab({
  ocId,
  autosend,
}: {
  ocId: string;
  autosend: LevyAutosendSchedule;
}) {
  const ocCode = useOCCode();
  const on = autosend.enabled && !!autosend.next_send_date;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Levy schedule</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {autosend.last_error
                ? "The last scheduled run did not go out."
                : on
                  ? `Next run ${formatDateLong(autosend.next_send_date!)}.`
                  : "Levies are not on a schedule."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Badge
              variant={autosend.last_error ? "destructive" : on ? "success" : "neutral"}
            >
              {autosend.last_error ? "Error" : on ? "On" : "Off"}
            </Badge>
            <Link href={`/ocs/${ocCode}/levies`}>
              <Button variant="secondary" size="sm">
                Open Levies
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Per-OC levy follow-up: inherits the company default unless overridden. */}
      <OCFollowupCard ocId={ocId} />
    </div>
  );
}
