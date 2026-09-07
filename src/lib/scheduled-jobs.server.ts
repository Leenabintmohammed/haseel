/**
 * Scheduled Finance Processing Jobs
 *
 * Design goals:
 * - Reminder Engine must never be blocked by another finance subsystem.
 * - Keep each Cloudflare Worker invocation below the subrequest limit.
 * - Process owners in small deterministic batches.
 * - Every stage is independently fault-tolerant.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshOverdueInvoices, syncNotifications } from "./finance.server";
import { evaluatePaymentPromises } from "./payment-promise.server";
import { processReminderEngineForOwner } from "./reminder-engine.server";

export type ScheduledJobContext = {
  supabase: SupabaseClient;
  userId?: string;
};

const OWNERS_PER_INVOCATION = 2;

export async function processFinanceForOwner(
  ctx: ScheduledJobContext,
  ownerId: string,
) {
  let invoicesTransitioned = 0;

  let reminders: Awaited<
    ReturnType<typeof processReminderEngineForOwner>
  > = {
    status: "waiting",
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  /*
   * Stage 1 — Refresh overdue invoices
   *
   * Failure here must not prevent reminders.
   */
  try {
    const overdue = await refreshOverdueInvoices({
      supabase: ctx.supabase,
      userId: ownerId,
    });

    invoicesTransitioned = overdue.transitioned;
  } catch (error) {
    console.error(
      `[ScheduledJobs] Invoice refresh failed for owner ${ownerId}:`,
      error,
    );
  }

  /*
   * Stage 2 — Sync notifications
   *
   * Failure here must not prevent reminders.
   */
  try {
    await syncNotifications({
      supabase: ctx.supabase,
      userId: ownerId,
    });
  } catch (error) {
    console.error(
      `[ScheduledJobs] Notification sync failed for owner ${ownerId}:`,
      error,
    );
  }

  /*
   * Stage 3 — REMINDER ENGINE
   *
   * This is intentionally isolated and executed regardless
   * of Payment Promises failures.
   */
  try {
    reminders = await processReminderEngineForOwner({
      supabase: ctx.supabase,
      ownerId,
    });

    console.log(
      `[ScheduledJobs] Reminder engine completed for owner ${ownerId}:`,
      reminders,
    );
  } catch (error) {
    console.error(
      `[ScheduledJobs] Reminder engine failed for owner ${ownerId}:`,
      error,
    );
  }

  /*
   * Stage 4 — Payment Promises
   *
   * Payment Promise processing is intentionally AFTER reminders.
   * A failure here must never prevent WhatsApp reminders.
   */
  try {
    await evaluatePaymentPromises({
      supabase: ctx.supabase,
      ownerId,
    });
  } catch (error) {
    console.error(
      `[ScheduledJobs] Payment promises failed for owner ${ownerId}:`,
      error,
    );
  }

  return {
    success: true,
    owner_id: ownerId,
    invoices_transitioned: invoicesTransitioned,
    reminders,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Select a small deterministic batch of owners for this invocation.
 *
 * With an every-5-minute Cron and 2 owners per invocation:
 *
 * 5 min  -> owners 0-1
 * 10 min -> owners 2-3
 * 15 min -> owners 4-5
 * 20 min -> owners 6-7
 *
 * Then the cycle repeats.
 *
 * This prevents one Worker invocation from processing every owner.
 */
function selectOwnerBatch<T>(owners: T[]): T[] {
  if (owners.length <= OWNERS_PER_INVOCATION) {
    return owners;
  }

  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));

  const start =
    (bucket * OWNERS_PER_INVOCATION) % owners.length;

  const selected: T[] = [];

  for (let i = 0; i < OWNERS_PER_INVOCATION; i++) {
    selected.push(owners[(start + i) % owners.length]!);
  }

  return selected;
}

export async function processFinanceForAllOwners(
  ctx: ScheduledJobContext,
) {
  try {
    /*
     * One lightweight query to discover owners.
     */
    const { data: owners, error: queryError } = await ctx.supabase
      .from("profiles")
      .select("id")
      .limit(1000);

    if (queryError) {
      console.error(
        "[ScheduledJobs] Error querying owners:",
        queryError,
      );

      return {
        success: false,
        error: `Failed to query owners: ${queryError.message}`,
        timestamp: new Date().toISOString(),
      };
    }

    const ownerIds = (owners ?? []).map((owner) => owner.id);

    console.log(
      `[ScheduledJobs] Total owners: ${ownerIds.length}`,
    );

    const selectedOwnerIds = selectOwnerBatch(ownerIds);

    console.log(
      `[ScheduledJobs] Processing batch of ${selectedOwnerIds.length} owners:`,
      selectedOwnerIds,
    );

    const results: Array<{
      success: boolean;
      owner_id: string;
      error?: string;
      invoices_transitioned?: number;
    }> = [];

    let processedCount = 0;
    let errorCount = 0;

    /*
     * Keep owners sequential.
     *
     * This is intentional.
     * Parallel execution would increase Supabase/WAHA
     * subrequests and make the Cloudflare limit easier to hit.
     */
    for (const ownerId of selectedOwnerIds) {
      const result = await processFinanceForOwner(
        ctx,
        ownerId,
      );

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
      batch_size: selectedOwnerIds.length,
      processed: processedCount,
      failed: errorCount,
      results,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      "[ScheduledJobs] Unexpected error:",
      error,
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Manual trigger for testing/debugging.
 */
export async function triggerFinanceProcessing(
  ctx: ScheduledJobContext,
) {
  if (ctx.userId) {
    return await processFinanceForOwner(
      ctx,
      ctx.userId,
    );
  }

  return await processFinanceForAllOwners(ctx);
}
