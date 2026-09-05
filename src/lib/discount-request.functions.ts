import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  approveDiscountRequest,
  listPendingDiscountRequests,
  rejectDiscountRequest,
} from "./discount-request.server";
import { wahaWhatsAppProvider } from "./messaging/providers/waha.server";

const RequestIdInput = z.object({
  requestId: z.string().uuid(),
});

const ResolveInput = z.object({
  requestId: z.string().uuid(),
  ownerResponse: z.string().max(1000).optional(),
});

export type OwnerDiscountRequest = {
  id: string;
  owner_id: string;
  client_id: string | null;
  invoice_id: string | null;
  requested_amount: number | null;
  requested_discount_amount: number | null;
  requested_discount_percent: number | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  owner_response: string | null;
  created_at: string;
  resolved_at: string | null;
  client_name: string | null;
  client_phone: string | null;
  invoice_amount: number | null;
  invoice_remaining_balance: number | null;
};

async function enrichRequests(
  supabase: any,
  ownerId: string,
  requests: Awaited<ReturnType<typeof listPendingDiscountRequests>>,
): Promise<OwnerDiscountRequest[]> {
  if (!requests.length) {
    return [];
  }

  const clientIds = Array.from(
    new Set(
      requests
        .map((request) => request.client_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const invoiceIds = Array.from(
    new Set(
      requests
        .map((request) => request.invoice_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [{ data: clients, error: clientsError }, { data: invoices, error: invoicesError }] =
    await Promise.all([
      clientIds.length
        ? supabase
            .from("clients")
            .select("id, owner_id, name, phone")
            .eq("owner_id", ownerId)
            .in("id", clientIds)
        : Promise.resolve({ data: [], error: null }),

      invoiceIds.length
        ? supabase
            .from("invoices")
            .select("id, owner_id, client_id, amount, remaining_balance")
            .eq("owner_id", ownerId)
            .in("id", invoiceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (clientsError) {
    throw new Error(`discount_clients_lookup_failed: ${clientsError.message}`);
  }

  if (invoicesError) {
    throw new Error(`discount_invoices_lookup_failed: ${invoicesError.message}`);
  }

  const clientMap = new Map(
    (clients ?? []).map((client: any) => [client.id, client]),
  );

  const invoiceMap = new Map(
    (invoices ?? []).map((invoice: any) => [invoice.id, invoice]),
  );

  return requests.map((request) => {
    const client = request.client_id
      ? clientMap.get(request.client_id)
      : null;

    const invoice = request.invoice_id
      ? invoiceMap.get(request.invoice_id)
      : null;

    return {
      ...request,
      client_name: client?.name ?? null,
      client_phone: client?.phone ?? null,
      invoice_amount:
        invoice?.amount !== null && invoice?.amount !== undefined
          ? Number(invoice.amount)
          : null,
      invoice_remaining_balance:
        invoice?.remaining_balance !== null &&
        invoice?.remaining_balance !== undefined
          ? Number(invoice.remaining_balance)
          : null,
    };
  });
}

export const getPendingDiscountRequestsFn = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }): Promise<OwnerDiscountRequest[]> => {
    const requests = await listPendingDiscountRequests(
      context.supabase,
      context.userId,
    );

    return enrichRequests(
      context.supabase,
      context.userId,
      requests,
    );
  });

export const approveDiscountRequestFn = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResolveInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await approveDiscountRequest({
      supabase: context.supabase,
      ownerId: context.userId,
      requestId: data.requestId,
      ownerResponse: data.ownerResponse ?? null,
    });

    let notification: {
      success: boolean;
      error?: string;
    } = { success: false };

    if (result.request.client_id) {
      const { data: client } = await context.supabase
        .from("clients")
        .select("name, phone")
        .eq("owner_id", context.userId)
        .eq("id", result.request.client_id)
        .maybeSingle();

      if (client?.phone) {
        const discountPercent =
          result.request.requested_discount_percent;

        const discountAmount =
          result.request.requested_discount_amount;

        const discountText =
          discountPercent !== null
            ? `${discountPercent}%`
            : discountAmount !== null
              ? String(discountAmount)
              : "the requested";

        const message =
          `Your discount request has been approved. ` +
          `The approved discount is ${discountText}. ` +
          `Your invoice has been updated accordingly.`;

        const sent = await wahaWhatsAppProvider.sendMessage({
          to: client.phone,
          body: message,
        });

        notification = {
          success: sent.success,
          ...(sent.error ? { error: sent.error } : {}),
        };
      } else {
        notification = {
          success: false,
          error: "customer_phone_not_found",
        };
      }
    } else {
      notification = {
        success: false,
        error: "customer_not_found",
      };
    }

    return {
      status: "approved" as const,
      request: result.request,
      invoice: result.invoice,
      notification,
    };
  });

export const rejectDiscountRequestFn = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResolveInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = await rejectDiscountRequest({
      supabase: context.supabase,
      ownerId: context.userId,
      requestId: data.requestId,
      ownerResponse: data.ownerResponse ?? null,
    });

    let notification: {
      success: boolean;
      error?: string;
    } = { success: false };

    if (result.client_id) {
      const { data: client } = await context.supabase
        .from("clients")
        .select("name, phone")
        .eq("owner_id", context.userId)
        .eq("id", result.client_id)
        .maybeSingle();

      if (client?.phone) {
        const sent = await wahaWhatsAppProvider.sendMessage({
          to: client.phone,
          body:
            "Your discount request has been reviewed by the business owner and was not approved.",
        });

        notification = {
          success: sent.success,
          ...(sent.error ? { error: sent.error } : {}),
        };
      } else {
        notification = {
          success: false,
          error: "customer_phone_not_found",
        };
      }
    } else {
      notification = {
        success: false,
        error: "customer_not_found",
      };
    }

    return {
      status: "rejected" as const,
      request: result,
      notification,
    };
  });

export const getDiscountRequestByIdFn = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .inputValidator(RequestIdInput.parse)
  .handler(async ({ data, context }) => {
    const { data: request, error } = await context.supabase
      .from("discount_requests")
      .select("*")
      .eq("id", data.requestId)
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (error) {
      throw new Error(`discount_request_lookup_failed: ${error.message}`);
    }

    return request;
  });
