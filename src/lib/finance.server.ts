import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDaysFrom,
  addMonthsFrom,
  allocatePlanPayments,
  canTransitionInvoice,
  canTransitionPlan,
  computeInvoiceTotals,
  daysBetween,
  deriveInstallmentStatus,
  deriveInvoiceStatus as deriveInvoiceStatusCore,
  derivePlanStatus,
  installmentDueDate,
  isEditableInvoice,
  NON_RECEIVABLE,
  round2,
  scoreRisk,
  splitInstallments,
  todayISO,
  toNumber,
  type LineItemInput,
  type RiskLevel,
} from "./finance-core";
import { fail, isFailure, type DuelyFailure } from "./finance-errors";

export type FinCtx = { supabase: SupabaseClient; userId: string; actor?: "ai" | "human" | "system" };

/* re-exported helpers kept for backwards compatibility */
export const n = toNumber;
export const today = todayISO;
export { addDaysFrom, addMonthsFrom, round2 };
export const deriveInvoiceStatus = (inv: {
  status: string;
  amount: number;
  paid_amount: number;
  due_date: string;
}) => deriveInvoiceStatusCore(inv);

/* ------------------------------------------------------------- audit log */

export async function audit(
  ctx: FinCtx,
  entry: {
    entity_type: string;
    entity_id?: string | null;
    action: string;
    before_state?: unknown;
    after_state?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await ctx.supabase.from("audit_logs").insert({
    owner_id: ctx.userId,
    actor_type: ctx.actor ?? "system",
    actor_id: ctx.userId,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    action: entry.action,
    before_state: (entry.before_state ?? null) as never,
    after_state: (entry.after_state ?? null) as never,
    metadata: (entry.metadata ?? {}) as never,
  });
  if (error) console.error("[audit] failed", entry.action, error.message);
}

/* ------------------------------------------------------- invoice totals */

/** Recompute and persist subtotal / discount / tax / total for one invoice. */
export async function recalcInvoiceTotals(
  ctx: FinCtx,
  invoiceId: string,
  overrides?: {
    items?: LineItemInput[] | null;
    subtotal?: number;
    discount_type?: string;
    discount_value?: number;
    tax_rate?: number;
  },
) {
  const { data: inv } = await ctx.supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (!inv) return fail("not_found", "Invoice not found.", { invoice_id: invoiceId });

  const { data: rows } = await ctx.supabase
    .from("invoice_items")
    .select("description,quantity,unit_price,line_total,sort_order")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  const items: LineItemInput[] | null =
    overrides?.items ??
    (rows && rows.length
      ? rows
      : Array.isArray(inv.items) && inv.items.length
        ? (inv.items as LineItemInput[])
        : null);

  const totals = computeInvoiceTotals({
    items,
    subtotal: overrides?.subtotal ?? (items ? undefined : toNumber(inv.subtotal) || toNumber(inv.amount)),
    discount_type: overrides?.discount_type ?? inv.discount_type,
    discount_value: overrides?.discount_value ?? inv.discount_value,
    tax_rate: overrides?.tax_rate ?? inv.tax_rate,
  });

  const { data: updated } = await ctx.supabase
    .from("invoices")
    .update({
      subtotal: totals.subtotal,
      discount_type: totals.discount_type,
      discount_value: totals.discount_value,
      discount_amount: totals.discount_amount,
      tax_rate: totals.tax_rate,
      tax_amount: totals.tax_amount,
      amount: totals.total,
      items: (totals.items.length ? totals.items : inv.items) as never,
    })
    .eq("id", invoiceId)
    .select("*")
    .single();
  return { invoice: updated ?? inv, totals };
}

/** Replace the line items of a draft invoice and recompute totals. */
export async function replaceInvoiceItems(ctx: FinCtx, invoiceId: string, items: LineItemInput[]) {
  const { data: inv } = await ctx.supabase.from("invoices").select("*").eq("id", invoiceId).eq("owner_id", ctx.userId).maybeSingle();
  if (!inv) return fail("not_found", "Invoice not found.", { invoice_id: invoiceId });
  if (!isEditableInvoice(inv.status))
    return fail("invoice_locked", `Invoice ${inv.invoice_number} is ${inv.status} and can no longer be edited.`);

  const totals = computeInvoiceTotals({ items, discount_type: inv.discount_type, discount_value: inv.discount_value, tax_rate: inv.tax_rate });
  await ctx.supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (totals.items.length) {
    const { error } = await ctx.supabase.from("invoice_items").insert(
      totals.items.map((it, i) => ({
        owner_id: ctx.userId,
        invoice_id: invoiceId,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
        sort_order: i,
      })),
    );
    if (error) return fail("internal_error", error.message);
  }
  const result = await recalcInvoiceTotals(ctx, invoiceId, { items: totals.items });
  await audit(ctx, {
    entity_type: "invoice",
    entity_id: invoiceId,
    action: "invoice.items_replaced",
    before_state: { amount: inv.amount, items: inv.items },
    after_state: isFailure(result) ? null : result.totals,
  });
  return result;
}

/* ------------------------------------------------------- invoice status */

/** Explicit owner/AI-driven status change, guarded by the state machine. */
export async function setInvoiceStatus(ctx: FinCtx, invoiceId: string, next: string) {
  const { data: inv } = await ctx.supabase.from("invoices").select("*").eq("id", invoiceId).eq("owner_id", ctx.userId).maybeSingle();
  if (!inv) return fail("not_found", "Invoice not found.", { invoice_id: invoiceId });
  if (inv.status === next) return { invoice: inv, unchanged: true };
  if (!canTransitionInvoice(inv.status, next))
    return fail("invalid_state_transition", `Cannot move invoice from ${inv.status} to ${next}.`, {
      from: inv.status,
      to: next,
    });

  const patch: Record<string, unknown> = { status: next };
  if (next === "sent") patch['sent_at'] = new Date().toISOString();
  if (next === "cancelled") patch['cancelled_at'] = new Date().toISOString();

  const { data: updated, error } = await ctx.supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId)
    .select("*")
    .single();
  if (error) return fail("internal_error", error.message);
  await audit(ctx, {
    entity_type: "invoice",
    entity_id: invoiceId,
    action: `invoice.status.${next}`,
    before_state: { status: inv.status },
    after_state: { status: next },
  });
  return { invoice: updated };
}

