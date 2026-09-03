import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvoicePDF } from "./pdf-generator.server";
import { setInvoiceStatus } from "./finance.server";
import {
  sendMessage,
  sendDocument,
} from "./messaging/messaging.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
    await supabaseAdmin.storage
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
  await supabaseAdmin.storage
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
 * Sends an invoice over WhatsApp.
 *
 * Flow:
 * 1. Validate invoice
 * 2. Resolve client
 * 3. Generate PDF
 * 4. Upload PDF to Supabase Storage
 * 5. Create signed URL
 * 6. Send AI-generated message
 * 7. Send PDF through Twilio
 * 8. Mark invoice as sent
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

  /**
   * Generate invoice PDF.
   */
  let pdfBytes: Uint8Array;

  try {
    pdfBytes = await generateInvoicePDF({
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
  } catch (error) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "pdf_generation_failed",
      message:
        error instanceof Error
          ? error.message
          : "Failed to generate invoice PDF.",
    };
  }

  /**
   * Upload PDF and create a temporary signed URL.
   */
  let pdfUrl: string;

  try {
    pdfUrl = await uploadInvoicePDF(
      ctx.supabase,
      invoiceId,
      invoice.invoice_number,
      pdfBytes,
    );
  } catch (error) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id: null,
      error: "pdf_upload_failed",
      message:
        error instanceof Error
          ? error.message
          : "Failed to upload invoice PDF.",
    };
  }

  /**
   * Send the AI-generated message.
   */
  const textResult = await sendMessage({
    to: recipient,
    body: message,
  });

  if (!textResult.success) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id:
        textResult.providerMessageId ?? null,
      error: "delivery_failed",
      message:
        textResult.error ??
        "WhatsApp invoice message failed to send.",
    };
  }

  /**
   * Send the invoice PDF through Twilio.
   */
  const documentResult = await sendDocument({
    to: recipient,
    fileUrl: pdfUrl,
    fileName:
      `invoice-${invoice.invoice_number}.pdf`,
    body:
      `Invoice ${invoice.invoice_number}`,
  });

  if (!documentResult.success) {
    return {
      sent: false,
      simulated: false,
      channel: "whatsapp",
      recipient,
      whatsapp_message_id:
        textResult.providerMessageId ?? null,
      error: "document_delivery_failed",
      message:
        documentResult.error ??
        "The invoice message was sent, but the PDF could not be delivered.",
    };
  }

  /**
   * Mark invoice as sent.
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
        documentResult.providerMessageId ??
        textResult.providerMessageId ??
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
      documentResult.providerMessageId ??
      textResult.providerMessageId ??
      null,
    invoice:
      (moved as {
        invoice?: unknown;
      }).invoice,
  };
}
