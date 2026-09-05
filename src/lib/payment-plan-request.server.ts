import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymentPlan, type FinCtx } from "./finance.server";

export type PaymentPlanRequestStatus =
  | "pending"
  | "approved"
  | "rejected";

export type PaymentPlanRequest = {
  id: string;
  owner_id: string;
  invoice_id: string | null;
  client_id: string | null;
  requested_total_amount: number | null;
  requested_installment_count: number;
  requested_frequency: "weekly" | "biweekly" | "monthly" | "quarterly";
  requested_start_date: string | null;
  reason: string | null;
  status: PaymentPlanRequestStatus;
  owner_response: string | null;
  created_at: string;
  resolved_at: string | null;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeFrequency(
  value: unknown,
): "weekly" | "biweekly" | "monthly" | "quarterly" {
  const normalized = String(value ?? "").toLowerCase().trim();

  if (normalized === "weekly") return "weekly";
  if (normalized === "biweekly") return "biweekly";
  if (normalized === "quarterly") return "quarterly";

  return "monthly";
}

export async function createPaymentPlanRequest(input: {
  supabase: SupabaseClient;
  ownerId: string;
  clientId: string;
  invoiceId: string;
  requestedInstallmentCount: number;
  requestedFrequency?: string | null;
  requestedStartDate?: string | null;
  reason: string;
}): Promise<PaymentPlanRequest> {
  const count = Math.round(
    toNumber(input.requestedInstallmentCount) ?? 0,
  );

  if (count < 2 || count > 60) {
    throw new Error("invalid_payment_plan_installment_count");
  }

  const frequency = normalizeFrequency(
    input.requestedFrequency,
  );

  const { data: invoice, error: invoiceError } = await input.supabase
    .from("invoices")
    .select(
      "id,owner_id,client_id,status,amount,remaining_balance,currency",
    )
    .eq("id", input.invoiceId)
    .eq("owner_id", input.ownerId)
    .eq("client_id", input.clientId)
    .maybeSingle();

  if (invoiceError) {
    throw new Error(
      `payment_plan_invoice_lookup_failed: ${invoiceError.message}`,
    );
  }

  if (!invoice) {
    throw new Error("payment_plan_invoice_not_found");
  }

  const remaining = toNumber(invoice.remaining_balance);

  if (remaining === null || remaining <= 0) {
    throw new Error("payment_plan_invoice_already_paid");
  }

  if (
    ["draft", "paid", "cancelled"].includes(
      String(invoice.status).toLowerCase(),
    )
  ) {
    throw new Error("payment_plan_invoice_not_eligible");
  }

  const { data: existingPlan } = await input.supabase
    .from("payment_plans")
    .select("id,status")
    .eq("owner_id", input.ownerId)
    .eq("invoice_id", input.invoiceId)
    .in("status", ["active", "at_risk", "paused"])
    .maybeSingle();

  if (existingPlan) {
    throw new Error("payment_plan_already_active");
  }

  const { data: existingRequest, error: requestLookupError } =
    await input.supabase
      .from("payment_plan_requests")
      .select("id,status")
      .eq("owner_id", input.ownerId)
      .eq("client_id", input.clientId)
      .eq("invoice_id", input.invoiceId)
      .eq("status", "pending")
      .maybeSingle();

  if (requestLookupError) {
    throw new Error(
      `payment_plan_request_existing_lookup_failed: ${requestLookupError.message}`,
    );
  }

  if (existingRequest) {
    throw new Error("payment_plan_request_already_pending");
  }

  const { data, error } = await (
    input.supabase as any
  )
    .from("payment_plan_requests")
    .insert({
      owner_id: input.ownerId,
      client_id: input.clientId,
      invoice_id: input.invoiceId,
      requested_total_amount: remaining,
      requested_installment_count: count,
      requested_frequency: frequency,
      requested_start_date:
        input.requestedStartDate ?? null,
      reason: input.reason.trim() || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `payment_plan_request_create_failed: ${error.message}`,
    );
  }

  return data as PaymentPlanRequest;
}

export async function listPendingPaymentPlanRequests(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<PaymentPlanRequest[]> {
  const { data, error } = await (
    supabase as any
  )
    .from("payment_plan_requests")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `payment_plan_request_list_failed: ${error.message}`,
    );
  }

  return (data ?? []) as PaymentPlanRequest[];
}

