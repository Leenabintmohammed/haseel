import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPaymentPromise,
} from "../../payment-promise.server";

import type {
  CustomerInvoice,
} from "../domain";

function isValidDate(
  value: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value)
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] = value.split("-").map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export async function executePaymentPromise(
  input: {
    supabase: SupabaseClient;
    ownerId: string;
    clientId: string;
    invoice: CustomerInvoice;
    promiseDate: string;
    customerMessage: string;
  },
) {
  if (
    !isValidDate(
      input.promiseDate,
    )
  ) {
    return {
      status: "invalid_promise_date",
    };
  }

  try {
    const result =
      await createPaymentPromise({
        supabase:
          input.supabase,
        ownerId:
          input.ownerId,
        invoiceId:
          input.invoice.id,
        clientId:
          input.clientId,
        promiseDate:
          input.promiseDate,
        customerMessage:
          input.customerMessage,
      });

    if (!result.created) {
      return {
        status: "already_exists",
        invoice_number:
          input.invoice.invoice_number,
        promise_date:
          result.existingPromise
            ?.promise_date ?? null,
      };
    }

    return {
      status: "created",
      invoice_number:
        input.invoice.invoice_number,
      promise_date:
        result.promise.promise_date,
    };
  } catch (error) {
    console.error(
      "[Haseel] payment promise command failed",
      error,
    );

    return {
      status: "error",
      code: "payment_promise_failed",
    };
  }
}
