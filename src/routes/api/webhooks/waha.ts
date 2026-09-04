import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/api/webhooks/waha")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as WahaPayload;

        console.log("[WAHA Webhook]", JSON.stringify(body));

        if (body.event !== "message") {
          return Response.json({
            status: "ignored",
            reason: "unsupported_event",
          });
        }

        const message = body.payload;

        if (!message || message.fromMe) {
          return Response.json({
            status: "ignored",
            reason: "outgoing_message",
          });
        }

        const phone = extractPhone(message.from || "");

        const text = (
          message.body ||
          message._data?.body ||
          ""
        ).trim();

        if (!phone || !text) {
          return Response.json({
            status: "ignored",
            reason: "missing_phone_or_text",
          });
        }

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

          return new Response(
            JSON.stringify({
              status: "error",
              reason: "profile_lookup_failed",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
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

          return Response.json({
            status: "ignored",
            reason: "unknown_sender",
          });
        }

        const sessionId =
          `whatsapp:${body.session || "default"}:${phone}`;

        try {
          const result = await runOrchestrator({
            supabase: supabaseAdmin,
            userId: profile.id,
            message: text,
            sessionId,
            page: "whatsapp",
            focus: null,
            selection: [],
          });

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

          return Response.json({
            status: "ok",
            replied: Boolean(result.reply.trim()),
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
