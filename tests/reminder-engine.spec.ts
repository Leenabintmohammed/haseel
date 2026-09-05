import { describe, expect, it } from "vitest";
import {
  buildReminderMessage,
  DEFAULT_REMINDER_SETTINGS,
  resolveReminderType,
  runReminderEngineForOwner,
  type BusinessPaymentSettings,
  type ReminderClaimInput,
  type ReminderEngineDependencies,
  type ReminderInvoice,
  type ReminderSettings,
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
  paymentSettings?: BusinessPaymentSettings | null;
  sendSuccess?: boolean;
}): {
  deps: ReminderEngineDependencies;
  getReminderRows: () => Array<ReminderClaimInput & { status: string; sent_at: string | null }>;
  sentBodies: string[];
} {
  const reminderRows = new Map<string, ReminderClaimInput & { status: string; sent_at: string | null }>();
  const sentBodies: string[] = [];
  const settings = { ...DEFAULT_REMINDER_SETTINGS, timezone: "UTC", reminder_time: "10:00", ...(args.settings ?? {}) };
  const invoices = args.invoices ?? [makeInvoice()];
  const paymentSettings = args.paymentSettings ?? null;
  const sendSuccess = args.sendSuccess ?? true;
  return {
    getReminderRows: () => Array.from(reminderRows.values()),
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
      async claimReminderAttempt(row) {
        const existing = reminderRows.get(row.slot_id);
        if (!existing) {
          reminderRows.set(row.slot_id, { ...row, status: "processing", sent_at: null });
          return { claimed: true, existingStatus: null };
        }
        if (existing.status === "failed") {
          reminderRows.set(row.slot_id, { ...row, status: "processing", sent_at: null });
          return { claimed: true, existingStatus: "failed" };
        }
        return { claimed: false, existingStatus: existing.status };
      },
      async finalizeReminderAttempt({ slotId, status, sentAt }) {
        const existing = reminderRows.get(slotId);
        if (!existing || existing.status !== "processing") {
          throw new Error(`Slot ${slotId} not claimable for finalize`);
        }
        reminderRows.set(slotId, { ...existing, status, sent_at: sentAt });
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
    const { deps, getReminderRows } = makeDeps({
      invoices: [
        makeInvoice({ id: "p", status: "paid" }),
        makeInvoice({ id: "c", status: "cancelled" }),
        makeInvoice({ id: "d", status: "draft" }),
      ],
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.sent).toBe(0);
    expect(getReminderRows()).toHaveLength(0);
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
    const first = makeDeps({});
    await runReminderEngineForOwner("owner-a", first.deps, now);
    const second = await runReminderEngineForOwner("owner-a", first.deps, now);
    expect(second.already_sent_today).toBe(1);
    expect(second.sent).toBe(0);
  });

  it("respects disabled reminder settings", async () => {
    const { deps, getReminderRows } = makeDeps({
      settings: { enabled: false },
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.settings_disabled).toBe(true);
    expect(getReminderRows()).toHaveLength(0);
  });

  it("waits until configured reminder_time in owner timezone", async () => {
    const { deps, getReminderRows } = makeDeps({
      settings: { timezone: "UTC", reminder_time: "14:00" },
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.waiting_for_time_window).toBe(true);
    expect(result.sent).toBe(0);
    expect(getReminderRows()).toHaveLength(0);
  });

  it("maintains tenant isolation", async () => {
    const { deps, getReminderRows } = makeDeps({
      invoices: [makeInvoice({ owner_id: "owner-b" })],
    });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(getReminderRows()).toHaveLength(0);
  });

  it("handles WhatsApp send failure safely", async () => {
    const { deps, getReminderRows } = makeDeps({ sendSuccess: false });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.failed).toBe(1);
    expect(getReminderRows()).toHaveLength(1);
    expect(getReminderRows()[0]?.status).toBe("failed");
  });

  it("prevents duplicate concurrent sends for same invoice/day", async () => {
    const shared = makeDeps({});
    let release!: () => void;
    const sendGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstSendStarted = false;

    shared.deps.sendWhatsApp = async (input) => {
      if (!firstSendStarted) {
        firstSendStarted = true;
        shared.sentBodies.push(input.body);
        await sendGate.promise;
        return { success: true };
      }
      shared.sentBodies.push(input.body);
      return { success: true };
    };

    const runA = runReminderEngineForOwner("owner-a", shared.deps, now);
    const runB = runReminderEngineForOwner("owner-a", shared.deps, now);
    release();
    const [a, b] = await Promise.all([runA, runB]);

    expect(a.sent + b.sent).toBe(1);
    expect(a.already_sent_today + b.already_sent_today).toBe(1);
    expect(shared.sentBodies).toHaveLength(1);
  });
});
