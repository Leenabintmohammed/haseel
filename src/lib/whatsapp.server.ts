import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvoicePDF } from "./pdf-generator.server";
import { setInvoiceStatus } from "./finance.server";
import {
  sendMessage,
  sendDocument,
} from "./messaging/messaging.server";

export type WhatsAppMessageInput = {
  invoice_id: string;
  recipient: string;
  message: string;
};

export type WhatsAppSendResult = {
  sent: boolean;
  simulated: boolean;
  channel: "whatsapp";
  recipient: string;
  whatsapp_message_id: string | null;
  invoice?: unknown;
  error?: string;
  message?: string;
};

type WhatsAppContext = {
  supabase: SupabaseClient;
  userId: string;
};

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name}_MISSING`);
  }

  return value;
}

export function normalizeWhatsAppPhone(phone: string) {
  let value = phone.trim().replace(/[^\d+]/g, "");

  if (value.startsWith("00")) {
    value = `+${value.slice(2)}`;
  }

  if (value.startsWith("+")) {
    value = value.slice(1);
  }

  return value;
}

function isValidWhatsAppPhone(phone: string) {
  return /^\d{8,15}$/.test(phone);
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

/**
 * Sends an already-generated message and optional invoice PDF
 * through WhatsApp.
 *
 * The AI is responsible for deciding what the message says.
 * This module is only responsible for delivery.
 */
export async function sendWhatsAppMessage(
  ctx: WhatsAppContext,
  input: WhatsAppMessageInput,
): Promise<WhatsAppSendResult> {
  const recipient = normalizeWhatsAppPhone(
    input.recipient,
  );

  if (!recipient) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient: "",
      whatsapp_message_id: null,
      error: "validation_failed",
      message:
        "A WhatsApp phone number is required.",
    };
  }

  if (!isValidWhatsAppPhone(recipient)) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "validation_failed",
      message:
        "The WhatsApp phone number is invalid. Use international format, for example +971501234567.",
    };
  }

  let accessToken: string;
  let phoneNumberId: string;
  let graphVersion: string;

  try {
    accessToken = requiredEnv(
      "WHATSAPP_ACCESS_TOKEN",
    );
    phoneNumberId = requiredEnv(
      "WHATSAPP_PHONE_NUMBER_ID",
    );
    graphVersion = requiredEnv(
      "WHATSAPP_GRAPH_API_VERSION",
    );
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "WHATSAPP_CONFIG_MISSING";

    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "internal_error",
      message:
        `WhatsApp is not configured. Missing ${code.replace(
          "_MISSING",
          "",
        )}.`,
    };
  }

  const baseUrl =
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}`;

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
        type: "text",
        text: {
          preview_url: true,
          body: input.message,
        },
      }),
    },
  );

  if (!messageResponse.ok) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "delivery_failed",
      message:
        await readMetaError(messageResponse),
    };
  }

  const result = (await messageResponse.json()) as {
    messages?: Array<{
      id?: string;
    }>;
  };

  return {
    sent: true,
    simulated: false,
    channel: "whatsapp",
    recipient,
    whatsapp_message_id:
      result.messages?.[0]?.id ?? null,
  };
}

/**
 * Sends an invoice over WhatsApp.
 *
 * The message itself comes from the AI.
 * This function only:
 *
 * 1. validates the invoice
 * 2. resolves the client phone
 * 3. generates the invoice PDF
 * 4. uploads the PDF to Meta
 * 5. sends the AI-generated text
 * 6. sends the PDF as a document message
 * 7. moves the invoice to "sent"
 */
