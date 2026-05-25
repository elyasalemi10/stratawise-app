/**
 * Shared types for PDF template props.
 */

export interface ManagementCompany {
  name: string;
  logo_url?: string | null;
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

export interface BudgetReportProps extends BaseDocumentProps {
  financialYear: string;
  fundLabel: string;
  status: "draft" | "approved";
  approvedAt: string | null;
  approvalNote: string | null;
  items: BudgetReportItem[];
  totalAmount: number;
  brandColors?: BrandColors;
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
