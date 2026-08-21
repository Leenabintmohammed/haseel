import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const ChatInput = z.object({
  message: z.string().min(1),
  session_id: z.string(),
  page: z.string().optional(),
  focus: z
    .object({ type: z.string(), id: z.string(), summary: z.string().optional() })
    .nullable()
    .optional(),
  selection: z.array(z.object({ type: z.string(), id: z.string() })).optional(),
});

export type PendingAction = {
  id: string;
  tool_name: string;
  intent: string;
  parameters_json: string;
  autonomy_level: string;
  title: string;
  fields: { label: string; value: string }[];
};

export type ChatResult = {
  reply: string;
  pending: PendingAction[];
  performed: { tool: string; autonomy: string; status: string }[];
};

type ApprovalSignatureInput = {
  owner_id: string;
  intent: string | null;
  tool_name: string;
  autonomy_level: string;
  parameters: unknown;
  entity_type: string | null;
  entity_id: string | null;
  state_hash: string | null;
  expires_at: string | null;
  status: string;
};

function approvalSignatureSecret() {
  const secret = process.env["APPROVAL_SIGNING_SECRET"];
  if (!secret) throw new Error("approval_signing_secret_missing");
  return secret;
}

function approvalSignaturePayload(input: ApprovalSignatureInput) {
  const canonicalExpiresAt = input.expires_at
    ? new Date(input.expires_at).toISOString()
    : null;

  return JSON.stringify([
    input.owner_id,
    input.intent,
    input.tool_name,
    input.autonomy_level,
    input.parameters,
    input.entity_type,
    input.entity_id,
    input.state_hash,
    canonicalExpiresAt,
    input.status,
  ]);
}

export function createApprovalSignature(input: ApprovalSignatureInput) {
  return createHmac("sha256", approvalSignatureSecret())
    .update(approvalSignaturePayload(input))
    .digest("hex");
}

export function isValidApprovalSignature(input: ApprovalSignatureInput, signature: string | null | undefined) {
  if (!signature) return false;
  const expected = createApprovalSignature(input);
  const actual = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

export function computeEntityStateHash(entity: Record<string, unknown> | null | undefined): string {
  if (!entity) return "";

  const stateString = JSON.stringify({
    status: entity['status'],
    amount: entity['amount'],
    paid_amount: entity['paid_amount'],
    updated_at: entity['updated_at'],
  });

  return Array.from(stateString).reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0).toString(36);
}

export async function buildApprovalActionInput(
  ctx: { supabase: { from: (table: string) => any }; userId?: string },
  toolName: string,
  params: Record<string, unknown>,
) {
  const entityLookup: Record<
    string,
    Array<{ table: string; idKey: string; entityLabel: string; byId?: boolean; ownerScoped?: boolean }>
  > = {
    send_invoice: [{ table: "invoices", idKey: "invoice_id", entityLabel: "invoice", byId: true }],
    cancel_invoice: [{ table: "invoices", idKey: "invoice_id", entityLabel: "invoice", byId: true }],
    send_reminder: [{ table: "reminders", idKey: "reminder_id", entityLabel: "reminder", byId: true }],
    update_company_policy: [{ table: "company_policies", idKey: "policy_key", entityLabel: "policy", byId: false, ownerScoped: true }],
    create_payment_plan: [{ table: "invoices", idKey: "invoice_id", entityLabel: "invoice", byId: true }],
    cancel_payment_plan: [{ table: "payment_plans", idKey: "plan_id", entityLabel: "payment plan", byId: true }],
    pause_payment_plan: [{ table: "payment_plans", idKey: "plan_id", entityLabel: "payment plan", byId: true }],
    resume_payment_plan: [{ table: "payment_plans", idKey: "plan_id", entityLabel: "payment plan", byId: true }],
    reverse_payment: [{ table: "payments", idKey: "payment_id", entityLabel: "payment", byId: true }],
  };

  const candidates = entityLookup[toolName];
  if (!candidates) {
    return { ok: true, entity_type: null, entity_id: null, state_hash: null };
  }

  for (const lookup of candidates) {
    const entityId = String(params[lookup.idKey] ?? "").trim();
    if (!entityId) continue;

    let query = ctx.supabase.from(lookup.table).select("*");
    if (lookup.byId === false) {
      query = query.eq("policy_key", entityId);
      if (ctx.userId) query = query.eq("owner_id", ctx.userId);
    } else {
      query = query.eq("id", entityId);
      if (ctx.userId) query = query.eq("owner_id", ctx.userId);
    }

    const { data: entity, error } = await query.maybeSingle();
    if (error) {
      return {
        ok: false,
        error: {
          code: "entity_lookup_error",
          message: `Failed to validate ${lookup.entityLabel}: ${error.message}`,
        },
      };
    }

    if (entity) {
      return {
        ok: true,
        entity_type: lookup.table,
        entity_id: entityId,
        state_hash: computeEntityStateHash(entity),
      };
    }
  }

  const firstCandidate = candidates[0];
  return {
    ok: false,
    error: {
      code: "entity_not_found",
      message: `The ${firstCandidate?.entityLabel ?? "target entity"} could not be found. Approval was not created.`,
    },
  };
}

