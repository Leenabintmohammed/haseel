import { defineEventHandler, getHeader, getRouterParam, setResponseHeader, setResponseStatus } from "h3";
import type { H3Event } from "h3";
import { createClient } from "@supabase/supabase-js";
import { generateInvoicePDF } from "@/lib/pdf-generator.server";

export default defineEventHandler(async (event: H3Event) => {
  const token = getHeader(event, "authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !supabaseUrl || !supabaseKey) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await authClient.auth.getUser(token);
  const userId = userData.user?.id;
  if (!userId) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  const invoiceId = getRouterParam(event, "invoiceId");
  if (!invoiceId) {
    setResponseStatus(event, 400);
    return { error: "invoiceId is required" };
  }

  const supabase = authClient;
  const ctx = { supabase, userId };

  // Fetch invoice to verify ownership and get PDF
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("pdf_url, id, invoice_number")
    .eq("id", invoiceId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    setResponseStatus(event, 404);
    return { error: "Invoice not found" };
  }

  // Generate PDF
  setResponseHeader(event, "Content-Type", "application/pdf");
  setResponseHeader(event, "Content-Disposition", `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);

  // Re-generate PDF for response
  const { data: fullInvoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!fullInvoice) {
    setResponseStatus(event, 404);
    return { error: "Invoice not found" };
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("description, quantity, unit_price, line_total")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, address")
    .eq("id", userId)
    .maybeSingle();

  const { data: client } = await supabase
    .from("clients")
    .select("name, email")
    .eq("id", fullInvoice.client_id)
    .eq("owner_id", userId)
    .maybeSingle();

  const pdfBytes = await generateInvoicePDF({
    invoice_number: fullInvoice.invoice_number,
    issue_date: fullInvoice.issue_date ? fullInvoice.issue_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    due_date: fullInvoice.due_date ? fullInvoice.due_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    client_name: client?.name,
    client_email: client?.email,
    company_name: profile?.company_name,
    company_address: profile?.address,
    currency: fullInvoice.currency,
    amount: fullInvoice.amount,
    subtotal: fullInvoice.subtotal,
    discount: fullInvoice.discount || 0,
    tax: fullInvoice.tax || 0,
    paid_amount: fullInvoice.paid_amount || 0,
    items: (items || []).map((item: any) => ({
      description: item.description,
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      line_total: item.line_total || 0,
    })),
    notes: fullInvoice.notes,
  });

  return new Response(pdfBytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${fullInvoice.invoice_number}.pdf"`,
    },
  });
});


