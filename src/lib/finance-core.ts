/**
 * Pure financial core — no IO, no Supabase, fully unit-testable.
 * Every money calculation in Duely must go through this module.
 */

export type DiscountType = "none" | "fixed" | "percentage";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export type PlanStatus = "active" | "at_risk" | "paused" | "completed" | "cancelled" | "defaulted";

export type InstallmentStatus = "pending" | "partial" | "paid" | "overdue";

/* ------------------------------------------------------------------ money */

/** Round to 2 decimals with half-up behaviour that is stable for floats. */
export function round2(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export type LineItemInput = {
  description?: string;
  quantity?: unknown;
  unit_price?: unknown;
  amount?: unknown;
  line_total?: unknown;
};

export type NormalizedLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

/** Accepts both the legacy `{description, amount}` jsonb shape and quantity/unit_price rows. */
export function normalizeLineItem(item: LineItemInput): NormalizedLineItem {
  const hasQty = item.quantity !== undefined || item.unit_price !== undefined;
  const quantity = hasQty ? Math.max(0, toNumber(item.quantity, 1)) : 1;
  const unitPrice = hasQty
    ? Math.max(0, toNumber(item.unit_price, 0))
    : Math.max(0, toNumber(item.line_total ?? item.amount, 0));
  return {
    description: String(item.description ?? "Item"),
    quantity,
    unit_price: round2(unitPrice),
    line_total: round2(quantity * unitPrice),
  };
}

export type InvoiceTotalsInput = {
  items?: LineItemInput[] | null;
  subtotal?: unknown;
  discount_type?: string | null;
  discount_value?: unknown;
  tax_rate?: unknown;
};

export type InvoiceTotals = {
  items: NormalizedLineItem[];
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  taxable_base: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
};

/**
 * Authoritative invoice math:
 * subtotal -> discount -> taxable base -> tax -> total.
 * Discount never exceeds the subtotal; tax is applied after discount.
 */
export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const items = (input.items ?? []).map(normalizeLineItem);
  const subtotal = items.length
    ? round2(items.reduce((s, i) => s + i.line_total, 0))
    : round2(Math.max(0, toNumber(input.subtotal, 0)));

  const discountType = (["none", "fixed", "percentage"].includes(String(input.discount_type))
    ? String(input.discount_type)
    : "none") as DiscountType;
  const discountValue = Math.max(0, toNumber(input.discount_value, 0));

  let discountAmount = 0;
  if (discountType === "fixed") discountAmount = Math.min(subtotal, discountValue);
  else if (discountType === "percentage") discountAmount = round2((subtotal * Math.min(100, discountValue)) / 100);
  discountAmount = round2(Math.min(subtotal, discountAmount));

  const taxableBase = round2(Math.max(0, subtotal - discountAmount));
  const taxRate = Math.min(100, Math.max(0, toNumber(input.tax_rate, 0)));
  const taxAmount = round2((taxableBase * taxRate) / 100);
  const total = round2(taxableBase + taxAmount);

  return {
    items,
    subtotal,
    discount_type: discountType,
    discount_value: round2(discountValue),
    discount_amount: discountAmount,
    taxable_base: taxableBase,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
  };
}

/* --------------------------------------------------------- state machine */

const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["draft", "sent", "cancelled"],
  sent: ["sent", "viewed", "partially_paid", "paid", "overdue", "cancelled"],
  viewed: ["viewed", "partially_paid", "paid", "overdue", "cancelled"],
  partially_paid: ["partially_paid", "paid", "overdue", "cancelled"],
  overdue: ["overdue", "partially_paid", "paid", "cancelled"],
  // Reachable again only when a payment is reversed.
  paid: ["paid", "partially_paid", "sent", "viewed", "overdue"],
  cancelled: ["cancelled"],
};

export function canTransitionInvoice(from: string, to: string): boolean {
  const allowed = INVOICE_TRANSITIONS[from as InvoiceStatus];
  if (!allowed) return false;
  return allowed.includes(to as InvoiceStatus);
}

export const INVOICE_TERMINAL: InvoiceStatus[] = ["cancelled"];

/** Statuses that exclude an invoice from receivables. */
export const NON_RECEIVABLE: string[] = ["paid", "cancelled", "draft"];

export function isEditableInvoice(status: string): boolean {
  return status === "draft";
}

/**
 * Derive the payment-truth status of an invoice.
 * Draft and cancelled are owner-controlled and never auto-derived.
 */
export function deriveInvoiceStatus(inv: {
  status: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  today?: string;
}): InvoiceStatus {
  const now = inv.today ?? todayISO();
  if (inv.status === "cancelled" || inv.status === "draft") return inv.status as InvoiceStatus;
  const amount = round2(inv.amount);
  const paid = round2(inv.paid_amount);
  if (amount > 0 && paid >= amount) return "paid";
  const overdue = inv.due_date < now;
  if (paid > 0) return overdue ? "overdue" : "partially_paid";
  if (overdue) return "overdue";
  return inv.status === "viewed" ? "viewed" : "sent";
}

