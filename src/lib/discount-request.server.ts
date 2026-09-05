import type { SupabaseClient } from "@supabase/supabase-js";
import { recalcInvoiceTotals, type FinCtx } from "./finance.server";

export type DiscountRequestStatus =
  | "pending"
  | "approved"
  | "rejected";

export type DiscountRequest = {
  id: string;
  owner_id: string;
  client_id: string | null;
  invoice_id: string | null;
  requested_amount: number | null;
  requested_discount_amount: number | null;
  requested_discount_percent: number | null;
  reason: string | null;
  status: DiscountRequestStatus;
  owner_response: string | null;
  created_at: string;
  resolved_at: string | null;
};

type CreateDiscountRequestInput = {
  supabase: SupabaseClient;
  ownerId: string;
  clientId: string;
  invoiceId: string;
  requestedAmount?: number | null;
  requestedDiscountAmount?: number | null;
  requestedDiscountPercent?: number | null;
  reason: string;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function createDiscountRequest({
  supabase,
  ownerId,
  clientId,
  invoiceId,
  requestedAmount = null,
  requestedDiscountAmount = null,
  requestedDiscountPercent = null,
  reason,
}: CreateDiscountRequestInput): Promise<DiscountRequest> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, client_id, status, amount, remaining_balance, discount_type, discount_value",
    )
    .eq("id", invoiceId)
    .eq("owner_id", ownerId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (invoiceError) {
    throw new Error(
      `discount_invoice_lookup_failed: ${invoiceError.message}`,
    );
  }

  if (!invoice) {
    throw new Error("discount_invoice_not_found");
  }

  const remainingBalance = toNumber(invoice.remaining_balance);

  if (remainingBalance !== null && remainingBalance <= 0) {
    throw new Error("discount_invoice_already_paid");
  }

  const discountAmount = toNumber(requestedDiscountAmount);
  const discountPercent = toNumber(requestedDiscountPercent);

  if (
    discountPercent !== null &&
    (discountPercent <= 0 || discountPercent > 100)
  ) {
    throw new Error("invalid_discount_percentage");
  }

  if (discountAmount !== null && discountAmount <= 0) {
    throw new Error("invalid_discount_amount");
  }

  if (discountAmount === null && discountPercent === null && !reason.trim()) {
    throw new Error("discount_request_requires_reason");
  }

  if (discountAmount !== null && discountPercent !== null) {
    throw new Error("discount_request_multiple_discount_types");
  }

  /*
   * Prevent multiple unresolved requests for the same invoice.
   *
   * The customer should not be able to create a new request every time
   * they send another WhatsApp message while an owner decision is pending.
   */
  const { data: existingRequest, error: existingRequestError } =
    await supabase
      .from("discount_requests")
      .select("id, status")
      .eq("owner_id", ownerId)
      .eq("client_id", clientId)
      .eq("invoice_id", invoiceId)
      .eq("status", "pending")
      .maybeSingle();

  if (existingRequestError) {
    throw new Error(
      `discount_request_existing_lookup_failed: ${existingRequestError.message}`,
    );
  }

  if (existingRequest) {
    throw new Error("discount_request_already_pending");
  }

  const invoiceAmount = toNumber(invoice.amount);

  const { data, error } = await supabase
    .from("discount_requests")
    .insert({
      owner_id: ownerId,
      client_id: clientId,
      invoice_id: invoiceId,
      requested_amount: requestedAmount ?? invoiceAmount,
      requested_discount_amount: discountAmount,
      requested_discount_percent: discountPercent,
      reason: reason.trim() || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `discount_request_create_failed: ${error.message}`,
    );
  }

  return data as DiscountRequest;
}

export async function getDiscountRequest(
  supabase: SupabaseClient,
  ownerId: string,
  requestId: string,
): Promise<DiscountRequest | null> {
  const { data, error } = await supabase
    .from("discount_requests")
    .select("*")
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `discount_request_lookup_failed: ${error.message}`,
    );
  }

  return data as DiscountRequest | null;
}

export async function listPendingDiscountRequests(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<DiscountRequest[]> {
  const { data, error } = await supabase
    .from("discount_requests")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `discount_request_list_failed: ${error.message}`,
    );
  }

  return (data ?? []) as DiscountRequest[];
}

type ResolveDiscountRequestInput = {
  supabase: SupabaseClient;
  ownerId: string;
  requestId: string;
  ownerResponse?: string | null;
};

/**
 * Reject a pending discount request.
 *
 * This only resolves the request.
 * It MUST NOT modify the invoice.
 */
