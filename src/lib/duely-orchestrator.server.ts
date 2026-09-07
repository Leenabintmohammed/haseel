import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateText,
  stepCountIs,
  tool,
} from "ai";
import { z } from "zod";

import {
  getDuelyModel,
  hasAiProvider,
} from "./ai-provider.server";

import {
  buildApprovalActionInput,
  createApprovalSignature,
} from "./ai.functions";

import {
  optionalPaymentLinkSchema,
  updatablePaymentLinkSchema,
} from "./payment-link";

import {
  TOOL_AUTONOMY,
  executeTool,
  dashboardSummary,
  atRiskClients,
  type ToolCtx,
} from "./duely-tools.server";

import { syncNotifications } from "./finance.server";

export type PendingAction = {
  id: string;
  tool_name: string;
  intent: string;
  parameters_json: string;
  autonomy_level: string;
  title: string;
  fields: {
    label: string;
    value: string;
  }[];
};

export type ChatResult = {
  reply: string;
  pending: PendingAction[];
  performed: {
    tool: string;
    autonomy: string;
    status: string;
  }[];
};

const TITLES: Record<
  string,
  string
> = {
  send_invoice: "Send Invoice",
  send_reminder: "Send Reminder",
  update_company_policy:
    "Update Company Policy",
  create_payment_plan:
    "Create Payment Plan",
  cancel_payment_plan:
    "Cancel Payment Plan",
  reverse_payment:
    "Reverse Payment",
};

function describe(
  params: Record<string, unknown>,
) {
  return Object.entries(params)
    .slice(0, 6)
    .map(([k, v]) => ({
      label: k
        .replace(/_/g, " ")
        .replace(
          /\b\w/g,
          (c) => c.toUpperCase(),
        ),
      value:
        typeof v === "object"
          ? JSON.stringify(v)
          : String(v),
    }));
}

