import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvoicePDF } from "./pdf-generator.server";
import { setInvoiceStatus } from "./finance.server";

type WhatsAppCtx = {
  supabase: SupabaseClient;
  userId: string;
};

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name}_MISSING`);
  }

  return value;
}

function normalizeWhatsAppPhone(phone: string) {
  let value = phone.trim().replace(/[^\d+]/g, "");

  if (value.startsWith("00")) {
    value = `+${value.slice(2)}`;
  }

  if (value.startsWith("+")) {
    value = value.slice(1);
  }

  return value;
}

async function readMetaError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
        error_user_msg?: string;
      };
    };

    return (
      body.error?.error_user_msg ||
      body.error?.message ||
      "WhatsApp request failed."
    );
  } catch {
    return "WhatsApp request failed.";
  }
}

export async function sendWhatsAppInvoice(
  ctx: WhatsAppCtx,
  invoiceId: string,
) {
  const { data: invoice, error: invoiceError } = await ctx.supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();

  if (invoiceError) {
    return {
      error: "internal_error",
      message: invoiceError.message,
    };
  }

  if (!invoice) {
    return {
      error: "invoice_not_found",
      message: "Invoice not found.",
    };
  }

  const { data: client, error: clientError } = await ctx.supabase
    .from("clients")
    .select("name, phone")
    .eq("id", invoice.client_id)
    .eq("owner_id", ctx.userId)
    .maybeSingle();

  if (clientError) {
    return {
      error: "internal_error",
      message: clientError.message,
    };
  }

  const recipient = client?.phone
    ? normalizeWhatsAppPhone(client.phone)
    : "";

  if (!recipient) {
    return {
      error: "validation_failed",
      message: `Client ${client?.name ?? "for this invoice"} does not have a WhatsApp phone number.`,
    };
  }

  if (!/^\d{8,15}$/.test(recipient)) {
    return {
      error: "validation_failed",
      message:
        "The client's WhatsApp phone number is invalid. Store it in international format, e.g. +971501234567.",
    };
  }

  let accessToken: string;
  let phoneNumberId: string;
  let graphVersion: string;

  try {
    accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");
    phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
    graphVersion = requireEnv("WHATSAPP_GRAPH_API_VERSION");
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "WHATSAPP_CONFIG_MISSING";

    return {
      error: "internal_error",
      message: `WhatsApp is not configured (${code.replace(
        "_MISSING",
        "",
      )}).`,
    };
  }

  const { data: items, error: itemsError } = await ctx.supabase
    .from("invoice_items")
    .select("description, quantity, unit_price, line_total")
    .eq("invoice_id", invoiceId)
    .eq("owner_id", ctx.userId)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    return {
      error: "internal_error",
      message: itemsError.message,
    };
  }

  const { data: profile, error: profileError } = await ctx.supabase
    .from("profiles")
    .select("company_name, address")
    .eq("id", ctx.userId)
    .maybeSingle();

  if (profileError) {
    return {
      error: "internal_error",
      message: profileError.message,
    };
  }

  const pdfBytes = await generateInvoicePDF({
    invoice_number: invoice.invoice_number,
    issue_date:
      invoice.issue_date?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
    due_date:
      invoice.due_date?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
    client_name: client?.name ?? "Client",
    client_email: undefined,
    company_name: profile?.company_name ?? "Your Company",
    company_address: profile?.address ?? undefined,
    currency: invoice.currency ?? "AED",
    amount: num(invoice.amount),
    subtotal: num(invoice.subtotal),
    discount: num(invoice.discount),
    tax: num(invoice.tax),
    paid_amount: num(invoice.paid_amount),
    items: (items ?? []).map((item) => ({
      description: item.description,
      quantity: num(item.quantity, 1),
      unit_price: num(item.unit_price),
      line_total: num(item.line_total),
    })),
    notes: invoice.notes ?? undefined,
  });

  const baseUrl =
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}`;

  const mediaForm = new FormData();

  mediaForm.append("messaging_product", "whatsapp");
  mediaForm.append("type", "application/pdf");

  mediaForm.append(
    "file",
    new Blob([pdfBytes], {
      type: "application/pdf",
    }),
    `invoice-${invoice.invoice_number}.pdf`,
  );

  const mediaResponse = await fetch(
    `${baseUrl}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: mediaForm,
    },
  );

  if (!mediaResponse.ok) {
    return {
      error: "delivery_failed",
      message: await readMetaError(mediaResponse),
    };
  }

  const mediaResult = (await mediaResponse.json()) as {
    id?: string;
  };

  if (!mediaResult.id) {
    return {
      error: "delivery_failed",
      message:
        "WhatsApp media upload did not return a media id.",
    };
  }

  const messageResponse = await fetch(
    `${baseUrl}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        type: "document",
        document: {
          id: mediaResult.id,
          filename: `invoice-${invoice.invoice_number}.pdf`,
          caption:
            `Invoice ${invoice.invoice_number} · ` +
            `${invoice.currency ?? "AED"} ` +
            `${num(invoice.amount).toFixed(2)}`,
        },
      }),
    },
  );

  if (!messageResponse.ok) {
    return {
      error: "delivery_failed",
      message: await readMetaError(messageResponse),
    };
  }

  const messageResult = (await messageResponse.json()) as {
    messages?: Array<{
      id?: string;
    }>;
  };

  const moved = await setInvoiceStatus(
    ctx,
    invoiceId,
    "sent",
  );

  if ((moved as { error?: string })?.error) {
    return moved;
  }

  return {
    sent: true,
    simulated: false,
    channel: "whatsapp",
    recipient,
    whatsapp_message_id:
      messageResult.messages?.[0]?.id ?? null,
    invoice: (moved as { invoice?: unknown }).invoice,
  };
}