/** Single source of truth: recompute paid/remaining/status of one invoice from its live payments. */
export async function recalcInvoice(ctx: FinCtx, invoiceId: string) {
  const { data: inv } = await ctx.supabase.from("invoices").select("*").eq("id", invoiceId).eq("owner_id", ctx.userId).maybeSingle();
  if (!inv) return null;
  const { data: pays } = await ctx.supabase
    .from("payments")
    .select("amount,reversed_at")
    .eq("invoice_id", invoiceId);
  const paid = round2((pays ?? []).filter((p) => !p.reversed_at).reduce((s, p) => s + toNumber(p.amount), 0));
  const amount = round2(toNumber(inv.amount));
  const derived = deriveInvoiceStatusCore({
    status: inv.status,
    amount,
    paid_amount: paid,
    due_date: inv.due_date,
  });
  const status = canTransitionInvoice(inv.status, derived) ? derived : inv.status;
  const { data: updated } = await ctx.supabase
    .from("invoices")
    .update({
      paid_amount: paid,
      remaining_balance: round2(Math.max(0, amount - paid)),
      status,
      paid_date: amount > 0 && paid >= amount ? todayISO() : null,
    })
    .eq("id", invoiceId)
    .select("*")
    .single();
  return updated;
}

export async function refreshOverdueInvoices(ctx: FinCtx) {
  const { data } = await ctx.supabase
    .from("invoices")
    .update({ status: "overdue" })
    .eq("owner_id", ctx.userId)
    .lt("due_date", todayISO())
    .in("status", ["sent", "viewed", "partially_paid"])
    .select("id");
  return { transitioned: (data ?? []).length };
}

