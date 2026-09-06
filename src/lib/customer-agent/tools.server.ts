import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  tool,
} from "ai";

import {
  z,
} from "zod";

import type {
  CustomerContext,
} from "./domain";

import {
  resolveInvoiceReference,
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
    supabase:
      SupabaseClient;

    ownerId:
      string;

    clientId:
      string;

    customerMessage:
      string;

    context:
      CustomerContext;
  },
) {
  const {
    supabase,
    ownerId,
    clientId,
    customerMessage,
    context,
  } = input;

  const invoiceReferenceSchema =
    z.object({
      invoice_reference:
        z.string().optional(),
    });

  function resolveCustomerInvoice(
    invoice_reference?: string,
  ) {
    return resolveInvoiceReference(
      context.invoices,
      invoice_reference,
    );
  }

  function numeric(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function roundMoney(
    value: number,
  ): number {
    return Math.round(
      (value + Number.EPSILON) * 100,
    ) / 100;
  }

  return {
    get_customer_profile:
      tool({
        description:
          "Get the verified profile of the current customer.",

        inputSchema:
          z.object({}),

        execute:
          async () =>
            context.customer,
      }),

    list_my_invoices:
      tool({
        description:
          "List invoices belonging only to the current customer.",

        inputSchema:
          z.object({
            outstanding_only:
              z.boolean()
                .optional(),
          }),

        execute:
          async ({
            outstanding_only,
          }) => {
            const invoices =
              outstanding_only
                ? context.invoices.filter(
                    (invoice) =>
                      numeric(
                        invoice.remaining_balance,
                      ) > 0,
                  )
                : context.invoices;

            return invoices;
          },
      }),

    get_my_invoice:
      tool({
        description:
          "Get a specific invoice belonging to the current customer.",

        inputSchema:
          invoiceReferenceSchema,

        execute:
          async ({
            invoice_reference,
          }) => {
            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind ===
              "matched"
            ) {
              return result.invoice;
            }

            if (
              result.kind ===
              "ambiguous"
            ) {
              return invoiceReferenceResult(
                result.invoices,
              );
            }

            return {
              status:
                "not_found",
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
          async () => ({
            currencies:
              context
                .outstanding_totals_by_currency,
          }),
      }),

    list_my_payments:
      tool({
        description:
          "List payments recorded for the current customer.",

        inputSchema:
          z.object({
            invoice_reference:
              z.string()
                .optional(),
          }),

        execute:
          async ({
            invoice_reference,
          }) => {
            if (
              !invoice_reference
            ) {
              return context.payments;
            }

            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind !==
              "matched"
            ) {
              return result.kind ===
                "ambiguous"
                ? invoiceReferenceResult(
                    result.invoices,
                  )
                : {
                    status:
                      "invoice_not_found",
                  };
            }

            return context.payments.filter(
              (payment) =>
                payment.invoice_id ===
                result.invoice.id,
            );
          },
      }),

    list_my_payment_plans:
      tool({
        description:
          "List payment plans belonging to the current customer.",

        inputSchema:
          z.object({
            invoice_reference:
              z.string()
                .optional(),
          }),

        execute:
          async ({
            invoice_reference,
          }) => {
            if (
              !invoice_reference
            ) {
              return context.payment_plans;
            }

            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind !==
              "matched"
            ) {
              return result.kind ===
                "ambiguous"
                ? invoiceReferenceResult(
                    result.invoices,
                  )
                : {
                    status:
                      "invoice_not_found",
                  };
            }

            return context.payment_plans.filter(
              (plan) =>
                plan.invoice_id ===
                result.invoice.id,
            );
          },
      }),

    get_my_discount_requests:
      tool({
        description:
          "Get the customer's discount requests and their current statuses.",

        inputSchema:
          z.object({
            invoice_reference:
              z.string()
                .optional(),
          }),

        execute:
          async ({
            invoice_reference,
          }) => {
            if (
              !invoice_reference
            ) {
              return context.discount_requests;
            }

            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind !==
              "matched"
            ) {
              return result.kind ===
                "ambiguous"
                ? invoiceReferenceResult(
                    result.invoices,
                  )
                : {
                    status:
                      "invoice_not_found",
                  };
            }

            return context.discount_requests.filter(
              (request) =>
                request.invoice_id ===
                result.invoice.id,
            );
          },
      }),

    get_my_payment_plan_requests:
      tool({
        description:
          "Get the customer's payment-plan requests and their current statuses.",

        inputSchema:
          z.object({
            invoice_reference:
              z.string()
                .optional(),
          }),

        execute:
          async ({
            invoice_reference,
          }) => {
            if (
              !invoice_reference
            ) {
              return context.payment_plan_requests;
            }

            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind !==
              "matched"
            ) {
              return result.kind ===
                "ambiguous"
                ? invoiceReferenceResult(
                    result.invoices,
                  )
                : {
                    status:
                      "invoice_not_found",
                  };
            }

            return context.payment_plan_requests.filter(
              (request) =>
                request.invoice_id ===
                result.invoice.id,
            );
          },
      }),

    get_my_payment_details:
      tool({
        description:
          "Get the business payment details available to the customer.",

        inputSchema:
          z.object({}),

        execute:
          async () =>
            context.payment_methods ??
            {
              status:
                "not_available",
            },
      }),

    /*
     * IMPORTANT:
     *
     * This is a READ/CALCULATION operation only.
     * It NEVER creates a payment-plan request.
     *
     * It exists specifically so that:
     *
     * "propose a payment plan"
     *
     * does not accidentally become:
     *
     * "submit a payment-plan request".
     */
    propose_payment_plan:
      tool({
        description:
          "Propose payment-plan options for an invoice without creating or submitting any request. This tool is read-only and must be used when the customer asks to propose, suggest, compare, or see payment-plan options.",

        inputSchema:
          z.object({
            invoice_reference:
              z.string()
                .optional(),
          }),

        execute:
          async ({
            invoice_reference,
          }) => {
            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind ===
              "none"
            ) {
              return {
                status:
                  "invoice_not_found",
                invoice_reference:
                  invoice_reference ??
                  null,
              };
            }

            if (
              result.kind ===
              "ambiguous"
            ) {
              return invoiceReferenceResult(
                result.invoices,
              );
            }

            const invoice =
              result.invoice;

            const remaining =
              numeric(
                invoice.remaining_balance,
              );

            if (
              remaining <= 0
            ) {
              return {
                status:
                  "invoice_already_paid",
                invoice_number:
                  invoice.invoice_number,
              };
            }

            const status =
              String(
                invoice.status ?? "",
              ).toLowerCase();

            if (
              [
                "draft",
                "paid",
                "cancelled",
                "void",
              ].includes(status)
            ) {
              return {
                status:
                  "invoice_not_receivable",
                invoice_number:
                  invoice.invoice_number,
                invoice_status:
                  invoice.status,
              };
            }

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

            if (hasActivePlan) {
              return {
                status:
                  "active_plan_exists",
                invoice_number:
                  invoice.invoice_number,
              };
            }

            const hasPendingRequest =
              context.payment_plan_requests.some(
                (request) =>
                  request.invoice_id ===
                    invoice.id &&
                  request.status ===
                    "pending",
              );

            if (hasPendingRequest) {
              return {
                status:
                  "request_already_pending",
                invoice_number:
                  invoice.invoice_number,
              };
            }

            const installmentCounts =
              [6, 12, 18];

            const options =
              installmentCounts.map(
                (count) => ({
                  installment_count:
                    count,
                  frequency:
                    "monthly" as const,
                  estimated_installment:
                    roundMoney(
                      remaining /
                        count,
                    ),
                  total_amount:
                    roundMoney(
                      remaining,
                    ),
                }),
              );

            return {
              status:
                "proposals_available",
              invoice_id:
                invoice.id,
              invoice_number:
                invoice.invoice_number,
              currency:
                invoice.currency,
              remaining_balance:
                remaining,
              options,
              requires_customer_confirmation:
                true,
              request_created:
                false,
            };
          },
      }),

    request_payment_plan:
      tool({
        description:
          "Submit a payment-plan request for business-owner review. Use invoice_reference for the customer's invoice number. NEVER use this tool when the customer is only asking to propose, suggest, compare, or see payment-plan options. Only use it when the customer explicitly wants to submit/request a specific plan.",

        inputSchema:
          z.object({
            invoice_reference:
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
              z.string()
                .optional(),

            reason:
              z.string()
                .optional(),
          }),

        execute:
          async ({
            invoice_reference,
            installment_count,
            frequency,
            start_date,
            reason,
          }) => {
            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind ===
              "none"
            ) {
              return {
                status:
                  "invoice_not_found",
                invoice_reference:
                  invoice_reference ??
                  null,
              };
            }

            if (
              result.kind ===
              "ambiguous"
            ) {
              return invoiceReferenceResult(
                result.invoices,
              );
            }

            const invoice =
              result.invoice;

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

              startDate:
                start_date,

              reason,

              hasActivePlan,

              hasPendingRequest,
            });
          },
      }),

    request_discount:
      tool({
        description:
          "Submit a discount request for business-owner review. Use invoice_reference for the customer's invoice number. Never approve a discount.",

        inputSchema:
          z.discriminatedUnion(
            "discount_type",
            [
              z.object({
                discount_type:
                  z.literal(
                    "percentage",
                  ),

                invoice_reference:
                  z.string()
                    .optional(),

                discount_value:
                  z.number()
                    .positive()
                    .max(100),

                reason:
                  z.string()
                    .optional(),
              }),

              z.object({
                discount_type:
                  z.literal(
                    "fixed",
                  ),

                invoice_reference:
                  z.string()
                    .optional(),

                discount_value:
                  z.number()
                    .positive(),

                reason:
                  z.string()
                    .optional(),
              }),
            ],
          ),

        execute:
          async ({
            discount_type,
            invoice_reference,
            discount_value,
            reason,
          }) => {
            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind ===
              "none"
            ) {
              return {
                status:
                  "invoice_not_found",
                invoice_reference:
                  invoice_reference ??
                  null,
              };
            }

            if (
              result.kind ===
              "ambiguous"
            ) {
              return invoiceReferenceResult(
                result.invoices,
              );
            }

            const invoice =
              result.invoice;

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

    promise_to_pay:
      tool({
        description:
          "Record a promise to pay an invoice on a specific date. This is not a payment.",

        inputSchema:
          z.object({
            invoice_reference:
              z.string()
                .optional(),

            promise_date:
              z.string(),
          }),

        execute:
          async ({
            invoice_reference,
            promise_date,
          }) => {
            const result =
              resolveCustomerInvoice(
                invoice_reference,
              );

            if (
              result.kind ===
              "none"
            ) {
              return {
                status:
                  "invoice_not_found",
              };
            }

            if (
              result.kind ===
              "ambiguous"
            ) {
              return invoiceReferenceResult(
                result.invoices,
              );
            }

            return executePaymentPromise({
              supabase,

              ownerId,

              clientId,

              invoice:
                result.invoice,

              promiseDate:
                promise_date,

              customerMessage,
            });
          },
      }),
  };
}
