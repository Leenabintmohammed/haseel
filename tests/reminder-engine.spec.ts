import { describe, expect, it } from "vitest";
import {
  buildReminderMessage,
  DEFAULT_REMINDER_SETTINGS,
  PROCESSING_STALE_THRESHOLD_MINUTES,
  resolveReminderType,
  runReminderEngineForOwner,
  type BusinessPaymentSettings,
  type ReminderClaimInput,
  type ReminderEngineDependencies,
  type ReminderInvoice,
  type ReminderSettings,
} from "../src/lib/reminder-engine.server";
import type { PaymentPromiseRow } from "../src/lib/payment-promise.server";

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
  paymentPromises?: PaymentPromiseRow[];
}): {
  deps: ReminderEngineDependencies;
  getReminderRows: () => Array<
    ReminderClaimInput & { status: string; sent_at: string | null; processing_started_at: string | null }
  >;
  getPaymentPromises: () => PaymentPromiseRow[];
  setReminderRowOwner: (slotId: string, ownerId: string) => void;
  setProcessingStartedAt: (slotId: string, processingStartedAt: string | null) => void;
  sentBodies: string[];
} {
  const staleThresholdMs = PROCESSING_STALE_THRESHOLD_MINUTES * 60 * 1000;
  const reminderRows = new Map<
    string,
    ReminderClaimInput & { status: string; sent_at: string | null; processing_started_at: string | null }
  >();
  const sentBodies: string[] = [];
  const settings = { ...DEFAULT_REMINDER_SETTINGS, timezone: "UTC", reminder_time: "10:00", ...(args.settings ?? {}) };
  const invoices = args.invoices ?? [makeInvoice()];
  const paymentSettings = args.paymentSettings ?? null;
  const sendSuccess = args.sendSuccess ?? true;
  const paymentPromises = new Map((args.paymentPromises ?? []).map((promise) => [promise.id, promise]));
  return {
    getReminderRows: () => Array.from(reminderRows.values()),
    getPaymentPromises: () => Array.from(paymentPromises.values()),
    setReminderRowOwner: (slotId, ownerId) => {
      const current = reminderRows.get(slotId);
      if (!current) {
        return;
      }
      reminderRows.set(slotId, { ...current, owner_id: ownerId });
    },
    setProcessingStartedAt: (slotId, processingStartedAt) => {
      const current = reminderRows.get(slotId);
      if (!current) {
        return;
      }
      reminderRows.set(slotId, { ...current, processing_started_at: processingStartedAt });
    },
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
      async getActivePaymentPromise(ownerId, invoiceId) {
        return (
          Array.from(paymentPromises.values()).find(
            (promise) =>
              promise.owner_id === ownerId &&
              promise.invoice_id === invoiceId &&
              promise.status === "active",
          ) ?? null
        );
      },
      async breakPaymentPromise(ownerId, invoiceId, resolvedAt) {
        const promise = Array.from(paymentPromises.values()).find(
          (item) =>
            item.owner_id === ownerId &&
            item.invoice_id === invoiceId &&
            item.status === "active",
        );
        if (!promise) {
          return null;
        }
        const updated = { ...promise, status: "broken" as const, resolved_at: resolvedAt };
        paymentPromises.set(updated.id, updated);
        return updated;
      },
      async fulfillPaymentPromise(ownerId, invoiceId, resolvedAt) {
        const promise = Array.from(paymentPromises.values()).find(
          (item) =>
            item.owner_id === ownerId &&
            item.invoice_id === invoiceId &&
            item.status === "active",
        );
        if (!promise) {
          return null;
        }
        const updated = { ...promise, status: "fulfilled" as const, resolved_at: resolvedAt };
        paymentPromises.set(updated.id, updated);
        return updated;
      },
      async claimReminderAttempt(row) {
        const existing = reminderRows.get(row.slot_id);
        const claimStartedAt = new Date().toISOString();
        if (!existing) {
          reminderRows.set(row.slot_id, {
           ...row,
           status: "processing",
           sent_at: null,
           processing_started_at: claimStartedAt,
          });
          return { claimed: true, existingStatus: null };
        }
        if (existing.owner_id !== row.owner_id) {
          return { claimed: false, existingStatus: null };
        }
        if (existing.status === "failed") {
          reminderRows.set(row.slot_id, {
           ...row,
           status: "processing",
           sent_at: null,
           processing_started_at: claimStartedAt,
          });
          return { claimed: true, existingStatus: "failed" };
        }
        if (existing.status === "processing" && existing.processing_started_at) {
          const existingStarted = new Date(existing.processing_started_at).getTime();
          const nowTime = new Date(claimStartedAt).getTime();
          if (Number.isFinite(existingStarted) && Number.isFinite(nowTime) && existingStarted < nowTime - staleThresholdMs) {
           reminderRows.set(row.slot_id, {
             ...row,
             status: "processing",
             sent_at: null,
             processing_started_at: claimStartedAt,
           });
           return { claimed: true, existingStatus: "processing" };
          }
        }
        return { claimed: false, existingStatus: existing.status };
      },
      async finalizeReminderAttempt({ slotId, status, sentAt }) {
        const existing = reminderRows.get(slotId);
        if (!existing || existing.status !== "processing") {
          throw new Error(`Slot ${slotId} not claimable for finalize`);
        }
        reminderRows.set(slotId, { ...existing, status, sent_at: sentAt, processing_started_at: null });
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
  const staleThresholdMs = PROCESSING_STALE_THRESHOLD_MINUTES * 60 * 1000;

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

  it("sent row is never sent again", async () => {
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

  it("suppresses escalation while a future payment promise is active", async () => {
    const { deps, getReminderRows, sentBodies } = makeDeps({
      paymentPromises: [
        {
          id: "promise-1",
          owner_id: "owner-a",
          invoice_id: "inv-1",
          client_id: "client-1",
          promise_date: "2026-09-07",
          status: "active",
          customer_message: "I will pay tomorrow",
          created_at: "2026-09-05T09:00:00.000Z",
          resolved_at: null,
        },
      ],
    });

    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(getReminderRows()).toHaveLength(0);
    expect(sentBodies).toHaveLength(0);
  });

  it("marks same-day unpaid promises broken and resumes reminders", async () => {
    const { deps, getPaymentPromises, sentBodies } = makeDeps({
      paymentPromises: [
        {
          id: "promise-2",
          owner_id: "owner-a",
          invoice_id: "inv-1",
          client_id: "client-1",
          promise_date: "2026-09-05",
          status: "active",
          customer_message: "I will pay on Friday",
          created_at: "2026-09-04T09:00:00.000Z",
          resolved_at: null,
        },
      ],
    });

    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.sent).toBe(1);
    expect(getPaymentPromises()[0]?.status).toBe("broken");
    expect(sentBodies[0]).toContain("promised for invoice INV-001 is due today");
  });

  it("keeps overdue broken promises in the normal reminder flow with acknowledgment", async () => {
    const { deps, getPaymentPromises, sentBodies } = makeDeps({
      paymentPromises: [
        {
          id: "promise-3",
          owner_id: "owner-a",
          invoice_id: "inv-1",
          client_id: "client-1",
          promise_date: "2026-09-04",
          status: "active",
          customer_message: "I will pay tomorrow",
          created_at: "2026-09-03T09:00:00.000Z",
          resolved_at: null,
        },
      ],
    });

    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.sent).toBe(1);
    expect(getPaymentPromises()[0]?.status).toBe("broken");
    expect(sentBodies[0]).toContain("was due on September 4, 2026");
  });

  it("clears processing_started_at after failed finalization", async () => {
    const { deps, getReminderRows } = makeDeps({ sendSuccess: false });
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.failed).toBe(1);
    expect(getReminderRows()).toHaveLength(1);
    expect(getReminderRows()[0]?.status).toBe("failed");
    expect(getReminderRows()[0]?.processing_started_at).toBeNull();
  });

  it("clears processing_started_at after successful finalization", async () => {
    const { deps, getReminderRows } = makeDeps({});
    const result = await runReminderEngineForOwner("owner-a", deps, now);
    expect(result.sent).toBe(1);
    expect(getReminderRows()[0]?.status).toBe("sent");
    expect(getReminderRows()[0]?.processing_started_at).toBeNull();
  });

  it("does not reclaim a fresh processing row", async () => {
    const shared = makeDeps({});
    const finalize = shared.deps.finalizeReminderAttempt;
    shared.deps.finalizeReminderAttempt = async () => {};
    await runReminderEngineForOwner("owner-a", shared.deps, now);
    const slotId = shared.getReminderRows()[0]?.slot_id as string;
    shared.setProcessingStartedAt(slotId, new Date(Date.now() - staleThresholdMs + 60_000).toISOString());

    shared.deps.finalizeReminderAttempt = finalize;
    const retryResult = await runReminderEngineForOwner("owner-a", shared.deps, now);

    expect(retryResult.sent).toBe(0);
    expect(retryResult.skipped).toBe(1);
    expect(shared.sentBodies).toHaveLength(1);
  });

  it("reclaims stale processing row and completes normal send flow", async () => {
    const shared = makeDeps({});
    const finalize = shared.deps.finalizeReminderAttempt;
    shared.deps.finalizeReminderAttempt = async () => {};
    await runReminderEngineForOwner("owner-a", shared.deps, now);
    const firstSlotId = shared.getReminderRows()[0]?.slot_id;
    expect(firstSlotId).toBeDefined();
    shared.setProcessingStartedAt(firstSlotId as string, new Date(Date.now() - staleThresholdMs - 60_000).toISOString());

    shared.deps.finalizeReminderAttempt = finalize;
    const retryResult = await runReminderEngineForOwner("owner-a", shared.deps, now);

    expect(retryResult.sent).toBe(1);
    expect(shared.sentBodies).toHaveLength(2);
    expect(shared.getReminderRows()[0]?.status).toBe("sent");
    expect(shared.getReminderRows()[0]?.processing_started_at).toBeNull();
    expect(shared.getReminderRows()[0]?.slot_id).toBe(firstSlotId);
  });

  it("keeps failed rows retryable with deterministic slot id", async () => {
    const shared = makeDeps({ sendSuccess: false });
    const first = await runReminderEngineForOwner("owner-a", shared.deps, now);
    expect(first.failed).toBe(1);
    const firstSlotId = shared.getReminderRows()[0]?.slot_id;
    expect(firstSlotId).toBeDefined();

    shared.deps.sendWhatsApp = async (input) => {
      shared.sentBodies.push(input.body);
      return { success: true };
    };
    const second = await runReminderEngineForOwner("owner-a", shared.deps, new Date(now.getTime() + 60_000));
    expect(second.sent).toBe(1);
    expect(shared.getReminderRows()[0]?.slot_id).toBe(firstSlotId);
  });

  it("does not reclaim another owner's processing row", async () => {
    const shared = makeDeps({});
    const finalize = shared.deps.finalizeReminderAttempt;
    shared.deps.finalizeReminderAttempt = async () => {};
    await runReminderEngineForOwner("owner-a", shared.deps, now);
    const slotId = shared.getReminderRows()[0]?.slot_id;
    expect(slotId).toBeDefined();
    const existingSlotId = slotId as string;

    shared.setReminderRowOwner(existingSlotId, "owner-b");
    shared.deps.finalizeReminderAttempt = finalize;
    const retryResult = await runReminderEngineForOwner("owner-a", shared.deps, new Date(now.getTime() + staleThresholdMs + 60_000));

    expect(retryResult.sent).toBe(0);
    expect(retryResult.skipped).toBe(1);
    expect(shared.sentBodies).toHaveLength(1);
  });

  it("keeps concurrent claim behavior safe", async () => {
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
