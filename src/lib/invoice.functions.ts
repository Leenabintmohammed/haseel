import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const item = z.object({
  description: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
});

const invoiceInput = z.object({
  client_id: z.string().uuid(),
  invoice_number: z.string().trim().min(1).optional(),
  issue_date: z.string().min(1),
  due_date: z.string().min(1),
  currency: z.string().trim().min(1).max(3),
  items: z.array(item).min(1),
  discount_type: z.enum(["none", "fixed", "percentage"]).optional(),
  discount_value: z.coerce.number().nonnegative().optional(),
  tax_rate: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export const createInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => invoiceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { executeTool } = await import("./duely-tools.server");
    return (await executeTool("create_invoice", data, { supabase: context.supabase, userId: context.userId, actor: "human" })) as any;
  });

export const recordInvoicePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      invoice_id: z.string().uuid(),
      amount: z.coerce.number().positive(),
      payment_date: z.string().min(1),
      payment_method: z.string().trim().optional(),
      reference: z.string().trim().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { executeTool } = await import("./duely-tools.server");
    return (await executeTool("record_payment", data, { supabase: context.supabase, userId: context.userId, actor: "human" })) as any;
  });