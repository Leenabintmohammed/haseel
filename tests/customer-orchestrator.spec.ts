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
  getDuelyBaseModelId: (...args: unknown[]) =>
    getDuelyBaseModelId(...args),
  getDuelyModelId: (...args: unknown[]) => getDuelyModelId(...args),
  hasAiProvider: (...args: unknown[]) => hasAiProvider(...args),
}));

type QueryResult = {
  data: unknown;
  error: unknown;
};

type TableRow = Record<string, unknown>;

type MockData = {
  clients?: TableRow[];
  invoices?: TableRow[];
  payments?: TableRow[];
  payment_plans?: TableRow[];
  business_payment_settings?: TableRow[];
  ai_conversations?: TableRow[];
};

class QueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;

  constructor(
    private readonly mock: MockSupabase,
    private readonly table: string,
  ) {}

  select(columns?: string) {
    this.mock.selects.push({ table: this.table, columns: columns ?? "*" });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    this.mock.filters.push({ table: this.table, column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  in() {
    return this;
  }

  maybeSingle() {
    const rows = this.mock.resolveRows(this.table, this.filters, this.orderBy);
    return Promise.resolve<QueryResult>({
      data: rows[0] ?? null,
      error: null,
    });
  }

  limit(count: number) {
    const rows = this.mock
      .resolveRows(this.table, this.filters, this.orderBy)
      .slice(0, count);
    return Promise.resolve<QueryResult>({
      data: rows,
      error: null,
    });
  }

  insert(row: unknown) {
    this.mock.inserts.push({ table: this.table, row });
    return Promise.resolve<QueryResult>({
      data: null,
      error: null,
    });
  }
}

class MockSupabase {
  inserts: Array<{ table: string; row: unknown }> = [];
  filters: Array<{ table: string; column: string; value: unknown }> = [];
  selects: Array<{ table: string; columns: string }> = [];

  constructor(private readonly data: MockData = {}) {}

  from(table: string) {
    return new QueryBuilder(this, table);
  }

  resolveRows(
    table: string,
    filters: Array<{ column: string; value: unknown }>,
    orderBy: { column: string; ascending: boolean } | null,
  ) {
    const rows = [...(this.data[table as keyof MockData] ?? [])].filter((row) =>
      filters.every(({ column, value }) => row[column] === value),
    );

    if (!orderBy) {
      return rows;
    }

    return rows.sort((left, right) => {
      const a = left[orderBy.column];
      const b = right[orderBy.column];
      if (a === b) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return orderBy.ascending
        ? String(a).localeCompare(String(b))
        : String(b).localeCompare(String(a));
    });
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
        paid_amount: null,
        remaining_balance: 1500,
        payment_link: null,
      },
    ],
    payments: [],
    payment_plans: [],
    business_payment_settings: [],
    ai_conversations: [{ owner_id: "owner-1", session_id: "session-1", role: "user", message: "Where is my invoice?" }],
    ...overrides,
  });
}

