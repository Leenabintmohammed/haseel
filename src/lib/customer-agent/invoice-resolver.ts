import type {
  CustomerInvoice,
} from "./domain";

export type InvoiceResolution =
  | {
      kind: "matched";
      invoice: CustomerInvoice;
      matched_by:
        | "id"
        | "invoice_number";
    }
  | {
      kind: "ambiguous";
      invoices: CustomerInvoice[];
    }
  | {
      kind: "none";
    };

function normalized(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizedInvoiceNumber(
  value: string,
): string {
  return normalized(value)
    .replace(/^invoice\s*#?/i, "")
    .replace(/^inv\s*#?/i, "")
    .replace(/\s+/g, "");
}

function numeric(
  value: unknown,
): number {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : 0;
}

/**
 * A receivable invoice is any invoice with an outstanding balance
 * that has not been closed as draft, paid, cancelled, or void.
 *
 * IMPORTANT:
 * overdue is receivable and therefore can be used for payment-plan requests.
 */
export function isReceivableInvoice(
  invoice: CustomerInvoice,
): boolean {
  const status = String(
    invoice.status ?? "",
  ).toLowerCase();

  const remaining = numeric(
    invoice.remaining_balance,
  );

  return (
    remaining > 0 &&
    ![
      "draft",
      "paid",
      "cancelled",
      "void",
    ].includes(status)
  );
}

/**
 * Resolve a customer-facing invoice reference.
 *
 * We intentionally accept a single reference rather than asking the AI
 * to distinguish internal IDs from invoice numbers.
 */
export function resolveInvoiceReference(
  invoices: CustomerInvoice[],
  reference?: string | null,
): InvoiceResolution {
  const eligible =
    invoices.filter(
      isReceivableInvoice,
    );

  if (!reference?.trim()) {
    if (eligible.length === 1) {
      return {
        kind: "matched",
        invoice: eligible[0],
        matched_by:
          "invoice_number",
      };
    }

    if (eligible.length > 1) {
      return {
        kind: "ambiguous",
        invoices: eligible,
      };
    }

    return {
      kind: "none",
    };
  }

  const input =
    normalized(reference);

  /*
   * First try exact internal UUID.
   *
   * This is safe because we only compare against invoices that already
   * belong to this customer context.
   */
  const idMatches =
    eligible.filter(
      (invoice) =>
        normalized(invoice.id) ===
        input,
    );

  if (idMatches.length === 1) {
    return {
      kind: "matched",
      invoice:
        idMatches[0],
      matched_by: "id",
    };
  }

  if (idMatches.length > 1) {
    return {
      kind: "ambiguous",
      invoices: idMatches,
    };
  }

  /*
   * Then try the human-facing invoice number.
   */
  const targetNumber =
    normalizedInvoiceNumber(
      reference,
    );

  const numberMatches =
    eligible.filter(
      (invoice) => {
        if (
          !invoice.invoice_number
        ) {
          return false;
        }

        const candidate =
          normalizedInvoiceNumber(
            invoice.invoice_number,
          );

        return (
          candidate ===
            targetNumber ||
          candidate.includes(
            targetNumber,
          )
        );
      },
    );

  if (numberMatches.length === 1) {
    return {
      kind: "matched",
      invoice:
        numberMatches[0],
      matched_by:
        "invoice_number",
    };
  }

  if (numberMatches.length > 1) {
    return {
      kind: "ambiguous",
      invoices:
        numberMatches,
    };
  }

  return {
    kind: "none",
  };
}

export function invoiceReferenceResult(
  invoices: CustomerInvoice[],
) {
  return {
    status:
      "needs_clarification",

    invoices: invoices.map(
      (invoice) => ({
        invoice_id:
          invoice.id,

        invoice_number:
          invoice.invoice_number,

        currency:
          invoice.currency,

        remaining_balance:
          invoice.remaining_balance,

        status:
          invoice.status,

        due_date:
          invoice.due_date,
      }),
    ),
  };
}