export async function rejectDiscountRequest({
  supabase,
  ownerId,
  requestId,
  ownerResponse = null,
}: ResolveDiscountRequestInput): Promise<DiscountRequest> {
  const { data: request, error: requestError } = await supabase
    .from("discount_requests")
    .select("*")
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (requestError) {
    throw new Error(
      `discount_request_lookup_failed: ${requestError.message}`,
    );
  }

  if (!request) {
    throw new Error("discount_request_not_found");
  }

  if (request.status !== "pending") {
    throw new Error("discount_request_already_resolved");
  }

  const { data, error } = await supabase
    .from("discount_requests")
    .update({
      status: "rejected",
      owner_response:
        ownerResponse?.trim() || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `discount_request_reject_failed: ${error.message}`,
    );
  }

  return data as DiscountRequest;
}

/**
 * Approve a pending discount request.
 *
 * Financial changes are applied ONLY through recalcInvoiceTotals().
 * Never update invoice.amount or invoice.discount_amount directly here.
 */
export async function approveDiscountRequest({
  supabase,
  ownerId,
  requestId,
  ownerResponse = null,
}: ResolveDiscountRequestInput): Promise<{
  request: DiscountRequest;
  invoice: Record<string, unknown>;
}> {
  const { data: request, error: requestError } = await supabase
    .from("discount_requests")
    .select("*")
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (requestError) {
    throw new Error(
      `discount_request_lookup_failed: ${requestError.message}`,
    );
  }

  if (!request) {
    throw new Error("discount_request_not_found");
  }

  if (request.status !== "pending") {
    throw new Error("discount_request_already_resolved");
  }

  if (!request.invoice_id) {
    throw new Error("discount_request_invoice_missing");
  }

  if (!request.client_id) {
    throw new Error("discount_request_client_missing");
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, client_id, status, amount, remaining_balance, subtotal, discount_type, discount_value, tax_rate",
    )
    .eq("id", request.invoice_id)
    .eq("owner_id", ownerId)
    .eq("client_id", request.client_id)
    .maybeSingle();

  if (invoiceError) {
    throw new Error(
      `discount_invoice_lookup_failed: ${invoiceError.message}`,
    );
  }

  if (!invoice) {
    throw new Error("discount_invoice_not_found");
  }

  const remainingBalance = toNumber(invoice.remaining_balance);

  if (remainingBalance !== null && remainingBalance <= 0) {
    throw new Error("discount_invoice_already_paid");
  }

  const requestedAmount = toNumber(
    request.requested_discount_amount,
  );

  const requestedPercent = toNumber(
    request.requested_discount_percent,
  );

  if (requestedAmount !== null && requestedPercent !== null) {
    throw new Error("discount_request_multiple_discount_types");
  }

  if (requestedAmount !== null && requestedAmount <= 0) {
    throw new Error("invalid_discount_amount");
  }

  if (
    requestedPercent !== null &&
    (requestedPercent <= 0 || requestedPercent > 100)
  ) {
    throw new Error("invalid_discount_percentage");
  }

  /*
   * If the customer made a generic discount request without specifying
   * an amount or percentage, the owner cannot approve an undefined
   * financial value.
   *
   * The owner must first specify a concrete amount/percentage through
   * the approval UI/action.
   */
  if (requestedAmount === null && requestedPercent === null) {
    throw new Error("discount_request_amount_required_for_approval");
  }

  const finCtx: FinCtx = {
    supabase,
    userId: ownerId,
    actor: "human",
  };

  const totalsOverride =
    requestedPercent !== null
      ? {
          discount_type: "percentage",
          discount_value: requestedPercent,
        }
      : {
          discount_type: "fixed",
          discount_value: requestedAmount!,
        };

  const recalculated = await recalcInvoiceTotals(
    finCtx,
    request.invoice_id,
    totalsOverride,
  );

  const { data: resolvedRequest, error: resolveError } =
    await supabase
      .from("discount_requests")
      .update({
        status: "approved",
        owner_response:
          ownerResponse?.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .select("*")
      .single();

  if (resolveError) {
    /*
     * The invoice has already been recalculated. Do not attempt to
     * silently reverse the financial operation here.
     *
     * This should be surfaced as an operational error and investigated
     * rather than pretending the approval did not happen.
     */
    throw new Error(
      `discount_request_resolve_failed_after_invoice_update: ${resolveError.message}`,
    );
  }

  return {
    request: resolvedRequest as DiscountRequest,
    invoice: recalculated.invoice as Record<string, unknown>,
  };
}

