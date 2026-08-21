/**
 * Scheduled Finance Processing Jobs
 *
 * These functions are designed to be called on a schedule (e.g., via cron, GitHub Actions, Cloudflare Cron Triggers, etc).
 * All functions are idempotent and scoped to owner_id when necessary.
 *
 * Usage:
 * - Call via HTTP endpoint: POST /api/jobs/process-finance with Authorization header
 * - Or call directly from scheduled job infrastructure
 *
 * Requirements for deployment:
 * - Set SCHEDULED_JOB_SECRET environment variable to a secure random string
 * - Schedule HTTP requests to /api/jobs/process-finance every 1-6 hours
 * - Or use platform-specific cron (Cloudflare, Vercel, etc.)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshOverdueInvoices, syncNotifications } from "./finance.server";

export type ScheduledJobContext = {
  supabase: SupabaseClient;
  userId?: string; // If provided, process only this owner. If not, process all owners.
};

/**
 * Process overdue invoices and sync notifications for one owner.
 * Idempotent: safe to call multiple times.
 * Returns count of invoices that transitioned to overdue status.
 */
export async function processFinanceForOwner(ctx: ScheduledJobContext, ownerId: string) {
  try {
    // Refresh overdue invoices (idempotent - only updates if status truly changed)
    const overdue = await refreshOverdueInvoices({ supabase: ctx.supabase, userId: ownerId });

    // Sync notifications (idempotent via dedupe_key UNIQUE constraint)
    await syncNotifications({ supabase: ctx.supabase, userId: ownerId });

    return {
      success: true,
      owner_id: ownerId,
      invoices_transitioned: overdue.transitioned,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[ScheduledJobs] Error processing owner ${ownerId}:`, error);
    return {
      success: false,
      owner_id: ownerId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Process finance jobs for all active owners.
 * Queries the profiles table to find all user IDs, then processes each.
 * Idempotent: safe to run repeatedly without side effects.
 *
 * Returns summary of processing results.
 */
export async function processFinanceForAllOwners(ctx: ScheduledJobContext) {
  const results: Array<{ success: boolean; owner_id: string; error?: string; invoices_transitioned?: number }> = [];
  let processedCount = 0;
  let errorCount = 0;

  try {
    // Get all owners (use service_role if available, otherwise query authenticated)
    const { data: owners, error: queryError } = await ctx.supabase
      .from("profiles")
      .select("id")
      .limit(1000); // Adjust if you have more than 1000 owners

    if (queryError) {
      console.error("[ScheduledJobs] Error querying owners:", queryError);
      return {
        success: false,
        error: `Failed to query owners: ${queryError.message}`,
        timestamp: new Date().toISOString(),
      };
    }

    const ownerIds = (owners ?? []).map((p) => p.id);
    console.log(`[ScheduledJobs] Processing ${ownerIds.length} owners`);

    // Process each owner sequentially to avoid overwhelming the database
    for (const ownerId of ownerIds) {
      const result = await processFinanceForOwner(ctx, ownerId);
      results.push(result);
      if (result.success) {
        processedCount++;
      } else {
        errorCount++;
      }
    }

    return {
      success: true,
      total_owners: ownerIds.length,
      processed: processedCount,
      failed: errorCount,
      results,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[ScheduledJobs] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Manual trigger for testing or debugging.
 * Processes a single owner if userId is provided in context, otherwise all owners.
 */
export async function triggerFinanceProcessing(ctx: ScheduledJobContext) {
  if (ctx.userId) {
    return await processFinanceForOwner(ctx, ctx.userId);
  }
  return await processFinanceForAllOwners(ctx);
}
