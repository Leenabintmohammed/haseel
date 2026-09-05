import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentPromiseStatus =
  | "active"
  | "fulfilled"
  | "broken"
  | "cancelled";

export type PaymentPromiseRow = {
  id: string;
  owner_id: string;
  invoice_id: string | null;
  client_id: string | null;
  promise_date: string;
  status: PaymentPromiseStatus;
  customer_message: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type PromiseInvoiceRow = {
  id: string;
  owner_id: string;
  client_id: string;
  invoice_number: string;
  status: string;
  remaining_balance: number | string | null;
};

export type PromiseIntent =
  | { kind: "confirmed"; promiseDate: string; locale: "ar" | "en" }
  | { kind: "none"; locale: "ar" | "en" };

export type PromiseInvoiceMatch =
  | { kind: "single"; invoice: PromiseInvoiceRow }
  | { kind: "ambiguous"; invoices: PromiseInvoiceRow[] }
  | { kind: "none" };

type MutationArgs = {
  supabase: SupabaseClient;
  ownerId: string;
  promiseId?: string;
  invoiceId?: string;
  resolvedAt?: string;
};

function isArabicText(value: string): boolean {
  return /[\u0600-\u06FF]/u.test(value);
}

function normalizeTimezone(value: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "Asia/Dubai";
  }
}

function localDateParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
  };
}

function isoFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toLocalDateKey(now: Date, timezone: string): string {
  const { year, month, day } = localDateParts(now, timezone);
  return isoFromParts(year, month, day);
}

function normalizeDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) {
      return String(code - 0x0660);
    }
    return String(code - 0x06f0);
  });
}

function normalizeText(value: string): string {
  return normalizeDigits(value)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/gu, "")
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numericValue(raw: number | string | null | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function weekdayIndex(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

function nextWeekday(baseDate: string, targetDay: number): string {
  const current = weekdayIndex(baseDate);
  const delta = (targetDay - current + 7) % 7 || 7;
  return addDays(baseDate, delta);
}

function parseExplicitDate(value: string): string | null {
  const isoMatch = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/u);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return isValidCalendarDate(year, month, day)
      ? isoFromParts(year, month, day)
      : null;
  }

  const dayFirstMatch = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/u);
  if (dayFirstMatch) {
    const year = Number(dayFirstMatch[3]);
    const month = Number(dayFirstMatch[2]);
    const day = Number(dayFirstMatch[1]);
    return isValidCalendarDate(year, month, day)
      ? isoFromParts(year, month, day)
      : null;
  }

  const englishMonthMatch = value.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(20\d{2})\b/u,
  );
  if (englishMonthMatch) {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const year = Number(englishMonthMatch[3]);
    const month = months.indexOf(englishMonthMatch[1]!) + 1;
    const day = Number(englishMonthMatch[2]);
    return isValidCalendarDate(year, month, day)
      ? isoFromParts(year, month, day)
      : null;
  }

  const englishDayMonthMatch = value.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:,\s*|\s+)(20\d{2})\b/u,
  );
  if (englishDayMonthMatch) {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const year = Number(englishDayMonthMatch[3]);
    const month = months.indexOf(englishDayMonthMatch[2]!) + 1;
    const day = Number(englishDayMonthMatch[1]);
    return isValidCalendarDate(year, month, day)
      ? isoFromParts(year, month, day)
      : null;
  }

  return null;
}

function parseRelativeDate(value: string, today: string): string | null {
  if (/\btomorrow\b/u.test(value) || /(غداً|غدًا|غدا|غد)/u.test(value) || /(بكرة|بكرا)/u.test(value)) {
    return addDays(today, 1);
  }

  if (/\bnext week\b/u.test(value) || /(الأسبوع|الاسبوع)\s+القادم/u.test(value)) {
    return addDays(today, 7);
  }

  const inDaysMatch = value.match(/\b(?:in|after)\s+(\d+)\s+day(?:s)?\b/u);
  if (inDaysMatch) {
    return addDays(today, Number(inDaysMatch[1]));
  }

  if (/\bafter two days\b/u.test(value) || /\bin two days\b/u.test(value)) {
    return addDays(today, 2);
  }

  if (/بعد يومين/u.test(value)) {
    return addDays(today, 2);
  }

  const arabicDaysMatch = value.match(/بعد\s+(\d+)\s+(?:يوم|أيام|ايام)/u);
  if (arabicDaysMatch) {
    return addDays(today, Number(arabicDaysMatch[1]));
  }

  return null;
}

