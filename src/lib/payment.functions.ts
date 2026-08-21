import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { getDashboardAnalytics, type DashboardAnalyticsResult } from "./dashboard-analytics.server";

const input = z.object({ payment_id: z.string().uuid().optional(), limit: z.number().int().positive().max(200).optional() });
type Payment = Database["public"]["Tables"]["payments"]["Row"];
type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Plan = Database["public"]["Tables"]["payment_plans"]["Row"] & {
  payment_plan_installments: Database["public"]["Tables"]["payment_plan_installments"]["Row"][];
};

export type PaymentWorkspaceData = {
  analytics: DashboardAnalyticsResult;
  currencyAnalytics: Record<string, Pick<DashboardAnalyticsResult, "aging" | "collections" | "trends" | "summary">>;
  payments: Payment[];
  invoices: Invoice[];
  clients: Client[];
  plans: Plan[];
};

export const getPaymentWorkspaceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => input.parse(value))
  .handler(async ({ data, context }): Promise<PaymentWorkspaceData> => {
    const owner = context.userId;
    const analytics = await getDashboardAnalytics({ supabase: context.supabase, userId: owner }, { limit: data.limit ?? 50 });
    let paymentsQuery = context.supabase
      .from("payments")
      .select("*")
      .eq("owner_id", owner)
      .order("payment_date", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.payment_id) paymentsQuery = paymentsQuery.eq("id", data.payment_id);

    const [paymentsResult, invoicesResult, plansResult] = await Promise.all([
      paymentsQuery,
      context.supabase.from("invoices").select("*").eq("owner_id", owner).order("due_date", { ascending: true }),
      context.supabase
        .from("payment_plans")
        .select("*, payment_plan_installments(*)")
        .eq("owner_id", owner)
        .order("created_at", { ascending: false }),
    ]);
    if (paymentsResult.error || invoicesResult.error || plansResult.error) throw new Error("Unable to load collection data.");

    const currencies = [...new Set((invoicesResult.data ?? []).map((invoice) => invoice.currency))];
    const currencyAnalyticsEntries = await Promise.all(
      currencies.map(async (currency) => [
        currency,
        await getDashboardAnalytics({ supabase: context.supabase, userId: owner }, { currency, limit: data.limit ?? 50 }),
      ] as const),
    );

    const ids = new Set<string>();
    for (const payment of paymentsResult.data ?? []) if (payment.client_id) ids.add(payment.client_id);
    for (const invoice of invoicesResult.data ?? []) ids.add(invoice.client_id);
    for (const plan of plansResult.data ?? []) ids.add(plan.client_id);
    const clientsResult = ids.size
      ? await context.supabase.from("clients").select("*").eq("owner_id", owner).in("id", [...ids])
      : { data: [], error: null };
    if (clientsResult.error) throw new Error("Unable to load collection clients.");

    return {
      analytics,
      currencyAnalytics: Object.fromEntries(currencyAnalyticsEntries),
      payments: paymentsResult.data ?? [],
      invoices: invoicesResult.data ?? [],
      clients: clientsResult.data ?? [],
      plans: (plansResult.data ?? []) as Plan[],
    };
  });