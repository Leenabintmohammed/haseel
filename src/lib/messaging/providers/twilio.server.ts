import type {
  MessagingProvider,
  SendDocumentInput,
  SendMessageInput,
  SendMessageResult,
} from "../types";

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !whatsappFrom) {
    throw new Error(
      "Missing Twilio configuration: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM",
    );
  }

  return {
    accountSid,
    authToken,
    whatsappFrom,
  };
}

function formatWhatsAppAddress(value: string) {
  if (value.startsWith("whatsapp:")) {
    return value;
  }

  return `whatsapp:${value}`;
}

async function twilioRequest(
  to: string,
  body: URLSearchParams,
) {
  const { accountSid, authToken } = getTwilioConfig();

  const credentials = Buffer.from(
    `${accountSid}:${authToken}`,
  ).toString("base64");

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || "Twilio request failed",
    );
  }

  return data;
}

export const twilioWhatsAppProvider: MessagingProvider = {
  async sendMessage(
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    try {
      const { whatsappFrom } = getTwilioConfig();

      const body = new URLSearchParams({
        From: formatWhatsAppAddress(whatsappFrom),
        To: formatWhatsAppAddress(input.to),
        Body: input.body,
      });

      const data = await twilioRequest(input.to, body);

      return {
        success: true,
        providerMessageId: data.sid,
        status: "sent",
      };
    } catch (error) {
      return {
        success: false,
        providerMessageId: null,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Unknown Twilio error",
      };
    }
  },

  async sendDocument(
    input: SendDocumentInput,
  ): Promise<SendMessageResult> {
    try {
      const { whatsappFrom } = getTwilioConfig();

      const params: Record<string, string> = {
        From: formatWhatsAppAddress(whatsappFrom),
        To: formatWhatsAppAddress(input.to),
        MediaUrl: input.fileUrl || "",
      };

      if (input.body) {
        params.Body = input.body;
      }

      const body = new URLSearchParams(params);

      const data = await twilioRequest(input.to, body);

      return {
        success: true,
        providerMessageId: data.sid,
        status: "sent",
      };
    } catch (error) {
      return {
        success: false,
        providerMessageId: null,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Unknown Twilio error",
      };
    }
  },
};
