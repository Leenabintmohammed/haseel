import type { SupabaseClient } from "@supabase/supabase-js";
import {
  refreshOverdueInvoices,
  syncNotifications,
} from "./finance.server";
import { evaluatePaymentPromises } from "./payment-promise.server";
import { processReminderEngineForOwner } from "./reminder-engine.server";

export type ScheduledJobContext = {
  supabase: SupabaseClient;
  userId?: string;
};

const OWNERS_PER_INVOCATION = 2;

type OwnerProcessingResult = {
  success: boolean;
  owner_id: string;
  invoices_transitioned: number;
  reminders: Awaited<
    ReturnType<typeof processReminderEngineForOwner>
  >;
  errors: string[];
  timestamp: string;
};

const EMPTY_REMINDER_RESULT: Awaited<
  ReturnType<typeof processReminderEngineForOwner>
> = {
  owner_id: "",
  sent: 0,
  failed: 0,
  skipped: 0,
  already_sent_today: 0,
  settings_disabled: false,
  waiting_for_time_window: false,
};

export async function processFinanceForOwner(
  ctx: ScheduledJobContext,
  ownerId: string,
): Promise<OwnerProcessingResult> {
  let invoicesTransitioned = 0;
  let reminders = {
    ...EMPTY_REMINDER_RESULT,
    owner_id: ownerId,
  };

  const errors: string[] = [];

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

    console.log(
      `[ScheduledJobs] Invoice refresh completed for owner ${ownerId}:`,
      {
        transitioned: overdue.transitioned,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    errors.push(
      `invoice_refresh: ${message}`,
    );

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

    console.log(
      `[ScheduledJobs] Notification sync completed for owner ${ownerId}`,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    errors.push(
      `notification_sync: ${message}`,
    );

    console.error(
      `[ScheduledJobs] Notification sync failed for owner ${ownerId}:`,
      error,
    );
  }

  /*
   * Stage 3 — Reminder Engine
   *
   * This must always run even if earlier stages failed.
   */
  try {
    reminders =
      await processReminderEngineForOwner({
        supabase: ctx.supabase,
        ownerId,
      });

    console.log(
      `[ScheduledJobs] Reminder engine completed for owner ${ownerId}:`,
      reminders,
    );

    /*
     * The reminder engine can complete successfully while
     * individual WhatsApp sends fail. Those are represented
     * explicitly by reminders.failed.
     */
    if (reminders.failed > 0) {
      errors.push(
        `reminder_engine: ${reminders.failed} reminder(s) failed to send`,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    errors.push(
      `reminder_engine: ${message}`,
    );

    console.error(
      `[ScheduledJobs] Reminder engine failed for owner ${ownerId}:`,
      error,
    );
  }

  /*
   * Stage 4 — Payment Promises
   *
   * This stage is intentionally executed after reminders.
   *
   * A failure here must never prevent reminders from being
   * attempted first.
   */
  try {
    const paymentPromiseResult =
      await evaluatePaymentPromises({
        supabase: ctx.supabase,
        ownerId,
      });

    console.log(
      `[ScheduledJobs] Payment promises completed for owner ${ownerId}:`,
      paymentPromiseResult,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    errors.push(
      `payment_promises: ${message}`,
    );

    console.error(
      `[ScheduledJobs] Payment promises failed for owner ${ownerId}:`,
      error,
    );
  }

  const success = errors.length === 0;

  if (!success) {
    console.error(
      `[ScheduledJobs] Owner ${ownerId} completed with ${errors.length} error(s):`,
      errors,
    );
  }

  return {
    success,
    owner_id: ownerId,
    invoices_transitioned: invoicesTransitioned,
    reminders,
    errors,
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
function selectOwnerBatch<T>(
  owners: T[],
): T[] {
  if (
    owners.length <=
    OWNERS_PER_INVOCATION
  ) {
    return owners;
  }

  const bucket = Math.floor(
    Date.now() / (5 * 60 * 1000),
  );

  const start =
    (bucket * OWNERS_PER_INVOCATION) %
    owners.length;

  const selected: T[] = [];

  for (
    let i = 0;
    i < OWNERS_PER_INVOCATION;
    i++
  ) {
    selected.push(
      owners[
        (start + i) % owners.length
      ]!,
    );
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
    const {
      data: owners,
      error: queryError,
    } = await ctx.supabase
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
        total_owners: 0,
        batch_size: 0,
        processed: 0,
        failed: 1,
        results: [],
        error: `Failed to query owners: ${queryError.message}`,
        timestamp:
          new Date().toISOString(),
      };
    }

    const ownerIds = (
      owners ?? []
    ).map(
      (owner) => owner.id,
    );

    console.log(
      `[ScheduledJobs] Total owners: ${ownerIds.length}`,
    );

    if (ownerIds.length === 0) {
      console.log(
        "[ScheduledJobs] No owners found.",
      );

      return {
        success: true,
        total_owners: 0,
        batch_size: 0,
        processed: 0,
        failed: 0,
        results: [],
        timestamp:
          new Date().toISOString(),
      };
    }

    const selectedOwnerIds =
      selectOwnerBatch(ownerIds);

    console.log(
      `[ScheduledJobs] Processing batch of ${selectedOwnerIds.length} owners:`,
      selectedOwnerIds,
    );

    const results: OwnerProcessingResult[] =
      [];

    let processedCount = 0;
    let errorCount = 0;

    /*
     * Owners remain sequential.
     *
     * Parallel execution would increase concurrent
     * Supabase/WAHA requests and make Cloudflare
     * subrequest pressure worse.
     */
    for (const ownerId of selectedOwnerIds) {
      const result =
        await processFinanceForOwner(
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

    const success =
      errorCount === 0;

    console.log(
      `[ScheduledJobs] Batch completed: processed=${processedCount}, failed=${errorCount}, success=${success}`,
    );

    return {
      success,
      total_owners:
        ownerIds.length,
      batch_size:
        selectedOwnerIds.length,
      processed:
        processedCount,
      failed:
        errorCount,
      results,
      timestamp:
        new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      "[ScheduledJobs] Unexpected error:",
      error,
    );

    return {
      success: false,
      total_owners: 0,
      batch_size: 0,
      processed: 0,
      failed: 1,
      results: [],
      error:
        error instanceof Error
          ? error.message
          : String(error),
      timestamp:
        new Date().toISOString(),
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

  return await processFinanceForAllOwners(
    ctx,
  );
}
