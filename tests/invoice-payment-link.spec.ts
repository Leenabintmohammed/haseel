import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InvoicePaymentLink } from "../src/components/invoices/InvoicePaymentLink";

vi.mock("../src/lib/finance.server", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/finance.server")
  >("../src/lib/finance.server");

  return {
    ...actual,
    audit: vi.fn(async () => undefined),
    recalcInvoice: vi.fn(async () => null),
  };
});

const { executeTool } = await import("../src/lib/duely-tools.server");

type TableName =
  | "clients"
  | "invoices"
  | "invoice_items"
  | "company_policies"
  | "profiles";

type DatabaseState = Record<TableName, Record<string, unknown>[]>;

class MockSupabase {
  state: DatabaseState;

  constructor(seed?: Partial<DatabaseState>) {
    this.state = {
      clients: seed?.clients ? clone(seed.clients) : [],
      invoices: seed?.invoices ? clone(seed.invoices) : [],
      invoice_items: seed?.invoice_items ? clone(seed.invoice_items) : [],
      company_policies: seed?.company_policies
        ? clone(seed.company_policies)
        : [],
      profiles: seed?.profiles ? clone(seed.profiles) : [],
    };
  }

  from(table: TableName) {
    return new MockQuery(this.state, table);
  }
}

class MockQuery
  implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>
{
  private action: "select" | "insert" | "update" = "select";
  private filters: Array<{ column: string; value: unknown }> = [];
  private payload: Record<string, unknown> | Record<string, unknown>[] | null =
    null;
  private selectOptions:
    | {
        count?: string;
        head?: boolean;
      }
    | undefined;

  constructor(
    private readonly state: DatabaseState,
    private readonly table: TableName,
  ) {}

  select(
    _columns = "*",
    options?: {
      count?: string;
      head?: boolean;
    },
  ) {
    this.selectOptions = options;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.executeSingle(true));
  }

  single() {
    return Promise.resolve(this.executeSingle(false));
  }

  then<TResult1 = { data: unknown; error: { message: string } | null; count?: number | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown;
          error: { message: string } | null;
          count?: number | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private executeSingle(allowNull: boolean) {
    const result = this.execute();
    const rows = Array.isArray(result.data)
      ? result.data
      : result.data
        ? [result.data]
        : [];

    if (rows.length === 0) {
      return allowNull
        ? { data: null, error: null }
        : { data: null, error: { message: "Not found" } };
    }

    return { data: clone(rows[0]), error: null };
  }

  private execute() {
    const rows = this.filterRows();

    if (this.action === "insert") {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(
        (row, index) => normalizeInsertedRow(this.table, row ?? {}, this.state[this.table].length + index + 1),
      );
      this.state[this.table].push(...inserted);
      return { data: clone(inserted), error: null };
    }

    if (this.action === "update") {
      const updated = rows.map((row) => {
        Object.assign(row, this.payload ?? {});
        return clone(row);
      });
      return { data: updated, error: null };
    }

    if (this.selectOptions?.head && this.selectOptions.count === "exact") {
      return { data: null, error: null, count: rows.length };
    }

    return { data: clone(rows), error: null };
  }

  private filterRows() {
    return this.state[this.table].filter((row) =>
      this.filters.every(
        ({ column, value }) => row[column] === value,
      ),
    );
  }
}

