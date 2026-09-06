import type {
  CustomerInvoice,
  PolicyResult,
} from "../domain";

function numeric(
  value: unknown,
): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function evaluatePaymentPlanPolicy(
  invoice: CustomerInvoice,
  options: {
    hasActivePlan: boolean;
    hasPendingRequest: boolean;
    installmentCount: number;
  },
): PolicyResult {
  const status = String(
    invoice.status ?? "",
  ).toLowerCase();

  const remaining = numeric(
    invoice.remaining_balance,
  );

  if (remaining <= 0) {
    return {
      allowed: false,
      code: "invoice_already_paid",
      message:
        "The invoice has no outstanding balance.",
    };
  }

  if (
    ["draft", "paid", "cancelled", "void"].includes(
      status,
    )
  ) {
    return {
      allowed: false,
      code: "invoice_not_receivable",
      message:
        "The invoice is not currently a receivable invoice.",
    };
  }

  if (options.hasActivePlan) {
    return {
      allowed: false,
      code: "active_plan_exists",
      message:
        "An active payment plan already exists for this invoice.",
    };
  }

  if (options.hasPendingRequest) {
    return {
      allowed: false,
      code: "request_already_pending",
      message:
        "A payment-plan request is already pending for this invoice.",
    };
  }

  if (
    options.installmentCount < 2 ||
    options.installmentCount > 60
  ) {
    return {
      allowed: false,
      code: "invalid_installment_count",
      message:
        "Installment count must be between 2 and 60.",
    };
  }

  return {
    allowed: true,
    code: "eligible",
  };
}
