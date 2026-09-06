import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateText,
  stepCountIs,
} from "ai";

import {
  getDuelyModel,
  getDuelyModelId,
  hasAiProvider,
} from "./ai-provider.server";

import {
  loadCustomerContext,
} from "./customer-agent/context.server";

import {
  createCustomerTools,
} from "./customer-agent/tools.server";

import {
  CUSTOMER_AGENT_PROMPT,
} from "./customer-agent/prompt";

type CustomerOrchestratorArgs = {
  supabase: SupabaseClient;
  ownerId: string;
  clientId: string;
  customerPhone: string;
  message: string;
  sessionId: string;
};

function isArabic(
  value: string,
): boolean {
  return /[\u0600-\u06FF]/u.test(
    value,
  );
}

function fallback(
  message: string,
): string {
  return isArabic(message)
    ? "تعذر معالجة رسالتك حالياً. يرجى المحاولة مرة أخرى."
    : "I couldn't process your message right now. Please try again.";
}

export async function runCustomerOrchestrator(
  args: CustomerOrchestratorArgs,
): Promise<{
  reply: string;
}> {
  const {
    supabase,
    ownerId,
    clientId,
    customerPhone,
    message,
    sessionId,
  } = args;

  const cleanMessage =
    message.trim();

  if (!cleanMessage) {
    return {
      reply: "",
    };
  }

  /*
   * ---------------------------------------------------------------
   * 1. Customer Context
   * ---------------------------------------------------------------
   */

  const customerContext =
    await loadCustomerContext(
      supabase,
      {
        ownerId,
        clientId,
      },
    );

  if (!customerContext.ok) {
    return {
      reply:
        fallback(cleanMessage),
    };
  }

  /*
   * ---------------------------------------------------------------
   * 2. Persist incoming message
   * ---------------------------------------------------------------
   */

  const conversationContext = {
    mode: "customer",
    client_id:
      clientId,
    customer_phone:
      customerPhone,
  };

  const {
    error:
      userConversationError,
  } = await supabase
    .from("ai_conversations")
    .insert({
      owner_id:
        ownerId,
      session_id:
        sessionId,
      role:
        "user",
      message:
        cleanMessage,
      context:
        conversationContext as never,
    });

  if (
    userConversationError
  ) {
    console.error(
      "[Haseel] user conversation insert failed",
      userConversationError,
    );
  }

  /*
   * ---------------------------------------------------------------
   * 3. Load recent conversation
   * ---------------------------------------------------------------
   */

  const {
    data:
      recentHistory,
    error:
      historyError,
  } = await supabase
    .from("ai_conversations")
    .select(
      "role,message,created_at",
    )
    .eq(
      "owner_id",
      ownerId,
    )
    .eq(
      "session_id",
      sessionId,
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    )
    .limit(30);

  if (historyError) {
    console.error(
      "[Haseel] history lookup failed",
      historyError,
    );
  }

  const history =
    [
      ...(recentHistory ?? []),
    ].reverse();

  const messages =
    history
      .map(
        (row) => ({
          role:
            row.role ===
            "assistant"
              ? ("assistant" as const)
              : ("user" as const),
          content:
            String(
              row.message ??
                "",
            ),
        }),
      )
      .filter(
        (row) =>
          row.content.trim()
            .length > 0,
      );

  if (
    !messages.some(
      (row) =>
        row.role ===
          "user" &&
        row.content ===
          cleanMessage,
    )
  ) {
    messages.push({
      role: "user",
      content:
        cleanMessage,
    });
  }

  /*
   * ---------------------------------------------------------------
   * 4. AI availability
   * ---------------------------------------------------------------
   */

  if (!hasAiProvider()) {
    return {
      reply:
        fallback(cleanMessage),
    };
  }

  /*
   * ---------------------------------------------------------------
   * 5. Tools
   * ---------------------------------------------------------------
   */

  const tools =
    createCustomerTools({
      supabase,
      ownerId,
      clientId,
      customerMessage:
        cleanMessage,
      context:
        customerContext.context,
    });

  /*
   * ---------------------------------------------------------------
   * 6. Verified financial context
   * ---------------------------------------------------------------
   */

  const verifiedContext =
    JSON.stringify(
      customerContext.context,
      null,
      2,
    );

  /*
   * ---------------------------------------------------------------
   * 7. Agent system prompt
   * ---------------------------------------------------------------
   */

  const systemPrompt = `
${CUSTOMER_AGENT_PROMPT}

VERIFIED CUSTOMER CONTEXT

${verifiedContext}

IMPORTANT

The current database state is authoritative.

The customer currently authenticated for this conversation is:

Customer ID:
${clientId}

Do not use data outside this customer.

CURRENT MESSAGE

${cleanMessage}
`;

  /*
   * ---------------------------------------------------------------
   * 8. Generate
   * ---------------------------------------------------------------
   */

  const modelId =
    getDuelyModelId();

  try {
    const result =
      await generateText({
        model:
          getDuelyModel(),

        system:
          systemPrompt,

        messages,

        tools,

        stopWhen:
          stepCountIs(8),
      });

    const reply =
      result.text?.trim() ||
      fallback(cleanMessage);

    /*
     * -------------------------------------------------------------
     * 9. Persist response
     * -------------------------------------------------------------
     */

    const {
      error:
        assistantConversationError,
    } = await supabase
      .from("ai_conversations")
      .insert({
        owner_id:
          ownerId,
        session_id:
          sessionId,
        role:
          "assistant",
        message:
          reply,
        context:
          conversationContext as never,
      });

    if (
      assistantConversationError
    ) {
      console.error(
        "[Haseel] assistant conversation insert failed",
        assistantConversationError,
      );
    }

    console.log(
      "[Haseel] customer agent completed",
      {
        model:
          modelId,
        sessionId,
        messageCount:
          messages.length,
        resultLength:
          reply.length,
        finishReason:
          result.finishReason,
        usage:
          result.usage,
      },
    );

    return {
      reply,
    };
  } catch (error) {
    console.error(
      "[Haseel] customer agent failed",
      {
        model:
          modelId,
        sessionId,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );

    const reply =
      fallback(cleanMessage);

    await supabase
      .from("ai_conversations")
      .insert({
        owner_id:
          ownerId,
        session_id:
          sessionId,
        role:
          "assistant",
        message:
          reply,
        context:
          conversationContext as never,
      });

    return {
      reply,
    };
  }
}