/**
 * Validate if an AI action is still valid for execution.
 * Checks:
 * - Action exists and is awaiting approval
 * - Action has not expired
 * - Entity state has not changed (optional state hash validation)
 */
export async function validateActionBeforeExecution(ctx: any, action: any) {
  const { TOOL_AUTONOMY } = await import("./duely-tools.server");
  const expectedAutonomy = TOOL_AUTONOMY[action.tool_name];
  if (expectedAutonomy !== "approval_required" || action.autonomy_level !== expectedAutonomy) {
    return {
      valid: false,
      reason: "invalid_autonomy",
      message: "This action is not currently authorized for approval execution.",
    };
  }

  try {
    if (!isValidApprovalSignature({
      owner_id: action.owner_id,
      intent: action.intent,
      tool_name: action.tool_name,
      autonomy_level: action.autonomy_level,
      parameters: action.parameters,
      entity_type: action.entity_type,
      entity_id: action.entity_id,
      state_hash: action.state_hash,
      expires_at: action.expires_at,
      status: action.status,
    }, action.server_signature)) {
      return {
        valid: false,
        reason: "invalid_signature",
        message: "This approval was not created by the server approval flow.",
      };
    }
  } catch {
    return {
      valid: false,
      reason: "signature_unavailable",
      message: "Approval signing is not configured on the server.",
    };
  }

  const now = new Date();

  // Check expiration (default 15 minutes if expires_at is set)
  if (action.expires_at) {
    const expiresAt = new Date(action.expires_at);
    if (now > expiresAt) {
      return {
        valid: false,
        reason: "expired",
        message: `This approval expired at ${expiresAt.toISOString()}. Please create a new approval.`,
      };
    }
  }

  // If entity_id is specified, verify entity still exists and state hasn't changed
  if (action.entity_id && action.entity_type) {
    try {
      // Fetch current entity state
      const { data: entity, error } = await ctx.supabase
        .from(action.entity_type)
        .select("*")
        .eq("id", action.entity_id)
        .eq("owner_id", ctx.userId)
        .maybeSingle();

      if (error) {
        return {
          valid: false,
          reason: "fetch_error",
          message: `Failed to validate entity: ${error.message}`,
        };
      }

      if (!entity) {
        return {
          valid: false,
          reason: "entity_not_found",
          message: `The ${action.entity_type} no longer exists. Action cannot be executed.`,
        };
      }

      // If state_hash exists, verify entity hasn't changed
      if (action.state_hash) {
        const currentStateHash = computeEntityStateHash(entity);

        if (currentStateHash !== action.state_hash) {
          return {
            valid: false,
            reason: "state_changed",
            message: `The ${action.entity_type} has been modified since this approval was created. Please review and create a new approval.`,
          };
        }
      }
    } catch (err) {
      return {
        valid: false,
        reason: "validation_error",
        message: `Error validating entity: ${(err as Error).message}`,
      };
    }
  }

  return { valid: true };
}

export const duelyChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChatInput.parse(input))
  .handler(async ({ data, context }): Promise<ChatResult> => {
    const { runOrchestrator } = await import("./duely-orchestrator.server");
    const focus = data.focus
      ? { type: data.focus.type, id: data.focus.id, summary: data.focus.summary ?? "" }
      : null;
    return runOrchestrator({
      supabase: context.supabase,
      userId: context.userId,
      message: data.message,
      sessionId: data.session_id,
      page: data.page ?? "dashboard",
      focus,
      selection: data.selection ?? [],
    });
  });