/* -------------------------------------------------------- payment engine */

export type RecordPaymentInput = {
  invoice_id?: string | null;
  client_id?: string | null;
  plan_id?: string | null;
  installment_id?: string | null;
  amount: number;
  currency?: string;
  payment_date?: string;
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  idempotency_key?: string | null;
  allow_overpayment?: boolean;
};

/**
 * The only supported way to record money in. Validates amount, enforces
 * balance limits, is idempotent, then recalculates every affected aggregate.
 */
export async function recordPayment(ctx: FinCtx, input: RecordPaymentInput) {
  const amount = round2(toNumber(input.amount));
  if (!(amount > 0)) return fail("validation_failed", "Payment amount must be greater than zero.");

  if (input.idempotency_key) {
    const { data: existing } = await ctx.supabase
      .from("payments")
      .select("*")
      .eq("owner_id", ctx.userId)
      .eq("idempotency_key", input.idempotency_key)
      .maybeSingle();
    if (existing) return { recorded: true, duplicate: true, payment: existing };
  }

  let invoice: Record<string, unknown> | null = null;
  if (input.invoice_id) {
    const { data } = await ctx.supabase.from("invoices").select("*").eq("id", input.invoice_id).eq("owner_id", ctx.userId).maybeSingle();
    if (!data) return fail("not_found", "Invoice not found.", { invoice_id: input.invoice_id });
    if (data.status === "cancelled") return fail("invoice_locked", "This invoice is cancelled.");
    if (data.status === "draft")
      return fail("invoice_locked", "Send the invoice before recording a payment against it.");
    const remaining = round2(toNumber(data.remaining_balance));
    if (!input.allow_overpayment && amount > remaining + 0.001)
      return fail("amount_exceeds_balance", `Payment exceeds the remaining balance of ${remaining}.`, {
        remaining_balance: remaining,
        attempted: amount,
      });
    invoice = data as Record<string, unknown>;
  }

  let planId = input.plan_id ?? null;
  if (input.installment_id) {
    const { data: inst } = await ctx.supabase
      .from("payment_plan_installments")
      .select("*")
      .eq("id", input.installment_id)
      .eq("owner_id", ctx.userId)
      .maybeSingle();
    if (!inst) return fail("not_found", "Installment not found.", { installment_id: input.installment_id });
    planId = planId ?? inst.plan_id;
  }
  if (planId) {
    const { data: plan } = await ctx.supabase.from("payment_plans").select("status").eq("id", planId).eq("owner_id", ctx.userId).maybeSingle();
    if (!plan) return fail("not_found", "Payment plan not found.", { plan_id: planId });
    if (plan.status === "cancelled") return fail("conflict", "This payment plan is cancelled.");
  }

  const { data: payment, error } = await ctx.supabase
    .from("payments")
    .insert({
      owner_id: ctx.userId,
      invoice_id: input.invoice_id ?? null,
      client_id: input.client_id ?? (invoice?.['client_id'] as string | undefined) ?? null,
      plan_id: planId,
      installment_id: input.installment_id ?? null,
      amount,
      currency: input.currency ?? (invoice?.['currency'] as string | undefined) ?? "AED",
      payment_date: input.payment_date ?? todayISO(),
      payment_method: input.payment_method ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      idempotency_key: input.idempotency_key ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await ctx.supabase
        .from("payments")
        .select("*")
        .eq("owner_id", ctx.userId)
        .eq("idempotency_key", input.idempotency_key!)
        .maybeSingle();
      if (existing) return { recorded: true, duplicate: true, payment: existing };
    }
    return fail("internal_error", error.message);
  }

  const updatedInvoice = payment.invoice_id ? await recalcInvoice(ctx, payment.invoice_id) : null;
  const planState = planId ? await recalcPlan(ctx, planId) : null;

  await audit(ctx, {
    entity_type: "payment",
    entity_id: payment.id,
    action: "payment.recorded",
    before_state: invoice ? { remaining_balance: invoice['remaining_balance'], status: invoice['status'] } : null,
    after_state: updatedInvoice
      ? { remaining_balance: updatedInvoice.remaining_balance, status: updatedInvoice.status }
      : { amount, plan_id: planId },
    metadata: { amount, currency: payment.currency, invoice_id: payment.invoice_id, plan_id: planId },
  });

  await notifyPaymentReceived(ctx, {
    payment_id: payment.id,
    invoice_id: payment.invoice_id,
    client_id: payment.client_id,
    amount,
    currency: payment.currency,
  });

  if (updatedInvoice && invoice) {
    const late = daysBetween(String(invoice['due_date']), payment.payment_date);
    await ctx.supabase.from("client_memory").upsert(
      {
        owner_id: ctx.userId,
        client_id: payment.client_id,
        memory_type: "payment_behavior",
        memory_key: "last_payment_delay_days",
        memory_value: { days: late, invoice: invoice['invoice_number'], amount } as never,
        confidence: 1,
        source: "system",
      },
      { onConflict: "owner_id,client_id,memory_key" },
    );
  }

  return { recorded: true, payment, invoice: updatedInvoice, plan: planState };
}

