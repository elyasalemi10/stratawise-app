/**
 * Shared types for PDF template props.
 */

export interface ManagementCompany {
  name: string;
  logo_url?: string | null;
  /** Optional contact lines printed under the logo on report PDFs. */
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  abn?: string | null;
}

export interface OC {
  name: string;
  address: string;
  abn?: string | null;
  plan_number: string;
}

export interface BaseDocumentProps {
  managementCompany: ManagementCompany;
  oc: OC;
  documentTitle: string;
  referenceNumber: string;
  date: Date;
}

// --- Levy Notice ---

export interface LotOwner {
  name: string;
  lot_number: string;
  address: string;
}

export interface LevyLineItem {
  description: string;
  amount: number;
}

export interface PaymentInstructions {
  bpay?: {
    biller_code: string;
    reference: string;
  } | null;
  eft: {
    bsb: string;
    account_number: string;
    account_name: string;
    reference: string;
  };
}

export interface OutstandingBalance {
  reference: string;
  period: string;
  amount: number;
}

export interface BrandColors {
  primary: string;   // used for subtotal/GST row bg and due date text
  secondary: string; // used for accents
}

export interface LevyNoticeProps extends BaseDocumentProps {
  lotOwner: LotOwner;
  levyPeriod: { start: string; end: string };
  lineItems: LevyLineItem[];
  totalDue: number;
  dueDate: string;
  paymentInstructions: PaymentInstructions;
  outstandingBalances?: OutstandingBalance[];
  includeGst?: boolean;
  note?: string;
  penaltyInterestRate?: number;
  brandColors?: BrandColors;
  /** Optional arrears summary printed under the period total. Only set
   *  when the OC opts in via include_arrears_on_notice. asOf carries the
   *  bank-import date so the owner knows the figure is point-in-time. */
  priorArrears?: {
    amount: number;
    asOf: string;
  } | null;
  /** Optional "Reason / Note" text for special levies. Rendered as a
   *  quote-style block at the top of the notice (accent left border)
   *  so the owner sees what this one-off raise is funding. */
  specialReason?: string | null;
}

// --- Budget Report ---

export interface BudgetReportItem {
  code: string | null;
  name: string;
  description: string | null;
  amount: number;
  /** Optional fund this item belongs to. Drives the multi-fund split in
   *  the PDF: when items in `items` carry more than one distinct
   *  `fund_type`, the report renders one section per fund with a
   *  separator rule between them. */
  fund_type?: "administrative" | "capital_works" | "maintenance_plan" | null;
}

export interface BudgetReportLot {
  lot_number: number;
  unit_number?: string | null;
  liability: number;
}

export interface BudgetReportProps extends BaseDocumentProps {
  financialYear: string;
  fundLabel: string;
  status: "draft" | "approved";
  approvedAt: string | null;
  approvalNote: string | null;
  items: BudgetReportItem[];
  totalAmount: number;
  brandColors?: BrandColors;
  /** Per-lot allocation inputs. When provided, the PDF renders a "Lot contributions"
   *  section that splits each fund's total in proportion to lot liability. Lot rows
   *  use lot numbers only (no owner names), so the document stays accurate as
   *  ownership changes. */
  lots?: BudgetReportLot[];
  /** OC billing cycle (monthly / quarterly / half_yearly / annually) , drives the
   *  per-period column in the lot contributions table. */
  billingCycle?: "monthly" | "quarterly" | "half_yearly" | "annually" | string;
}

// --- Meeting Minutes ---

export interface Attendee {
  name: string;
  lot_number?: string;
  type: "present" | "proxy" | "apology";
  proxy_for?: string;
}

export interface VoteTally {
  for: number;
  against: number;
  abstain: number;
}

export interface AgendaItem {
  number: string;
  title: string;
  motion?: string;
  moved_by?: string;
  seconded_by?: string;
  vote?: VoteTally;
  result?: "PASSED" | "FAILED";
  notes?: string;
}

export interface ActionItem {
  description: string;
  assigned_to: string;
  due_date?: string;
}

export interface MeetingMinutesProps extends BaseDocumentProps {
  meetingType: "AGM" | "SGM" | "Committee";
  meetingDate: string;
  meetingTime: string;
  location: string;
  attendees: Attendee[];
  quorumMet: boolean;
  quorumDetails?: string;
  agendaItems: AgendaItem[];
  actionItems?: ActionItem[];
  nextMeetingDate?: string;
}