function parseWeekdayDate(value: string, today: string): string | null {
  const weekdays: Array<[RegExp, number]> = [
    [/\b(?:monday)\b/u, 1],
    [/\b(?:tuesday)\b/u, 2],
    [/\b(?:wednesday)\b/u, 3],
    [/\b(?:thursday)\b/u, 4],
    [/\b(?:friday)\b/u, 5],
    [/\b(?:saturday)\b/u, 6],
    [/\b(?:sunday)\b/u, 0],
    [/(الاثنين|الإثنين)/u, 1],
    [/(الثلاثاء)/u, 2],
    [/(الاربعاء|الأربعاء)/u, 3],
    [/(الخميس)/u, 4],
    [/(الجمعة)/u, 5],
    [/(السبت)/u, 6],
    [/(الاحد|الأحد)/u, 0],
  ];

  for (const [pattern, day] of weekdays) {
    if (pattern.test(value)) {
      return nextWeekday(today, day);
    }
  }

  return null;
}

export function parsePaymentPromiseDate(
  message: string,
  options?: { now?: Date; timezone?: string },
): string | null {
  const timezone = options?.timezone ?? "Asia/Dubai";
  const today = toLocalDateKey(options?.now ?? new Date(), timezone);
  const normalized = normalizeText(message);
  const explicitDate =
    parseExplicitDate(normalized) ??
    parseRelativeDate(normalized, today) ??
    parseWeekdayDate(normalized, today);

  if (!explicitDate || explicitDate <= today) {
    return null;
  }

  return explicitDate;
}

export function formatPaymentPromiseDate(
  promiseDate: string,
  locale: "ar" | "en",
): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${promiseDate}T00:00:00.000Z`));
}

export function detectPaymentPromiseIntent(
  message: string,
  options?: { now?: Date; timezone?: string },
): PromiseIntent {
  const locale: "ar" | "en" = isArabicText(message) ? "ar" : "en";
  const normalized = normalizeText(message);
  const vaguePattern =
    /\b(?:maybe|might|try|trying|hope|hopefully|perhaps|probably)\b/u.test(normalized) ||
    /(ربما|قد|يمكن|سأحاول|احاول|أتمنى|ان شاء الله|إن شاء الله)/u.test(normalized);
  if (vaguePattern) {
    return { kind: "none", locale };
  }

  const hasCommitment =
    /\b(?:i will|i ll|i'll|we will|we ll|we'll)\b.*\b(?:pay|transfer|send)\b/u.test(normalized) ||
    /(سأدفع|سادفع|سأحول|ساحول|سأرسل|سارسل|سأقوم بتحويل)/u.test(normalized);
  if (!hasCommitment) {
    return { kind: "none", locale };
  }

  const promiseDate = parsePaymentPromiseDate(message, options);
  if (!promiseDate) {
    return { kind: "none", locale };
  }

  return { kind: "confirmed", promiseDate, locale };
}

export function findPromiseInvoiceMatch(
  message: string,
  invoices: PromiseInvoiceRow[],
): PromiseInvoiceMatch {
  const openInvoices = invoices.filter((invoice) => numericValue(invoice.remaining_balance) > 0);
  if (openInvoices.length === 0) {
    return { kind: "none" };
  }

  const normalizedMessage = normalizeText(message);
  const mentioned = openInvoices.filter((invoice) => {
    const invoiceNumber = normalizeText(invoice.invoice_number ?? "");
    return invoiceNumber.length > 0 && normalizedMessage.includes(invoiceNumber);
  });

  if (mentioned.length === 1) {
    return { kind: "single", invoice: mentioned[0]! };
  }

  if (mentioned.length > 1) {
    return { kind: "ambiguous", invoices: mentioned };
  }

  if (openInvoices.length === 1) {
    return { kind: "single", invoice: openInvoices[0]! };
  }

  return { kind: "ambiguous", invoices: openInvoices };
}

export async function getOwnerTimezone(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<string> {
  const { data } = await supabase
    .from("reminder_settings")
    .select("timezone")
    .eq("owner_id", ownerId)
    .maybeSingle();

  return normalizeTimezone((data as { timezone?: string } | null)?.timezone ?? "Asia/Dubai");
}

export async function getActivePaymentPromise(args: {
  supabase: SupabaseClient;
  ownerId: string;
  invoiceId: string;
}): Promise<PaymentPromiseRow | null> {
  const { data, error } = await args.supabase
    .from("payment_promises")
    .select("*")
    .eq("owner_id", args.ownerId)
    .eq("invoice_id", args.invoiceId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active payment promise for invoice ${args.invoiceId}: ${error.message}`);
  }

  return (data as PaymentPromiseRow | null) ?? null;
}

