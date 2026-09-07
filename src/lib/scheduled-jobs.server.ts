import type { SupabaseClient } from "@supabase/supabase-js";
import {
  refreshOverdueInvoices,
} from "./finance.server";
import { evaluatePaymentPromises } from "./payment-promise.server";
import { processReminderEngineForOwner } from "./reminder-engine.server";

export type ScheduledJobContext = {
  supabase: SupabaseClient;
  userId?: string;
};

const OWNERS_PER_INVOCATION = 2;

type ReminderResult = Awaited<
  ReturnType<typeof processReminderEngineForOwner>
>;

type OwnerProcessingResult = {
  success: boolean;
  owner_id: string;
  invoices_transitioned: number;
  reminders: ReminderResult;
  errors: string[];
  timestamp: string;
};

function emptyReminderResult(
  ownerId: string,
): ReminderResult {
  return {
    owner_id: ownerId,
    sent: 0,
    failed: 0,
    skipped: 0,
    already_sent_today: 0,
    settings_disabled: false,
    waiting_for_time_window: false,
  };
}

export async function processFinanceForOwner(
  ctx: ScheduledJobContext,
  ownerId: string,
): Promise<OwnerProcessingResult> {
  let invoicesTransitioned = 0;

  let reminders = emptyReminderResult(ownerId);

  const errors: string[] = [];

  /*
   * Stage 1 — Refresh overdue invoices.
   *
   * Keep this stage lightweight.
   */
  try {
    const overdue =
      await refreshOverdueInvoices({
        supabase: ctx.supabase,
        userId: ownerId,
      });

    invoicesTransitioned =
      overdue.transitioned;

    console.log(
      `[ScheduledJobs] Invoice refresh completed for owner ${ownerId}:`,
      {
        transitioned:
          invoicesTransitioned,
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
   * Stage 2 — REMINDER ENGINE
   *
   * This is the primary scheduled operation.
   *
   * We intentionally do NOT run syncNotifications()
   * here because that function performs one notification
   * upsert per invoice/installment and can consume a large
   * number of Worker subrequests.
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
   * Stage 3 — PAYMENT PROMISES
   *
   * This runs after reminders so that promise evaluation
   * can never block the primary WhatsApp reminder path.
   */
  try {
    const result =
      await evaluatePaymentPromises({
        supabase: ctx.supabase,
        ownerId,
      });

    console.log(
      `[ScheduledJobs] Payment promises completed for owner ${ownerId}:`,
      result,
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

  const success =
    errors.length === 0;

  if (!success) {
    console.error(
      `[ScheduledJobs] Owner ${ownerId} completed with ${errors.length} error(s):`,
      errors,
    );
  }

  return {
    success,
    owner_id: ownerId,
    invoices_transitioned:
      invoicesTransitioned,
    reminders,
    errors,
    timestamp:
      new Date().toISOString(),
  };
}

/**
 * Select a small deterministic batch of owners.
 *
 * With a 5-minute Cron and 2 owners per invocation:
 *
 * 0-1 -> first invocation
 * 2-3 -> second invocation
 * 4-5 -> third invocation
 * 6-7 -> fourth invocation
 *
 * Then the cycle repeats.
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
    Date.now() /
      (5 * 60 * 1000),
  );

  const start =
    (bucket *
      OWNERS_PER_INVOCATION) %
    owners.length;

  const selected: T[] = [];

  for (
    let i = 0;
    i < OWNERS_PER_INVOCATION;
    i++
  ) {
    selected.push(
      owners[
        (start + i) %
          owners.length
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
     * One lightweight owner discovery query.
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

    const ownerIds =
      (owners ?? []).map(
        (owner) => owner.id,
      );

    console.log(
      `[ScheduledJobs] Total owners: ${ownerIds.length}`,
    );

    if (ownerIds.length === 0) {
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
     * Owners are deliberately processed sequentially.
     *
     * Parallel execution would increase concurrent
     * Supabase and WhatsApp requests.
     */
    for (
      const ownerId of
        selectedOwnerIds
    ) {
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
