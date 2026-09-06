import { z } from "zod";

export const PaymentPlanFrequencySchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
]);

export type PaymentPlanFrequency =
  z.infer<typeof PaymentPlanFrequencySchema>;

export const CustomerActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request_payment_plan"),
    invoice_id: z.string().optional(),
    invoice_number: z.string().optional(),
    installment_count: z.number().int().min(2).max(60),
    frequency: PaymentPlanFrequencySchema,
    start_date: z.string().optional(),
    reason: z.string().optional(),
  }),

  z.object({
    action: z.literal("request_discount"),
    invoice_id: z.string().optional(),
    invoice_number: z.string().optional(),
    discount_type: z.enum(["percentage", "fixed"]),
    discount_value: z.number().positive(),
    reason: z.string().optional(),
  }),

  z.object({
    action: z.literal("promise_to_pay"),
    invoice_id: z.string().optional(),
    invoice_number: z.string().optional(),
    promise_date: z.string(),
  }),
]);

export type CustomerAction =
  z.infer<typeof CustomerActionSchema>;

export type CustomerInvoice = {
  id: string;
  invoice_number: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  due_date: string | null;
  paid_date: string | null;
  paid_amount: number | null;
  remaining_balance: number | null;
  payment_link: string | null;
};

export type CustomerPayment = {
  id: string;
  invoice_id: string | null;
  amount: number | null;
  currency: string | null;
  payment_date: string | null;
  payment_method: string | null;
  reference: string | null;
};

export type CustomerPlan = {
  id: string;
  invoice_id: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  currency: string | null;
  installment_count: number | null;
  frequency: string | null;
  start_date: string | null;
  status: string | null;
};

export type DiscountRequestState = {
  id: string;
  invoice_id: string | null;
  client_id: string | null;
  requested_amount: number | null;
  requested_discount_amount: number | null;
  requested_discount_percent: number | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  owner_response: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type PaymentPlanRequestState = {
  id: string;
  invoice_id: string | null;
  client_id: string | null;
  requested_installment_count: number | null;
  requested_frequency: string | null;
  requested_start_date: string | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  owner_response: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type BusinessPaymentSettings = {
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  iban: string | null;
  swift_bic: string | null;
  payment_instructions: string | null;
};

export type CustomerRecord = {
  id: string;
  name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_language: string | null;
};

export type CustomerContext = {
  customer: CustomerRecord;
  invoices: CustomerInvoice[];
  payments: CustomerPayment[];
  payment_plans: CustomerPlan[];
  discount_requests: DiscountRequestState[];
  payment_plan_requests: PaymentPlanRequestState[];
  payment_methods: BusinessPaymentSettings | null;
  outstanding_totals_by_currency: Array<{
    currency: string;
    outstanding: number;
  }>;
};

export type PolicyResult =
  | {
      allowed: true;
      code: "eligible";
    }
  | {
      allowed: false;
      code: string;
      message: string;
    };

export type AgentToolResult = Record<string, unknown>;
