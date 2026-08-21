import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NON_RECEIVABLE,
  daysBetween,
  round2,
  scoreRisk,
  todayISO,
  toNumber,
} from "./finance-core";

export type DashboardAnalyticsOptions = {
  startDate?: string;
  endDate?: string;
  clientId?: string;
  currency?: string;
  invoiceStatus?: string[];
  riskLevel?: string[];
  limit?: number;
};

export type DashboardContext = {
  supabase: SupabaseClient;
  userId: string;
};

export type MetricValue = {
  value: number | null;
  available: boolean;
  reason?: string | undefined;
};

export type InvoiceMetricBucket = {
  amount: number;
  invoiceCount: number;
};

export type AgingBucket = {
  current: InvoiceMetricBucket;
  days1to30: InvoiceMetricBucket;
  days31to60: InvoiceMetricBucket;
  days61to90: InvoiceMetricBucket;
  days90Plus: InvoiceMetricBucket;
};

export type TrendPoint = {
  period: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  overdue: number;
};

export type DashboardInvoiceRow = {
  id: string;
  owner_id: string;
  client_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  issue_date: string;
  due_date: string;
  paid_date?: string | null;
  paid_amount: number;
  remaining_balance: number;
  subtotal?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  clients?: { id?: string; name?: string; company_name?: string } | null;
};

export type DashboardPaymentRow = {
  id: string;
  owner_id: string;
  invoice_id?: string | null;
  client_id?: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method?: string | null;
  reference?: string | null;
  reversed_at?: string | null;
};

export type DashboardPlanRow = {
  id: string;
  owner_id: string;
  client_id: string;
  invoice_id?: string | null;
  total_amount: number;
  remaining_amount: number;
  paid_amount: number;
  currency: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  clients?: { id?: string; name?: string; company_name?: string } | null;
  payment_plan_installments?: DashboardInstallmentRow[];
};

export type DashboardInstallmentRow = {
  id: string;
  owner_id: string;
  plan_id: string;
  seq: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
};

export type DashboardNotificationRow = {
  id: string;
  owner_id: string;
  event_type: string;
  title: string;
  body?: string | null;
  invoice_id?: string | null;
  client_id?: string | null;
  plan_id?: string | null;
  installment_id?: string | null;
  read_at?: string | null;
  created_at?: string | null;
};

export type DashboardSummary = {
  outstandingReceivables: number | null;
  overdueReceivables: number | null;
  dueIn7Days: number | null;
  dueIn30Days: number | null;
  dueIn60Days: number | null;
  dueIn90Days: number | null;
  dueIn12Months: number | null;
  totalCollected: number | null;
  collectionRate: number | null;
  atRiskReceivables: number | null;
};

export type DashboardCollections = {
  totalCollected: MetricValue;
  paymentCount: MetricValue;
  averagePayment: MetricValue;
  onTimePaymentRate: MetricValue;
  latePaymentRate: MetricValue;
  averageDaysToPay: MetricValue;
};

export type DashboardAnalyticsResult = {
  summary: DashboardSummary;
  aging: AgingBucket;
  collections: DashboardCollections;
  trends: {
    last30Days: TrendPoint[];
    last90Days: TrendPoint[];
    last12Months: TrendPoint[];
  };
  upcomingPayments: Array<{
    id: string;
    clientId: string;
    clientName: string;
    invoiceId: string;
    amount: number;
    dueDate: string;
    outstandingAmount: number;
    riskLevel?: string;
    planId?: string | null;
    installmentId?: string | null;
  }>;
  overdueInvoices: Array<{
    id: string;
    clientId: string;
    clientName: string;
    invoiceNumber: string;
    outstandingAmount: number;
    daysOverdue: number;
    riskLevel?: string;
    status: string;
    planId?: string | null;
  }>;
  atRiskClients: Array<{
    clientId: string;
    clientName: string;
    riskScore: number;
    riskLevel: string;
    outstandingExposure: number;
    overdueExposure: number;
    factors: string[];
  }>;
  paymentPlans: {
    activePlans: number;
    remainingBalance: number;
    dueThisPeriod: number;
    overdueInstallments: number;
    collected: number;
    plansAtRisk: number;
  };
  notifications: DashboardNotificationRow[];
  invoicePipeline: {
    draft: { amount: number; count: number };
    sent: { amount: number; count: number };
    dueSoon: { amount: number; count: number };
    overdue: { amount: number; count: number };
    paid: { amount: number; count: number };
  };
  currencyBreakdown: Record<string, DashboardSummary>;
  filters: DashboardAnalyticsOptions;
};

