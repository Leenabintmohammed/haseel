import type {
  CustomerInvoice,
  PolicyResult,
} from "../domain";

export function evaluateDiscountPolicy(
  invoice: CustomerInvoice,
  options: {
    discountType: "percentage" | "fixed";
    discountValue: number;
    hasPendingRequest: boolean;
  },
): PolicyResult {
  const remaining =
    Number(invoice.remaining_balance ?? 0);

  if (
    !Number.isFinite(remaining) ||
    remaining <= 0
  ) {
    return {
      allowed: false,
      code: "invoice_already_paid",
      message:
        "The invoice has no outstanding balance.",
    };
  }

  if (options.hasPendingRequest) {
    return {
      allowed: false,
      code: "request_already_pending",
      message:
        "A discount request is already pending for this invoice.",
    };
  }

  if (
    options.discountType === "percentage" &&
    (
      options.discountValue <= 0 ||
      options.discountValue > 100
    )
  ) {
    return {
      allowed: false,
      code: "invalid_discount_percentage",
      message:
        "Percentage discount must be greater than 0 and no more than 100.",
    };
  }

  if (
    options.discountType === "fixed" &&
    options.discountValue <= 0
  ) {
    return {
      allowed: false,
      code: "invalid_discount_amount",
      message:
        "Fixed discount must be greater than zero.",
    };
  }

  return {
    allowed: true,
    code: "eligible",
  };
}
