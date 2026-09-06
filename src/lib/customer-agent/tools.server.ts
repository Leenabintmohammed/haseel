import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";

import type {
  CustomerContext,
} from "./domain";

import {
  resolveInvoice,
  invoiceReferenceResult,
} from "./invoice-resolver";

import {
  executePaymentPlanRequest,
} from "./services/payment-plan.service";

import {
  executeDiscountRequest,
} from "./services/discount.service";

import {
  executePaymentPromise,
} from "./services/payment-promise.service";

export function createCustomerTools(
  input: {
    supabase: SupabaseClient;
    ownerId: string;
    clientId: string;
    customerMessage: string;
    context: CustomerContext;
  },
) {
  const {
    supabase,
    ownerId,
    clientId,
    customerMessage,
    context,
  } = input;

  return {
    get_customer_profile: tool({
      description:
        "Get the verified profile of the current customer.",
      inputSchema:
        z.object({}),
      execute: async () =>
        context.customer,
    }),

    list_my_invoices: tool({
      description:
        "List invoices belonging to the current customer.",
      inputSchema:
        z.object({
          outstanding_only:
            z.boolean().optional(),
        }),
      execute: async ({
        outstanding_only,
      }) => {
        const invoices =
          outstanding_only
            ? context.invoices.filter(
                (invoice) =>
                  Number(
                    invoice.remaining_balance,
                  ) > 0,
              )
            : context.invoices;

        return invoices;
      },
    }),

    get_my_invoice: tool({
      description:
        "Get a specific invoice belonging to the current customer.",
      inputSchema:
        z.object({
          invoice_id:
            z.string().optional(),
          invoice_number:
            z.string().optional(),
        }),

      execute: async ({
        invoice_id,
        invoice_number,
      }) => {
        if (invoice_id) {
          const invoice =
            context.invoices.find(
              (item) =>
                item.id === invoice_id,
            );

          return invoice ?? {
            status: "not_found",
          };
        }

        const match =
          resolveInvoice(
            context.invoices,
            invoice_number,
          );

        if (
          match.kind === "matched"
        ) {
          return match.invoice;
        }

        if (
          match.kind === "ambiguous"
        ) {
          return invoiceReferenceResult(
            match.invoices,
          );
        }

        return {
          status: "not_found",
        };
      },
    }),

    get_my_outstanding_balance:
      tool({
        description:
          "Get outstanding balances separated by currency.",
        inputSchema:
          z.object({}),

        execute:
          async () =>
            ({
              currencies:
                context.outstanding_totals_by_currency,
            }),
      }),

    list_my_payments: tool({
      description:
        "List payments recorded for the current customer.",
      inputSchema:
        z.object({
          invoice_id:
            z.string().optional(),
        }),

      execute: async ({
        invoice_id,
      }) =>
        context.payments.filter(
          (payment) =>
            !invoice_id ||
            payment.invoice_id ===
              invoice_id,
        ),
    }),

    list_my_payment_plans: tool({
      description:
        "List payment plans belonging to the current customer.",
      inputSchema:
        z.object({
          invoice_id:
            z.string().optional(),
        }),

      execute: async ({
        invoice_id,
      }) =>
        context.payment_plans.filter(
          (plan) =>
            !invoice_id ||
            plan.invoice_id ===
              invoice_id,
        ),
    }),

    get_my_discount_requests:
      tool({
        description:
          "Get the customer's discount requests and current statuses.",
        inputSchema:
          z.object({
            invoice_id:
              z.string().optional(),
          }),

        execute: async ({
          invoice_id,
        }) =>
          context.discount_requests.filter(
            (request) =>
              !invoice_id ||
              request.invoice_id ===
                invoice_id,
          ),
      }),

    get_my_payment_plan_requests:
      tool({
        description:
          "Get the customer's payment-plan requests and current statuses.",
        inputSchema:
          z.object({
            invoice_id:
              z.string().optional(),
          }),

        execute: async ({
          invoice_id,
        }) =>
          context.payment_plan_requests.filter(
            (request) =>
              !invoice_id ||
              request.invoice_id ===
                invoice_id,
          ),
      }),

    get_my_payment_details:
      tool({
        description:
          "Get business payment details available to the customer.",
        inputSchema:
          z.object({}),

        execute: async () =>
          context.payment_methods ?? {
            status: "not_available",
          },
      }),

    request_payment_plan: tool({
      description:
        "Submit a payment-plan request for owner review. Never treat this as approval.",
      inputSchema:
        z.object({
          invoice_id:
            z.string().optional(),

          invoice_number:
            z.string().optional(),

          installment_count:
            z.number()
              .int()
              .min(2)
              .max(60),

          frequency:
            z.enum([
              "weekly",
              "biweekly",
              "monthly",
              "quarterly",
            ]),

          start_date:
            z.string().optional(),

          reason:
            z.string().optional(),
        }),

      execute: async ({
        invoice_id,
        invoice_number,
        installment_count,
        frequency,
        start_date,
        reason,
      }) => {
        const match =
          resolveInvoice(
            context.invoices,
            invoice_id ??
              invoice_number,
          );

        if (
          match.kind === "none"
        ) {
          return {
            status: "invoice_not_found",
          };
        }

        if (
          match.kind === "ambiguous"
        ) {
          return invoiceReferenceResult(
            match.invoices,
          );
        }

        const invoice =
          match.invoice;

        const hasActivePlan =
          context.payment_plans.some(
            (plan) =>
              plan.invoice_id ===
                invoice.id &&
              [
                "active",
                "at_risk",
                "paused",
              ].includes(
                String(
                  plan.status ?? "",
                ).toLowerCase(),
              ),
          );

        const hasPendingRequest =
          context.payment_plan_requests.some(
            (request) =>
              request.invoice_id ===
                invoice.id &&
              request.status ===
                "pending",
          );

        return executePaymentPlanRequest({
          supabase,
          ownerId,
          clientId,
          invoice,
          installmentCount:
            installment_count,
          frequency,
          startDate: start_date,
          reason,
          hasActivePlan,
          hasPendingRequest,
        });
      },
    }),

    request_discount: tool({
      description:
        "Submit a discount request for owner review. Never approve a discount.",
      inputSchema:
        z.discriminatedUnion(
          "discount_type",
          [
            z.object({
              discount_type:
                z.literal(
                  "percentage",
                ),

              invoice_id:
                z.string().optional(),

              invoice_number:
                z.string().optional(),

              discount_value:
                z.number()
                  .positive()
                  .max(100),

              reason:
                z.string().optional(),
            }),

            z.object({
              discount_type:
                z.literal("fixed"),

              invoice_id:
                z.string().optional(),

              invoice_number:
                z.string().optional(),

              discount_value:
                z.number()
                  .positive(),

              reason:
                z.string().optional(),
            }),
          ],
        ),

      execute: async ({
        discount_type,
        invoice_id,
        invoice_number,
        discount_value,
        reason,
      }) => {
        const match =
          resolveInvoice(
            context.invoices,
            invoice_id ??
              invoice_number,
          );

        if (
          match.kind === "none"
        ) {
          return {
            status:
              "invoice_not_found",
          };
        }

        if (
          match.kind === "ambiguous"
        ) {
          return invoiceReferenceResult(
            match.invoices,
          );
        }

        const invoice =
          match.invoice;

        const hasPendingRequest =
          context.discount_requests.some(
            (request) =>
              request.invoice_id ===
                invoice.id &&
              request.status ===
                "pending",
          );

        return executeDiscountRequest({
          supabase,
          ownerId,
          clientId,
          invoice,
          discountType:
            discount_type,
          discountValue:
            discount_value,
          reason,
          hasPendingRequest,
        });
      },
    }),

    promise_to_pay: tool({
      description:
        "Record a customer promise to pay an invoice on a specific date. This is not a payment.",
      inputSchema:
        z.object({
          invoice_id:
            z.string().optional(),

          invoice_number:
            z.string().optional(),

          promise_date:
            z.string(),
        }),

      execute: async ({
        invoice_id,
        invoice_number,
        promise_date,
      }) => {
        const match =
          resolveInvoice(
            context.invoices,
            invoice_id ??
              invoice_number,
          );

        if (
          match.kind === "none"
        ) {
          return {
            status:
              "invoice_not_found",
          };
        }

        if (
          match.kind === "ambiguous"
        ) {
          return invoiceReferenceResult(
            match.invoices,
          );
        }

        return executePaymentPromise({
          supabase,
          ownerId,
          clientId,
          invoice:
            match.invoice,
          promiseDate:
            promise_date,
          customerMessage,
        });
      },
    }),
  };
}