export async function rejectPaymentPlanRequest(input: {
  supabase: SupabaseClient;
  ownerId: string;
  requestId: string;
  ownerResponse?: string | null;
}): Promise<PaymentPlanRequest> {
  const { data: request, error: requestError } = await (
    input.supabase as any
  )
    .from("payment_plan_requests")
    .select("*")
    .eq("id", input.requestId)
    .eq("owner_id", input.ownerId)
    .maybeSingle();

  if (requestError) {
    throw new Error(
      `payment_plan_request_lookup_failed: ${requestError.message}`,
    );
  }

  if (!request) {
    throw new Error("payment_plan_request_not_found");
  }

  if (request.status !== "pending") {
    throw new Error("payment_plan_request_already_resolved");
  }

  const { data, error } = await (
    input.supabase as any
  )
    .from("payment_plan_requests")
    .update({
      status: "rejected",
      owner_response:
        input.ownerResponse?.trim() || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.requestId)
    .eq("owner_id", input.ownerId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `payment_plan_request_reject_failed: ${error.message}`,
    );
  }

  return data as PaymentPlanRequest;
}

export async function approvePaymentPlanRequest(input: {
  supabase: SupabaseClient;
  ownerId: string;
  requestId: string;
  ownerResponse?: string | null;
}): Promise<{
  request: PaymentPlanRequest;
  plan: any;
  installments: any[];
}> {
  const { data: request, error: requestError } = await (
    input.supabase as any
  )
    .from("payment_plan_requests")
    .select("*")
    .eq("id", input.requestId)
    .eq("owner_id", input.ownerId)
    .maybeSingle();

  if (requestError) {
    throw new Error(
      `payment_plan_request_lookup_failed: ${requestError.message}`,
    );
  }

  if (!request) {
    throw new Error("payment_plan_request_not_found");
  }

  if (request.status !== "pending") {
    throw new Error("payment_plan_request_already_resolved");
  }

  if (!request.invoice_id) {
    throw new Error("payment_plan_request_invoice_missing");
  }

  if (!request.client_id) {
    throw new Error("payment_plan_request_client_missing");
  }

  const { data: invoice, error: invoiceError } = await input.supabase
    .from("invoices")
    .select(
      "id,owner_id,client_id,status,amount,remaining_balance,currency",
    )
    .eq("id", request.invoice_id)
    .eq("owner_id", input.ownerId)
    .eq("client_id", request.client_id)
    .maybeSingle();

  if (invoiceError) {
    throw new Error(
      `payment_plan_invoice_lookup_failed: ${invoiceError.message}`,
    );
  }

  if (!invoice) {
    throw new Error("payment_plan_invoice_not_found");
  }

  const remaining = toNumber(invoice.remaining_balance);

  if (remaining === null || remaining <= 0) {
    throw new Error("payment_plan_invoice_already_paid");
  }

  const { data: existingPlan } = await input.supabase
    .from("payment_plans")
    .select("id,status")
    .eq("owner_id", input.ownerId)
    .eq("invoice_id", input.invoice_id)
    .in("status", ["active", "at_risk", "paused"])
    .maybeSingle();

  if (existingPlan) {
    throw new Error("payment_plan_already_active");
  }

  const finCtx: FinCtx = {
    supabase: input.supabase,
    userId: input.ownerId,
    actor: "human",
  };

  const result = await createPaymentPlan(finCtx, {
    client_id: request.client_id,
    invoice_id: request.invoice_id,
    total_amount: remaining,
    currency: invoice.currency || "AED",
    installment_count: request.requested_installment_count,
    frequency: request.requested_frequency,
    start_date:
      request.requested_start_date ||
      new Date().toISOString().slice(0, 10),
    notes: request.reason
      ? `Created from customer payment plan request: ${request.reason}`
      : "Created from customer payment plan request.",
  });

  if ("error" in result) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "payment_plan_create_failed",
    );
  }

  const createdPlan = result.plan as any;
  const createdInstallments = Array.isArray(result.installments)
    ? (result.installments as any[])
    : [];

  const { data: resolvedRequest, error: resolveError } = await (
    input.supabase as any
  )
    .from("payment_plan_requests")
    .update({
      status: "approved",
      owner_response:
        input.ownerResponse?.trim() || "Approved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.requestId)
    .eq("owner_id", input.ownerId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (resolveError) {
    throw new Error(
      `payment_plan_request_resolve_failed_after_plan_creation: ${resolveError.message}`,
    );
  }

  return {
    request: resolvedRequest as PaymentPlanRequest,
    plan: createdPlan,
    installments: createdInstallments,
  };
}
