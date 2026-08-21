import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { computeClientRisk, type RiskResult } from "./finance.server";
import {
  computeDashboardAnalytics,
  fetchDashboardRows,
  type AgingBucket,
  type DashboardAnalyticsResult,
} from "./dashboard-analytics.server";

const workspaceInput = z.object({
  client_id: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().positive().max(100).optional(),
});
const clientFields = z.object({
  name: z.string().trim().min(1).max(200),
  company_name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(60).optional(),
  billing_address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];
type Plan = Database["public"]["Tables"]["payment_plans"]["Row"] & {
  payment_plan_installments: Database["public"]["Tables"]["payment_plan_installments"]["Row"][];
};
type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type ClientSummary = {
  total_invoiced: Record<string, number>;
  total_paid: Record<string, number>;
  invoice_count: number;
  payment_count: number;
  payment_plan_count: number;
  last_payment: string | null;
};
export type ClientWorkspaceData = {
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  plans: Plan[];
  risks: Record<string, RiskResult>;
  insights: Record<string, DashboardAnalyticsResult>;
  aging_by_currency: Record<string, Record<string, AgingBucket>>;
  summaries: Record<string, ClientSummary>;
  notifications: Notification[];
};

export const getClientWorkspaceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => workspaceInput.parse(value))
  .handler(async ({ data, context }): Promise<ClientWorkspaceData> => {
    const owner = context.userId;
    let query = context.supabase
      .from("clients")
      .select("*")
      .eq("owner_id", owner)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.client_id) query = query.eq("id", data.client_id);
    if (data.search)
      query = query.or(
        `name.ilike.%${data.search}%,company_name.ilike.%${data.search}%,email.ilike.%${data.search}%,phone.ilike.%${data.search}%`,
      );
    const { data: clients, error } = await query;
    if (error) throw new Error("Unable to load clients.");
    const ids = (clients ?? []).map((client) => client.id);
    if (!ids.length)
      return {
        clients: [],
        invoices: [],
        payments: [],
        plans: [],
        risks: {},
        insights: {},
        aging_by_currency: {},
        summaries: {},
        notifications: [],
      };
    const [invoicesResult, paymentsResult, plansResult, notificationsResult] = await Promise.all([
      context.supabase
        .from("invoices")
        .select("*")
        .eq("owner_id", owner)
        .in("client_id", ids)
        .order("due_date", { ascending: true }),
      context.supabase
        .from("payments")
        .select("*")
        .eq("owner_id", owner)
        .in("client_id", ids)
        .order("payment_date", { ascending: false }),
      context.supabase
        .from("payment_plans")
        .select("*, payment_plan_installments(*)")
        .eq("owner_id", owner)
        .in("client_id", ids)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("notifications")
        .select("*")
        .eq("owner_id", owner)
        .in("client_id", ids)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (
      invoicesResult.error ||
      paymentsResult.error ||
      plansResult.error ||
      notificationsResult.error
    )
      throw new Error("Unable to load client financial data.");
    // Fetch the owner-wide analytics dataset exactly once. Insight/risk/aging figures
    // per client are then derived in-memory (no per-client or per-currency queries),
    // avoiding an N+1 query pattern that made this page slow or unresponsive for
    // accounts with more than a handful of clients.
    const ownerRows = await fetchDashboardRows({ supabase: context.supabase, userId: owner }, 50);
    const riskEntries = ids.map((id) => {
      const invoices = ownerRows.invoices.filter((row) => row.client_id === id);
      const payments = ownerRows.payments.filter((row) => row.client_id === id);
      return [id, computeClientRisk(id, invoices, payments)] as const;
    });
    const insightEntries = ids.map(
      (id) => [id, computeDashboardAnalytics(ownerRows, { clientId: id, limit: 50 })] as const,
    );
    const agingEntries = ids.map((id) => {
      const currencies = [
        ...new Set(
          (invoicesResult.data ?? [])
            .filter((row) => row.client_id === id)
            .map((row) => row.currency),
        ),
      ];
      const values = currencies.map(
        (currency) =>
          [
            currency,
            computeDashboardAnalytics(ownerRows, { clientId: id, currency, limit: 50 }).aging,
          ] as const,
      );
      return [id, Object.fromEntries(values)] as const;
    });
    const add = (rows: { currency: string; amount: number }[]) =>
      rows.reduce<Record<string, number>>((result, row) => {
        result[row.currency] = (result[row.currency] ?? 0) + Number(row.amount);
        return result;
      }, {});
    const summaries = Object.fromEntries(
      ids.map((id) => {
        const invoices = (invoicesResult.data ?? []).filter(
          (row) => row.client_id === id && row.status !== "draft",
        );
        const payments = (paymentsResult.data ?? []).filter(
          (row) => row.client_id === id && !row.reversed_at,
        );
        return [
          id,
          {
            total_invoiced: add(invoices),
            total_paid: add(payments),
            invoice_count: invoices.length,
            payment_count: payments.length,
            payment_plan_count: (plansResult.data ?? []).filter((row) => row.client_id === id)
              .length,
            last_payment: payments[0]?.payment_date ?? null,
          },
        ];
      }),
    );
    return {
      clients: clients ?? [],
      invoices: invoicesResult.data ?? [],
      payments: paymentsResult.data ?? [],
      plans: (plansResult.data ?? []) as Plan[],
      risks: Object.fromEntries(riskEntries),
      insights: Object.fromEntries(insightEntries),
      aging_by_currency: Object.fromEntries(agingEntries),
      summaries,
      notifications: notificationsResult.data ?? [],
    };
  });

export const createClientFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => clientFields.parse(value))
  .handler(async ({ data, context }) => {
    const { executeTool } = await import("./duely-tools.server");
    return (await executeTool("create_client", data, {
      supabase: context.supabase,
      userId: context.userId,
      actor: "human",
    })) as any;
  });

export const updateClientFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) =>
    clientFields
      .extend({ client_id: z.string().uuid(), status: z.string().optional() })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { executeTool } = await import("./duely-tools.server");
    return (await executeTool("update_client", data, {
      supabase: context.supabase,
      userId: context.userId,
      actor: "human",
    })) as any;
  });