async function buildContext(
  ctx: ToolCtx,
  page: string,
  focus: {
    type: string;
    id: string;
    summary?: string;
  } | null,
  selection: {
    type: string;
    id: string;
  }[],
) {
  const [
    { data: profile },
    { data: policies },
    summary,
    { data: clients },
    notifications,
    risk,
  ] = await Promise.all([
    ctx.supabase
      .from("profiles")
      .select("*")
      .eq("id", ctx.userId)
      .maybeSingle(),

    ctx.supabase
      .from("company_policies")
      .select(
        "policy_key,policy_value",
      )
      .eq(
        "owner_id",
        ctx.userId,
      ),

    dashboardSummary(ctx),

    ctx.supabase
      .from("clients")
      .select(
        "id,name,company_name,email",
      )
      .eq(
        "owner_id",
        ctx.userId,
      )
      .limit(50),

    syncNotifications(ctx),

    atRiskClients(ctx),
  ]);

  let focusDetail: unknown =
    null;

  let memory: unknown[] = [];

  if (
    focus?.type === "invoice"
  ) {
    const { data } =
      await ctx.supabase
        .from("invoices")
        .select(
          "*, clients(id,name,company_name,email)",
        )
        .eq(
          "id",
          focus.id,
        )
        .eq(
          "owner_id",
          ctx.userId,
        )
        .maybeSingle();

    focusDetail = data;

    if (data?.client_id) {
      const { data: m } =
        await ctx.supabase
          .from("client_memory")
          .select("*")
          .eq(
            "owner_id",
            ctx.userId,
          )
          .eq(
            "client_id",
            data.client_id,
          );

      memory = m ?? [];
    }
  } else if (
    focus?.type === "client"
  ) {
    const { data } =
      await ctx.supabase
        .from("clients")
        .select("*")
        .eq(
          "id",
          focus.id,
        )
        .eq(
          "owner_id",
          ctx.userId,
        )
        .maybeSingle();

    focusDetail = data;

    const { data: m } =
      await ctx.supabase
        .from("client_memory")
        .select("*")
        .eq(
          "owner_id",
          ctx.userId,
        )
        .eq(
          "client_id",
          focus.id,
        );

    memory = m ?? [];
  } else if (
    focus?.type === "payment"
  ) {
    const { data } =
      await ctx.supabase
        .from("payments")
        .select("*")
        .eq(
          "id",
          focus.id,
        )
        .eq(
          "owner_id",
          ctx.userId,
        )
        .maybeSingle();

    focusDetail = data;
  } else if (
    focus?.type ===
    "payment_plan"
  ) {
    const { data } =
      await ctx.supabase
        .from("payment_plans")
        .select(
          "*, payment_plan_installments(*)",
        )
        .eq(
          "id",
          focus.id,
        )
        .eq(
          "owner_id",
          ctx.userId,
        )
        .maybeSingle();

    focusDetail = data;
  }

  const selectedInvoiceIds =
    selection
      .filter(
        (s) => s.type === "invoice",
      )
      .map((s) => s.id);

  const selectedClientIds =
    selection
      .filter(
        (s) => s.type === "client",
      )
      .map((s) => s.id);

  const selectedPaymentIds =
    selection
      .filter(
        (s) => s.type === "payment",
      )
      .map((s) => s.id);

  const selectedPlanIds =
    selection
      .filter(
        (s) =>
          s.type ===
          "payment_plan",
      )
      .map((s) => s.id);

  const selected: Record<
    string,
    unknown
  > = {};

  if (
    selectedInvoiceIds.length
  ) {
    const { data } =
      await ctx.supabase
        .from("invoices")
        .select(
          "id,invoice_number,amount,remaining_balance,currency,status,due_date, clients(id,name)",
        )
        .eq(
          "owner_id",
          ctx.userId,
        )
        .in(
          "id",
          selectedInvoiceIds,
        );

    selected["invoices"] =
      data ?? [];
  }

  if (
    selectedClientIds.length
  ) {
    const { data } =
      await ctx.supabase
        .from("clients")
        .select(
          "id,name,company_name,email,status",
        )
        .eq(
          "owner_id",
          ctx.userId,
        )
        .in(
          "id",
          selectedClientIds,
        );

    selected["clients"] =
      data ?? [];
  }

  if (
    selectedPaymentIds.length
  ) {
    const { data } =
      await ctx.supabase
        .from("payments")
        .select(
          "id,amount,currency,payment_date,payment_method,reference,invoice_id,client_id,reversed_at",
        )
        .eq(
          "owner_id",
          ctx.userId,
        )
        .in(
          "id",
          selectedPaymentIds,
        );

    selected["payments"] =
      data ?? [];
  }

  if (
    selectedPlanIds.length
  ) {
    const { data } =
      await ctx.supabase
        .from("payment_plans")
        .select(
          "id,client_id,invoice_id,total_amount,paid_amount,remaining_amount,currency,status,payment_plan_installments(*)",
        )
        .eq(
          "owner_id",
          ctx.userId,
        )
        .in(
          "id",
          selectedPlanIds,
        );

    selected[
      "payment_plans"
    ] = data ?? [];
  }

  return {
    user: {
      id: ctx.userId,
      name: profile?.full_name,
      company:
        profile?.company_name,
      currency: profile?.currency,
    },

    current_page: page,

    current_focus: focus
      ? {
          ...focus,
          detail:
            focusDetail,
        }
      : null,

    current_selection:
      selection.length
        ? selected
        : null,

    company_policies:
      policies ?? [],

    relevant_client_memory:
      memory,

    clients_directory:
      clients ?? [],

    financial_snapshot:
      summary,

    unread_notifications:
      (
        notifications.notifications ??
        []
      ).slice(0, 15),

    at_risk_clients:
      risk.clients,

    today:
      new Date()
        .toISOString()
        .slice(0, 10),
  };
}

