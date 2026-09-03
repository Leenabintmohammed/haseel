import type { SupabaseClient } from "@supabase/supabase-js";
import { setInvoiceStatus } from "./finance.server";
import {
  sendMessage,
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

async function uploadInvoicePDF(
  supabase: SupabaseClient,
  invoiceId: string,
  invoiceNumber: string,
  pdfBytes: Uint8Array,
) {
  const filePath = `${invoiceId}/invoice-${invoiceNumber}.pdf`;

  const { error: uploadError } =
    await supabase.storage
      .from("invoices")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

  if (uploadError) {
    throw new Error(
      `Invoice PDF upload failed: ${uploadError.message}`,
    );
  }

  const { data, error: urlError } =
    await supabase.storage
      .from("invoices")
      .createSignedUrl(filePath, 600);

  if (urlError || !data?.signedUrl) {
    throw new Error(
      `Invoice PDF URL creation failed: ${
        urlError?.message ?? "No signed URL returned."
      }`,
    );
  }

  return data.signedUrl;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

/**
 * Sends a normal WhatsApp text message through Twilio.
 */
export async function sendWhatsAppMessage(
  _ctx: WhatsAppContext,
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

  const result = await sendMessage({
    to: recipient,
    body: input.message,
  });

  if (!result.success) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id:
        result.providerMessageId ?? null,
      error: "delivery_failed",
      message:
        result.error ??
        "WhatsApp message failed to send.",
    };
  }

  return {
    sent: true,
    simulated: false,
    channel: "whatsapp",
    recipient,
    whatsapp_message_id:
      result.providerMessageId ?? null,
  };
}

/**
 * Sends an invoice notification over WhatsApp.
 *
 * PDF delivery will be added once invoice storage/public
 * file URLs are implemented.
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
        `Client ${
          client?.name ?? "for this invoice"
        } does not have a WhatsApp phone number.`,
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

  /**
   * Send the AI-generated invoice message.
   */
  const result = await sendMessage({
    to: recipient,
    body: message,
  });

  if (!result.success) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id:
        result.providerMessageId ?? null,
      error: "delivery_failed",
      message:
        result.error ??
        "WhatsApp invoice message failed to send.",
    };
  }

  /**
   * Mark the invoice as sent after successful
   * WhatsApp delivery.
   */
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
        result.providerMessageId ?? null,
      error: "internal_error",
      message:
        "The WhatsApp message was sent, but the invoice status could not be updated.",
    };
  }

  return {
    sent: true,
    simulated: false,
    channel: "whatsapp",
    recipient,
    whatsapp_message_id:
      result.providerMessageId ?? null,
    invoice:
      (moved as {
        invoice?: unknown;
      }).invoice,
  };
}
