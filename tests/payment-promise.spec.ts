import { describe, expect, it } from "vitest";
import { recalcInvoice } from "../src/lib/finance.server";
import {
  createPaymentPromise,
  detectPaymentPromiseIntent,
  evaluatePaymentPromises,
  findPromiseInvoiceMatch,
  parsePaymentPromiseDate,
} from "../src/lib/payment-promise.server";

type TableRow = Record<string, unknown>;
type RowFilter = {
  column: string;
  operator: "eq";
  value: unknown;
};

type MockData = {
  clients?: TableRow[];
  invoices?: TableRow[];
  payments?: TableRow[];
  payment_promises?: TableRow[];
  reminder_settings?: TableRow[];
};

class QueryBuilder {
  private filters: RowFilter[] = [];
  private insertRows: TableRow[] | null = null;
  private updatePatch: TableRow | null = null;

  constructor(
    private readonly mock: MockSupabase,
    private readonly table: keyof MockData,
  ) {}

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, operator: "eq", value });
    return this;
  }

  maybeSingle() {
    if (this.updatePatch) {
      return Promise.resolve(this.mock.updateSingle(this.table, this.filters, this.updatePatch));
    }
    return Promise.resolve({
      data: this.mock.selectRows(this.table, this.filters)[0] ?? null,
      error: null,
    });
  }

  single() {
    if (this.insertRows) {
      return Promise.resolve(this.mock.insertSingle(this.table, this.insertRows[0] ?? {}));
    }
    if (this.updatePatch) {
      return Promise.resolve(this.mock.updateSingle(this.table, this.filters, this.updatePatch));
    }
    return Promise.resolve({
      data: this.mock.selectRows(this.table, this.filters)[0] ?? null,
      error: null,
    });
  }

  insert(row: TableRow | TableRow[]) {
    this.insertRows = Array.isArray(row) ? row : [row];
    return this;
  }

  update(patch: TableRow) {
    this.updatePatch = patch;
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const result: QueryResult = this.insertRows
      ? this.mock.insertSingle(this.table, this.insertRows[0] ?? {})
      : this.updatePatch
        ? this.mock.updateSingle(this.table, this.filters, this.updatePatch)
        : { data: this.mock.selectRows(this.table, this.filters), error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

class MockSupabase {
  readonly tables: Record<string, TableRow[]>;
  invoiceUpdateCount = 0;
  paymentInsertCount = 0;

  constructor(data: MockData) {
    this.tables = {
      clients: [...(data.clients ?? [])],
      invoices: [...(data.invoices ?? [])],
      payments: [...(data.payments ?? [])],
      payment_promises: [...(data.payment_promises ?? [])],
      reminder_settings: [...(data.reminder_settings ?? [])],
    };
  }

  from(table: keyof MockData) {
    return new QueryBuilder(this, table);
  }

  selectRows(table: keyof MockData, filters: RowFilter[]) {
    return this.tables[table].filter((row) =>
      filters.every((filter) => row[filter.column] === filter.value),
    );
  }

  insertSingle(table: keyof MockData, row: TableRow) {
    const stored = {
      id: row.id ?? `${String(table)}-${this.tables[table].length + 1}`,
      created_at: row.created_at ?? "2026-09-05T00:00:00.000Z",
      resolved_at: row.resolved_at ?? null,
      ...row,
    };
    if (table === "payments") {
      this.paymentInsertCount++;
    }
    this.tables[table].push(stored);
    return { data: stored, error: null };
  }

  updateSingle(table: keyof MockData, filters: RowFilter[], patch: TableRow) {
    const row = this.selectRows(table, filters)[0];
    if (!row) {
      return { data: null, error: null };
    }
    Object.assign(row, patch);
    if (table === "invoices") {
      this.invoiceUpdateCount++;
    }
    return { data: row, error: null };
  }
}

function createMockSupabase(overrides: MockData = {}) {
  return new MockSupabase({
    clients: [
      {
        id: "client-1",
        owner_id: "owner-1",
        name: "Mona",
      },
      {
        id: "client-2",
        owner_id: "owner-1",
        name: "Omar",
      },
    ],
    invoices: [
      {
        id: "inv-1",
        owner_id: "owner-1",
        client_id: "client-1",
        invoice_number: "INV-001",
        status: "overdue",
        remaining_balance: 1500,
        amount: 1500,
        paid_amount: 0,
        due_date: "2026-09-01",
      },
      {
        id: "inv-2",
        owner_id: "owner-1",
        client_id: "client-2",
        invoice_number: "INV-002",
        status: "sent",
        remaining_balance: 600,
        amount: 600,
        paid_amount: 0,
        due_date: "2026-09-10",
      },
    ],
    payments: [],
    payment_promises: [],
    reminder_settings: [{ owner_id: "owner-1", timezone: "Asia/Dubai" }],
    ...overrides,
  });
}

describe("payment promise creation", () => {
  it("creates a payment promise without mutating invoice or payment records", async () => {
    const supabase = createMockSupabase();

    const result = await createPaymentPromise({
      supabase: supabase as never,
      ownerId: "owner-1",
      invoiceId: "inv-1",
      clientId: "client-1",
      promiseDate: "2026-09-07",
      customerMessage: "I will pay tomorrow",
    });

    expect(result.created).toBe(true);
    expect(supabase.tables.payment_promises).toHaveLength(1);
    expect(supabase.tables.payments).toHaveLength(0);
    expect(supabase.invoiceUpdateCount).toBe(0);
  });

  it("enforces the owner, invoice, and client relationship", async () => {
    const supabase = createMockSupabase();

    const mismatch = await createPaymentPromise({
      supabase: supabase as never,
      ownerId: "owner-1",
      invoiceId: "inv-1",
      clientId: "client-2",
      promiseDate: "2026-09-07",
    });

    const wrongOwner = await createPaymentPromise({
      supabase: supabase as never,
      ownerId: "owner-2",
      invoiceId: "inv-1",
      clientId: "client-1",
      promiseDate: "2026-09-07",
    });

    expect(mismatch).toEqual({
      created: false,
      reason: "invoice_client_mismatch",
    });
    expect(wrongOwner).toEqual({
      created: false,
      reason: "invoice_not_found",
    });
  });

  it("prevents duplicate active promises for the same invoice", async () => {
    const supabase = createMockSupabase({
      payment_promises: [
        {
          id: "promise-1",
          owner_id: "owner-1",
          invoice_id: "inv-1",
          client_id: "client-1",
          promise_date: "2026-09-07",
          status: "active",
          customer_message: "I will pay tomorrow",
          created_at: "2026-09-05T00:00:00.000Z",
          resolved_at: null,
        },
      ],
    });

    const result = await createPaymentPromise({
      supabase: supabase as never,
      ownerId: "owner-1",
      invoiceId: "inv-1",
      clientId: "client-1",
      promiseDate: "2026-09-08",
    });

    expect(result.created).toBe(false);
    if (!result.created) {
      expect(result.reason).toBe("duplicate_active_promise");
      expect(result.existingPromise?.id).toBe("promise-1");
    }
    expect(supabase.tables.payment_promises).toHaveLength(1);
  });
});

describe("payment promise date parsing and intent detection", () => {
  const base = new Date("2026-09-05T10:00:00.000Z");

  it("parses supported English dates", () => {
    expect(parsePaymentPromiseDate("I will pay tomorrow", { now: base, timezone: "UTC" })).toBe("2026-09-06");
    expect(parsePaymentPromiseDate("I will transfer the amount in 2 days", { now: base, timezone: "UTC" })).toBe("2026-09-07");
    expect(parsePaymentPromiseDate("I'll pay on Friday", { now: base, timezone: "UTC" })).toBe("2026-09-11");
    expect(parsePaymentPromiseDate("I will pay on 7/9/2026", { now: base, timezone: "UTC" })).toBe("2026-09-07");
    expect(parsePaymentPromiseDate("I will pay on 7 September 2026", { now: base, timezone: "UTC" })).toBe("2026-09-07");
    expect(parsePaymentPromiseDate("I'll pay on September 7", { now: base, timezone: "UTC" })).toBe("2026-09-07");
    expect(parsePaymentPromiseDate("I will pay on 7 September", { now: base, timezone: "UTC" })).toBe("2026-09-07");
    expect(parsePaymentPromiseDate("I'll pay on Sep 7", { now: base, timezone: "UTC" })).toBe("2026-09-07");
  });

  it("parses supported Arabic dates", () => {
    expect(parsePaymentPromiseDate("سأدفع غداً", { now: base, timezone: "UTC" })).toBe("2026-09-06");
    expect(parsePaymentPromiseDate("سأدفع بعد يومين", { now: base, timezone: "UTC" })).toBe("2026-09-07");
    expect(parsePaymentPromiseDate("سأحول المبلغ يوم الأحد", { now: base, timezone: "UTC" })).toBe("2026-09-06");
    expect(parsePaymentPromiseDate("سأدفع يوم 7 سبتمبر", { now: base, timezone: "UTC" })).toBe("2026-09-07");
    expect(parsePaymentPromiseDate("سأدفع في 7 سبتمبر", { now: base, timezone: "UTC" })).toBe("2026-09-07");
  });

  it("rejects invalid explicit dates", () => {
    expect(parsePaymentPromiseDate("I will pay on 31/02/2026", { now: base, timezone: "UTC" })).toBeNull();
    expect(parsePaymentPromiseDate("I will pay on 2026-13-40", { now: base, timezone: "UTC" })).toBeNull();
  });

  it("detects clear English and Arabic payment commitments but ignores vague language", () => {
    expect(detectPaymentPromiseIntent("I will pay tomorrow", { now: base, timezone: "UTC" })).toEqual({
      kind: "confirmed",
      locale: "en",
      promiseDate: "2026-09-06",
    });
    expect(detectPaymentPromiseIntent("I'll pay on September 7", { now: base, timezone: "UTC" })).toEqual({
      kind: "confirmed",
      locale: "en",
      promiseDate: "2026-09-07",
    });
    expect(detectPaymentPromiseIntent("I will pay on 7 September 2026", { now: base, timezone: "UTC" })).toEqual({
      kind: "confirmed",
      locale: "en",
      promiseDate: "2026-09-07",
    });
    expect(detectPaymentPromiseIntent("سأدفع غداً", { now: base, timezone: "UTC" })).toEqual({
      kind: "confirmed",
      locale: "ar",
      promiseDate: "2026-09-06",
    });
    expect(detectPaymentPromiseIntent("سأدفع في 7 سبتمبر", { now: base, timezone: "UTC" })).toEqual({
      kind: "confirmed",
      locale: "ar",
      promiseDate: "2026-09-07",
    });
    expect(detectPaymentPromiseIntent("I might pay tomorrow", { now: base, timezone: "UTC" })).toEqual({
      kind: "none",
      locale: "en",
    });
  });

  it("rolls yearless month-day dates to the next year only after they have passed", () => {
    const lateYearBase = new Date("2026-12-31T10:00:00.000Z");
    const afterDateBase = new Date("2026-09-08T10:00:00.000Z");

    expect(parsePaymentPromiseDate("I'll pay on January 2", { now: lateYearBase, timezone: "UTC" })).toBe("2027-01-02");
    expect(parsePaymentPromiseDate("سأدفع في 7 سبتمبر", { now: afterDateBase, timezone: "UTC" })).toBe("2027-09-07");
    expect(parsePaymentPromiseDate("I'll pay on September 8", { now: new Date("2026-09-08T10:00:00.000Z"), timezone: "UTC" })).toBeNull();
  });
});

describe("payment promise evaluation", () => {
  it("marks past promises fulfilled when the invoice is paid", async () => {
    const supabase = createMockSupabase({
      invoices: [
        {
          id: "inv-1",
          owner_id: "owner-1",
          client_id: "client-1",
          invoice_number: "INV-001",
          status: "paid",
          remaining_balance: 0,
          amount: 1500,
          paid_amount: 1500,
          due_date: "2026-09-01",
        },
      ],
      payment_promises: [
        {
          id: "promise-1",
          owner_id: "owner-1",
          invoice_id: "inv-1",
          client_id: "client-1",
          promise_date: "2026-09-05",
          status: "active",
          customer_message: "I will pay tomorrow",
          created_at: "2026-09-04T00:00:00.000Z",
          resolved_at: null,
        },
      ],
    });

    const result = await evaluatePaymentPromises({
      supabase: supabase as never,
      ownerId: "owner-1",
      now: new Date("2026-09-06T09:00:00.000Z"),
      timezone: "UTC",
    });

    expect(result.fulfilled).toBe(1);
    expect(supabase.tables.payment_promises[0]?.status).toBe("fulfilled");
  });

  it("marks past promises broken when the invoice stays unpaid", async () => {
    const supabase = createMockSupabase({
      payment_promises: [
        {
          id: "promise-2",
          owner_id: "owner-1",
          invoice_id: "inv-1",
          client_id: "client-1",
          promise_date: "2026-09-05",
          status: "active",
          customer_message: "I will pay tomorrow",
          created_at: "2026-09-04T00:00:00.000Z",
          resolved_at: null,
        },
      ],
    });

    const result = await evaluatePaymentPromises({
      supabase: supabase as never,
      ownerId: "owner-1",
      now: new Date("2026-09-06T09:00:00.000Z"),
      timezone: "UTC",
    });

    expect(result.broken).toBe(1);
    expect(supabase.tables.payment_promises[0]?.status).toBe("broken");
  });

  it("fulfills the active promise when invoice recalculation sees a fully paid invoice", async () => {
    const supabase = createMockSupabase({
      invoices: [
        {
          id: "inv-1",
          owner_id: "owner-1",
          client_id: "client-1",
          invoice_number: "INV-001",
          status: "partially_paid",
          remaining_balance: 500,
          amount: 1500,
          paid_amount: 1000,
          due_date: "2026-09-01",
        },
      ],
      payments: [
        {
          id: "payment-1",
          owner_id: "owner-1",
          invoice_id: "inv-1",
          amount: 1500,
          reversed_at: null,
        },
      ],
      payment_promises: [
        {
          id: "promise-3",
          owner_id: "owner-1",
          invoice_id: "inv-1",
          client_id: "client-1",
          promise_date: "2026-09-07",
          status: "active",
          customer_message: "I will pay tomorrow",
          created_at: "2026-09-05T00:00:00.000Z",
          resolved_at: null,
        },
      ],
    });

    await recalcInvoice({ supabase: supabase as never, userId: "owner-1" }, "inv-1");

    expect(supabase.tables.payment_promises[0]?.status).toBe("fulfilled");
    expect(supabase.tables.payment_promises[0]?.resolved_at).toBeTruthy();
  });
});

describe("payment promise invoice matching", () => {
  it("does not guess when multiple unpaid invoices exist without an invoice reference", () => {
    const match = findPromiseInvoiceMatch("I will pay tomorrow", [
      {
        id: "inv-1",
        owner_id: "owner-1",
        client_id: "client-1",
        invoice_number: "INV-001",
        status: "overdue",
        remaining_balance: 1500,
      },
      {
        id: "inv-2",
        owner_id: "owner-1",
        client_id: "client-1",
        invoice_number: "INV-002",
        status: "sent",
        remaining_balance: 600,
      },
    ]);

    expect(match.kind).toBe("ambiguous");
  });
});
