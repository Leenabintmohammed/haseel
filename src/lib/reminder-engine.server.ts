import type { SupabaseClient } from "@supabase/supabase-js";
import { NON_RECEIVABLE, daysBetween } from "./finance-core";
import { sendMessage } from "./messaging/messaging.server";
import {
  breakPaymentPromise,
  fulfillPaymentPromise,
  getActivePaymentPromise,
  type PaymentPromiseRow,
} from "./payment-promise.server";

export type ReminderType = "friendly" | "firm" | "serious";

export type ReminderSettings = {
  enabled: boolean;
  daily_enabled: boolean;
  reminder_time: string;
  timezone: string;
  friendly_start_day: number;
  friendly_end_day: number;
  firm_start_day: number;
  firm_end_day: number;
  serious_start_day: number;
};

export type BusinessPaymentSettings = {
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  iban: string | null;
  swift_bic: string | null;
  payment_instructions: string | null;
};

export type ReminderInvoice = {
  id: string;
  owner_id: string;
  client_id: string;
  invoice_number: string;
  due_date: string;
  status: string;
  remaining_balance: number | string;
  currency: string;
  payment_link: string | null;
  clients: {
    name?: string | null;
    phone?: string | null;
  } | null;
};

export type ReminderClaimInput = {
  slot_id: string;
  owner_id: string;
  invoice_id: string;
  client_id: string;
  channel: "whatsapp";
  reminder_type: ReminderType;
  message: string;
  scheduled_at: string;
  days_overdue: number;
};

const NON_RECEIVABLE_SET = new Set(NON_RECEIVABLE);
export const PROCESSING_STALE_THRESHOLD_MINUTES = 15;
const PROCESSING_STALE_THRESHOLD_MS = PROCESSING_STALE_THRESHOLD_MINUTES * 60 * 1000;

export type ReminderEngineResult = {
  owner_id: string;
  sent: number;
  failed: number;
  skipped: number;
  already_sent_today: number;
  settings_disabled: boolean;
  waiting_for_time_window: boolean;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  daily_enabled: true,
  reminder_time: "10:00",
  timezone: "Asia/Dubai",
  friendly_start_day: 0,
  friendly_end_day: 3,
  firm_start_day: 4,
  firm_end_day: 6,
  serious_start_day: 7,
};

export type ReminderEngineDependencies = {
  getReminderSettings(ownerId: string): Promise<ReminderSettings | null>;
  listOverdueInvoices(ownerId: string, localDate: string): Promise<ReminderInvoice[]>;
  getBusinessPaymentSettings(ownerId: string): Promise<BusinessPaymentSettings | null>;
  getActivePaymentPromise(ownerId: string, invoiceId: string): Promise<PaymentPromiseRow | null>;
  breakPaymentPromise(ownerId: string, invoiceId: string, resolvedAt: string): Promise<PaymentPromiseRow | null>;
  fulfillPaymentPromise(ownerId: string, invoiceId: string, resolvedAt: string): Promise<PaymentPromiseRow | null>;
  claimReminderAttempt(
    row: ReminderClaimInput,
  ): Promise<{ claimed: boolean; existingStatus: string | null }>;
  finalizeReminderAttempt(args: {
    slotId: string;
    ownerId: string;
    status: "sent" | "failed";
    sentAt: string | null;
  }): Promise<void>;
  sendWhatsApp(input: { to: string; body: string }): Promise<{ success: boolean; error?: string | null }>;
};