/** Reverse a payment (never delete it) and roll every aggregate back. */
export async function reversePayment(ctx: FinCtx, paymentId: string, reason?: string) {
  const { data: pay } = await ctx.supabase.from("payments").select("*").eq("id", paymentId).eq("owner_id", ctx.userId).maybeSingle();
  if (!pay) return fail("not_found", "Payment not found.", { payment_id: paymentId });
  if (pay.reversed_at) return fail("conflict", "This payment was already reversed.");

  const { data: updated, error } = await ctx.supabase
    .from("payments")
    .update({
      reversed_at: new Date().toISOString(),
      reversal_reason: reason ?? null,
      reversed_by: ctx.actor ?? "system",
    })
    .eq("id", paymentId)
    .select("*")
    .single();
  if (error) return fail("internal_error", error.message);

  const invoice = updated.invoice_id ? await recalcInvoice(ctx, updated.invoice_id) : null;
  const plan = updated.plan_id ? await recalcPlan(ctx, updated.plan_id) : null;
  await audit(ctx, {
    entity_type: "payment",
    entity_id: paymentId,
    action: "payment.reversed",
    before_state: { amount: pay.amount, reversed_at: null },
    after_state: { reversed_at: updated.reversed_at, reason: reason ?? null },
  });
  return { reversed: true, payment: updated, invoice, plan };
}

/* ---------------------------------------------------------- payment plans */

