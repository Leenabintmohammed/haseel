import { describe, expect, it } from "vitest";
import {
  buildReminderMessage,
  DEFAULT_REMINDER_SETTINGS,
  resolveReminderType,
  runReminderEngineForOwner,
  type BusinessPaymentSettings,
  type ReminderEngineDependencies,
  type ReminderInsert,
  type ReminderInvoice,
  type ReminderSettings,
  type SentReminder,
} from "../src/lib/reminder-engine.server";

function makeInvoice(overrides: Partial<ReminderInvoice> = {}): ReminderInvoice {
  return {
    id: "inv-1",
    owner_id: "owner-a",
    client_id: "client-1",
    invoice_number: "INV-001",
    due_date: "2026-09-03",
    status: "overdue",
    remaining_balance: 1500,
    currency: "AED",
    payment_link: null,
    clients: { name: "Mona", phone: "+971501234567" },
    ...overrides,
  };
}

function makeDeps(args: {
  settings?: Partial<ReminderSettings>;
  invoices?: ReminderInvoice[];
  sentReminders?: SentReminder[];
  paymentSettings?: BusinessPaymentSettings | null;
  sendSuccess?: boolean;
}): { deps: ReminderEngineDependencies; inserted: ReminderInsert[]; sentBodies: string[] } {
  const inserted: ReminderInsert[] = [];
  const sentBodies: string[] = [];
  const settings = { ...DEFAULT_REMINDER_SETTINGS, timezone: "UTC", reminder_time: "10:00", ...(args.settings ?? {}) };
  const invoices = args.invoices ?? [makeInvoice()];
  const sentReminders = args.sentReminders ?? [];
  const paymentSettings = args.paymentSettings ?? null;
  const sendSuccess = args.sendSuccess ?? true;

  return {
    inserted,
    sentBodies,
    deps: {
      async getReminderSettings() {
        return settings;
      },
      async listOverdueInvoices() {
        return invoices;
      },
      async getBusinessPaymentSettings() {
        return paymentSettings;
      },
      async listRecentlySentReminders() {
        return sentReminders;
      },
      async insertReminder(row) {
        inserted.push(row);
      },
      async sendWhatsApp(input) {
        sentBodies.push(input.body);
        return sendSuccess ? { success: true } : { success: false, error: "delivery_failed" };
      },
    },
  };
}

describe("reminder engine severity rules", () => {
  it("maps day 0-3 to friendly, day 4-6 to firm, day 7+ to serious", () => {
    const s = { ...DEFAULT_REMINDER_SETTINGS };
    expect(resolveReminderType(0, s)).toBe("friendly");
    expect(resolveReminderType(3, s)).toBe("friendly");
    expect(resolveReminderType(4, s)).toBe("firm");
    expect(resolveReminderType(6, s)).toBe("firm");
    expect(resolveReminderType(7, s)).toBe("serious");
    expect(resolveReminderType(15, s)).toBe("serious");
  });
});

describe("reminder engine processing", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");

  it("skips paid and cancelled/non-collectible invoices", async () => {
    const { deps, inserted } = makeDeps({
      invoices: [
        makeInvoice({ id: "p", status: "paid" }),
        makeInvoice({ id: "c", status: "cancelled" }),
        makeInvoice({ id: "d", status: "draft" }),
      ],
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.sent).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it("includes payment link when present", async () => {
    const { deps, sentBodies } = makeDeps({
      invoices: [makeInvoice({ payment_link: "https://pay.example/inv-1" })],
    });
    await runReminderEngineForOwner("owner-a", deps, now);
    expect(sentBodies[0]).toContain("https://pay.example/inv-1");
  });

  it("uses bank details when payment link is absent", async () => {
    const { deps, sentBodies } = makeDeps({
      paymentSettings: {
        bank_name: "ADCB",
        account_name: "Haseel LLC",
        account_number: "123456",
        iban: "AE000000000000000123456",
        swift_bic: "ADCBAEAA",
        payment_instructions: "Use invoice number as reference",
      },
    });
    await runReminderEngineForOwner("owner-a", deps, now);
    expect(sentBodies[0]).toContain("Bank: ADCB");
    expect(sentBodies[0]).toContain("IBAN: AE000000000000000123456");
  });

  it("does not fabricate payment information", () => {
    const text = buildReminderMessage({
      customerName: "Mona",
      invoiceNumber: "INV-001",
      amount: 100,
      currency: "AED",
      dueDate: "2026-09-01",
      daysOverdue: 4,
      reminderType: "firm",
      paymentLink: null,
      paymentSettings: null,
    });
    expect(text).not.toContain("Bank:");
    expect(text).not.toContain("IBAN:");
    expect(text).not.toContain("Payment link:");
  });

  it("prevents duplicate daily reminders", async () => {
    const { deps, inserted } = makeDeps({
      sentReminders: [{ invoice_id: "inv-1", sent_at: "2026-09-05T03:00:00.000Z" }],
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.already_sent_today).toBe(1);
    expect(result.sent).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it("respects disabled reminder settings", async () => {
    const { deps, inserted } = makeDeps({
      settings: { enabled: false },
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.settings_disabled).toBe(true);
    expect(inserted).toHaveLength(0);
  });

  it("waits until configured reminder_time in owner timezone", async () => {
    const { deps, inserted } = makeDeps({
      settings: { timezone: "UTC", reminder_time: "14:00" },
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.waiting_for_time_window).toBe(true);
    expect(result.sent).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it("maintains tenant isolation", async () => {
    const { deps, inserted } = makeDeps({
      invoices: [makeInvoice({ owner_id: "owner-b" })],
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(inserted).toHaveLength(0);
  });

  it("handles WhatsApp send failure safely", async () => {
    const { deps, inserted } = makeDeps({ sendSuccess: false });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.failed).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.status).toBe("failed");
  });
});
