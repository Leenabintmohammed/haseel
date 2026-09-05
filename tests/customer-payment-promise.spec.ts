import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const getDuelyModel = vi.fn(() => ({ modelId: "gpt-4.1-mini" }));
const getDuelyBaseModelId = vi.fn(() => "gpt-4.1-mini");
const getDuelyModelId = vi.fn(() => "gpt-4.1-mini");
const hasAiProvider = vi.fn(() => true);

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("../src/lib/ai-provider.server", () => ({
  getDuelyModel: (...args: unknown[]) => getDuelyModel(...args),
  getDuelyBaseModelId: (...args: unknown[]) => getDuelyBaseModelId(...args),
  getDuelyModelId: (...args: unknown[]) => getDuelyModelId(...args),
  hasAiProvider: (...args: unknown[]) => hasAiProvider(...args),
}));

type QueryResult = {
  data: unknown;
  error: null;
};

type TableRow = Record<string, unknown>;
type MockData = {
  clients?: TableRow[];
  invoices?: TableRow[];
  payments?: TableRow[];
  payment_plans?: TableRow[];
  business_payment_settings?: TableRow[];
  reminder_settings?: TableRow[];
  payment_promises?: TableRow[];
  ai_conversations?: TableRow[];
};

class QueryBuilder {
  private filters: Array<{ column: string; value: unknown; operator: "eq" | "in" }> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private pendingInsert: TableRow | null = null;

