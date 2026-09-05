import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wahaWhatsAppProvider } from "./messaging/providers/waha.server";
import {
  approvePaymentPlanRequest,
  listPendingPaymentPlanRequests,
  rejectPaymentPlanRequest,
  type PaymentPlanRequest,
} from "./payment-plan-request.server";

const RequestIdInput = z.object({
  requestId: z.string().uuid(),
});

const ResolveInput = z.object({
  requestId: z.string().uuid(),
  ownerResponse: z.string().max(1000).optional(),
});

export type OwnerPaymentPlanRequest = PaymentPlanRequest & {
  client_name: string | null;
  client_phone: string | null;
  invoice_amount: number | null;
  invoice_remaining_balance: number | null;
  invoice_currency: string | null;
};

async function enrichRequests(
  supabase: any,
  ownerId: string,
  requests: PaymentPlanRequest[],
): Promise<OwnerPaymentPlanRequest[]> {
  if (!requests.length) {
    return [];
  }

  const clientIds = Array.from(
    new Set(
      requests
        .map((request) => request.client_id)
        .filter(Boolean),
    ),
  );

  const invoiceIds = Array.from(
    new Set(
      requests
        .map((request) => request.invoice_id)
        .filter(Boolean),
    ),
  );

  const [{ data: clients, error: clientError }, { data: invoices, error: invoiceError }] =
    await Promise.all([
      clientIds.length
        ? supabase
            .from("clients")
            .select("id,name,phone")
            .eq("owner_id", ownerId)
            .in("id", clientIds)
        : Promise.resolve({ data: [], error: null }),

      invoiceIds.length
        ? supabase
            .from("invoices")
            .select(
              "id,amount,remaining_balance,currency",
            )
            .eq("owner_id", ownerId)
            .in("id", invoiceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (clientError) {
    throw new Error(
      `payment_plan_request_clients_lookup_failed: ${clientError.message}`,
    );
  }

  if (invoiceError) {
    throw new Error(
      `payment_plan_request_invoices_lookup_failed: ${invoiceError.message}`,
    );
  }

  const clientMap = new Map(
    (clients ?? []).map((client: any) => [
      client.id,
      client,
    ]),
  );

  const invoiceMap = new Map(
    (invoices ?? []).map((invoice: any) => [
      invoice.id,
      invoice,
    ]),
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
        invoice?.amount == null
          ? null
          : Number(invoice.amount),
      invoice_remaining_balance:
        invoice?.remaining_balance == null
          ? null
          : Number(invoice.remaining_balance),
      invoice_currency:
        invoice?.currency ?? null,
    };
  });
}

export const getPendingPaymentPlanRequestsFn = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({}).parse(input),
  )
  .handler(async ({ context }) => {
    const requests =
      await listPendingPaymentPlanRequests(
        context.supabase,
        context.userId,
      );

    return enrichRequests(
      context.supabase,
      context.userId,
      requests,
    );
  });

export const approvePaymentPlanRequestFn = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    ResolveInput.parse(input),
  )
  .handler(async ({ data, context }) => {
    const result =
      await approvePaymentPlanRequest({
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
        .select("phone")
        .eq("owner_id", context.userId)
        .eq("id", result.request.client_id)
        .maybeSingle();

      if (client?.phone) {
        const firstInstallment =
          result.installments[0];

        const firstAmount =
          firstInstallment?.amount != null
            ? Number(firstInstallment.amount)
            : null;

        const installmentText =
          firstAmount == null
            ? `${result.request.requested_installment_count} installments`
            : `${result.request.requested_installment_count} installments, starting with ${firstAmount.toLocaleString("en-AE")} ${result.plan?.currency ?? "AED"}`;

        const sent =
          await wahaWhatsAppProvider.sendMessage({
            to: client.phone,
            body:
              `Your payment plan has been approved. ` +
              `You are set up for ${installmentText}. ` +
              `Your approved payment plan is now active.`,
          });

        notification = {
          success: sent.success,
          ...(sent.error
            ? { error: sent.error }
            : {}),
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
      plan: result.plan,
      installments: result.installments,
      notification,
    };
  });

export const rejectPaymentPlanRequestFn = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    ResolveInput.parse(input),
  )
  .handler(async ({ data, context }) => {
    const result =
      await rejectPaymentPlanRequest({
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
        .select("phone")
        .eq("owner_id", context.userId)
        .eq("id", result.client_id)
        .maybeSingle();

      if (client?.phone) {
        const sent =
          await wahaWhatsAppProvider.sendMessage({
            to: client.phone,
            body:
              "Your payment plan request has been reviewed by the business owner and was not approved.",
          });

        notification = {
          success: sent.success,
          ...(sent.error
            ? { error: sent.error }
            : {}),
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

export const getPaymentPlanRequestByIdFn = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .inputValidator(RequestIdInput.parse)
  .handler(async ({ data, context }) => {
    const { data: request, error } = await (
      context.supabase as any
    )
      .from("payment_plan_requests")
      .select("*")
      .eq("id", data.requestId)
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `payment_plan_request_lookup_failed: ${error.message}`,
      );
    }

    return request;
  });
