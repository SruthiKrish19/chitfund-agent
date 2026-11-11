export type DrawMode = "lottery" | "auction";
export type Cadence = "MONTH" | "WEEK";

export interface Member {
  id: string;
  name: string;
  email: string;
  /** cycle index (1-based) in which this member won the pot, if any */
  wonCycle?: number;
  /** PayPal recurring invoice series for this member's contributions */
  recurringSeriesId?: string;
}

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "REMINDED" | "FAILED";

export interface MemberInvoice {
  memberId: string;
  invoiceId?: string;
  status: InvoiceStatus;
  amount: number;
  reminders: number;
  paidAt?: string;
  error?: string;
}

export type PayoutStatus = "PAID" | "PENDING_REGION" | "FAILED" | "NOT_RUN";

export interface Cycle {
  index: number; // 1-based
  label: string; // e.g. "Dec 2026"
  startedAt: string;
  invoices: MemberInvoice[];
  pot: number;
  collected: number;
  winnerId?: string;
  drawMode: DrawMode;
  /** auction only: discount the winner accepted, redistributed as dividend */
  auctionDiscount?: number;
  dividendPerMember?: number;
  payout: {
    status: PayoutStatus;
    amount: number;
    batchId?: string;
    message?: string;
  };
  closedAt?: string;
}

export interface LedgerEntry {
  id: string;
  at: string;
  cycle?: number;
  memberId?: string;
  kind:
    | "CIRCLE_CREATED"
    | "SERIES_CREATED"
    | "INVOICE_SENT"
    | "PAYMENT_RECORDED"
    | "REMINDER_SENT"
    | "DRAW"
    | "PAYOUT"
    | "NOTE";
  amount?: number;
  paypalId?: string;
  detail: string;
}

export interface Circle {
  id: string;
  name: string;
  description: string;
  currency: "USD";
  contribution: number;
  cadence: Cadence;
  drawMode: DrawMode;
  startDate: string; // yyyy-mm-dd
  foremanCommissionPct: number;
  members: Member[];
  cycles: Cycle[];
  ledger: LedgerEntry[];
  /** @deprecated series are per member; kept for older records */
  recurringSeriesId?: string;
  createdAt: string;
  parsedBy: "claude" | "fallback";
  /** Seeded for reviewers of the hosted demo; shown with a SAMPLE badge. */
  sample?: boolean;
}

export interface CircleSpec {
  name: string;
  memberCount: number;
  memberNames?: string[];
  contribution: number;
  cadence: Cadence;
  drawMode: DrawMode;
  startDate: string;
  foremanCommissionPct: number;
}
