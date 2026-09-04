import { defineEventHandler, readBody } from "h3";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runOrchestrator } from "@/lib/duely-orchestrator.server";
import { wahaWhatsAppProvider } from "@/lib/messaging/providers/waha.server";

type WahaPayload = {
  event?: string;
  session?: string;
  payload?: {
    id?: string;
    from?: string;
    to?: string;
    body?: string;
    fromMe?: boolean;
    _data?: {
      body?: string;
    };
  };
};

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function extractPhone(chatId: string): string | null {
  if (!chatId || chatId.includes("@g.us")) {
    return null;
  }

  const phone = normalizePhone(chatId.split("@")[0]);

  return /^\d{8,15}$/.test(phone) ? phone : null;
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as WahaPayload;

  console.log("[WAHA Webhook]", JSON.stringify(body));

  // Ignore anything other than incoming messages
  if (body.event !== "message") {
    return {
      status: "ignored",
      reason: "unsupported_event",
    };
  }

  const message = body.payload;

  // Ignore invalid payloads and messages sent by Haseel's own WhatsApp
  if (!message || message.fromMe) {
    return {
      status: "ignored",
      reason: "outgoing_message",
    };
  }

  const phone = extractPhone(message.from || "");

  const text = (
    message.body ||
    message._data?.body ||
    ""
  ).trim();

  // Ignore groups or messages without usable text
  if (!phone || !text) {
    return {
      status: "ignored",
      reason: "missing_phone_or_text",
    };
  }

  /*
   * Find the Haseel account associated with this WhatsApp number.
   *
   * profiles.id is the same UUID used as the Haseel userId.
   */
  const phoneVariants = [
    phone,
    `+${phone}`,
    `00${phone}`,
  ];

  const { data: profiles, error: profileError } =
    await supabaseAdmin
      .from("profiles")
      .select("id, phone")
      .in("phone", phoneVariants)
      .limit(2);

  if (profileError) {
    console.error(
      "[WAHA Webhook] Profile lookup failed",
      profileError,
    );

    throw profileError;
  }

  const profile = profiles?.find(
    (item) =>
      normalizePhone(item.phone || "") === phone,
  );

  if (!profile) {
    console.warn(
      "[WAHA Webhook] No Haseel account found for phone",
      phone,
    );

    return {
      status: "ignored",
      reason: "unknown_sender",
    };
  }

  /*
   * Every WhatsApp user gets a stable Haseel AI conversation session.
   */
  const sessionId =
    `whatsapp:${body.session || "default"}:${phone}`;

  try {
    /*
     * Send the WhatsApp message through the existing
     * Haseel AI orchestrator.
     */
    const result = await runOrchestrator({
      supabase: supabaseAdmin,
      userId: profile.id,
      message: text,
      sessionId,
      page: "whatsapp",
      focus: null,
      selection: [],
    });

    /*
     * Send Haseel AI's response back to WhatsApp.
     */
    if (result.reply.trim()) {
      const sendResult =
        await wahaWhatsAppProvider.sendMessage({
          to: phone,
          body: result.reply,
        });

      if (!sendResult.success) {
        console.error(
          "[WAHA Webhook] Reply failed",
          sendResult.error,
        );

        throw new Error(
          sendResult.error ||
            "Failed to send WhatsApp reply",
        );
      }
    }

    console.log(
      "[WAHA Webhook] AI reply sent",
      {
        phone,
        userId: profile.id,
        messageId: message.id,
      },
    );

    return {
      status: "ok",
      replied: Boolean(result.reply.trim()),
    };
  } catch (error) {
    console.error(
      "[WAHA Webhook] Processing failed",
      error,
    );

    throw error;
  }
});