async function makeReminderSlotId(ownerId: string, invoiceId: string, localDate: string): Promise<string> {
  const input = `reminder:whatsapp:${ownerId}:${invoiceId}:${localDate}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizeTimezone(value: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

function localParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export function toLocalDateKey(now: Date, timezone: string): string {
  const zone = normalizeTimezone(timezone);
  const parts = localParts(now, zone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localTimeInMinutes(now: Date, timezone: string): number {
  const zone = normalizeTimezone(timezone);
  const parts = localParts(now, zone);
  return parts.hour * 60 + parts.minute;
}

function configuredTimeInMinutes(reminderTime: string): number {
  const [h, m] = reminderTime.split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return 10 * 60;
  }
  return hour * 60 + minute;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function asAmount(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paymentSection(paymentLink: string | null, payment: BusinessPaymentSettings | null): string[] {
  if (paymentLink && paymentLink.trim()) {
    return [`Payment link: ${paymentLink.trim()}`];
  }

  if (!payment) {
    return [];
  }

  const lines = [
    payment.bank_name ? `Bank: ${payment.bank_name}` : null,
    payment.account_name ? `Account name: ${payment.account_name}` : null,
    payment.account_number ? `Account number: ${payment.account_number}` : null,
    payment.iban ? `IBAN: ${payment.iban}` : null,
    payment.swift_bic ? `SWIFT/BIC: ${payment.swift_bic}` : null,
    payment.payment_instructions ? `Instructions: ${payment.payment_instructions}` : null,
  ].filter((line): line is string => Boolean(line && line.trim()));

  return lines.length ? ["Payment details:", ...lines] : [];
}

export function resolveReminderType(daysOverdue: number, settings: ReminderSettings): ReminderType | null {
  if (daysOverdue < settings.friendly_start_day) {
    return null;
  }
  if (daysOverdue >= settings.serious_start_day) {
    return "serious";
  }
  if (daysOverdue >= settings.firm_start_day && daysOverdue <= settings.firm_end_day) {
    return "firm";
  }
  if (daysOverdue >= settings.friendly_start_day && daysOverdue <= settings.friendly_end_day) {
    return "friendly";
  }
  return null;
}

export function buildReminderMessage(input: {
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string;
  daysOverdue: number;
  reminderType: ReminderType;
  paymentLink: string | null;
  paymentSettings: BusinessPaymentSettings | null;
  paymentPromise?: {
    promiseDate: string;
    status: "due_today" | "broken";
  } | null;
}): string {
  const greeting = `Hi ${input.customerName || "there"},`;
  const amountText = `${input.currency} ${input.amount.toLocaleString()}`;
  const introByType: Record<ReminderType, string> = {
    friendly: `Just a friendly reminder that invoice ${input.invoiceNumber} (${amountText}) was due on ${input.dueDate}.`,
    firm: `This is a reminder that invoice ${input.invoiceNumber} (${amountText}) is now ${input.daysOverdue} day(s) overdue (due ${input.dueDate}).`,
    serious: `Invoice ${input.invoiceNumber} (${amountText}) is ${input.daysOverdue} day(s) overdue (due ${input.dueDate}). Please arrange payment as soon as possible.`,
  };
  const promiseIntro =
    input.paymentPromise?.status === "due_today"
      ? `The payment you promised for invoice ${input.invoiceNumber} is due today, but we have not yet recorded the payment.`
      : input.paymentPromise?.status === "broken"
        ? `The payment you promised for invoice ${input.invoiceNumber} was due on ${new Intl.DateTimeFormat("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${input.paymentPromise.promiseDate}T00:00:00.000Z`))}, but we have not yet recorded the payment.`
        : null;
  const paymentLines = paymentSection(input.paymentLink, input.paymentSettings);
  const lines = [greeting, "", promiseIntro ?? introByType[input.reminderType]];
  if (promiseIntro) {
    lines.push("", "Please arrange payment as soon as possible.");
  }
  if (paymentLines.length) {
    lines.push("", ...paymentLines);
  }
  lines.push("", "If you have already paid, please ignore this message. Thank you.");
  return lines.join("\n");
}

function invoiceCollectible(invoice: ReminderInvoice): boolean {
  if (NON_RECEIVABLE_SET.has(invoice.status)) {
    return false;
  }
  return asAmount(invoice.remaining_balance) > 0;
}

export async function runReminderEngineForOwner(
  ownerId: string,
  deps: ReminderEngineDependencies,
  now = new Date(),
): Promise<ReminderEngineResult> {
  const settings = {
    ...DEFAULT_REMINDER_SETTINGS,
    ...(await deps.getReminderSettings(ownerId)),
  };

  if (!settings.enabled || !settings.daily_enabled) {
    return {
      owner_id: ownerId,
      sent: 0,
      failed: 0,
      skipped: 0,
      already_sent_today: 0,
      settings_disabled: true,
      waiting_for_time_window: false,
    };
  }

  const timezone = normalizeTimezone(settings.timezone);
  const localDate = toLocalDateKey(now, timezone);
  const localMinutes = localTimeInMinutes(now, timezone);
  const reminderMinutes = configuredTimeInMinutes(settings.reminder_time);

  if (localMinutes < reminderMinutes) {
    return {
      owner_id: ownerId,
      sent: 0,
      failed: 0,
      skipped: 0,
      already_sent_today: 0,
      settings_disabled: false,
      waiting_for_time_window: true,
    };
  }

  const invoices = await deps.listOverdueInvoices(ownerId, localDate);
  if (!invoices.length) {
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

  const paymentSettings = await deps.getBusinessPaymentSettings(ownerId);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let alreadySent = 0;
  const scheduledAt = now.toISOString();

  for (const invoice of invoices) {
    if (invoice.owner_id !== ownerId || !invoiceCollectible(invoice) || invoice.due_date >= localDate) {
      skipped++;
      continue;
    }

    const phone = normalizePhone(invoice.clients?.phone ?? "");
    if (!/^\d{8,15}$/.test(phone)) {
      skipped++;
      continue;
    }

    const daysOverdue = Math.max(0, daysBetween(invoice.due_date, localDate));
    const reminderType = resolveReminderType(daysOverdue, settings);
    if (!reminderType) {
      skipped++;
      continue;
    }

    const activePromise = await deps.getActivePaymentPromise(ownerId, invoice.id);
    let paymentPromiseContext: { promiseDate: string; status: "due_today" | "broken" } | null = null;
    if (activePromise) {
      if (activePromise.promise_date > localDate) {
        skipped++;
        continue;
      }

      if (asAmount(invoice.remaining_balance) <= 0) {
        await deps.fulfillPaymentPromise(ownerId, invoice.id, scheduledAt);
        skipped++;
        continue;
      }

      if (activePromise.promise_date === localDate) {
        await deps.breakPaymentPromise(ownerId, invoice.id, scheduledAt);
        paymentPromiseContext = {
          promiseDate: activePromise.promise_date,
          status: "due_today",
        };
      } else {
        await deps.breakPaymentPromise(ownerId, invoice.id, scheduledAt);
        paymentPromiseContext = {
          promiseDate: activePromise.promise_date,
          status: "broken",
        };
      }
    }

    const message = buildReminderMessage({
      customerName: invoice.clients?.name?.trim() || "there",
      invoiceNumber: invoice.invoice_number,
      amount: asAmount(invoice.remaining_balance),
      currency: invoice.currency || "AED",
      dueDate: invoice.due_date,
      daysOverdue,
      reminderType,
      paymentLink: invoice.payment_link,
      paymentSettings,
      paymentPromise: paymentPromiseContext,
    });
    const slotId = await makeReminderSlotId(ownerId, invoice.id, localDate);
    const claim = await deps.claimReminderAttempt({
      slot_id: slotId,
      owner_id: ownerId,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      channel: "whatsapp",
      reminder_type: reminderType,
      message,
      scheduled_at: scheduledAt,
      days_overdue: daysOverdue,
    });
    if (!claim.claimed) {
      if (claim.existingStatus === "sent") {
        alreadySent++;
      } else {
        skipped++;
      }
      continue;
    }

    const sendResult = await deps.sendWhatsApp({
      to: phone,
      body: message,
    });

    if (sendResult.success) {
      await deps.finalizeReminderAttempt({
        slotId,
        ownerId,
        status: "sent",
        sentAt: scheduledAt,
      });
      sent++;
      continue;
    }

    await deps.finalizeReminderAttempt({
      slotId,
      ownerId,
      status: "failed",
      sentAt: null,
    });
    failed++;
  }

  return {
    owner_id: ownerId,
    sent,
    failed,
    skipped,
    already_sent_today: alreadySent,
    settings_disabled: false,
    waiting_for_time_window: false,
  };
}

export async function processReminderEngineForOwner(args: {
  supabase: SupabaseClient;
  ownerId: string;
  now?: Date;
}): Promise<ReminderEngineResult> {
  const deps: ReminderEngineDependencies = {
    async getReminderSettings(ownerId) {
      const { data, error } = await args.supabase
        .from("reminder_settings")
        .select(
          "enabled,daily_enabled,reminder_time,timezone,friendly_start_day,friendly_end_day,firm_start_day,firm_end_day,serious_start_day",
        )
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load reminder settings for owner ${ownerId}: ${error.message}`);
      }
      return (data as ReminderSettings | null) ?? null;
    },
    async listOverdueInvoices(ownerId, localDate) {
      const nonReceivableCsv = `(${NON_RECEIVABLE.map((status) => `"${status.replace(/"/g, '\\"')}"`).join(",")})`;
      const { data, error } = await args.supabase
        .from("invoices")
        .select(
          "id,owner_id,client_id,invoice_number,due_date,status,remaining_balance,currency,payment_link,clients(name,phone)",
        )
        .eq("owner_id", ownerId)
        .not("status", "in", nonReceivableCsv)
        .lt("due_date", localDate);
      if (error) {
        throw new Error(`Failed to load overdue invoices for owner ${ownerId}: ${error.message}`);
      }
      return (data as ReminderInvoice[] | null) ?? [];
    },
    async getBusinessPaymentSettings(ownerId) {
      const { data, error } = await args.supabase
        .from("business_payment_settings")
        .select("bank_name,account_name,account_number,iban,swift_bic,payment_instructions")
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load business payment settings for owner ${ownerId}: ${error.message}`);
      }
      return (data as BusinessPaymentSettings | null) ?? null;
    },
    async getActivePaymentPromise(ownerId, invoiceId) {
      return getActivePaymentPromise({
        supabase: args.supabase,
        ownerId,
        invoiceId,
      });
    },
    async breakPaymentPromise(ownerId, invoiceId, resolvedAt) {
      return breakPaymentPromise({
        supabase: args.supabase,
        ownerId,
        invoiceId,
        resolvedAt,
      });
    },
    async fulfillPaymentPromise(ownerId, invoiceId, resolvedAt) {
      return fulfillPaymentPromise({
        supabase: args.supabase,
        ownerId,
        invoiceId,
        resolvedAt,
      });
    },
    async claimReminderAttempt(row) {
      const claimStartedAt = new Date().toISOString();
      const { error: insertError } = await args.supabase.from("reminders").insert({
        id: row.slot_id,
        owner_id: row.owner_id,
        invoice_id: row.invoice_id,
        client_id: row.client_id,
        channel: row.channel,
        reminder_type: row.reminder_type,
        message: row.message,
        status: "processing",
        scheduled_at: row.scheduled_at,
        sent_at: null,
        processing_started_at: claimStartedAt,
        days_overdue: row.days_overdue,
      });
      if (!insertError) {
        return { claimed: true, existingStatus: null };
      }

      if (insertError.code !== "23505") {
        throw new Error(`Failed to claim reminder slot for invoice ${row.invoice_id}: ${insertError.message}`);
      }

      const { data: reclaimed, error: reclaimError } = await args.supabase
        .from("reminders")
        .update({
          status: "processing",
          reminder_type: row.reminder_type,
          message: row.message,
          sent_at: null,
          processing_started_at: claimStartedAt,
          days_overdue: row.days_overdue,
        })
        .eq("id", row.slot_id)
        .eq("owner_id", row.owner_id)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      if (reclaimError) {
        throw new Error(`Failed to reclaim reminder slot for invoice ${row.invoice_id}: ${reclaimError.message}`);
      }
      if (reclaimed?.id) {
        return { claimed: true, existingStatus: "failed" };
      }

      // External delivery cannot be made transactional with DB finalization.
      // We only reclaim stale processing rows to provide bounded retries while
      // minimizing duplicate sends when there is uncertainty.
      const staleCutoffIso = new Date(Date.now() - PROCESSING_STALE_THRESHOLD_MS).toISOString();
      const { data: staleReclaimed, error: staleReclaimError } = await args.supabase
        .from("reminders")
        .update({
          status: "processing",
          reminder_type: row.reminder_type,
          message: row.message,
          sent_at: null,
          processing_started_at: claimStartedAt,
          days_overdue: row.days_overdue,
        })
        .eq("id", row.slot_id)
        .eq("owner_id", row.owner_id)
        .eq("status", "processing")
        .not("processing_started_at", "is", null)
        .lt("processing_started_at", staleCutoffIso)
        .select("id")
        .maybeSingle();
      if (staleReclaimError) {
        throw new Error(`Failed to recover stale reminder slot for invoice ${row.invoice_id}: ${staleReclaimError.message}`);
      }
      if (staleReclaimed?.id) {
        return { claimed: true, existingStatus: "processing" };
      }

      const { data: existing, error: existingError } = await args.supabase
        .from("reminders")
        .select("status")
        .eq("id", row.slot_id)
        .eq("owner_id", row.owner_id)
        .maybeSingle();
      if (existingError) {
        throw new Error(`Failed to load existing reminder slot for invoice ${row.invoice_id}: ${existingError.message}`);
      }
      return {
        claimed: false,
        existingStatus: existing?.status ?? null,
      };
    },
    async finalizeReminderAttempt(input) {
      const { data, error } = await args.supabase
        .from("reminders")
        .update({
          status: input.status,
          sent_at: input.sentAt,
          processing_started_at: null,
        })
        .eq("id", input.slotId)
        .eq("owner_id", input.ownerId)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to finalize reminder slot ${input.slotId}: ${error.message}`);
      }
      if (!data?.id) {
        throw new Error(`Reminder slot ${input.slotId} was not in processing state during finalize.`);
      }
    },
    async sendWhatsApp(input) {
      const result = await sendMessage(input);
      return {
        success: result.success,
        error: result.error ?? null,
      };
    },
  };

  return runReminderEngineForOwner(args.ownerId, deps, args.now ?? new Date());
}
