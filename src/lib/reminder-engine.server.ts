import type { SupabaseClient } from "@supabase/supabase-js";
import { NON_RECEIVABLE, daysBetween } from "./finance-core";
import { sendMessage } from "./messaging/messaging.server";

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

export type SentReminder = {
  invoice_id: string | null;
  sent_at: string | null;
};

export type ReminderInsert = {
  owner_id: string;
  invoice_id: string;
  client_id: string;
  channel: "whatsapp";
  reminder_type: ReminderType;
  message: string;
  status: "sent" | "failed";
  scheduled_at: string;
  sent_at: string | null;
  days_overdue: number;
};

const NON_RECEIVABLE_SET = new Set(NON_RECEIVABLE);

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
  listRecentlySentReminders(ownerId: string, invoiceIds: string[]): Promise<SentReminder[]>;
  insertReminder(row: ReminderInsert): Promise<void>;
  sendWhatsApp(input: { to: string; body: string }): Promise<{ success: boolean; error?: string | null }>;
};

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
}): string {
  const greeting = `Hi ${input.customerName || "there"},`;
  const amountText = `${input.currency} ${input.amount.toLocaleString()}`;
  const introByType: Record<ReminderType, string> = {
    friendly: `Just a friendly reminder that invoice ${input.invoiceNumber} (${amountText}) was due on ${input.dueDate}.`,
    firm: `This is a reminder that invoice ${input.invoiceNumber} (${amountText}) is now ${input.daysOverdue} day(s) overdue (due ${input.dueDate}).`,
    serious: `Invoice ${input.invoiceNumber} (${amountText}) is ${input.daysOverdue} day(s) overdue (due ${input.dueDate}). Please arrange payment as soon as possible.`,
  };
  const paymentLines = paymentSection(input.paymentLink, input.paymentSettings);
  const lines = [greeting, "", introByType[input.reminderType]];
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
  const sentRows = await deps.listRecentlySentReminders(
    ownerId,
    invoices.map((invoice) => invoice.id),
  );
  const todaySent = new Set(
    sentRows
      .filter((row) => row.invoice_id && row.sent_at && toLocalDateKey(new Date(row.sent_at), timezone) === localDate)
      .map((row) => row.invoice_id as string),
  );

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

    if (todaySent.has(invoice.id)) {
      alreadySent++;
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
    });

    const sendResult = await deps.sendWhatsApp({
      to: phone,
      body: message,
    });

    if (sendResult.success) {
      await deps.insertReminder({
        owner_id: ownerId,
        invoice_id: invoice.id,
        client_id: invoice.client_id,
        channel: "whatsapp",
        reminder_type: reminderType,
        message,
        status: "sent",
        scheduled_at: scheduledAt,
        sent_at: scheduledAt,
        days_overdue: daysOverdue,
      });
      sent++;
      continue;
    }

    await deps.insertReminder({
      owner_id: ownerId,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      channel: "whatsapp",
      reminder_type: reminderType,
      message,
      status: "failed",
      scheduled_at: scheduledAt,
      sent_at: null,
      days_overdue: daysOverdue,
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
      const nonReceivableCsv = `(${NON_RECEIVABLE.join(",")})`;
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
    async listRecentlySentReminders(ownerId, invoiceIds) {
      if (!invoiceIds.length) return [];
      const since = new Date((args.now ?? new Date()).getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await args.supabase
        .from("reminders")
        .select("invoice_id,sent_at")
        .eq("owner_id", ownerId)
        .eq("channel", "whatsapp")
        .eq("status", "sent")
        .in("invoice_id", invoiceIds)
        .gte("sent_at", since);
      if (error) {
        throw new Error(`Failed to load recent reminders for owner ${ownerId}: ${error.message}`);
      }
      return (data as SentReminder[] | null) ?? [];
    },
    async insertReminder(row) {
      const { error } = await args.supabase.from("reminders").insert(row);
      if (error) {
        throw new Error(`Failed to persist reminder for invoice ${row.invoice_id}: ${error.message}`);
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
