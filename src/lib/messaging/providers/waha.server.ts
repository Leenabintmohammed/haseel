import type {
  MessagingProvider,
  SendDocumentInput,
  SendMessageInput,
  SendMessageResult,
} from "../types";

const WAHA_BASE_URL =
  process.env.WAHA_BASE_URL?.replace(/\/$/, "");

const WAHA_API_KEY =
  process.env.WAHA_API_KEY;

const WAHA_SESSION =
  process.env.WAHA_SESSION || "default";

function getConfig() {
  if (!WAHA_BASE_URL) {
    throw new Error(
      "Missing WAHA_BASE_URL environment variable",
    );
  }

  if (!WAHA_API_KEY) {
    throw new Error(
      "Missing WAHA_API_KEY environment variable",
    );
  }

  return {
    baseUrl: WAHA_BASE_URL,
    apiKey: WAHA_API_KEY,
    session: WAHA_SESSION,
  };
}

/**
 * Normalize a phone number to the format expected by WAHA:
 *
 *   971501234567@c.us
 *
 * Supported input examples:
 *
 *   +971501234567
 *   00971501234567
 *   971501234567
 *
 * The international country code must remain present.
 */
function normalizeChatId(
  phone: string,
): string {
  let digits = phone.replace(
    /\D/g,
    "",
  );

  /*
   * Convert international dialing prefix 00
   * to the plain international number.
   *
   * Example:
   * 00971501234567
   * becomes
   * 971501234567
   */
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (!/^\d{8,15}$/.test(digits)) {
    throw new Error(
      `Invalid WhatsApp phone number: ${phone}`,
    );
  }

  return `${digits}@c.us`;
}

export async function resolveWahaPhoneFromLid(
  lid: string,
): Promise<string | null> {
  const {
    baseUrl,
    apiKey,
    session,
  } = getConfig();

  const normalizedLid =
    lid.replace(/@lid$/i, "");

  if (!/^\d+$/.test(normalizedLid)) {
    return null;
  }

  try {
    const response = await fetch(
      `${baseUrl}/api/${encodeURIComponent(
        session,
      )}/lids/${encodeURIComponent(
        normalizedLid,
      )}`,
      {
        method: "GET",
        headers: {
          Accept:
            "application/json",
          "X-Api-Key": apiKey,
        },
      },
    );

    const text =
      await response.text();

    if (!response.ok) {
      console.warn(
        "[WAHA] Failed to resolve LID",
        normalizedLid,
        response.status,
        text,
      );

      return null;
    }

    let data: {
      lid?: string;
      pn?: string | null;
    };

    try {
      data = JSON.parse(text) as {
        lid?: string;
        pn?: string | null;
      };
    } catch {
      console.warn(
        "[WAHA] Invalid LID response",
        text,
      );

      return null;
    }

    let phone =
      data.pn?.replace(
        /\D/g,
        "",
      ) || "";

    /*
     * LID resolution may also return a phone
     * using the international 00 prefix.
     */
    if (phone.startsWith("00")) {
      phone = phone.slice(2);
    }

    if (
      !/^\d{8,15}$/.test(phone)
    ) {
      console.warn(
        "[WAHA] LID resolved without valid phone",
        normalizedLid,
        data.pn,
      );

      return null;
    }

    console.log(
      "[WAHA] LID resolved",
      {
        lid: `${normalizedLid}@lid`,
        phone,
      },
    );

    return phone;
  } catch (error) {
    console.error(
      "[WAHA] LID resolution failed",
      error,
    );

    return null;
  }
}

async function parseResponse(
  response: Response,
) {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getProviderMessageId(
  data: unknown,
): string | null {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }

  const value =
    data as Record<
      string,
      unknown
    >;

  if (
    typeof value.id === "string"
  ) {
    return value.id;
  }

  if (
    value.key &&
    typeof value.key ===
      "object" &&
    typeof (
      value.key as Record<
        string,
        unknown
      >
    ).id === "string"
  ) {
    return (
      value.key as Record<
        string,
        unknown
      >
    ).id as string;
  }

  if (
    typeof value.messageId ===
    "string"
  ) {
    return value.messageId;
  }

  return null;
}

function extractWahaError(
  data: unknown,
): string {
  if (
    typeof data === "string" &&
    data.trim()
  ) {
    return data.trim();
  }

  if (
    data &&
    typeof data === "object"
  ) {
    const value =
      data as Record<
        string,
        unknown
      >;

    const candidates = [
      value.message,
      value.error,
      value.details,
      value.description,
      value.code,
    ];

    const parts =
      candidates
        .filter(
          (item) =>
            typeof item ===
              "string" &&
            item.trim(),
        )
        .map(
          (item) =>
            String(item).trim(),
        );

    if (parts.length) {
      return [
        ...new Set(parts),
      ].join(" | ");
    }

    try {
      return JSON.stringify(
        data,
      );
    } catch {
      return "Unknown WAHA error response";
    }
  }

  return "Empty WAHA error response";
}

async function sendWahaRequest(
  endpoint: string,
  body: Record<
    string,
    unknown
  >,
): Promise<SendMessageResult> {
  const {
    baseUrl,
    apiKey,
  } = getConfig();

  try {
    console.log(
      "[WAHA] Sending request",
      {
        endpoint,
        body,
      },
    );

    const response =
      await fetch(
        `${baseUrl}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
              "application/json",
            "X-Api-Key":
              apiKey,
          },
          body: JSON.stringify(
            body,
          ),
        },
      );

    const data =
      await parseResponse(
        response,
      );

    if (!response.ok) {
      const errorMessage =
        extractWahaError(
          data,
        );

      console.error(
        "[WAHA] Request failed",
        {
          endpoint,
          status:
            response.status,
          statusText:
            response.statusText,
          error:
            errorMessage,
          response:
            data,
        },
      );

      return {
        success: false,
        providerMessageId:
          null,
        status: "failed",
        error:
          `WAHA request failed with status ${response.status}: ${errorMessage}`,
      };
    }

    console.log(
      "[WAHA] Request succeeded",
      {
        endpoint,
        status:
          response.status,
        providerMessageId:
          getProviderMessageId(
            data,
          ),
      },
    );

    return {
      success: true,
      providerMessageId:
        getProviderMessageId(
          data,
        ),
      status: "sent",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown WAHA error";

    console.error(
      "[WAHA] Request exception",
      {
        endpoint,
        error: message,
      },
    );

    return {
      success: false,
      providerMessageId:
        null,
      status: "failed",
      error: message,
    };
  }
}

export const wahaWhatsAppProvider: MessagingProvider =
  {
    async sendMessage(
      input: SendMessageInput,
    ) {
      const {
        session,
      } = getConfig();

      const chatId =
        normalizeChatId(
          input.to,
        );

      console.log(
        "[WAHA] Normalized WhatsApp chatId",
        {
          input: input.to,
          chatId,
        },
      );

      return sendWahaRequest(
        "/api/sendText",
        {
          session,
          chatId,
          text: input.body,
        },
      );
    },

    async sendDocument(
      input: SendDocumentInput,
    ) {
      const {
        session,
      } = getConfig();

      const chatId =
        normalizeChatId(
          input.to,
        );

      console.log(
        "[WAHA] Normalized WhatsApp document chatId",
        {
          input: input.to,
          chatId,
        },
      );

      return sendWahaRequest(
        "/api/sendFile",
        {
          session,
          chatId,
          caption:
            input.body || "",
          file: {
            mimetype:
              "application/pdf",
            filename:
              input.fileName ||
              "invoice.pdf",
            url: input.fileUrl,
          },
        },
      );
    },
  };