  constructor(
    private readonly mock: MockSupabase,
    private readonly table: string,
  ) {}

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, operator: "eq" });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, value: values, operator: "in" });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return Promise.resolve<QueryResult>({
      data: this.resolveRows(),
      error: null,
    });
  }

  maybeSingle() {
    return Promise.resolve<QueryResult>({
      data: this.resolveRows()[0] ?? null,
      error: null,
    });
  }

  insert(row: TableRow) {
    this.pendingInsert = row;
    return this;
  }

  single() {
    if (!this.pendingInsert) {
      return Promise.resolve<QueryResult>({
        data: this.resolveRows()[0] ?? null,
        error: null,
      });
    }

    const stored = this.mock.insertRow(this.table, this.pendingInsert);
    return Promise.resolve<QueryResult>({
      data: stored,
      error: null,
    });
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const result = this.pendingInsert
      ? { data: this.mock.insertRow(this.table, this.pendingInsert), error: null }
      : { data: this.resolveRows(), error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  private resolveRows() {
    const rows = this.mock.resolveRows(this.table, this.filters, this.orderBy);
    return this.limitCount == null ? rows : rows.slice(0, this.limitCount);
  }
}

class MockSupabase {
  inserts: Array<{ table: string; row: unknown }> = [];

  constructor(private readonly data: MockData = {}) {}

  from(table: string) {
    return new QueryBuilder(this, table);
  }

  resolveRows(
    table: string,
    filters: Array<{ column: string; value: unknown; operator: "eq" | "in" }>,
    orderBy: { column: string; ascending: boolean } | null,
  ) {
    const rows = [...(this.data[table as keyof MockData] ?? [])].filter((row) =>
      filters.every(({ column, value, operator }) =>
        operator === "in"
          ? Array.isArray(value) && value.includes(row[column])
          : row[column] === value,
      ),
    );

    if (!orderBy) {
      return rows;
    }

    return rows.sort((left, right) => {
      const a = left[orderBy.column];
      const b = right[orderBy.column];
      if (a === b) return 0;
      return orderBy.ascending
        ? String(a).localeCompare(String(b))
        : String(b).localeCompare(String(a));
    });
  }

  insertRow(table: string, row: TableRow) {
    const stored = {
      id: row.id ?? `${table}-${this.inserts.length + 1}`,
      created_at: row.created_at ?? "2026-09-05T00:00:00.000Z",
      resolved_at: row.resolved_at ?? null,
      ...row,
    };
    this.inserts.push({ table, row: stored });
    const key = table as keyof MockData;
    const existing = this.data[key] ?? [];
    this.data[key] = [...existing, stored];
    return stored;
  }
}

function createMockSupabase(overrides: MockData = {}) {
  return new MockSupabase({
    clients: [
      {
        id: "client-1",
        owner_id: "owner-1",
        name: "Mona",
        company_name: "Acme",
        email: "mona@example.com",
        phone: "+971501234567",
        preferred_language: "en",
      },
    ],
    invoices: [
      {
        id: "inv-1",
        owner_id: "owner-1",
        client_id: "client-1",
        invoice_number: "INV-001",
        amount: 1500,
        currency: "AED",
        status: "overdue",
        due_date: "2026-09-01",
        paid_date: null,
        paid_amount: 0,
        remaining_balance: 1500,
        payment_link: null,
      },
    ],
    payments: [],
    payment_plans: [],
    business_payment_settings: [],
    reminder_settings: [{ owner_id: "owner-1", timezone: "UTC" }],
    payment_promises: [],
    ai_conversations: [],
    ...overrides,
  });
}

describe("customer WhatsApp payment promises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateText.mockResolvedValue({ text: "fallback", finishReason: "stop", usage: {} });
  });

  it("records a clear English payment promise and skips model generation", async () => {
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");
    const supabase = createMockSupabase();

    const result = await runCustomerOrchestrator({
      supabase: supabase as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "I will pay tomorrow",
      sessionId: "session-1",
    });

    expect(result.reply).toContain("recorded your promise to pay invoice INV-001");
    expect(supabase.inserts.find((entry) => entry.table === "payment_promises")).toBeTruthy();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not create a promise for a vague statement", async () => {
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");
    const supabase = createMockSupabase();

    await runCustomerOrchestrator({
      supabase: supabase as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "I might pay tomorrow",
      sessionId: "session-2",
    });

    expect(supabase.inserts.find((entry) => entry.table === "payment_promises")).toBeFalsy();
    expect(generateText).toHaveBeenCalled();
  });

  it("asks which invoice the customer means when multiple invoices are unpaid", async () => {
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");
    const supabase = createMockSupabase({
      invoices: [
        {
          id: "inv-1",
          owner_id: "owner-1",
          client_id: "client-1",
          invoice_number: "INV-001",
          amount: 1500,
          currency: "AED",
          status: "overdue",
          due_date: "2026-09-01",
          paid_date: null,
          paid_amount: 0,
          remaining_balance: 1500,
          payment_link: null,
        },
        {
          id: "inv-2",
          owner_id: "owner-1",
          client_id: "client-1",
          invoice_number: "INV-002",
          amount: 750,
          currency: "AED",
          status: "sent",
          due_date: "2026-09-04",
          paid_date: null,
          paid_amount: 0,
          remaining_balance: 750,
          payment_link: null,
        },
      ],
    });

    const result = await runCustomerOrchestrator({
      supabase: supabase as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "I will pay tomorrow",
      sessionId: "session-3",
    });

    expect(result.reply).toContain("which invoice");
    expect(supabase.inserts.find((entry) => entry.table === "payment_promises")).toBeFalsy();
  });

  it("records a clear Arabic payment promise in Arabic", async () => {
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");
    const supabase = createMockSupabase({
      clients: [
        {
          id: "client-1",
          owner_id: "owner-1",
          name: "منى",
          company_name: "Acme",
          email: "mona@example.com",
          phone: "+971501234567",
          preferred_language: "ar",
        },
      ],
    });

    const result = await runCustomerOrchestrator({
      supabase: supabase as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "سأدفع غداً",
      sessionId: "session-4",
    });

    expect(result.reply).toContain("تم تسجيل تعهّدك");
    expect(supabase.inserts.find((entry) => entry.table === "payment_promises")).toBeTruthy();
  });
});