export async function createPaymentPromise(args: {
  supabase: SupabaseClient;
  ownerId: string;
  invoiceId: string;
  clientId: string;
  promiseDate: string;
  customerMessage?: string | null;
}): Promise<
  | { created: true; promise: PaymentPromiseRow; invoice: PromiseInvoiceRow }
  | { created: false; reason: "invoice_not_found" | "client_not_found" | "invoice_client_mismatch" | "invoice_not_open" | "duplicate_active_promise"; existingPromise?: PaymentPromiseRow | null }
> {
  const { data: invoice, error: invoiceError } = await args.supabase
    .from("invoices")
    .select("id,owner_id,client_id,invoice_number,status,remaining_balance")
    .eq("owner_id", args.ownerId)
    .eq("id", args.invoiceId)
    .maybeSingle();

  if (invoiceError) {
    throw new Error(`Failed to load invoice ${args.invoiceId}: ${invoiceError.message}`);
  }
  if (!invoice) {
    return { created: false, reason: "invoice_not_found" };
  }

  const { data: client, error: clientError } = await args.supabase
    .from("clients")
    .select("id")
    .eq("owner_id", args.ownerId)
    .eq("id", args.clientId)
    .maybeSingle();

  if (clientError) {
    throw new Error(`Failed to load client ${args.clientId}: ${clientError.message}`);
  }
  if (!client) {
    return { created: false, reason: "client_not_found" };
  }

  const typedInvoice = invoice as PromiseInvoiceRow;
  if (typedInvoice.client_id !== args.clientId) {
    return { created: false, reason: "invoice_client_mismatch" };
  }

  if (!(numericValue(typedInvoice.remaining_balance) > 0)) {
    return { created: false, reason: "invoice_not_open" };
  }

  const existingPromise = await getActivePaymentPromise({
    supabase: args.supabase,
    ownerId: args.ownerId,
    invoiceId: args.invoiceId,
  });
  if (existingPromise) {
    return {
      created: false,
      reason: "duplicate_active_promise",
      existingPromise,
    };
  }

  const { data: promise, error } = await args.supabase
    .from("payment_promises")
    .insert({
      owner_id: args.ownerId,
      invoice_id: args.invoiceId,
      client_id: args.clientId,
      promise_date: args.promiseDate,
      customer_message: args.customerMessage ?? null,
      status: "active",
    })
    .select("*")
    .single();

  if (error || !promise) {
    throw new Error(`Failed to create payment promise for invoice ${args.invoiceId}: ${error?.message ?? "Unknown error"}`);
  }

  return {
    created: true,
    promise: promise as PaymentPromiseRow,
    invoice: typedInvoice,
  };
}