/* ------------------------------------------------------------ date utils */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysFrom(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonthsFrom(from: string, months: number): string {
  const d = new Date(`${from}T00:00:00.000Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.floor(
    (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86400000,
  );
}

export function installmentDueDate(start: string, frequency: string, index: number): string {
  if (frequency === "weekly") return addDaysFrom(start, 7 * index);
  if (frequency === "biweekly") return addDaysFrom(start, 14 * index);
  if (frequency === "quarterly") return addMonthsFrom(start, 3 * index);
  return addMonthsFrom(start, index);
}

/* ------------------------------------------------------- payment plan math */

/**
 * Split a total into `count` installments without losing or inventing cents.
 * The remainder lands on the final installment.
 */
export function splitInstallments(total: number, count: number): number[] {
  const n = Math.max(1, Math.round(count));
  const cents = Math.round(round2(total) * 100);
  const base = Math.floor(cents / n);
  const amounts = Array.from({ length: n }, () => base);
  amounts[n - 1] = base + (cents - base * n);
  return amounts.map((c) => round2(c / 100));
}

export function deriveInstallmentStatus(args: {
  amount: number;
  paid_amount: number;
  due_date: string;
  today?: string;
}): InstallmentStatus {
  const now = args.today ?? todayISO();
  const amount = round2(args.amount);
  const paid = round2(args.paid_amount);
  if (amount > 0 && paid >= amount) return "paid";
  const overdue = args.due_date < now;
  if (paid > 0) return overdue ? "overdue" : "partial";
  return overdue ? "overdue" : "pending";
}

/**
 * Allocate unlinked plan payments across installments, oldest due first.
 * Returns the paid amount per installment (direct + allocated).
 */
export function allocatePlanPayments(
  installments: { id: string; amount: number; due_date: string }[],
  directByInstallment: Record<string, number>,
  unlinkedTotal: number,
): Record<string, number> {
  let pool = round2(Math.max(0, unlinkedTotal));
  const ordered = [...installments].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  const result: Record<string, number> = {};
  for (const inst of ordered) {
    const direct = round2(directByInstallment[inst.id] ?? 0);
    let paid = direct;
    const need = round2(Math.max(0, round2(inst.amount) - paid));
    if (need > 0 && pool > 0) {
      const take = Math.min(need, pool);
      paid = round2(paid + take);
      pool = round2(pool - take);
    }
    result[inst.id] = paid;
  }
  return result;
}

export function derivePlanStatus(args: {
  current: string;
  remaining: number;
  installmentStatuses: string[];
}): PlanStatus {
  if (args.current === "cancelled") return "cancelled";
  if (args.current === "paused") return "paused";
  if (args.remaining <= 0) return "completed";
  const overdue = args.installmentStatuses.filter((s) => s === "overdue").length;
  if (overdue >= 3) return "defaulted";
  if (overdue > 0) return "at_risk";
  return "active";
}

const PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  active: ["active", "at_risk", "paused", "completed", "cancelled", "defaulted"],
  at_risk: ["at_risk", "active", "paused", "completed", "cancelled", "defaulted"],
  paused: ["paused", "active", "cancelled"],
  defaulted: ["defaulted", "active", "at_risk", "completed", "cancelled"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

export function canTransitionPlan(from: string, to: string): boolean {
  return PLAN_TRANSITIONS[from as PlanStatus]?.includes(to as PlanStatus) ?? false;
}

/* ------------------------------------------------------------ risk engine */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskInput = {
  delays: number[];
  outstanding: number;
  overdue_amount: number;
  max_days_overdue: number;
  reversed_payment_count?: number;
};

export type RiskOutput = {
  score: number;
  level: RiskLevel;
  factors: string[];
  average_payment_delay_days: number | null;
  on_time_percentage: number | null;
};

export function scoreRisk(input: RiskInput): RiskOutput {
  const delays = input.delays;
  const avgDelay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;
  const onTime = delays.length ? Math.round((delays.filter((d) => d <= 0).length / delays.length) * 100) : null;

  let score = 0;
  const factors: string[] = [];

  if (avgDelay !== null && avgDelay > 0) {
    score += Math.min(30, avgDelay * 1.5);
    factors.push(`Pays on average ${avgDelay} days late`);
  }
  if (onTime !== null && onTime < 70) {
    score += (70 - onTime) * 0.3;
    factors.push(`Only ${onTime}% of payments are on time`);
  }
  if (input.overdue_amount > 0) {
    const ratio = input.outstanding > 0 ? Math.min(1, input.overdue_amount / input.outstanding) : 1;
    score += ratio * 25;
    factors.push(`${Math.round(ratio * 100)}% of the outstanding balance is overdue`);
  }
  if (input.max_days_overdue > 0) {
    score += Math.min(25, input.max_days_overdue * 0.5);
    factors.push(`Oldest overdue invoice is ${input.max_days_overdue} days past due`);
  }
  if (input.reversed_payment_count && input.reversed_payment_count > 0) {
    score += Math.min(10, input.reversed_payment_count * 5);
    factors.push(`${input.reversed_payment_count} reversed payment(s) on record`);
  }
  if (!delays.length && !input.overdue_amount) factors.push("No payment history yet — insufficient data");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: RiskLevel = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score, level, factors, average_payment_delay_days: avgDelay, on_time_percentage: onTime };
}
