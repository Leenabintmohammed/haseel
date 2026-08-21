import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getDashboardAnalytics,
  type DashboardAnalyticsOptions,
  type DashboardAnalyticsResult,
} from "./dashboard-analytics.server";

const DashboardAnalyticsInput = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  clientId: z.string().optional(),
  currency: z.string().optional(),
  invoiceStatus: z.array(z.string()).optional(),
  riskLevel: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const getDashboardAnalyticsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DashboardAnalyticsInput.parse(input))
  .handler(async ({ data, context }): Promise<DashboardAnalyticsResult> => {
    const options = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as DashboardAnalyticsOptions;
    return getDashboardAnalytics({ supabase: context.supabase, userId: context.userId }, options);
  });
