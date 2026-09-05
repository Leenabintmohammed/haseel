import type { SupabaseClient } from "@supabase/supabase-js";

export type DiscountRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type DiscountRequest = {
  id: string;
  owner_id: string;
  client_id: string;
  invoice_id: string;
  requested_discount_amount: number | null;
  requested_discount_percentage: number | null;
  customer_message: string;
  status: DiscountRequestStatus;
  created_at: string;
  resolved_at: string | null;
};

type CreateDiscountRequestInput = {
  supabase: SupabaseClient;
  ownerId: string;
  clientId: string;
  invoiceId: string;
  requestedDiscountAmount?: number | null;
  requestedDiscountPercentage?: number | null;
  customerMessage: string;
};

export async function createDiscountRequest({
  supabase,
  ownerId,
  clientId,
  invoiceId,
  requestedDiscountAmount = null,
  requestedDiscountPercentage = null,
  customerMessage,
}: CreateDiscountRequestInput): Promise<DiscountRequest> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, owner_id, client_id, status, amount, remaining_balance")
    .eq("id", invoiceId)
    .eq("owner_id", ownerId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (invoiceError) {
    throw new Error(`discount_invoice_lookup_failed: ${invoiceError.message}`);
  }

  if (!invoice) {
    throw new Error("discount_invoice_not_found");
  }

  if (
    invoice.remaining_balance !== null &&
    Number(invoice.remaining_balance) <= 0
  ) {
    throw new Error("discount_invoice_already_paid");
  }

  if (
    requestedDiscountPercentage !== null &&
    (requestedDiscountPercentage <= 0 ||
      requestedDiscountPercentage > 100)
  ) {
    throw new Error("invalid_discount_percentage");
  }

  if (
    requestedDiscountAmount !== null &&
    requestedDiscountAmount <= 0
  ) {
    throw new Error("invalid_discount_amount");
  }

  const { data, error } = await supabase
    .from("discount_requests")
    .insert({
      owner_id: ownerId,
      client_id: clientId,
      invoice_id: invoiceId,
      requested_discount_amount: requestedDiscountAmount,
      requested_discount_percentage: requestedDiscountPercentage,
      customer_message: customerMessage.trim(),
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`discount_request_create_failed: ${error.message}`);
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
    throw new Error(`discount_request_lookup_failed: ${error.message}`);
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
    throw new Error(`discount_request_list_failed: ${error.message}`);
  }

  return (data ?? []) as DiscountRequest[];
}

type ResolveDiscountRequestInput = {
  supabase: SupabaseClient;
  ownerId: string;
  requestId: string;
};

export async function rejectDiscountRequest({
  supabase,
  ownerId,
  requestId,
}: ResolveDiscountRequestInput): Promise<DiscountRequest> {
  const { data: request, error: requestError } = await supabase
    .from("discount_requests")
    .select("*")
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (requestError) {
    throw new Error(`discount_request_lookup_failed: ${requestError.message}`);
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
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) {
    throw new Error(`discount_request_reject_failed: ${error.message}`);
  }

  return data as DiscountRequest;
}