const SYSTEM = `
You are Haseel AI, the primary operating interface of Haseel — an AI-native financial operations assistant for freelancers, agencies and small businesses.

RULES

- You act only through the provided tools. Never claim an action happened unless a tool returned success.
- Never invent clients, invoices, payments, amounts or dates.
- If data is missing, say so or ask.
- Ask only for genuinely missing information.
- Use company policies for defaults.
- Some tools require owner's approval: send_invoice, send_reminder, update_company_policy, create_payment_plan, cancel_payment_plan, reverse_payment.
- When an approval-required tool is called, the system creates an approval card. Never claim the action already happened.
- Payment plans: use list_payment_plans for broad/current plan questions and get_payment_plan when a specific plan_id is known.
- Never compute payment-plan balances yourself. Read them from tool results.
- Risk: use get_client_risk or list_at_risk_clients for reliability/chasing questions.
- Never cancel debt, grant major concessions, handle legal disputes or terminate a client relationship.
- For reminders, use generate_reminder with a complete professional message in the client's language.
- Reply in the language of the user's message.
- Be concise, direct and professional.
- Use short lines.
- Do not use markdown tables.
- Use amounts with their currency code.
`;

function normalizeForIntent(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /[?!.,]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic read path for common questions.
 *
 * These questions should not depend on the LLM deciding which
 * read tool to call. They are simple database reads and should
 * return consistently.
 */
async function tryDeterministicRead(
  ctx: ToolCtx,
  message: string,
): Promise<string | null> {
  const normalized =
    normalizeForIntent(
      message,
    );

  const asksActivePaymentPlan =
    normalized.includes(
      "current active payment plan",
    ) ||
    normalized.includes(
      "active payment plan",
    ) ||
    normalized.includes(
      "currently active payment plan",
    );

  if (
    !asksActivePaymentPlan
  ) {
    return null;
  }

  const {
    data: plan,
    error: planError,
  } = await ctx.supabase
    .from("payment_plans")
    .select(
      "id,client_id,invoice_id,total_amount,paid_amount,remaining_amount,currency,status,start_date,end_date,installment_count,frequency,created_at,clients(name,company_name),payment_plan_installments(*)",
    )
    .eq(
      "owner_id",
      ctx.userId,
    )
    .eq(
      "status",
      "active",
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    )
    .limit(1)
    .maybeSingle();

  if (planError) {
    throw new Error(
      `Failed to load active payment plan: ${planError.message}`,
    );
  }

  if (!plan) {
    return "There is no active payment plan currently.";
  }

  const client = plan.clients as
    | {
        name?: string | null;
        company_name?: string | null;
      }
    | null;

  const installments =
    Array.isArray(
      plan.payment_plan_installments,
    )
      ? plan.payment_plan_installments
      : [];

  const sortedInstallments =
    [...installments].sort(
      (
        a: {
          due_date?: string;
          seq?: number;
        },
        b: {
          due_date?: string;
          seq?: number;
        },
      ) => {
        const dateA =
          String(
            a.due_date ?? "",
          );

        const dateB =
          String(
            b.due_date ?? "",
          );

        if (
          dateA !== dateB
        ) {
          return dateA.localeCompare(
            dateB,
          );
        }

        return (
          Number(
            a.seq ?? 0,
          ) -
          Number(
            b.seq ?? 0,
          )
        );
      },
    );

  const firstInstallment =
    sortedInstallments[0];

  const firstDueDate =
    firstInstallment?.due_date
      ? String(
          firstInstallment.due_date,
        ).slice(0, 10)
      : null;

  const totalAmount =
    Number(
      plan.total_amount ?? 0,
    );

  const paidAmount =
    Number(
      plan.paid_amount ?? 0,
    );

  const remainingAmount =
    Number(
      plan.remaining_amount ??
        Math.max(
          0,
          totalAmount -
            paidAmount,
        ),
    );

  const totalText =
    `${plan.currency ?? "AED"} ${totalAmount.toLocaleString()}`;

  const paidText =
    `${plan.currency ?? "AED"} ${paidAmount.toLocaleString()}`;

  const remainingText =
    `${plan.currency ?? "AED"} ${remainingAmount.toLocaleString()}`;

  const clientName =
    client?.name?.trim() ||
    client?.company_name?.trim() ||
    "Unknown client";

  const schedule =
    plan.installment_count
      ? `${plan.installment_count} ${String(
          plan.frequency ?? "",
        ).trim() || "scheduled"} installments`
      : installments.length > 0
        ? `${installments.length} installments`
        : "Payment plan";

  const lines = [
    "Current active payment plan:",
    "",
    `- Client: ${clientName}`,
    `- Total: ${totalText}`,
    `- Paid: ${paidText}`,
    `- Remaining: ${remainingText}`,
    `- Schedule: ${schedule}`,
  ];

  if (
    firstDueDate
  ) {
    lines.push(
      `- First payment due: ${firstDueDate}`,
    );
  }

  if (
    plan.end_date
  ) {
    lines.push(
      `- Plan ends: ${String(
        plan.end_date,
      ).slice(0, 10)}`,
    );
  }

  lines.push(
    `- Status: ${plan.status}`,
  );

  return lines.join(
    "\n",
  );
}

export async function runOrchestrator(args: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  sessionId: string;
  page: string;
  focus: {
    type: string;
    id: string;
    summary?: string;
  } | null;
  selection?: {
    type: string;
    id: string;
  }[];
}): Promise<ChatResult> {
  const ctx: ToolCtx = {
    supabase:
      args.supabase,
    userId:
      args.userId,
  };

  if (
    !hasAiProvider()
  ) {
    return {
      reply:
        "AI is not configured yet.",
      pending: [],
      performed: [],
    };
  }

  await ctx.supabase
    .from("ai_conversations")
    .insert({
      owner_id:
        args.userId,
      session_id:
        args.sessionId,
      role: "user",
      message:
        args.message,
      context: {
        page: args.page,
        focus: args.focus,
      } as never,
    });

  /*
   * Deterministic handling for simple, high-confidence
   * read requests.
   *
   * This happens before building the large AI context.
   */
  try {
    const deterministicReply =
      await tryDeterministicRead(
        ctx,
        args.message,
      );

    if (
      deterministicReply
    ) {
      await ctx.supabase
        .from(
          "ai_conversations",
        )
        .insert({
          owner_id:
            args.userId,
          session_id:
            args.sessionId,
          role: "assistant",
          message:
            deterministicReply,
          context: {
            deterministic:
              true,
          } as never,
        });

      return {
        reply:
          deterministicReply,
        pending: [],
        performed: [],
      };
    }
  } catch (error) {
    console.error(
      "[Haseel AI] Deterministic read error",
      {
        name:
          error instanceof Error
            ? error.name
            : typeof error,
        message:
          error instanceof Error
            ? error.message
            : String(error),
        stack:
          error instanceof Error
            ? error.stack
            : undefined,
      },
    );

    await ctx.supabase
      .from(
        "ai_conversations",
      )
      .insert({
        owner_id:
          args.userId,
        session_id:
          args.sessionId,
        role: "assistant",
        message:
          "Something went wrong while loading that payment plan. Please try again.",
        context: {
          deterministic:
            true,
            failed: true,
        } as never,
      });

    return {
      reply:
        "Something went wrong while loading that payment plan. Please try again.",
      pending: [],
      performed: [],
    };
  }

  const {
    data: history,
  } = await ctx.supabase
    .from(
      "ai_conversations",
    )
    .select(
      "role,message",
    )
    .eq(
      "session_id",
      args.sessionId,
    )
    .order(
      "created_at",
      {
        ascending: true,
      },
    )
    .limit(20);

  const contextObject =
    await buildContext(
      ctx,
      args.page,
      args.focus,
      args.selection ??
        [],
    );

  const pending: PendingAction[] =
    [];

  const performed: {
    tool: string;
    autonomy: string;
    status: string;
  }[] = [];

  const makeTool = (
    name: string,
    description: string,
    schema: z.ZodTypeAny,
  ) =>
    tool({
      description,
      inputSchema:
        schema,

      execute:
        async (
          input: unknown,
        ) => {
          const params =
            (input ??
              {}) as Record<
              string,
              unknown
            >;

          const autonomy =
            TOOL_AUTONOMY[
              name
            ] ??
            "approval_required";

          if (
            autonomy ===
            "approval_required"
          ) {
            const expiresAt =
              new Date(
                Date.now() +
                  15 *
                    60 *
                    1000,
              ).toISOString();

            const approvalInput =
              await buildApprovalActionInput(
                ctx,
                name,
                params,
              );

            if (
              !approvalInput.ok
            ) {
              const error =
                approvalInput.error;

              performed.push({
                tool: name,
                autonomy,
                status:
                  "rejected",
              });

              return {
                status:
                  "error",
                code:
                  error?.code ??
                  "entity_not_found",
                message:
                  error?.message ??
                  "Approval could not be created.",
              };
            }

            const {
              data: action,
            } =
              await ctx.supabase
                .from(
                  "ai_actions",
                )
                .insert({
                  owner_id:
                    args.userId,
                  intent: name,
                  tool_name: name,
                  parameters:
                    params as never,
                  autonomy_level:
                    autonomy,
                  confidence:
                    0.95,
                  status:
                    "awaiting_approval",
                  expires_at:
                    expiresAt,
                  entity_type:
                    approvalInput.entity_type,
                  entity_id:
                    approvalInput.entity_id,
                  state_hash:
                    approvalInput.state_hash,
                  server_signature:
                    createApprovalSignature(
                      {
                        owner_id:
                          args.userId,
                        intent:
                          name,
                        tool_name:
                          name,
                        autonomy_level:
                          autonomy,
                        parameters:
                          params,
                        entity_type:
                          approvalInput.entity_type ??
                          null,
                        entity_id:
                          approvalInput.entity_id ??
                          null,
                        state_hash:
                          approvalInput.state_hash ??
                          null,
                        expires_at:
                          expiresAt,
                        status:
                          "awaiting_approval",
                      },
                    ),
                })
                .select("*")
                .single();

            if (action) {
              pending.push({
                id:
                  action.id,
                tool_name:
                  name,
                intent: name,
                parameters_json:
                  JSON.stringify(
                    params,
                  ),
                autonomy_level:
                  autonomy,
                title:
                  TITLES[name] ??
                  name,
                fields:
                  describe(
                    params,
                  ),
              });
            }

            performed.push({
              tool: name,
              autonomy,
              status:
                "awaiting_approval",
            });

            return {
              status:
                "awaiting_approval",
              note:
                "An approval card was shown to the owner.",
            };
          }

          const result =
            await executeTool(
              name,
              params,
              ctx,
            );

          const completionStatus =
            (
              result as {
                error?: string;
              }
            )?.error
              ? "failed"
              : "completed";

          await ctx.supabase
            .from("ai_actions")
            .insert({
              owner_id:
                args.userId,
              intent: name,
              tool_name: name,
              parameters:
                params as never,
              autonomy_level:
                autonomy,
              confidence:
                0.96,
              status:
                completionStatus,
              result:
                result as never,
              origin:
                "ai",
              new_state:
                result as never,
              resolved_at:
                new Date().toISOString(),
            });

          performed.push({
            tool: name,
            autonomy,
            status:
              completionStatus,
          });

          return result;
        },
    });

  const clientRef = {
    client_id:
      z.string().optional(),
    client_name:
      z.string().optional(),
  };

  const tools = {
    list_clients:
      makeTool(
        "list_clients",
        "List the user's clients",
        z.object({}),
      ),

    get_client:
      makeTool(
        "get_client",
        "Get one client by id or name",
        z.object(
          clientRef,
        ),
      ),

    create_client:
      makeTool(
        "create_client",
        "Create a new client",
        z.object({
          name:
            z.string(),
          company_name:
            z.string().optional(),
          email:
            z.string().optional(),
          phone:
            z.string().optional(),
          billing_address:
            z.string().optional(),
          preferred_language:
            z.string().optional(),
          notes:
            z.string().optional(),
        }),
      ),

    update_client:
      makeTool(
        "update_client",
        "Update client details",
        z.object({
          ...clientRef,
          name:
            z.string().optional(),
          company_name:
            z.string().optional(),
          email:
            z.string().optional(),
          phone:
            z.string().optional(),
          billing_address:
            z.string().optional(),
          status:
            z.string().optional(),
          notes:
            z.string().optional(),
        }),
      ),

    create_invoice:
      makeTool(
        "create_invoice",
        "Create a draft invoice for a client",
        z.object({
          ...clientRef,
          amount:
            z.number(),
          currency:
            z.string().optional(),
          due_in_days:
            z.number().optional(),
          due_date:
            z.string().optional(),
          description:
            z.string().optional(),
          notes:
            z.string().optional(),
          payment_link:
            optionalPaymentLinkSchema,
        }),
      ),

    update_invoice:
      makeTool(
        "update_invoice",
        "Update an invoice",
        z.object({
          invoice_id:
            z.string(),
          amount:
            z.number().optional(),
          due_date:
            z.string().optional(),
          notes:
            z.string().optional(),
          payment_link:
            updatablePaymentLinkSchema,
        }),
      ),

    get_invoice:
      makeTool(
        "get_invoice",
        "Get one invoice by id or invoice number",
        z.object({
          invoice_id:
            z.string().optional(),
          invoice_number:
            z.string().optional(),
        }),
      ),

    list_invoices:
      makeTool(
        "list_invoices",
        "List invoices, optionally filtered by status or client",
        z.object({
          status:
            z.string().optional(),
          client_id:
            z.string().optional(),
        }),
      ),

    send_invoice:
      makeTool(
        "send_invoice",
        "Send an invoice to the client by email or WhatsApp after owner approval. Use WhatsApp when the user explicitly requests WhatsApp. Generate a client-facing message appropriate to the requested intent, tone, and language.",
        z.object({
          invoice_id:
            z.string(),

          channel:
            z
              .enum([
                "email",
                "whatsapp",
              ])
              .optional(),

          message:
            z
              .string()
              .optional(),

          intent:
            z
              .string()
              .optional(),

          tone:
            z
              .enum([
                "professional",
                "friendly",
                "firm",
                "polite",
                "urgent",
              ])
              .optional(),

          language:
            z
              .enum([
                "en",
                "ar",
              ])
              .optional(),
        }),
      ),

    record_payment:
      makeTool(
        "record_payment",
        "Record a payment received against an invoice",
        z.object({
          ...clientRef,
          invoice_id:
            z.string().optional(),
          amount:
            z.number(),
          payment_date:
            z.string().optional(),
          payment_method:
            z.string().optional(),
          reference:
            z.string().optional(),
        }),
      ),

    get_outstanding_balance:
      makeTool(
        "get_outstanding_balance",
        "Get total outstanding balance, optionally for one client",
        z.object({
          client_id:
            z.string().optional(),
        }),
      ),

    list_overdue_invoices:
      makeTool(
        "list_overdue_invoices",
        "List all overdue invoices",
        z.object({}),
      ),

    generate_reminder:
      makeTool(
        "generate_reminder",
        "Draft a payment reminder message for an invoice. You must supply the full message text.",
        z.object({
          invoice_id:
            z.string(),
          tone:
            z.string().optional(),
          channel:
            z.string().optional(),
          message:
            z.string(),
        }),
      ),

    send_reminder:
      makeTool(
        "send_reminder",
        "Send a previously drafted reminder (requires owner approval)",
        z.object({
          reminder_id:
            z.string(),
        }),
      ),

    get_dashboard_summary:
      makeTool(
        "get_dashboard_summary",
        "Financial overview of the business",
        z.object({}),
      ),

    get_client_financial_summary:
      makeTool(
        "get_client_financial_summary",
        "Financial history and payment behaviour of one client",
        z.object(
          clientRef,
        ),
      ),

    get_company_policies:
      makeTool(
        "get_company_policies",
        "Read company policies",
        z.object({}),
      ),

    update_company_policy:
      makeTool(
        "update_company_policy",
        "Create or change a company policy (requires owner approval)",
        z.object({
          policy_key:
            z.string(),
          policy_value:
            z.any(),
        }),
      ),

    save_memory:
      makeTool(
        "save_memory",
        "Store a durable memory about a client",
        z.object({
          ...clientRef,
          memory_type:
            z.string(),
          memory_key:
            z.string(),
          memory_value:
            z.any(),
        }),
      ),

    create_payment_plan:
      makeTool(
        "create_payment_plan",
        "Create an installment payment plan for a client, optionally tied to an invoice (requires owner approval)",
        z.object({
          ...clientRef,
          invoice_id:
            z.string().optional(),
          total_amount:
            z.number().optional(),
          currency:
            z.string().optional(),
          installment_count:
            z.number(),
          frequency:
            z
              .enum([
                "weekly",
                "biweekly",
                "monthly",
                "quarterly",
              ])
              .optional(),
          start_date:
            z.string().optional(),
          notes:
            z.string().optional(),
        }),
      ),

    list_payment_plans:
      makeTool(
        "list_payment_plans",
        "List payment plans, optionally by client or status",
        z.object({
          client_id:
            z.string().optional(),
          status:
            z.string().optional(),
        }),
      ),

    get_payment_plan:
      makeTool(
        "get_payment_plan",
        "Get one payment plan with its installments and up-to-date balances",
        z.object({
          plan_id:
            z.string(),
        }),
      ),

    cancel_payment_plan:
      makeTool(
        "cancel_payment_plan",
        "Cancel a payment plan (requires owner approval)",
        z.object({
          plan_id:
            z.string(),
        }),
      ),

    record_installment_payment:
      makeTool(
        "record_installment_payment",
        "Record a payment against a specific payment plan installment",
        z.object({
          installment_id:
            z.string(),
          amount:
            z.number().optional(),
          payment_date:
            z.string().optional(),
          payment_method:
            z.string().optional(),
          reference:
            z.string().optional(),
        }),
      ),

    reverse_payment:
      makeTool(
        "reverse_payment",
        "Reverse a previously recorded payment (requires owner approval)",
        z.object({
          payment_id:
            z.string(),
        }),
      ),

    get_client_risk:
      makeTool(
        "get_client_risk",
        "Payment-risk score and factors for one client",
        z.object(
          clientRef,
        ),
      ),

    list_at_risk_clients:
      makeTool(
        "list_at_risk_clients",
        "List clients with medium or high payment risk",
        z.object({}),
      ),

    list_notifications:
      makeTool(
        "list_notifications",
        "Refresh and list unread financial notifications (due soon, overdue, installments)",
        z.object({}),
      ),

    cancel_invoice:
      makeTool(
        "cancel_invoice",
        "Cancel an invoice (requires owner approval)",
        z.object({
          invoice_id:
            z.string(),
        }),
      ),

    update_invoice_items:
      makeTool(
        "update_invoice_items",
        "Replace the line items of a DRAFT invoice; totals, discount and tax are recalculated automatically",
        z.object({
          invoice_id:
            z.string(),

          items:
            z.array(
              z.object({
                description:
                  z.string(),
                quantity:
                  z.number().optional(),
                unit_price:
                  z.number().optional(),
              }),
            ),
        }),
      ),

    pause_payment_plan:
      makeTool(
        "pause_payment_plan",
        "Pause a payment plan (requires owner approval)",
        z.object({
          plan_id:
            z.string(),
          reason:
            z.string().optional(),
        }),
      ),

    resume_payment_plan:
      makeTool(
        "resume_payment_plan",
        "Resume a paused payment plan (requires owner approval)",
        z.object({
          plan_id:
            z.string(),
        }),
      ),

    list_audit_log:
      makeTool(
        "list_audit_log",
        "Read the audit trail of financial changes, optionally filtered by entity",
        z.object({
          entity_type:
            z.string().optional(),
          entity_id:
            z.string().optional(),
          limit:
            z.number().optional(),
        }),
      ),

    list_client_invoices:
      makeTool(
        "list_client_invoices",
        "List all invoices for a specific client",
        z.object({
          client_id:
            z.string(),
        }),
      ),

    list_payment_history:
      makeTool(
        "list_payment_history",
        "List payment history, optionally filtered by client or invoice",
        z.object({
          limit:
            z.number().optional(),
          client_id:
            z.string().optional(),
          invoice_id:
            z.string().optional(),
        }),
      ),

    mark_notification_read:
      makeTool(
        "mark_notification_read",
        "Mark a notification as read",
        z.object({
          notification_id:
            z.string(),
        }),
      ),

    get_pending_approvals:
      makeTool(
        "get_pending_approvals",
        "List all pending approvals waiting for owner action",
        z.object({}),
      ),

    list_ai_action_history:
      makeTool(
        "list_ai_action_history",
        "List AI action history, optionally filtered by status",
        z.object({
          limit:
            z.number().optional(),
          status:
            z.string().optional(),
        }),
      ),
  };

  let reply = "";

  try {
    const result =
      await generateText({
        model:
          getDuelyModel(),

        system:
          `${SYSTEM}\n\nCURRENT CONTEXT (JSON):\n${JSON.stringify(
            contextObject,
          )}`,

        messages:
          (() => {
            const conversationMessages =
              (
                history ?? []
              ).map(
                (h) => ({
                  role:
                    h.role ===
                    "assistant"
                      ? ("assistant" as const)
                      : ("user" as const),

                  content:
                    h.message,
                }),
              );

            /*
             * The current user message has already been
             * inserted into ai_conversations above, so it
             * is normally present in history.
             *
             * Keep this fallback for safety.
             */
            if (
              conversationMessages.length ===
                0 &&
              args.message.trim()
            ) {
              conversationMessages.push(
                {
                  role: "user",
                  content:
                    args.message.trim(),
                },
              );
            }

            return conversationMessages;
          })(),

        tools,

        stopWhen:
          stepCountIs(50),
      });

    reply =
      result.text?.trim() ||
      "Done.";
  } catch (error) {
    console.error(
      "[Haseel AI] Orchestrator error",
      {
        name:
          error instanceof Error
            ? error.name
            : typeof error,

        message:
          error instanceof Error
            ? error.message
            : String(error),

        cause:
          error instanceof Error &&
          error.cause
            ? error.cause
            : undefined,

        stack:
          error instanceof Error
            ? error.stack
            : undefined,
      },
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      message.includes("429")
    ) {
      reply =
        "Haseel AI is rate limited right now. Please try again in a moment.";
    } else if (
      message.includes("402")
    ) {
      reply =
        "AI credits are exhausted. Please top up to keep using Haseel AI.";
    } else {
      reply =
        "Something went wrong while processing that. Please try again.";
    }
  }

  await ctx.supabase
    .from("ai_conversations")
    .insert({
      owner_id:
        args.userId,
      session_id:
        args.sessionId,
      role: "assistant",
      message: reply,
      context: {
        pending:
          pending.map(
            (p) => p.id,
          ),
      } as never,
    });

  return {
    reply,
    pending,
    performed,
  };
}
