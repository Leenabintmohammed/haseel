import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDiscountRequest,
} from "../../discount-request.server";

import {
  evaluateDiscountPolicy,
} from "../policies/discount.policy";

import type {
  CustomerInvoice,
} from "../domain";

export async function executeDiscountRequest(
  input: {
    supabase: SupabaseClient;
    ownerId: string;
    clientId: string;
    invoice: CustomerInvoice;
    discountType:
      | "percentage"
      | "fixed";
    discountValue: number;
    reason?: string;
    hasPendingRequest: boolean;
  },
) {
  const policy =
    evaluateDiscountPolicy(
      input.invoice,
      {
        discountType:
          input.discountType,
        discountValue:
          input.discountValue,
        hasPendingRequest:
          input.hasPendingRequest,
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
      await createDiscountRequest({
        supabase:
          input.supabase,
        ownerId:
          input.ownerId,
        clientId:
          input.clientId,
        invoiceId:
          input.invoice.id,
        requestedAmount:
          input.invoice.amount,
        requestedDiscountAmount:
          input.discountType === "fixed"
            ? input.discountValue
            : null,
        requestedDiscountPercent:
          input.discountType ===
          "percentage"
            ? input.discountValue
            : null,
        reason:
          input.reason?.trim() ||
          "Customer requested a discount.",
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
      requested_discount: {
        type:
          input.discountType,
        value:
          input.discountValue,
      },
    };
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      code ===
      "discount_request_already_pending"
    ) {
      return {
        status: "already_pending",
        invoice_number:
          input.invoice.invoice_number,
      };
    }

    if (
      code ===
      "discount_invoice_already_paid"
    ) {
      return {
        status: "invoice_already_paid",
        invoice_number:
          input.invoice.invoice_number,
      };
    }

    console.error(
      "[Haseel] discount command failed",
      {
        code,
        invoiceId:
          input.invoice.id,
      },
    );

    return {
      status: "error",
      code: "discount_request_failed",
    };
  }
}