function normalizeInsertedRow(
  table: TableName,
  row: Record<string, unknown>,
  index: number,
) {
  return {
    id: row.id ?? `${table}-${index}`,
    ...row,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeSupabase(seed?: Partial<DatabaseState>) {
  return new MockSupabase({
    clients: [
      {
        id: "client-1",
        owner_id: "owner-1",
        name: "ACME",
      },
    ],
    ...seed,
  });
}

const ctx = (supabase: MockSupabase) => ({
  supabase: supabase as never,
  userId: "owner-1",
  actor: "human" as const,
});

const createPayload = {
  client_id: "client-1",
  invoice_number: "INV-001",
  issue_date: "2026-09-05",
  due_date: "2026-09-20",
  currency: "AED",
  items: [{ description: "Consulting", quantity: 1, unit_price: 250 }],
};

describe("invoice payment link persistence", () => {
  it("creates an invoice without a payment link", async () => {
    const supabase = makeSupabase();

    const result = (await executeTool(
      "create_invoice",
      createPayload,
      ctx(supabase),
    )) as {
      invoice: { payment_link: string | null };
    };

    expect(result.invoice.payment_link).toBeNull();
    expect(supabase.state.invoices[0]?.payment_link).toBeNull();
  });

  it("creates an invoice with a trimmed payment link", async () => {
    const supabase = makeSupabase();

    const result = (await executeTool(
      "create_invoice",
      {
        ...createPayload,
        payment_link: "  https://example-payment-provider.com/pay/123  ",
      },
      ctx(supabase),
    )) as {
      invoice: { payment_link: string | null };
    };

    expect(result.invoice.payment_link).toBe(
      "https://example-payment-provider.com/pay/123",
    );
    expect(supabase.state.invoices[0]?.payment_link).toBe(
      "https://example-payment-provider.com/pay/123",
    );
  });

  it("stores null when the create payload sends a blank payment link", async () => {
    const supabase = makeSupabase();

    const result = (await executeTool(
      "create_invoice",
      {
        ...createPayload,
        payment_link: "   ",
      },
      ctx(supabase),
    )) as {
      invoice: { payment_link: string | null };
    };

    expect(result.invoice.payment_link).toBeNull();
    expect(supabase.state.invoices[0]?.payment_link).toBeNull();
  });

  it("adds a payment link when editing an invoice", async () => {
    const supabase = makeSupabase({
      invoices: [
        {
          id: "inv-1",
          owner_id: "owner-1",
          invoice_number: "INV-001",
          status: "draft",
          due_date: "2026-09-20",
          issue_date: "2026-09-05",
          amount: 250,
          paid_amount: 0,
          remaining_balance: 250,
          payment_link: null,
        },
      ],
    });

    const result = (await executeTool(
      "update_invoice",
      {
        invoice_id: "inv-1",
        payment_link: "https://example-payment-provider.com/pay/123",
      },
      ctx(supabase),
    )) as {
      invoice: { payment_link: string | null };
    };

    expect(result.invoice.payment_link).toBe(
      "https://example-payment-provider.com/pay/123",
    );
    expect(supabase.state.invoices[0]?.payment_link).toBe(
      "https://example-payment-provider.com/pay/123",
    );
  });

  it("changes an existing payment link when editing an invoice", async () => {
    const supabase = makeSupabase({
      invoices: [
        {
          id: "inv-1",
          owner_id: "owner-1",
          invoice_number: "INV-001",
          status: "draft",
          due_date: "2026-09-20",
          issue_date: "2026-09-05",
          amount: 250,
          paid_amount: 0,
          remaining_balance: 250,
          payment_link: "https://example-payment-provider.com/pay/old",
        },
      ],
    });

    const result = (await executeTool(
      "update_invoice",
      {
        invoice_id: "inv-1",
        payment_link: "https://example-payment-provider.com/pay/new",
      },
      ctx(supabase),
    )) as {
      invoice: { payment_link: string | null };
    };

    expect(result.invoice.payment_link).toBe(
      "https://example-payment-provider.com/pay/new",
    );
    expect(supabase.state.invoices[0]?.payment_link).toBe(
      "https://example-payment-provider.com/pay/new",
    );
  });

  it("removes a payment link when the edit payload clears it", async () => {
    const supabase = makeSupabase({
      invoices: [
        {
          id: "inv-1",
          owner_id: "owner-1",
          invoice_number: "INV-001",
          status: "draft",
          due_date: "2026-09-20",
          issue_date: "2026-09-05",
          amount: 250,
          paid_amount: 0,
          remaining_balance: 250,
          payment_link: "https://example-payment-provider.com/pay/old",
        },
      ],
    });

    const result = (await executeTool(
      "update_invoice",
      {
        invoice_id: "inv-1",
        payment_link: "   ",
      },
      ctx(supabase),
    )) as {
      invoice: { payment_link: string | null };
    };

    expect(result.invoice.payment_link).toBeNull();
    expect(supabase.state.invoices[0]?.payment_link).toBeNull();
  });
});

describe("invoice payment link display", () => {
  it("renders a clickable payment link when present", () => {
    const html = renderToStaticMarkup(
      createElement(InvoicePaymentLink, {
        paymentLink:
          "https://example-payment-provider.com/pay/123",
      }),
    );

    expect(html).toContain('href="https://example-payment-provider.com/pay/123"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(
      "https://example-payment-provider.com/pay/123",
    );
  });

  it("does not render an empty link when absent", () => {
    const html = renderToStaticMarkup(
      createElement(InvoicePaymentLink, {
        paymentLink: null,
      }),
    );

    expect(html).toBe("");
    expect(html).not.toContain("href=");
  });
});