const DEFAULT_LIMIT = 25;

function asDate(value?: string | null, fallback = new Date()): Date {
  if (!value) return fallback;
  return new Date(`${value}T00:00:00.000Z`);
}

function monthKey(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 7);
}

function clampDate(date: string | null | undefined): string | undefined {
  if (!date) return undefined;
  return date.slice(0, 10);
}

function numberOr(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return round2(items.reduce((total, item) => total + selector(item), 0));
}

function isOpenInvoice(inv: DashboardInvoiceRow): boolean {
  return !NON_RECEIVABLE.includes(inv.status) && numberOr(inv.remaining_balance) > 0;
}

function inRange(date: string | null | undefined, start?: string, end?: string): boolean {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function filterInvoiceRows(
  rows: DashboardInvoiceRow[],
  options: DashboardAnalyticsOptions = {},
): DashboardInvoiceRow[] {
  const { clientId, currency, invoiceStatus, startDate, endDate } = options;

  return rows.filter((inv) => {
    if (clientId && inv.client_id !== clientId) return false;
    if (currency && inv.currency !== currency) return false;
    if (invoiceStatus && invoiceStatus.length > 0 && !invoiceStatus.includes(inv.status)) return false;
    if (startDate && inv.issue_date && inv.issue_date < startDate) return false;
    if (endDate && inv.issue_date && inv.issue_date > endDate) return false;
    return true;
  });
}

function filterPaymentRows(
  rows: DashboardPaymentRow[],
  options: DashboardAnalyticsOptions = {},
): DashboardPaymentRow[] {
  const { clientId, currency, startDate, endDate } = options;

  return rows.filter((pay) => {
    if (clientId && pay.client_id !== clientId) return false;
    if (currency && pay.currency !== currency) return false;
    if (startDate && !inRange(pay.payment_date, startDate, endDate)) return false;
    if (endDate && !inRange(pay.payment_date, startDate, endDate)) return false;
    if (startDate && endDate && pay.payment_date < startDate) return false;
    if (startDate && endDate && pay.payment_date > endDate) return false;
    return true;
  });
}

export function getOutstandingReceivables(rows: DashboardInvoiceRow[]): { amount: number; invoiceCount: number } {
  const open = rows.filter(isOpenInvoice);
  return {
    amount: round2(sumBy(open, (item) => numberOr(item.remaining_balance))),
    invoiceCount: open.length,
  };
}

export function getOverdueReceivables(rows: DashboardInvoiceRow[], today: string = todayISO()): { amount: number; invoiceCount: number } {
  const overdue = rows.filter((inv) => isOpenInvoice(inv) && !!inv.due_date && inv.due_date < today);
  return {
    amount: round2(sumBy(overdue, (item) => numberOr(item.remaining_balance))),
    invoiceCount: overdue.length,
  };
}

export function getDueWindowSummary(rows: DashboardInvoiceRow[], today: string = todayISO()): Record<string, { amount: number; invoiceCount: number }> {
  const out = {
    "7d": { amount: 0, invoiceCount: 0 },
    "30d": { amount: 0, invoiceCount: 0 },
    "60d": { amount: 0, invoiceCount: 0 },
    "90d": { amount: 0, invoiceCount: 0 },
    "12m": { amount: 0, invoiceCount: 0 },
  };

  for (const inv of rows) {
    if (!isOpenInvoice(inv)) continue;
    const due = inv.due_date ? asDate(inv.due_date) : null;
    if (!due) continue;
    const days = Math.max(0, daysBetween(today, inv.due_date));
    if (days <= 7) {
      out["7d"].amount += numberOr(inv.remaining_balance);
      out["7d"].invoiceCount += 1;
    }
    if (days <= 30) {
      out["30d"].amount += numberOr(inv.remaining_balance);
      out["30d"].invoiceCount += 1;
    }
    if (days <= 60) {
      out["60d"].amount += numberOr(inv.remaining_balance);
      out["60d"].invoiceCount += 1;
    }
    if (days <= 90) {
      out["90d"].amount += numberOr(inv.remaining_balance);
      out["90d"].invoiceCount += 1;
    }
    if (days <= 365) {
      out["12m"].amount += numberOr(inv.remaining_balance);
      out["12m"].invoiceCount += 1;
    }
  }

  return Object.fromEntries(Object.entries(out).map(([key, value]) => [key, { amount: round2(value.amount), invoiceCount: value.invoiceCount }])) as Record<string, { amount: number; invoiceCount: number }>;
}

export function getReceivablesAging(rows: DashboardInvoiceRow[], today: string = todayISO()): AgingBucket {
  const zero = (): InvoiceMetricBucket => ({ amount: 0, invoiceCount: 0 });

  const buckets: AgingBucket = {
    current: zero(),
    days1to30: zero(),
    days31to60: zero(),
    days61to90: zero(),
    days90Plus: zero(),
  };

  for (const inv of rows) {
    if (!isOpenInvoice(inv)) continue;
    const due = inv.due_date ? asDate(inv.due_date) : null;
    if (!due) continue;
    const days = Math.max(0, daysBetween(inv.due_date, today));
    const amount = numberOr(inv.remaining_balance);
    if (inv.due_date > today) {
      buckets.current.amount += amount;
      buckets.current.invoiceCount += 1;
    } else if (days <= 30) {
      buckets.days1to30.amount += amount;
      buckets.days1to30.invoiceCount += 1;
    } else if (days <= 60) {
      buckets.days31to60.amount += amount;
      buckets.days31to60.invoiceCount += 1;
    } else if (days <= 90) {
      buckets.days61to90.amount += amount;
      buckets.days61to90.invoiceCount += 1;
    } else {
      buckets.days90Plus.amount += amount;
      buckets.days90Plus.invoiceCount += 1;
    }
  }

  return {
    current: { amount: round2(buckets.current.amount), invoiceCount: buckets.current.invoiceCount },
    days1to30: { amount: round2(buckets.days1to30.amount), invoiceCount: buckets.days1to30.invoiceCount },
    days31to60: { amount: round2(buckets.days31to60.amount), invoiceCount: buckets.days31to60.invoiceCount },
    days61to90: { amount: round2(buckets.days61to90.amount), invoiceCount: buckets.days61to90.invoiceCount },
    days90Plus: { amount: round2(buckets.days90Plus.amount), invoiceCount: buckets.days90Plus.invoiceCount },
  };
}

export function getCollectionMetrics(
  rows: DashboardPaymentRow[],
  invoiceRows: DashboardInvoiceRow[],
  today: string = todayISO(),
): DashboardCollections {
  const livePayments = rows.filter((pay) => !pay.reversed_at);
  const totalCollected = round2(sumBy(livePayments, (p) => numberOr(p.amount)));
  const paymentCount = livePayments.length;
  const averagePayment = paymentCount ? round2(totalCollected / paymentCount) : 0;

  const delays: number[] = [];
  for (const pay of livePayments) {
    if (!pay.invoice_id) continue;
    const invoice = invoiceRows.find((inv) => inv.id === pay.invoice_id);
    if (!invoice || !invoice.due_date) continue;
    delays.push(daysBetween(invoice.due_date, pay.payment_date ?? today));
  }

  const onTime = delays.length ? Math.round((delays.filter((d) => d <= 0).length / delays.length) * 100) : null;
  const late = delays.length ? Math.round((delays.filter((d) => d > 0).length / delays.length) * 100) : null;
  const averageDaysToPay = delays.length ? Math.round(delays.reduce((sum, delay) => sum + delay, 0) / delays.length) : null;

  const totalInvoiced = round2(sumBy(invoiceRows.filter((inv) => !NON_RECEIVABLE.includes(inv.status)), (inv) => numberOr(inv.amount)));

  return {
    totalCollected: {
      value: totalCollected,
      available: true,
    },
    paymentCount: {
      value: paymentCount,
      available: paymentCount > 0,
      reason: paymentCount > 0 ? undefined : "insufficient_historical_data",
    },
    averagePayment: {
      value: paymentCount > 0 ? averagePayment : null,
      available: paymentCount > 0,
      reason: paymentCount > 0 ? undefined : "insufficient_historical_data",
    },
    onTimePaymentRate: {
      value: onTime,
      available: onTime !== null,
      reason: onTime === null ? "insufficient_historical_data" : undefined,
    },
    latePaymentRate: {
      value: late,
      available: late !== null,
      reason: late === null ? "insufficient_historical_data" : undefined,
    },
    averageDaysToPay: {
      value: averageDaysToPay,
      available: averageDaysToPay !== null,
      reason: averageDaysToPay === null ? "insufficient_historical_data" : undefined,
    },
  };
}

export function buildCollectionTrend(
  invoices: DashboardInvoiceRow[],
  payments: DashboardPaymentRow[],
  range: "30d" | "90d" | "12m",
): TrendPoint[] {
  const now = new Date();
  const points: TrendPoint[] = [];

  const buckets: Record<string, { invoiced: number; collected: number; outstanding: number; overdue: number }> = {};

  const start = new Date(now);
  if (range === "30d") start.setUTCDate(start.getUTCDate() - 30);
  else if (range === "90d") start.setUTCDate(start.getUTCDate() - 90);
  else start.setUTCMonth(start.getUTCMonth() - 12);

  for (const inv of invoices) {
    const issueDate = clampDate(inv.issue_date);
    if (!issueDate) continue;
    const issue = new Date(`${issueDate}T00:00:00.000Z`);
    if (issue < start || issue > now) continue;
    const key = range === "30d" ? issueDate : monthKey(issueDate);
    const bucket = (buckets[key] ??= { invoiced: 0, collected: 0, outstanding: 0, overdue: 0 });
    bucket.invoiced += numberOr(inv.amount);
    if (isOpenInvoice(inv)) bucket.outstanding += numberOr(inv.remaining_balance);
    if (isOpenInvoice(inv) && !!inv.due_date && inv.due_date < todayISO()) bucket.overdue += numberOr(inv.remaining_balance);
  }

  for (const pay of payments) {
    if (pay.reversed_at) continue;
    const date = clampDate(pay.payment_date);
    if (!date) continue;
    const paymentDate = new Date(`${date}T00:00:00.000Z`);
    if (paymentDate < start || paymentDate > now) continue;
    const key = range === "30d" ? date : monthKey(date);
    const bucket = (buckets[key] ??= { invoiced: 0, collected: 0, outstanding: 0, overdue: 0 });
    bucket.collected += numberOr(pay.amount);
  }

  const keys = Object.keys(buckets).sort();
  for (const key of keys) {
    const bucket = buckets[key];
    if (!bucket) continue;
    points.push({
      period: key,
      invoiced: round2(bucket.invoiced),
      collected: round2(bucket.collected),
      outstanding: round2(bucket.outstanding),
      overdue: round2(bucket.overdue),
    });
  }

  return points;
}

export function getAtRiskClients(
  invoices: DashboardInvoiceRow[],
  payments: DashboardPaymentRow[],
): Array<{ clientId: string; clientName: string; riskScore: number; riskLevel: string; outstandingExposure: number; overdueExposure: number; factors: string[] }> {
  const byClient = new Map<string, { clientId: string; clientName: string; invoices: DashboardInvoiceRow[]; payments: DashboardPaymentRow[] }>();

  for (const inv of invoices) {
    const clientId = inv.client_id;
    const entry = byClient.get(clientId) ?? { clientId, clientName: inv.clients?.company_name || inv.clients?.name || "Client", invoices: [], payments: [] };
    entry.invoices.push(inv);
    byClient.set(clientId, entry);
  }

  for (const pay of payments) {
    if (!pay.client_id) continue;
    const entry = byClient.get(pay.client_id) ?? { clientId: pay.client_id, clientName: "Client", invoices: [], payments: [] };
    entry.payments.push(pay);
    byClient.set(pay.client_id, entry);
  }

  return Array.from(byClient.values())
    .map((entry) => {
      const outstanding = sumBy(entry.invoices.filter(isOpenInvoice), (item) => numberOr(item.remaining_balance));
      const overdue = sumBy(
        entry.invoices.filter((inv) => isOpenInvoice(inv) && !!inv.due_date && inv.due_date < todayISO()),
        (item) => numberOr(item.remaining_balance),
      );
      const delays = entry.payments
        .filter((pay) => !pay.reversed_at && pay.invoice_id)
        .map((pay) => {
          const invoice = entry.invoices.find((item) => item.id === pay.invoice_id);
          if (!invoice || !invoice.due_date) return 0;
          return daysBetween(invoice.due_date, pay.payment_date);
        })
        .filter((value) => Number.isFinite(value));

      const result = scoreRisk({
        delays,
        outstanding,
        overdue_amount: overdue,
        max_days_overdue: Math.max(
          0,
          ...entry.invoices
            .filter((inv) => isOpenInvoice(inv) && !!inv.due_date && inv.due_date < todayISO())
            .map((inv) => daysBetween(inv.due_date, todayISO())),
        ),
      });

      return {
        clientId: entry.clientId,
        clientName: entry.clientName,
        riskScore: result.score,
        riskLevel: result.level,
        outstandingExposure: outstanding,
        overdueExposure: overdue,
        factors: result.factors,
      };
    })
    .filter((entry) => entry.outstandingExposure > 0 || entry.overdueExposure > 0 || entry.riskScore >= 30)
    .sort((a, b) => b.riskScore - a.riskScore || b.outstandingExposure - a.outstandingExposure);
}

export function getPaymentPlanSummary(
  plans: DashboardPlanRow[],
  installments: DashboardInstallmentRow[],
): {
  activePlans: number;
  remainingBalance: number;
  dueThisPeriod: number;
  overdueInstallments: number;
  collected: number;
  plansAtRisk: number;
} {
  const activePlans = plans.filter((plan) => plan.status === "active" || plan.status === "at_risk" || plan.status === "paused").length;
  const remainingBalance = round2(sumBy(plans, (plan) => numberOr(plan.remaining_amount)));
  const dueThisPeriod = round2(
    sumBy(
      installments.filter((inst) => inst.status !== "paid" && inst.due_date >= todayISO() && inst.due_date <= todayISO()),
      (item) => numberOr(item.amount) - numberOr(item.paid_amount),
    ),
  );
  const overdueInstallments = installments.filter((inst) => inst.status === "overdue" || (inst.status !== "paid" && inst.due_date < todayISO())).length;
  const collected = round2(sumBy(plans, (plan) => numberOr(plan.paid_amount)));
  const plansAtRisk = plans.filter((plan) => plan.status === "at_risk" || plan.status === "defaulted").length;

  return {
    activePlans,
    remainingBalance,
    dueThisPeriod,
    overdueInstallments,
    collected,
    plansAtRisk,
  };
}

export async function getDashboardNotifications(ctx: DashboardContext, limit = 25): Promise<DashboardNotificationRow[]> {
  const { data } = await ctx.supabase
    .from("notifications")
    .select("*")
    .eq("owner_id", ctx.userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as DashboardNotificationRow[];
}

export type DashboardRawRows = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plans: any[];
  notifications: DashboardNotificationRow[];
};

/**
 * Fetches the full owner-scoped dataset once. Callers computing analytics for
 * multiple clients/currencies should fetch once via this function (or reuse an
 * existing fetch) and pass the rows to `computeDashboardAnalytics` per slice,
 * instead of calling `getDashboardAnalytics` in a loop (which re-queries the
 * entire dataset on every call).
 */
export async function fetchDashboardRows(
  ctx: DashboardContext,
  limit = DEFAULT_LIMIT,
): Promise<DashboardRawRows> {
  const { data: invoices } = await ctx.supabase
    .from("invoices")
    .select("*, clients(id,name,company_name)")
    .eq("owner_id", ctx.userId)
    .order("due_date", { ascending: true });

  const { data: payments } = await ctx.supabase
    .from("payments")
    .select("*")
    .eq("owner_id", ctx.userId)
    .order("payment_date", { ascending: false });

  const { data: plans } = await ctx.supabase
    .from("payment_plans")
    .select("*, clients(id,name,company_name), payment_plan_installments(*)")
    .eq("owner_id", ctx.userId)
    .order("created_at", { ascending: false });

  const notifications = await getDashboardNotifications(ctx, limit);

  return {
    invoices: (invoices ?? []) as DashboardRawRows["invoices"],
    payments: (payments ?? []) as DashboardRawRows["payments"],
    plans: (plans ?? []) as DashboardRawRows["plans"],
    notifications,
  };
}

/** Pure computation over already-fetched rows. Safe to call repeatedly (e.g. per client/currency) without re-querying. */
export function computeDashboardAnalytics(
  rows: DashboardRawRows,
  options: DashboardAnalyticsOptions = {},
): DashboardAnalyticsResult {
  const { invoices, payments, plans, notifications } = rows;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const today = todayISO();

  const invoiceRows = (invoices ?? []).map((inv) => ({
    ...inv,
    amount: numberOr(inv.amount),
    paid_amount: numberOr(inv.paid_amount),
    remaining_balance: numberOr(inv.remaining_balance),
    currency: String(inv.currency || "AED"),
    status: String(inv.status || "draft"),
    issue_date: clampDate(inv.issue_date),
    due_date: clampDate(inv.due_date),
    paid_date: clampDate(inv.paid_date),
  })) as DashboardInvoiceRow[];

  const paymentRows = (payments ?? []).map((pay) => ({
    ...pay,
    amount: numberOr(pay.amount),
    payment_date: clampDate(pay.payment_date) || today,
    currency: String(pay.currency || "AED"),
    reversed_at: pay.reversed_at ? clampDate(pay.reversed_at) : null,
  })) as DashboardPaymentRow[];

  const planRows = (plans ?? []).map((plan) => ({
    ...plan,
    total_amount: numberOr(plan.total_amount),
    remaining_amount: numberOr(plan.remaining_amount),
    paid_amount: numberOr(plan.paid_amount),
    currency: String(plan.currency || "AED"),
    status: String(plan.status || "active"),
    payment_plan_installments: ((plan.payment_plan_installments ?? []) as DashboardInstallmentRow[]).map((inst) => ({
      ...inst,
      amount: numberOr(inst.amount),
      paid_amount: numberOr(inst.paid_amount),
      due_date: clampDate(inst.due_date) || today,
      status: String(inst.status || "pending"),
    })),
  })) as DashboardPlanRow[];

  const filteredInvoices = filterInvoiceRows(invoiceRows, options);
  const filteredPayments = filterPaymentRows(paymentRows, options);

  const outstanding = getOutstandingReceivables(filteredInvoices);
  const overdue = getOverdueReceivables(filteredInvoices, today);
  const dueWindows = getDueWindowSummary(filteredInvoices, today);
  const aging = getReceivablesAging(filteredInvoices, today);
  const collections = getCollectionMetrics(filteredPayments, filteredInvoices, today);

  const allRiskClients = getAtRiskClients(invoiceRows, paymentRows);
  const riskFiltered = options.riskLevel?.length
    ? allRiskClients.filter((client) => options.riskLevel?.includes(client.riskLevel))
    : allRiskClients;

  const upcoming = filteredInvoices
    .filter((inv) => isOpenInvoice(inv) && inv.due_date && inv.due_date >= today)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .slice(0, limit)
    .map((inv) => {
      const relatedRisk = riskFiltered.find((entry) => entry.clientId === inv.client_id);
      return {
        id: inv.id,
        clientId: inv.client_id,
        clientName: inv.clients?.company_name || inv.clients?.name || "Client",
        invoiceId: inv.id,
        amount: numberOr(inv.amount),
        dueDate: inv.due_date || today,
        outstandingAmount: numberOr(inv.remaining_balance),
        ...(relatedRisk?.riskLevel ? { riskLevel: relatedRisk.riskLevel } : {}),
      };
    });

  const overdueInvoicesList = filteredInvoices
    .filter((inv) => isOpenInvoice(inv) && !!inv.due_date && inv.due_date < today)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .slice(0, limit)
    .map((inv) => {
      const relatedRisk = riskFiltered.find((entry) => entry.clientId === inv.client_id);
      return {
        id: inv.id,
        clientId: inv.client_id,
        clientName: inv.clients?.company_name || inv.clients?.name || "Client",
        invoiceNumber: inv.invoice_number,
        outstandingAmount: numberOr(inv.remaining_balance),
        daysOverdue: Math.max(0, daysBetween(inv.due_date, today)),
        ...(relatedRisk?.riskLevel ? { riskLevel: relatedRisk.riskLevel } : {}),
        status: inv.status,
      };
    });

  const baseSummary: DashboardSummary = {
    outstandingReceivables: outstanding.amount,
    overdueReceivables: overdue.amount,
    dueIn7Days: dueWindows["7d"]?.amount ?? 0,
    dueIn30Days: dueWindows["30d"]?.amount ?? 0,
    dueIn60Days: dueWindows["60d"]?.amount ?? 0,
    dueIn90Days: dueWindows["90d"]?.amount ?? 0,
    dueIn12Months: dueWindows["12m"]?.amount ?? 0,
    totalCollected: collections.totalCollected.value,
    collectionRate: null,
    atRiskReceivables: riskFiltered.reduce((sum, entry) => sum + entry.outstandingExposure, 0),
  };

  const totalInvoiced = round2(sumBy(filteredInvoices.filter((inv) => inv.status !== "draft" && inv.status !== "cancelled"), (inv) => numberOr(inv.amount)));
  baseSummary.collectionRate = totalInvoiced > 0 ? round2((collections.totalCollected.value ?? 0) / totalInvoiced) : null;

  const currencyBreakdown: Record<string, DashboardSummary> = {};
  for (const currency of Array.from(new Set(filteredInvoices.map((inv) => inv.currency)))) {
    const rows = filteredInvoices.filter((inv) => inv.currency === currency);
    const paymentSum = round2(sumBy(filteredPayments.filter((pay) => pay.currency === currency && !pay.reversed_at), (pay) => numberOr(pay.amount)));
    const totalCurrencyInvoiced = round2(sumBy(rows.filter((inv) => inv.status !== "draft" && inv.status !== "cancelled"), (inv) => numberOr(inv.amount)));
    const due = getDueWindowSummary(rows, today);
    const overdueForCurrency = getOverdueReceivables(rows, today);
    const outstandingForCurrency = getOutstandingReceivables(rows);
    const riskForCurrency = getAtRiskClients(rows, filteredPayments.filter((pay) => pay.currency === currency));
    currencyBreakdown[currency] = {
      outstandingReceivables: outstandingForCurrency.amount,
      overdueReceivables: overdueForCurrency.amount,
      dueIn7Days: due["7d"]?.amount ?? 0,
      dueIn30Days: due["30d"]?.amount ?? 0,
      dueIn60Days: due["60d"]?.amount ?? 0,
      dueIn90Days: due["90d"]?.amount ?? 0,
      dueIn12Months: due["12m"]?.amount ?? 0,
      totalCollected: paymentSum,
      collectionRate: totalCurrencyInvoiced > 0 ? round2(paymentSum / totalCurrencyInvoiced) : null,
      atRiskReceivables: riskForCurrency.reduce((sum, entry) => sum + entry.outstandingExposure, 0),
    };
  }

  const planSummary = getPaymentPlanSummary(planRows, planRows.flatMap((plan) => plan.payment_plan_installments ?? []));
  const pipeline = {
    draft: { amount: sumBy(filteredInvoices.filter((inv) => inv.status === "draft"), (inv) => numberOr(inv.amount)), count: filteredInvoices.filter((inv) => inv.status === "draft").length },
    sent: { amount: sumBy(filteredInvoices.filter((inv) => inv.status === "sent" || inv.status === "viewed"), (inv) => numberOr(inv.amount)), count: filteredInvoices.filter((inv) => inv.status === "sent" || inv.status === "viewed").length },
    dueSoon: { amount: sumBy(filteredInvoices.filter((inv) => isOpenInvoice(inv) && inv.due_date && inv.due_date >= today && daysBetween(today, inv.due_date) <= 30), (inv) => numberOr(inv.remaining_balance)), count: filteredInvoices.filter((inv) => isOpenInvoice(inv) && inv.due_date && inv.due_date >= today && daysBetween(today, inv.due_date) <= 30).length },
    overdue: { amount: overdue.amount, count: overdue.invoiceCount },
    paid: { amount: sumBy(filteredInvoices.filter((inv) => inv.status === "paid"), (inv) => numberOr(inv.amount)), count: filteredInvoices.filter((inv) => inv.status === "paid").length },
  };

  return {
    summary: baseSummary,
    aging,
    collections,
    trends: {
      last30Days: buildCollectionTrend(filteredInvoices, filteredPayments, "30d"),
      last90Days: buildCollectionTrend(filteredInvoices, filteredPayments, "90d"),
      last12Months: buildCollectionTrend(filteredInvoices, filteredPayments, "12m"),
    },
    upcomingPayments: upcoming,
    overdueInvoices: overdueInvoicesList,
    atRiskClients: riskFiltered.slice(0, limit).map((entry) => ({
      clientId: entry.clientId,
      clientName: entry.clientName,
      riskScore: entry.riskScore,
      riskLevel: entry.riskLevel,
      outstandingExposure: entry.outstandingExposure,
      overdueExposure: entry.overdueExposure,
      factors: entry.factors,
    })),
    paymentPlans: {
      activePlans: planSummary.activePlans,
      remainingBalance: planSummary.remainingBalance,
      dueThisPeriod: planSummary.dueThisPeriod,
      overdueInstallments: planSummary.overdueInstallments,
      collected: planSummary.collected,
      plansAtRisk: planSummary.plansAtRisk,
    },
    notifications,
    invoicePipeline: pipeline,
    currencyBreakdown,
    filters: options,
  };
}

export async function getDashboardAnalytics(
  ctx: DashboardContext,
  options: DashboardAnalyticsOptions = {},
): Promise<DashboardAnalyticsResult> {
  const rows = await fetchDashboardRows(ctx, options.limit ?? DEFAULT_LIMIT);
  return computeDashboardAnalytics(rows, options);
}

export const dashboardAnalytics = {
  getOutstandingReceivables,
  getOverdueReceivables,
  getDueWindowSummary,
  getReceivablesAging,
  getCollectionMetrics,
  buildCollectionTrend,
  getAtRiskClients,
  getPaymentPlanSummary,
  getDashboardNotifications,
  fetchDashboardRows,
  computeDashboardAnalytics,
  getDashboardAnalytics,
};