async function resolveActivePromise(
  args: MutationArgs,
): Promise<PaymentPromiseRow | null> {
  if (args.promiseId) {
    const { data, error } = await args.supabase
      .from("payment_promises")
      .select("*")
      .eq("owner_id", args.ownerId)
      .eq("id", args.promiseId)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load payment promise ${args.promiseId}: ${error.message}`);
    }
    return (data as PaymentPromiseRow | null) ?? null;
  }

  if (!args.invoiceId) {
    return null;
  }

  return getActivePaymentPromise({
    supabase: args.supabase,
    ownerId: args.ownerId,
    invoiceId: args.invoiceId,
  });
}

async function resolvePromiseStatus(
  args: MutationArgs & { status: Exclude<PaymentPromiseStatus, "active"> },
): Promise<PaymentPromiseRow | null> {
  const activePromise = await resolveActivePromise(args);
  if (!activePromise) {
    return null;
  }

  const resolvedAt = args.resolvedAt ?? new Date().toISOString();
  const { data, error } = await args.supabase
    .from("payment_promises")
    .update({
      status: args.status,
      resolved_at: resolvedAt,
    })
    .eq("owner_id", args.ownerId)
    .eq("id", activePromise.id)
    .eq("status", "active")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update payment promise ${activePromise.id}: ${error.message}`);
  }

  return (data as PaymentPromiseRow | null) ?? activePromise;
}

export async function fulfillPaymentPromise(args: MutationArgs) {
  return resolvePromiseStatus({ ...args, status: "fulfilled" });
}

export async function breakPaymentPromise(args: MutationArgs) {
  return resolvePromiseStatus({ ...args, status: "broken" });
}

export async function cancelPaymentPromise(args: MutationArgs) {
  return resolvePromiseStatus({ ...args, status: "cancelled" });
}

export async function evaluatePaymentPromises(args: {
  supabase: SupabaseClient;
  ownerId: string;
  now?: Date;
  timezone?: string;
}): Promise<{ evaluated: number; fulfilled: number; broken: number; cancelled: number; localDate: string }> {
  const timezone = args.timezone ?? (await getOwnerTimezone(args.supabase, args.ownerId));
  const localDate = toLocalDateKey(args.now ?? new Date(), timezone);
  const { data, error } = await args.supabase
    .from("payment_promises")
    .select("id,owner_id,invoice_id,client_id,promise_date,status,customer_message,created_at,resolved_at")
    .eq("owner_id", args.ownerId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to list payment promises for owner ${args.ownerId}: ${error.message}`);
  }

  let fulfilled = 0;
  let broken = 0;
  let cancelled = 0;
  let evaluated = 0;

  for (const promise of (data as PaymentPromiseRow[] | null) ?? []) {
    if (!promise.invoice_id) {
      const cancelledPromise = await cancelPaymentPromise({
        supabase: args.supabase,
        ownerId: args.ownerId,
        promiseId: promise.id,
      });
      if (cancelledPromise) {
        cancelled++;
        evaluated++;
      }
      continue;
    }

    if (promise.promise_date >= localDate) {
      continue;
    }

    const { data: invoice, error: invoiceError } = await args.supabase
      .from("invoices")
      .select("id,remaining_balance,status")
      .eq("owner_id", args.ownerId)
      .eq("id", promise.invoice_id)
      .maybeSingle();

    if (invoiceError) {
      throw new Error(`Failed to load invoice ${promise.invoice_id} while evaluating payment promises: ${invoiceError.message}`);
    }

    evaluated++;
    if (!invoice) {
      const cancelledPromise = await cancelPaymentPromise({
        supabase: args.supabase,
        ownerId: args.ownerId,
        promiseId: promise.id,
      });
      if (cancelledPromise) {
        cancelled++;
      }
      continue;
    }

    if (numericValue((invoice as { remaining_balance?: number | string | null }).remaining_balance) <= 0) {
      const fulfilledPromise = await fulfillPaymentPromise({
        supabase: args.supabase,
        ownerId: args.ownerId,
        promiseId: promise.id,
      });
      if (fulfilledPromise) {
        fulfilled++;
      }
      continue;
    }

    const brokenPromise = await breakPaymentPromise({
      supabase: args.supabase,
      ownerId: args.ownerId,
      promiseId: promise.id,
    });
    if (brokenPromise) {
      broken++;
    }
  }

  return {
    evaluated,
    fulfilled,
    broken,
    cancelled,
    localDate,
  };
}
