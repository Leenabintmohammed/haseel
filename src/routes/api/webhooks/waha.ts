import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runCustomerOrchestrator } from "@/lib/customer-orchestrator.server";import { wahaWhatsAppProvider } from "@/lib/messaging/providers/waha.server";

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

type WahaLidResponse = {
  lid?: string;
  pn?: string | null;
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

/**
 * Resolve a WhatsApp Linked ID (@lid) to the real phone number (@c.us)
 * using the WAHA LID API.
 */
async function resolveWahaPhone(
  chatId: string,
): Promise<string | null> {
  if (!chatId) {
    return null;
  }

  // Normal WhatsApp phone ID
  if (!chatId.toLowerCase().endsWith("@lid")) {
    return extractPhone(chatId);
  }

  const baseUrl = process.env.WAHA_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.WAHA_API_KEY;
  const session = process.env.WAHA_SESSION || "default";

  if (!baseUrl || !apiKey) {
    console.error(
      "[WAHA Webhook] Missing WAHA_BASE_URL or WAHA_API_KEY",
    );

    return null;
  }

  const lid = chatId.split("@")[0];

  if (!/^\d+$/.test(lid)) {
    console.warn(
      "[WAHA Webhook] Invalid WhatsApp LID",
      chatId,
    );

    return null;
  }

  try {
    const response = await fetch(
      `${baseUrl}/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(lid)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Api-Key": apiKey,
        },
      },
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "[WAHA Webhook] LID resolution failed",
        {
          status: response.status,
          response: responseText,
          lid,
        },
      );

      return null;
    }

    let data: WahaLidResponse;

    try {
      data = JSON.parse(responseText) as WahaLidResponse;
    } catch {
      console.error(
        "[WAHA Webhook] Invalid LID API response",
        responseText,
      );

      return null;
    }

    const phone = data.pn
      ? normalizePhone(data.pn)
      : "";

    if (!/^\d{8,15}$/.test(phone)) {
      console.warn(
        "[WAHA Webhook] LID resolved without valid phone",
        {
          lid,
          pn: data.pn,
        },
      );

      return null;
    }

    console.log(
      "[WAHA Webhook] LID resolved",
      {
        lid: chatId,
        phone,
      },
    );

    return phone;
  } catch (error) {
    console.error(
      "[WAHA Webhook] LID resolution request failed",
      error,
    );

    return null;
  }
}

export const Route = createFileRoute("/api/webhooks/waha")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: WahaPayload;

        try {
          body = (await request.json()) as WahaPayload;
        } catch (error) {
          console.error(
            "[WAHA Webhook] Invalid JSON payload",
            error,
          );

          return new Response(
            JSON.stringify({
              status: "error",
              reason: "invalid_json",
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        console.log(
          "[WAHA Webhook]",
          JSON.stringify(body),
        );

        if (body.event !== "message") {
          return Response.json({
            status: "ignored",
            reason: "unsupported_event",
          });
        }

        const message = body.payload;

        if (!message) {
          return Response.json({
            status: "ignored",
            reason: "missing_payload",
          });
        }

        if (message.fromMe) {
          return Response.json({
            status: "ignored",
            reason: "outgoing_message",
          });
        }

        const sender = message.from || "";
        const recipient = message.to || "";

        const text = (
          message.body ||
          message._data?.body ||
          ""
        ).trim();

        if (!sender || !recipient || !text) {
          return Response.json({
            status: "ignored",
            reason: "missing_sender_recipient_or_text",
          });
        }

        /**
         * IMPORTANT:
         *
         * sender = العميل
         * recipient = رقم WhatsApp الخاص بـ Haseel
         *
         * لا نبحث عن العميل في profiles.phone.
         * نبحث عنه في clients.phone ثم نأخذ owner_id
         * لمعرفة حساب Haseel الذي يملك هذا العميل.
         */

        const customerPhone = await resolveWahaPhone(sender);

        if (!customerPhone) {
          console.warn(
            "[WAHA Webhook] Could not resolve customer phone",
            sender,
          );

          return Response.json({
            status: "ignored",
            reason: "unresolved_customer",
          });
        }

        const haseelWhatsAppPhone = extractPhone(recipient);

        if (!haseelWhatsAppPhone) {
          console.warn(
            "[WAHA Webhook] Could not resolve Haseel recipient phone",
            recipient,
          );

          return Response.json({
            status: "ignored",
            reason: "invalid_haseel_recipient",
          });
        }

        console.log(
          "[WAHA Webhook] Message routing",
          {
            customerPhone,
            haseelWhatsAppPhone,
            text,
          },
        );

        /**
         * The customer's phone is already stored in clients.phone
         * because this is the same number used when Haseel sent
         * the invoice through WhatsApp.
         */
        const phoneVariants = [
          customerPhone,
          `+${customerPhone}`,
          `00${customerPhone}`,
        ];

        const {
          data: clients,
          error: clientError,
        } = await supabaseAdmin
          .from("clients")
          .select(
            "id, owner_id, phone, name",
          )
          .in("phone", phoneVariants)
          .limit(10);

        if (clientError) {
          console.error(
            "[WAHA Webhook] Client lookup failed",
            clientError,
          );

          return new Response(
            JSON.stringify({
              status: "error",
              reason: "client_lookup_failed",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        const client = clients?.find(
          (item) =>
            normalizePhone(item.phone || "") ===
            customerPhone,
        );

        if (!client?.owner_id) {
          console.warn(
            "[WAHA Webhook] No Haseel client found for phone",
            customerPhone,
          );

          return Response.json({
            status: "ignored",
            reason: "unknown_customer",
          });
        }

        console.log(
          "[WAHA Webhook] Client found",
          {
            customerPhone,
            clientId: client.id,
            clientName: client.name,
            userId: client.owner_id,
          },
        );

        /**
         * Conversation is now associated with:
         *
         * Haseel account owner
         * +
         * customer phone
         *
         * This prevents conversations from different customers
         * from being mixed together.
         */
        const sessionId =
          `whatsapp:${body.session || "default"}:${client.owner_id}:${customerPhone}`;

        try {
          console.log(
            "[WAHA Webhook] Sending message to orchestrator",
            {
              customerPhone,
              userId: client.owner_id,
              sessionId,
              text,
            },
          );

const result = await runCustomerOrchestrator({
  supabase: supabaseAdmin,
  ownerId: client.owner_id,
  clientId: client.id,
  customerPhone,
  message: text,
  sessionId,
});
          
          console.log(
            "[WAHA Webhook] Orchestrator completed",
            {
              customerPhone,
              hasReply: Boolean(
                result.reply?.trim(),
              ),
            },
          );

          if (result.reply.trim()) {
            const sendResult =
              await wahaWhatsAppProvider.sendMessage({
                to: customerPhone,
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

            console.log(
              "[WAHA Webhook] AI reply sent",
              {
                customerPhone,
                userId: client.owner_id,
                messageId: message.id,
                providerMessageId:
                  sendResult.providerMessageId,
              },
            );
          }

          return Response.json({
            status: "ok",
            replied: Boolean(
              result.reply.trim(),
            ),
          });
        } catch (error) {
          console.error(
            "[WAHA Webhook] Processing failed",
            error,
          );

          return new Response(
            JSON.stringify({
              status: "error",
              reason: "processing_failed",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }
      },
    },
  },
});
