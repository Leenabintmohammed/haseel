import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const getDuelyModel = vi.fn(() => ({ modelId: "gpt-4.1-mini" }));
const getDuelyModelId = vi.fn(() => "gpt-4.1-mini");
const hasAiProvider = vi.fn(() => true);

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("../src/lib/ai-provider.server", () => ({
  getDuelyModel: (...args: unknown[]) => getDuelyModel(...args),
  getDuelyModelId: (...args: unknown[]) => getDuelyModelId(...args),
  hasAiProvider: (...args: unknown[]) => hasAiProvider(...args),
}));

type QueryResult = {
  data: unknown;
  error: unknown;
};

class MockSupabase {
  inserts: Array<{ table: string; row: unknown }> = [];

  from(table: string) {
    const mock = this;
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      in() {
        return this;
      },
      maybeSingle() {
        if (table === "clients") {
          return Promise.resolve<QueryResult>({
            data: {
              id: "client-1",
              name: "Mona",
              company_name: "Acme",
              email: "mona@example.com",
              phone: "+971501234567",
              preferred_language: "en",
            },
            error: null,
          });
        }
        return Promise.resolve<QueryResult>({
          data: null,
          error: null,
        });
      },
      limit() {
        if (table === "invoices") {
          return Promise.resolve<QueryResult>({
            data: [
              {
                id: "inv-1",
                invoice_number: "INV-001",
                amount: 1500,
                currency: "AED",
                status: "overdue",
                due_date: "2026-09-01",
                paid_date: null,
                paid_amount: null,
                remaining_balance: 1500,
              },
            ],
            error: null,
          });
        }
        if (table === "payments") {
          return Promise.resolve<QueryResult>({
            data: [],
            error: null,
          });
        }
        if (table === "payment_plans") {
          return Promise.resolve<QueryResult>({
            data: [],
            error: null,
          });
        }
        if (table === "ai_conversations") {
          return Promise.resolve<QueryResult>({
            data: [{ role: "user", message: "Where is my invoice?" }],
            error: null,
          });
        }
        return Promise.resolve<QueryResult>({
          data: [],
          error: null,
        });
      },
      insert(row: unknown) {
        mock.inserts.push({ table, row });
        return Promise.resolve<QueryResult>({
          data: null,
          error: null,
        });
      },
    };
  }
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
      supabase: new MockSupabase() as never,
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
      supabase: new MockSupabase() as never,
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
      supabase: new MockSupabase() as never,
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