export const resolveAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ action_id: z.string(), decision: z.enum(["approve", "reject"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { executeTool } = await import("./duely-tools.server");
    const { audit } = await import("./finance.server");
    
    const { data: action } = await context.supabase
      .from("ai_actions")
      .select("*")
      .eq("id", data.action_id)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!action) {
      return { status: "error" as const, message: "action_not_found" };
    }
    if (action.status !== "awaiting_approval") {
      return { status: "error" as const, message: "already_resolved" };
    }

    if (data.decision === "reject") {
      const validation = await validateActionBeforeExecution(context, action);
      if (!validation.valid) {
        return { status: "error" as const, message: validation.message ?? "Validation failed" };
      }
      const resolvedAt = new Date().toISOString();
      await context.supabase.from("ai_actions").update({
        status: "rejected",
        resolved_at: resolvedAt,
        server_signature: createApprovalSignature({
          owner_id: action.owner_id,
          intent: action.intent,
          tool_name: action.tool_name,
          autonomy_level: action.autonomy_level,
          parameters: action.parameters,
          entity_type: action.entity_type,
          entity_id: action.entity_id,
          state_hash: action.state_hash,
          expires_at: action.expires_at,
          status: "rejected",
        }) as never,
      }).eq("id", action.id);
      await audit(
        { supabase: context.supabase, userId: context.userId, actor: "human" },
        {
          entity_type: "ai_action",
          entity_id: action.id,
          action: "ai_action.rejected",
          after_state: { status: "rejected", tool: action.tool_name },
        },
      );
      return { status: "rejected" as const, message: "" };
    }

    // Validate action is still executable
    const validation = await validateActionBeforeExecution(context, action);
    if (!validation.valid) {
      await context.supabase.from("ai_actions").update({ 
        status: "failed", 
        error: validation.message ?? null,
        resolved_at: new Date().toISOString(),
      }).eq("id", action.id);
      await audit(
        { supabase: context.supabase, userId: context.userId, actor: "system" },
        {
          entity_type: "ai_action",
          entity_id: action.id,
          action: "ai_action.failed_validation",
          metadata: { reason: validation.reason, message: validation.message },
        },
      );
      return { status: "error" as const, message: validation.message ?? "Validation failed" };
    }

    const { data: claimedAction } = await context.supabase
      .from("ai_actions")
      .update({
        status: "executing",
        server_signature: createApprovalSignature({
          owner_id: action.owner_id,
          intent: action.intent,
          tool_name: action.tool_name,
          autonomy_level: action.autonomy_level,
          parameters: action.parameters,
          entity_type: action.entity_type,
          entity_id: action.entity_id,
          state_hash: action.state_hash,
          expires_at: action.expires_at,
          status: "executing",
        }) as never,
      })
      .eq("id", action.id)
      .eq("owner_id", context.userId)
      .eq("status", "awaiting_approval")
      .select("id")
      .maybeSingle();
    if (!claimedAction) {
      return { status: "error" as const, message: "already_resolved" };
    }

    // Execute the tool
    const result = await executeTool(action.tool_name, (action.parameters ?? {}) as Record<string, unknown>, {
      supabase: context.supabase,
      userId: context.userId,
      actor: "human",
    });

    const isError = (result as { error?: string })?.error !== undefined;
    const finalStatus = isError ? "failed" : "completed";
    
    await context.supabase
      .from("ai_actions")
      .update({
        status: finalStatus,
        server_signature: createApprovalSignature({
          owner_id: action.owner_id,
          intent: action.intent,
          tool_name: action.tool_name,
          autonomy_level: action.autonomy_level,
          parameters: action.parameters,
          entity_type: action.entity_type,
          entity_id: action.entity_id,
          state_hash: action.state_hash,
          expires_at: action.expires_at,
          status: finalStatus,
        }) as never,
        result: result as never,
        new_state: result as never,
        origin: "human_approved",
        resolved_at: new Date().toISOString(),
        error: isError ? JSON.stringify(result) : null,
      })
      .eq("id", action.id);

    await audit(
      { supabase: context.supabase, userId: context.userId, actor: "human" },
      {
        entity_type: "ai_action",
        entity_id: action.id,
        action: `ai_action.${finalStatus}`,
        after_state: { status: finalStatus, tool: action.tool_name },
        metadata: isError ? { error: result } : { success: true },
      },
    );

    return { status: finalStatus as ("completed" | "failed"), message: JSON.stringify(result) };
  });
