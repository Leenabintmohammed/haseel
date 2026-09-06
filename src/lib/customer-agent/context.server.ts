import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BusinessPaymentSettings,
  CustomerContext,
  CustomerInvoice,
  CustomerPayment,
  CustomerPlan,
  CustomerRecord,
  DiscountRequestState,
  PaymentPlanRequestState,
} from "./domain";

function numberValue(
  value: unknown,
): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function outstandingTotals(
  invoices: CustomerInvoice[],
) {
  const totals =
    new Map<string, number>();

  for (const invoice of invoices) {
    const remaining =
      numberValue(
        invoice.remaining_balance,
      );

    if (remaining <= 0) {
      continue;
    }

    const currency =
      invoice.currency?.trim() ||
      "UNSPECIFIED";

    totals.set(
      currency,
      (
        totals.get(currency) ?? 0
      ) + remaining,
    );
  }

  return [...totals.entries()]
    .map(
      ([currency, outstanding]) => ({
        currency,
        outstanding,
      }),
    )
    .sort(
      (a, b) =>
        a.currency.localeCompare(
          b.currency,
        ),
    );
}

export async function loadCustomerContext(
  supabase: SupabaseClient,
  input: {
    ownerId: string;
    clientId: string;
  },
): Promise<
  | {
      ok: true;
      context: CustomerContext;
    }
  | {
      ok: false;
    }
> {
  const {
    ownerId,
    clientId,
  } = input;

  const [
    clientResult,
    invoiceResult,
    paymentResult,
    planResult,
    discountRequestResult,
    paymentPlanRequestResult,
    paymentSettingsResult,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id,name,company_name,email,phone,preferred_language",
      )
      .eq("id", clientId)
      .eq("owner_id", ownerId)
      .maybeSingle(),

    supabase
      .from("invoices")
      .select(
        "id,invoice_number,amount,currency,status,due_date,paid_date,paid_amount,remaining_balance,payment_link",
      )
      .eq("owner_id", ownerId)
      .eq("client_id", clientId)
      .order("due_date", {
        ascending: true,
      })
      .limit(100),

    supabase
      .from("payments")
      .select(
        "id,invoice_id,amount,currency,payment_date,payment_method,reference",
      )
      .eq("owner_id", ownerId)
      .eq("client_id", clientId)
      .order("payment_date", {
        ascending: false,
      })
      .limit(100),

    supabase
      .from("payment_plans")
      .select(
        "id,invoice_id,total_amount,paid_amount,remaining_amount,currency,installment_count,frequency,start_date,status",
      )
      .eq("owner_id", ownerId)
      .eq("client_id", clientId)
      .order("created_at", {
        ascending: false,
      })
      .limit(100),

    supabase
      .from("discount_requests")
      .select(
        "id,invoice_id,client_id,requested_amount,requested_discount_amount,requested_discount_percent,reason,status,owner_response,created_at,resolved_at",
      )
      .eq("owner_id", ownerId)
      .eq("client_id", clientId)
      .order("created_at", {
        ascending: false,
      })
      .limit(100),

    supabase
      .from("payment_plan_requests")
      .select(
        "id,invoice_id,client_id,requested_installment_count,requested_frequency,requested_start_date,reason,status,owner_response,created_at,resolved_at",
      )
      .eq("owner_id", ownerId)
      .eq("client_id", clientId)
      .order("created_at", {
        ascending: false,
      })
      .limit(100),

    supabase
      .from("business_payment_settings")
      .select(
        "bank_name,account_name,account_number,iban,swift_bic,payment_instructions",
      )
      .eq("owner_id", ownerId)
      .maybeSingle(),
  ]);

  if (
    clientResult.error ||
    !clientResult.data
  ) {
    console.error(
      "[Haseel] Customer lookup failed",
      clientResult.error,
    );

    return {
      ok: false,
    };
  }

  const customer =
    clientResult.data as CustomerRecord;

  const invoices =
    (invoiceResult.data ??
      []) as CustomerInvoice[];

  const payments =
    (paymentResult.data ??
      []) as CustomerPayment[];

  const plans =
    (planResult.data ??
      []) as CustomerPlan[];

  const discountRequests =
    (discountRequestResult.data ??
      []) as DiscountRequestState[];

  const paymentPlanRequests =
    (paymentPlanRequestResult.data ??
      []) as PaymentPlanRequestState[];

  const paymentMethods =
    (paymentSettingsResult.data ??
      null) as BusinessPaymentSettings | null;

  return {
    ok: true,
    context: {
      customer,
      invoices,
      payments,
      payment_plans: plans,
      discount_requests:
        discountRequests,
      payment_plan_requests:
        paymentPlanRequests,
      payment_methods:
        paymentMethods,
      outstanding_totals_by_currency:
        outstandingTotals(
          invoices,
        ),
    },
  };
}
