import type {
  CustomerInvoice,
} from "./domain";

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeInvoiceReference(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^invoice\s*#?/i, "")
    .replace(/^inv\s*#?/i, "")
    .trim();
}

export function isReceivableInvoice(
  invoice: CustomerInvoice,
): boolean {
  const remaining = toNumber(
    invoice.remaining_balance,
  );

  const status = String(
    invoice.status ?? "",
  ).toLowerCase();

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

export function resolveInvoice(
  invoices: CustomerInvoice[],
  reference?: string | null,
):
  | {
      kind: "matched";
      invoice: CustomerInvoice;
    }
  | {
      kind: "ambiguous";
      invoices: CustomerInvoice[];
    }
  | {
      kind: "none";
    } {
  const eligible = invoices.filter(
    isReceivableInvoice,
  );

  if (!reference?.trim()) {
    if (eligible.length === 1) {
      return {
        kind: "matched",
        invoice: eligible[0],
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

  const normalized =
    normalizeInvoiceReference(reference);

  const matches = eligible.filter(
    (invoice) => {
      const number =
        invoice.invoice_number?.trim();

      if (!number) {
        return false;
      }

      const normalizedNumber =
        normalizeInvoiceReference(number);

      return (
        normalizedNumber === normalized ||
        normalizedNumber.includes(normalized)
      );
    },
  );

  if (matches.length === 1) {
    return {
      kind: "matched",
      invoice: matches[0],
    };
  }

  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      invoices: matches,
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
    status: "needs_clarification",
    invoices: invoices.map(
      (invoice) => ({
        invoice_id: invoice.id,
        invoice_number:
          invoice.invoice_number,
        currency: invoice.currency,
        remaining_balance:
          invoice.remaining_balance,
        status: invoice.status,
        due_date: invoice.due_date,
      }),
    ),
  };
}
