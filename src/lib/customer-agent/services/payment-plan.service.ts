import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPaymentPlanRequest,
} from "../../payment-plan-request.server";

import {
  evaluatePaymentPlanPolicy,
} from "../policies/payment-plan.policy";

import type {
  CustomerInvoice,
} from "../domain";

export async function executePaymentPlanRequest(
  input: {
    supabase: SupabaseClient;
    ownerId: string;
    clientId: string;
    invoice: CustomerInvoice;
    installmentCount: number;
    frequency:
      | "weekly"
      | "biweekly"
      | "monthly"
      | "quarterly";
    startDate?: string;
    reason?: string;
    hasActivePlan: boolean;
    hasPendingRequest: boolean;
  },
) {
  const policy =
    evaluatePaymentPlanPolicy(
      input.invoice,
      {
        hasActivePlan:
          input.hasActivePlan,
        hasPendingRequest:
          input.hasPendingRequest,
        installmentCount:
          input.installmentCount,
      },
    );

  if (!policy.allowed) {
    return {
      status: "rejected_by_policy",
      reason: policy.code,
      message: policy.message,
      invoice_number:
        input.invoice.invoice_number,
    };
  }

  try {
    const request =
      await createPaymentPlanRequest({
        supabase:
          input.supabase,
        ownerId:
          input.ownerId,
        clientId:
          input.clientId,
        invoiceId:
          input.invoice.id,
        requestedInstallmentCount:
          input.installmentCount,
        requestedFrequency:
          input.frequency,
        requestedStartDate:
          input.startDate ?? null,
        reason:
          input.reason?.trim() ||
          "Customer requested a payment plan.",
      });

    return {
      status: "created",
      request_id:
        request.id,
      invoice_id:
        request.invoice_id,
      invoice_number:
        input.invoice.invoice_number,
      currency:
        input.invoice.currency,
      remaining_balance:
        input.invoice.remaining_balance,
      installment_count:
        request.requested_installment_count,
      frequency:
        request.requested_frequency,
      start_date:
        request.requested_start_date,
    };
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      code ===
      "payment_plan_request_already_pending"
    ) {
      return {
        status: "already_pending",
        invoice_number:
          input.invoice.invoice_number,
      };
    }

    if (
      code ===
      "payment_plan_already_active"
    ) {
      return {
        status: "already_has_active_plan",
        invoice_number:
          input.invoice.invoice_number,
      };
    }

    if (
      code ===
      "payment_plan_invoice_already_paid"
    ) {
      return {
        status: "invoice_already_paid",
        invoice_number:
          input.invoice.invoice_number,
      };
    }

    if (
      code ===
      "payment_plan_invoice_not_eligible"
    ) {
      return {
        status: "invoice_not_eligible",
        invoice_number:
          input.invoice.invoice_number,
        invoice_status:
          input.invoice.status,
      };
    }

    console.error(
      "[Haseel] payment plan command failed",
      {
        code,
        invoiceId:
          input.invoice.id,
      },
    );

    return {
      status: "error",
      code: "payment_plan_request_failed",
    };
  }
}