describe("runCustomerOrchestrator diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "secret-openai-key";
  });

  it("returns model response when generation succeeds", async () => {
    generateText.mockResolvedValue({
      text: "Your invoice is due tomorrow.",
      finishReason: "stop",
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      providerMetadata: { openai: { responseId: "resp_123", latencyMs: 12 } },
    });

    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");

    const result = await runCustomerOrchestrator({
      supabase: createMockSupabase() as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "Where is my invoice?",
      sessionId: "session-1",
    });

    expect(result.reply).toBe("Your invoice is due tomorrow.");
    expect(errorSpy).not.toHaveBeenCalledWith(
      "[Customer AI] Empty generation response",
      expect.anything(),
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "[Customer AI] Generation completed",
      expect.objectContaining({
        model: "gpt-4.1-mini",
        hasOpenAiApiKey: true,
        resultTextLength: "Your invoice is due tomorrow.".length,
      }),
    );
  });

  it("detects and surfaces empty model responses", async () => {
    generateText.mockResolvedValue({
      text: "   ",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
      providerMetadata: { openai: { responseId: "resp_empty" } },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");

    const result = await runCustomerOrchestrator({
      supabase: createMockSupabase() as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "Where is my invoice?",
      sessionId: "session-2",
    });

    expect(result.reply).toBe("AI_GENERATION_EMPTY");
    expect(errorSpy).toHaveBeenCalledWith(
      "[Customer AI] Empty generation response",
      expect.objectContaining({
        model: "gpt-4.1-mini",
        hasOpenAiApiKey: true,
        resultTextLength: 0,
        finishReason: "stop",
      }),
    );
  });

  it("logs generation errors safely without secrets or customer financial context", async () => {
    const error = new Error("provider failed");
    error.name = "ProviderError";
    error.cause = "network_reset";
    generateText.mockRejectedValue(error);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");

    await runCustomerOrchestrator({
      supabase: createMockSupabase() as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "Where is my invoice?",
      sessionId: "session-3",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[Customer AI] Generation failed",
      expect.objectContaining({
        name: "ProviderError",
        message: "provider failed",
        cause: "network_reset",
      }),
    );

    const serialized = JSON.stringify(errorSpy.mock.calls);
    expect(serialized).not.toContain("secret-openai-key");
    expect(serialized).not.toContain("INV-001");
    expect(serialized).not.toContain("1500");
  });
});

describe("runCustomerOrchestrator customer invoice safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses remaining balances only and reports separate outstanding totals by currency", async () => {
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");

    const result = await runCustomerOrchestrator({
      supabase: createMockSupabase({
        invoices: [
          {
            id: "inv-010",
            owner_id: "owner-1",
            client_id: "client-1",
            invoice_number: "INV-010",
            amount: 31200,
            currency: "SAR",
            status: "sent",
            due_date: "2026-09-10",
            paid_date: null,
            paid_amount: 0,
            remaining_balance: 31200,
            payment_link: null,
          },
          {
            id: "inv-015",
            owner_id: "owner-1",
            client_id: "client-1",
            invoice_number: "INV-015",
            amount: 818921,
            currency: "AED",
            status: "paid",
            due_date: "2026-09-12",
            paid_date: "2026-09-03",
            paid_amount: 818921,
            remaining_balance: 0,
            payment_link: null,
          },
          {
            id: "inv-020",
            owner_id: "owner-1",
            client_id: "client-1",
            invoice_number: "INV-020",
            amount: 100,
            currency: "SAR",
            status: "partial",
            due_date: "2026-09-14",
            paid_date: null,
            paid_amount: 50,
            remaining_balance: 50,
            payment_link: null,
          },
        ],
      }) as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "What is the total outstanding amount?",
      sessionId: "session-4",
    });

    expect(result.reply).toBe("AED 0 outstanding\nSAR 31,250 outstanding");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("provides the customer's invoice payment link when available", async () => {
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");

    const result = await runCustomerOrchestrator({
      supabase: createMockSupabase({
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
            paid_amount: null,
            remaining_balance: 1500,
            payment_link: "https://pay.example/inv-001",
          },
        ],
      }) as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "Is there a payment link?",
      sessionId: "session-5",
    });

    expect(result.reply).toBe(
      "Payment link for invoice INV-001: https://pay.example/inv-001",
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it("says no payment link is available and falls back to business payment instructions", async () => {
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");

    const result = await runCustomerOrchestrator({
      supabase: createMockSupabase({
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
            paid_amount: null,
            remaining_balance: 1500,
            payment_link: null,
          },
        ],
        business_payment_settings: [
          {
            owner_id: "owner-1",
            bank_name: "ADCB",
            account_name: "Acme LLC",
            account_number: "123456789",
            iban: "AE000000000000000123456",
            swift_bic: "ADCBAEAA",
            payment_instructions: "Use invoice number as reference",
          },
        ],
      }) as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "Is there a payment link?",
      sessionId: "session-6",
    });

    expect(result.reply).toBe(
      [
        "There is no payment link currently available.",
        "You can use these payment details instead:",
        "Bank: ADCB",
        "Account name: Acme LLC",
        "Account number: 123456789",
        "IBAN: AE000000000000000123456",
        "SWIFT/BIC: ADCBAEAA",
        "Instructions: Use invoice number as reference",
      ].join("\n"),
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not expose another customer's invoice or another business payment details", async () => {
    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");
    const supabase = createMockSupabase({
      invoices: [
        {
          id: "inv-own",
          owner_id: "owner-1",
          client_id: "client-1",
          invoice_number: "INV-OWN",
          amount: 200,
          currency: "AED",
          status: "sent",
          due_date: "2026-09-11",
          paid_date: null,
          paid_amount: 0,
          remaining_balance: 200,
          payment_link: "https://pay.example/own",
        },
        {
          id: "inv-other-client",
          owner_id: "owner-1",
          client_id: "client-2",
          invoice_number: "INV-OTHER",
          amount: 999,
          currency: "AED",
          status: "sent",
          due_date: "2026-09-11",
          paid_date: null,
          paid_amount: 0,
          remaining_balance: 999,
          payment_link: "https://pay.example/other-client",
        },
      ],
      business_payment_settings: [
        {
          owner_id: "owner-1",
          bank_name: "Allowed Bank",
          account_name: "Allowed Business",
          account_number: "111",
          iban: "AE111",
          swift_bic: "ALLOW1",
          payment_instructions: "Allowed instructions",
        },
        {
          owner_id: "owner-2",
          bank_name: "Blocked Bank",
          account_name: "Blocked Business",
          account_number: "999",
          iban: "AE999",
          swift_bic: "BLOCK1",
          payment_instructions: "Blocked instructions",
        },
      ],
    });

    const result = await runCustomerOrchestrator({
      supabase: supabase as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "Is there a payment link?",
      sessionId: "session-7",
    });

    expect(result.reply).toContain("https://pay.example/own");
    expect(result.reply).not.toContain("https://pay.example/other-client");
    expect(result.reply).not.toContain("Blocked Bank");
    expect(supabase.filters).toEqual(
      expect.arrayContaining([
        { table: "invoices", column: "owner_id", value: "owner-1" },
        { table: "invoices", column: "client_id", value: "client-1" },
        {
          table: "business_payment_settings",
          column: "owner_id",
          value: "owner-1",
        },
      ]),
    );
  });

  it("passes payment links and outstanding totals into model context for other questions", async () => {
    generateText.mockResolvedValue({
      text: "Here are your invoice details.",
      finishReason: "stop",
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      providerMetadata: { openai: { responseId: "resp_456" } },
    });

    const { runCustomerOrchestrator } = await import("../src/lib/customer-orchestrator.server");

    await runCustomerOrchestrator({
      supabase: createMockSupabase({
        invoices: [
          {
            id: "inv-1",
            owner_id: "owner-1",
            client_id: "client-1",
            invoice_number: "INV-001",
            amount: 500,
            currency: "AED",
            status: "partial",
            due_date: "2026-09-01",
            paid_date: null,
            paid_amount: 200,
            remaining_balance: 300,
            payment_link: "https://pay.example/inv-001",
          },
        ],
      }) as never,
      ownerId: "owner-1",
      clientId: "client-1",
      customerPhone: "971501234567",
      message: "Can you summarize my invoices?",
      sessionId: "session-8",
    });

    expect(generateText).toHaveBeenCalledTimes(1);
    const systemPrompt = generateText.mock.calls[0][0]?.system as string;
    expect(systemPrompt).toContain('"outstanding_totals_by_currency":[{"currency":"AED","outstanding":300}]');
    expect(systemPrompt).toContain('"payment_links":[{"invoice_id":"inv-1","invoice_number":"INV-001","payment_link":"https://pay.example/inv-001"}]');
  });
});