export async function createPaymentPlan(
  ctx: FinCtx,
  input: {
    client_id: string;
    invoice_id?: string | null;
    total_amount: number;
    currency: string;
    installment_count: number;
    frequency?: string;
    start_date?: string;
    notes?: string | null;
  },
): Promise<DuelyFailure | { plan: unknown; installments: unknown[] }> {
  const count = Math.max(1, Math.round(toNumber(input.installment_count, 1)));
  if (count > 60) return fail("validation_failed", "A payment plan cannot exceed 60 installments.");
  const total = round2(toNumber(input.total_amount));
  if (total <= 0) return fail("validation_failed", "Plan total must be greater than zero.");
  const frequency = input.frequency ?? "monthly";
  if (!["weekly", "biweekly", "monthly", "quarterly"].includes(frequency))
    return fail("validation_failed", `Unsupported plan frequency: ${frequency}.`);
  const start = input.start_date ?? todayISO();

  if (input.invoice_id) {
    const { data: existing } = await ctx.supabase
      .from("payment_plans")
      .select("id,status")
      .eq("invoice_id", input.invoice_id)
      .in("status", ["active", "at_risk", "paused"])
      .maybeSingle();
    if (existing) return fail("conflict", "This invoice already has an active payment plan.", { plan_id: existing.id });
  }

  const amounts = splitInstallments(total, count);
  const dueDates = amounts.map((_, i) => installmentDueDate(start, frequency, i));

  const { data: plan, error } = await ctx.supabase
    .from("payment_plans")
    .insert({
      owner_id: ctx.userId,
      client_id: input.client_id,
      invoice_id: input.invoice_id ?? null,
      total_amount: total,
      currency: input.currency,
      installment_count: count,
      frequency,
      start_date: start,
      end_date: dueDates[dueDates.length - 1]!,
      remaining_amount: total,
      status: "active",
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error || !plan) return fail("internal_error", error?.message ?? "Could not create the payment plan.");

  const { error: iErr } = await ctx.supabase.from("payment_plan_installments").insert(
    amounts.map((amount, i) => ({
      owner_id: ctx.userId,
      plan_id: plan.id,
      seq: i + 1,
      due_date: dueDates[i]!,
      amount,
      status: "pending",
    })),
  );
  if (iErr) return fail("internal_error", iErr.message);

  await audit(ctx, {
    entity_type: "payment_plan",
    entity_id: plan.id,
    action: "payment_plan.created",
    after_state: { total, count, frequency, start },
  });
  const state = await recalcPlan(ctx, plan.id);
  return isFailure(state) ? state : state;
}

/** Recompute installment + plan state from linked payments. */
export async function recalcPlan(
  ctx: FinCtx,
  planId: string,
): Promise<DuelyFailure | { plan: unknown; installments: Record<string, unknown>[] }> {
  const { data: plan } = await ctx.supabase.from("payment_plans").select("*").eq("id", planId).eq("owner_id", ctx.userId).maybeSingle();
  if (!plan) return fail("not_found", "Payment plan not found.", { plan_id: planId });

  const { data: installments } = await ctx.supabase
    .from("payment_plan_installments")
    .select("*")
    .eq("plan_id", planId)
    .order("seq", { ascending: true });
  const { data: pays } = await ctx.supabase
    .from("payments")
    .select("id,amount,installment_id,reversed_at")
    .eq("plan_id", planId);
  const live = (pays ?? []).filter((p) => !p.reversed_at);

  const direct: Record<string, number> = {};
  for (const p of live) if (p.installment_id) direct[p.installment_id] = round2((direct[p.installment_id] ?? 0) + toNumber(p.amount));
  const unlinked = round2(live.filter((p) => !p.installment_id).reduce((s, p) => s + toNumber(p.amount), 0));

  const rows = (installments ?? []).map((i) => ({ id: i.id, amount: toNumber(i.amount), due_date: i.due_date }));
  const allocation = allocatePlanPayments(rows, direct, unlinked);

  const updatedInstallments: Record<string, unknown>[] = [];
  for (const inst of installments ?? []) {
    const paid = round2(allocation[inst.id] ?? 0);
    const status = deriveInstallmentStatus({ amount: toNumber(inst.amount), paid_amount: paid, due_date: inst.due_date });
    if (paid !== round2(toNumber(inst.paid_amount)) || status !== inst.status) {
      await ctx.supabase
        .from("payment_plan_installments")
        .update({ paid_amount: paid, status })
        .eq("id", inst.id);
    }
    updatedInstallments.push({ ...inst, paid_amount: paid, status });
  }

  const paidTotal = round2(live.reduce((s, p) => s + toNumber(p.amount), 0));
  const remaining = round2(Math.max(0, toNumber(plan.total_amount) - paidTotal));
  const derived = derivePlanStatus({
    current: plan.status,
    remaining,
    installmentStatuses: updatedInstallments.map((i) => String(i['status'])),
  });
  const status = canTransitionPlan(plan.status, derived) ? derived : plan.status;

  const { data: saved } = await ctx.supabase
    .from("payment_plans")
    .update({ paid_amount: paidTotal, remaining_amount: remaining, status })
    .eq("id", planId)
    .select("*")
    .single();

  if (plan.invoice_id) await recalcInvoice(ctx, plan.invoice_id);
  return { plan: saved ?? plan, installments: updatedInstallments };
}

export async function setPlanStatus(ctx: FinCtx, planId: string, next: string, reason?: string) {
  const { data: plan } = await ctx.supabase.from("payment_plans").select("*").eq("id", planId).eq("owner_id", ctx.userId).maybeSingle();
  if (!plan) return fail("not_found", "Payment plan not found.", { plan_id: planId });
  if (!canTransitionPlan(plan.status, next))
    return fail("invalid_state_transition", `Cannot move plan from ${plan.status} to ${next}.`, {
      from: plan.status,
      to: next,
    });
  const { data: saved, error } = await ctx.supabase
    .from("payment_plans")
    .update({ status: next, paused_at: next === "paused" ? new Date().toISOString() : null })
    .eq("id", planId)
    .select("*")
    .single();
  if (error) return fail("internal_error", error.message);
  await audit(ctx, {
    entity_type: "payment_plan",
    entity_id: planId,
    action: `payment_plan.status.${next}`,
    before_state: { status: plan.status },
    after_state: { status: next, reason: reason ?? null },
  });
  return { plan: saved };
}

/* ---------------------------------------------------------- risk engine */

export type RiskResult = {
  client_id: string;
  score: number;
  level: RiskLevel;
  factors: string[];
  average_payment_delay_days: number | null;
  on_time_percentage: number | null;
  overdue_amount: number;
  outstanding: number;
};

/** Pure risk computation over already-fetched rows. Prefer this over `clientRisk` when scoring many clients to avoid N+1 queries. */
export function computeClientRisk(
  clientId: string,
  invoices: { id: string; status: string; due_date: string; remaining_balance: number | string }[],
  payments: { amount: number | string; payment_date: string; invoice_id: string | null; reversed_at?: string | null }[],
): RiskResult {
  const list = invoices;
  const all = payments;
  const live = all.filter((p) => !p.reversed_at);

  const delays: number[] = [];
  for (const pay of live) {
    const inv = list.find((i) => i.id === pay.invoice_id);
    if (inv) delays.push(daysBetween(inv.due_date, pay.payment_date));
  }
  const open = list.filter((i) => !NON_RECEIVABLE.includes(i.status));
  const outstanding = round2(open.reduce((s, i) => s + toNumber(i.remaining_balance), 0));
  const overdueInv = open.filter((i) => i.due_date < todayISO());
  const overdueAmount = round2(overdueInv.reduce((s, i) => s + toNumber(i.remaining_balance), 0));
  const maxDaysOverdue = overdueInv.reduce((m, i) => Math.max(m, daysBetween(i.due_date, todayISO())), 0);

  const scored = scoreRisk({
    delays,
    outstanding,
    overdue_amount: overdueAmount,
    max_days_overdue: maxDaysOverdue,
    reversed_payment_count: all.filter((p) => p.reversed_at).length,
  });

  return { client_id: clientId, ...scored, overdue_amount: overdueAmount, outstanding };
}

export async function clientRisk(ctx: FinCtx, clientId: string): Promise<RiskResult> {
  const { data: invoices } = await ctx.supabase.from("invoices").select("*").eq("client_id", clientId).eq("owner_id", ctx.userId);
  const { data: payments } = await ctx.supabase
    .from("payments")
    .select("amount,payment_date,invoice_id,reversed_at")
    .eq("client_id", clientId)
    .eq("owner_id", ctx.userId);
  return computeClientRisk(clientId, invoices ?? [], payments ?? []);
}

/* ---------------------------------------------------------- notifications */

async function pushNotification(
  ctx: FinCtx,
  row: {
    event_type: string;
    title: string;
    body?: string;
    dedupe_key: string;
    invoice_id?: string | null;
    client_id?: string | null;
    plan_id?: string | null;
    installment_id?: string | null;
  },
) {
  await ctx.supabase
    .from("notifications")
    .upsert({ owner_id: ctx.userId, ...row }, { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true });
}

/** Idempotent notification sweep: due soon, overdue, installment due, plan at risk. */
export async function syncNotifications(ctx: FinCtx) {
  await refreshOverdueInvoices(ctx);
  const now = todayISO();
  const soon = addDaysFrom(now, 3);
  const { data: invoices } = await ctx.supabase
    .from("invoices")
    .select("id,invoice_number,due_date,status,remaining_balance,currency,client_id, clients(name)")
    .eq("owner_id", ctx.userId)
    .not("status", "in", "(paid,cancelled,draft)");

  for (const inv of invoices ?? []) {
    const client = (inv.clients as { name?: string } | null)?.name ?? "client";
    const money = `${inv.currency} ${toNumber(inv.remaining_balance).toLocaleString()}`;
    if (inv.due_date < now) {
      const days = daysBetween(inv.due_date, now);
      await pushNotification(ctx, {
        event_type: "invoice_overdue",
        title: `${inv.invoice_number} is overdue`,
        body: `${client} — ${money} overdue by ${days} day(s).`,
        dedupe_key: `invoice_overdue:${inv.id}:${inv.due_date}`,
        invoice_id: inv.id,
        client_id: inv.client_id,
      });
    } else if (inv.due_date <= soon) {
      await pushNotification(ctx, {
        event_type: "invoice_due_soon",
        title: `${inv.invoice_number} is due soon`,
        body: `${client} — ${money} due on ${inv.due_date}.`,
        dedupe_key: `invoice_due_soon:${inv.id}:${inv.due_date}`,
        invoice_id: inv.id,
        client_id: inv.client_id,
      });
    }
  }

  const { data: installments } = await ctx.supabase
    .from("payment_plan_installments")
    .select("id,seq,due_date,amount,paid_amount,status,plan_id, payment_plans(client_id,currency,status)")
    .eq("owner_id", ctx.userId)
    .in("status", ["pending", "partial", "overdue"])
    .lte("due_date", soon);

  for (const inst of installments ?? []) {
    const plan = inst.payment_plans as { client_id?: string; currency?: string; status?: string } | null;
    if (plan?.status === "cancelled" || plan?.status === "paused") continue;
    const overdue = inst.due_date < now;
    await pushNotification(ctx, {
      event_type: overdue ? "installment_overdue" : "installment_due_soon",
      title: `Installment ${inst.seq} ${overdue ? "is overdue" : "is due soon"}`,
      body: `${plan?.currency ?? "AED"} ${round2(toNumber(inst.amount) - toNumber(inst.paid_amount))} due on ${inst.due_date}.`,
      dedupe_key: `installment:${overdue ? "overdue" : "soon"}:${inst.id}:${inst.due_date}`,
      plan_id: inst.plan_id,
      installment_id: inst.id,
      client_id: plan?.client_id ?? null,
    });
  }

  const { data: unread } = await ctx.supabase
    .from("notifications")
    .select("*")
    .eq("owner_id", ctx.userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return { notifications: unread ?? [] };
}

export async function notifyPaymentReceived(
  ctx: FinCtx,
  args: { payment_id: string; invoice_id?: string | null; client_id?: string | null; amount: number; currency: string },
) {
  await pushNotification(ctx, {
    event_type: "payment_received",
    title: "Payment received",
    body: `${args.currency} ${args.amount.toLocaleString()} recorded.`,
    dedupe_key: `payment_received:${args.payment_id}`,
    invoice_id: args.invoice_id ?? null,
    client_id: args.client_id ?? null,
  });
}