export async function sendWhatsAppInvoice(
  ctx: WhatsAppContext,
  invoiceId: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const {
    data: invoice,
    error: invoiceError,
  } = await ctx.supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();

  if (invoiceError) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient: "",
      whatsapp_message_id: null,
      error: "internal_error",
      message: invoiceError.message,
    };
  }

  if (!invoice) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient: "",
      whatsapp_message_id: null,
      error: "not_found",
      message: "Invoice not found.",
    };
  }

  const {
    data: client,
    error: clientError,
  } = await ctx.supabase
    .from("clients")
    .select("name, phone")
    .eq("id", invoice.client_id)
    .eq("owner_id", ctx.userId)
    .maybeSingle();

  if (clientError) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient: "",
      whatsapp_message_id: null,
      error: "internal_error",
      message: clientError.message,
    };
  }

  const recipient = client?.phone
    ? normalizeWhatsAppPhone(client.phone)
    : "";

  if (!recipient) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient: "",
      whatsapp_message_id: null,
      error: "validation_failed",
      message:
        `Client ${client?.name ?? "for this invoice"} does not have a WhatsApp phone number.`,
    };
  }

  if (!isValidWhatsAppPhone(recipient)) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "validation_failed",
      message:
        "The client's WhatsApp phone number is invalid. Use international format, for example +971501234567.",
    };
  }

  let accessToken: string;
  let phoneNumberId: string;
  let graphVersion: string;

  try {
    accessToken = requiredEnv(
      "WHATSAPP_ACCESS_TOKEN",
    );

    phoneNumberId = requiredEnv(
      "WHATSAPP_PHONE_NUMBER_ID",
    );

    graphVersion = requiredEnv(
      "WHATSAPP_GRAPH_API_VERSION",
    );
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "WHATSAPP_CONFIG_MISSING";

    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "internal_error",
      message:
        `WhatsApp is not configured. Missing ${code.replace(
          "_MISSING",
          "",
        )}.`,
    };
  }

  const {
    data: items,
    error: itemsError,
  } = await ctx.supabase
    .from("invoice_items")
    .select(
      "description, quantity, unit_price, line_total",
    )
    .eq("invoice_id", invoiceId)
    .eq("owner_id", ctx.userId)
    .order("sort_order", {
      ascending: true,
    });

  if (itemsError) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "internal_error",
      message: itemsError.message,
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await ctx.supabase
    .from("profiles")
    .select("company_name, address")
    .eq("id", ctx.userId)
    .maybeSingle();

  if (profileError) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "internal_error",
      message: profileError.message,
    };
  }

  /*
   * Generate the same invoice PDF already used by
   * the Email delivery flow.
   */
  const pdfBytes = await generateInvoicePDF({
    invoice_number:
      invoice.invoice_number,

    issue_date:
      invoice.issue_date?.slice(0, 10) ??
      new Date()
        .toISOString()
        .slice(0, 10),

    due_date:
      invoice.due_date?.slice(0, 10) ??
      new Date()
        .toISOString()
        .slice(0, 10),

    client_name:
      client?.name ?? "Client",

    client_email:
      undefined,

    company_name:
      profile?.company_name ??
      "Your Company",

    company_address:
      profile?.address ??
      undefined,

    currency:
      invoice.currency ??
      "AED",

    amount:
      num(invoice.amount),

    subtotal:
      num(invoice.subtotal),

    discount:
      num(invoice.discount),

    tax:
      num(invoice.tax),

    paid_amount:
      num(invoice.paid_amount),

    items:
      (items ?? []).map((item) => ({
        description:
          item.description,

        quantity:
          num(item.quantity, 1),

        unit_price:
          num(item.unit_price),

        line_total:
          num(item.line_total),
      })),

    notes:
      invoice.notes ??
      undefined,
  });

  const baseUrl =
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}`;

  /*
   * Upload the invoice PDF to WhatsApp/Meta.
   */
  const mediaForm = new FormData();

  mediaForm.append(
    "messaging_product",
    "whatsapp",
  );

  mediaForm.append(
    "type",
    "application/pdf",
  );

  mediaForm.append(
    "file",
    new Blob(
      [pdfBytes],
      {
        type: "application/pdf",
      },
    ),
    `invoice-${invoice.invoice_number}.pdf`,
  );

  const mediaResponse = await fetch(
    `${baseUrl}/media`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },
      body: mediaForm,
    },
  );

  if (!mediaResponse.ok) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "delivery_failed",
      message:
        await readMetaError(mediaResponse),
    };
  }

  const mediaResult =
    (await mediaResponse.json()) as {
      id?: string;
    };

  if (!mediaResult.id) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "delivery_failed",
      message:
        "WhatsApp PDF upload did not return a media id.",
    };
  }

  /*
   * First send the AI-generated message.
   */
  const textResponse = await fetch(
    `${baseUrl}/messages`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        messaging_product:
          "whatsapp",

        to: recipient,

        type: "text",

        text: {
          preview_url: true,
          body: message,
        },
      }),
    },
  );

  if (!textResponse.ok) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "delivery_failed",
      message:
        await readMetaError(
          textResponse,
        ),
    };
  }

  const textResult =
    (await textResponse.json()) as {
      messages?: Array<{
        id?: string;
      }>;
    };

  /*
   * Then send the invoice PDF.
   */
  const documentResponse =
    await fetch(
      `${baseUrl}/messages`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          messaging_product:
            "whatsapp",

          to: recipient,

          type: "document",

          document: {
            id:
              mediaResult.id,

            filename:
              `invoice-${invoice.invoice_number}.pdf`,

            caption:
              `Invoice ${invoice.invoice_number}`,
          },
        }),
      },
    );

  if (!documentResponse.ok) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id:
        textResult.messages?.[0]?.id ??
        null,
      error: "delivery_failed",
      message:
        await readMetaError(
          documentResponse,
        ),
    };
  }

  const documentResult =
    (await documentResponse.json()) as {
      messages?: Array<{
        id?: string;
      }>;
    };

  const moved = await setInvoiceStatus(
    ctx,
    invoiceId,
    "sent",
  );

  if (
    (moved as {
      error?: string;
    })?.error
  ) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id:
        documentResult.messages?.[0]?.id ??
        textResult.messages?.[0]?.id ??
        null,
      error: "internal_error",
      message:
        "The WhatsApp messages were sent, but the invoice status could not be updated.",
    };
  }

  return {
    sent: true,
    simulated: false,
    channel: "whatsapp",
    recipient,
    whatsapp_message_id:
      documentResult.messages?.[0]?.id ??
      textResult.messages?.[0]?.id ??
      null,
    invoice:
      (moved as {
        invoice?: unknown;
      }).invoice,
  };
}
