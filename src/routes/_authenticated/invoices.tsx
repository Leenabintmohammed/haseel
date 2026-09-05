import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  FilePlus2,
  Filter,
  Search,
  Sparkles,
  X,
Mail,
MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoicePaymentLink } from "@/components/invoices/InvoicePaymentLink";
import { StatusBadge } from "@/components/duely/StatusBadge";
import {
  useClients,
  useInvoiceDetails,
  useInvoices,
  isOverdue,
  type InvoiceRow,
} from "@/lib/queries";
import { formatMoney, formatDate, daysOverdue } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useDuely } from "@/lib/duely-context";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { sendInvoiceFn } from "@/lib/invoice.functions";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Haseel" },
      { name: "description", content: "Manage, monitor and collect your receivables." },
    ],
  }),
  component: InvoicesPage,
});

const statuses = [
  "all",
  "draft",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
] as const;
type StatusFilter = (typeof statuses)[number];

const displayMoney = (value: number, currency: string, lang: "en" | "ar") =>
  formatMoney(value, currency, lang);
const isNestedAction = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("button,a,input,select,textarea"));

function InvoicesPage() {
  const { lang } = useI18n();
  const { setPage, setFocus, selection, toggleSelected, setSelection, setPrefill, setAiOpen } =
    useDuely();
  const queryClient = useQueryClient();
  const invoices = useInvoices();
  const clients = useClients();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [actionError, setActionError] = useState("");
  useEffect(() => setPage("invoices"), [setPage]);

  const rows = (invoices.data ?? []) as unknown as InvoiceRow[];
  const list = useMemo(
    () =>
      rows.filter((invoice) => {
        const term = search.trim().toLowerCase();
        const haystack =
          `${invoice.invoice_number} ${invoice.clients?.name ?? ""} ${invoice.clients?.company_name ?? ""}`.toLowerCase();
        const statusMatch =
          filter === "all" ||
          (filter === "overdue" ? isOverdue(invoice) : invoice.status === filter);
        return (
          statusMatch &&
          (!clientFilter || invoice.client_id === clientFilter) &&
          (!term || haystack.includes(term))
        );
      }),
    [rows, filter, search, clientFilter],
  );
  const currencies = [...new Set(rows.map((row) => row.currency))];
  const sum = (key: "amount" | "remaining_balance" | "paid_amount", subset = rows) =>
    subset.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const totalLabel = (value: number) =>
    currencies.length === 1 ? displayMoney(value, currencies[0]!, lang) : "Multiple currencies";
  const overdueRows = rows.filter(isOverdue);
  const count = (value: StatusFilter) =>
    value === "all"
      ? rows.length
      : value === "overdue"
        ? overdueRows.length
        : rows.filter((row) => row.status === value).length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invoices"] });
  const downloadPdf = async (invoice: InvoiceRow) => {
    setActionError("");
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      setActionError("Your session has expired. Please sign in again.");
      return;
    }
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/pdf`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `invoice-${invoice.invoice_number}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Unable to download the invoice PDF.");
    }
  };
  const select = (row: InvoiceRow) => {
    setSelectedId(row.id);
    setFocus({
      type: "invoice",
      id: row.id,
      summary: `${row.invoice_number} · ${row.clients?.name ?? ""}`,
    });
  };

  return (
    <div className="space-y-6 p-5 sm:p-7 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-primary">Receivables</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage, monitor and collect your receivables.
          </p>
        </div>
        <Button
          onClick={() => {
            setPrefill("Create an invoice. Ask me for the client, due date and line items.");
            setAiOpen(true);
          }}
        >
          <Sparkles className="size-4" /> Ask Haseel
        </Button>
      </div>
      {actionError && (
        <div
          role="alert"
          className="flex justify-between rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span>{actionError}</span>
          <button aria-label="Dismiss error" onClick={() => setActionError("")}>
            <X className="size-4" />
          </button>
        </div>
      )}
      {invoices.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-card p-8 text-center">
          <p>Unable to load invoices.</p>
          <Button className="mt-4" variant="outline" onClick={() => invoices.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {(
              [
                ["Total Invoiced", sum("amount"), FilePlus2],
                ["Outstanding", sum("remaining_balance"), CircleDollarSign],
                ["Overdue", sum("remaining_balance", overdueRows), CalendarDays],
                ["Paid", sum("paid_amount"), Check],
              ] as const
            ).map(([label, value, Icon]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span className="text-xs">{label}</span>
                  <Icon className="size-4 text-primary" />
                </div>
                {invoices.isLoading ? (
                  <div className="mt-3 h-7 w-28 animate-pulse rounded bg-secondary" />
                ) : (
                  <p className="mt-2 truncate text-lg font-semibold">{totalLabel(value)}</p>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-border pb-1">
            {statuses.map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={cn(
                  "shrink-0 border-b-2 px-2 py-2 text-xs font-medium capitalize",
                  filter === status
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {status.replace("_", " ")}{" "}
                <span className="ms-1 text-[10px] opacity-60">{count(status)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
            <label className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-border px-3 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoice or client"
                className="w-full bg-transparent py-2 outline-none placeholder:text-muted-foreground"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 text-sm">
              <Filter className="size-4 text-muted-foreground" />
              <select
                value={clientFilter}
                onChange={(event) => setClientFilter(event.target.value)}
                className="bg-transparent py-2 outline-none"
              >
                <option value="">All clients</option>
                {(clients.data ?? []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            {(search || clientFilter || filter !== "all") && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setClientFilter("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            )}
            <span className="self-center text-xs text-muted-foreground">{list.length} results</span>
          </div>
          {invoices.isLoading ? (
            <div className="rounded-2xl border border-border bg-card">
              {[1, 2, 3, 4].map((row) => (
                <div
                  key={row}
                  className="h-16 animate-pulse border-b border-border bg-secondary/30"
                />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-14 text-center">
              <FilePlus2 className="mx-auto size-8 text-primary" />
              <p className="mt-4 font-medium">No invoices yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first invoice to start tracking receivables.
              </p>
              <Button
                className="mt-5"
                onClick={() => {
                  setPrefill("Create an invoice. Ask me for the client, due date and line items.");
                  setAiOpen(true);
                }}
              >
                <Sparkles className="size-4" /> Ask Haseel
              </Button>
            </div>
          ) : (
            <InvoiceList
              rows={list}
              lang={lang}
              {...(selectedId ? { selectedId } : {})}
              onSelect={select}
              onPdf={downloadPdf}
              selection={selection}
              onToggle={(id) =>
                toggleSelected({
                  type: "invoice",
                  id,
                  label: `Invoice · ${rows.find((row) => row.id === id)?.invoice_number ?? id.slice(0, 8)}`,
                })
              }
            />
          )}
          {selection.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft/30 px-4 py-3">
              <p className="text-sm">
                <span className="font-medium text-primary">{selection.length}</span> records
                selected for Haseel.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setPrefill(
                      "Analyze the selected invoice records and tell me what requires attention.",
                    );
                    setAiOpen(true);
                  }}
                >
                  Ask Haseel
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelection([])}>
                  Clear
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {selectedId && (
        <InvoiceDrawer
          invoiceId={selectedId}
          lang={lang}
          onClose={() => setSelectedId(undefined)}
          onPdf={downloadPdf}
          onAsk={(text) => {
            setPrefill(text);
            setAiOpen(true);
          }}
        />
      )}
    </div>
  );
}

function InvoiceList({
  rows,
  lang,
  selectedId,
  onSelect,
  onPdf,
  selection,
  onToggle,
}: {
  rows: InvoiceRow[];
  lang: "en" | "ar";
  selectedId?: string;
  onSelect: (row: InvoiceRow) => void;
  onPdf: (row: InvoiceRow) => void;
  selection: { type: string; id: string }[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="hidden grid-cols-[1.15fr_1.3fr_.9fr_.9fr_1fr_1fr_1fr_auto] gap-3 border-b border-border px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
        <span>Invoice</span>
        <span>Client</span>
        <span>Issue date</span>
        <span>Due date</span>
        <span>Amount</span>
        <span>Remaining</span>
        <span>Status</span>
        <span />
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          role="row"
          tabIndex={0}
          aria-selected={selection.some((item) => item.type === "invoice" && item.id === row.id)}
          onClick={(event) => {
            if (!isNestedAction(event.target)) onToggle(row.id);
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !isNestedAction(event.target)) {
              event.preventDefault();
              onToggle(row.id);
            }
          }}
          className={cn(
            "grid gap-3 border-s-2 border-b border-border px-4 py-4 last:border-0 md:grid-cols-[1.15fr_1.3fr_.9fr_.9fr_1fr_1fr_1fr_auto] md:items-center",
            selection.some((item) => item.type === "invoice" && item.id === row.id)
              ? "border-s-primary bg-primary-soft/30"
              : "border-s-transparent",
            selectedId === row.id && "ring-1 ring-primary/20",
          )}
        >
          <button onClick={() => onSelect(row)} className="min-w-0 text-start">
            <p className="truncate text-sm font-semibold">{row.invoice_number}</p>
            <p className="truncate text-xs text-muted-foreground md:hidden">
              {row.clients?.name ?? "—"}
            </p>
          </button>
          <p className="truncate text-sm text-muted-foreground">
            {row.clients?.company_name || row.clients?.name || "—"}
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(row.issue_date, lang)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(row.due_date, lang)}
            {isOverdue(row) && (
              <span className="ms-1 text-destructive">{daysOverdue(row.due_date)}d</span>
            )}
          </p>
          <p className="text-sm font-semibold">
            {displayMoney(Number(row.amount), row.currency, lang)}
            <span className="ms-1 text-[10px] font-normal text-muted-foreground">
              {row.currency}
            </span>
          </p>
          <p className="text-sm">
            {displayMoney(Number(row.remaining_balance), row.currency, lang)}
          </p>
          <div>
            <StatusBadge status={isOverdue(row) ? "overdue" : row.status} />
            <span className="mt-1 block text-[10px] text-muted-foreground">Risk —</span>
          </div>
          <div className="flex justify-end gap-1">
            <button
              aria-label={`Download ${row.invoice_number} PDF`}
              onClick={() => onPdf(row)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            >
              <ArrowDownToLine className="size-4" />
            </button>
            <button
              aria-label={`Open ${row.invoice_number}`}
              onClick={() => onSelect(row)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function InvoiceDrawer({
  invoiceId,
  lang,
  onClose,
  onPdf,
  onAsk,
}: {
  invoiceId: string;
  lang: "en" | "ar";
  onClose: () => void;
  onPdf: (row: InvoiceRow) => void;
  onAsk: (text: string) => void;
}) {
  const details = useInvoiceDetails(invoiceId);
  const invoice = details.data?.invoice as InvoiceRow | undefined;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-foreground/30"
      role="dialog"
      aria-modal="true"
    >
      <button aria-label="Close invoice details" className="absolute inset-0" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-s border-border bg-surface shadow-2xl">
        <header className="flex items-start justify-between border-b border-border p-5">
          <div>
            {invoice ? (
              <>
                <p className="text-sm text-primary">{invoice.invoice_number}</p>
                <h2 className="mt-1 text-xl font-semibold">{invoice.clients?.name ?? "Client"}</h2>
                <div className="mt-2">
                  <StatusBadge status={isOverdue(invoice) ? "overdue" : invoice.status} />
                </div>
              </>
            ) : (
              <div className="h-16 w-48 animate-pulse rounded bg-secondary" />
            )}
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-5" />
          </button>
        </header>
        {details.isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded bg-secondary" />
            ))}
          </div>
        ) : details.isError || !details.data || !invoice ? (
          <p className="p-6 text-sm text-destructive">Unable to load invoice details.</p>
        ) : (
          <div className="duely-scroll flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Total", invoice.amount],
                ["Paid", invoice.paid_amount],
                ["Remaining", invoice.remaining_balance],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{String(label)}</p>
                  <p className="mt-1 text-sm font-semibold">
                    {displayMoney(Number(value), invoice.currency, lang)}
                  </p>
                </div>
              ))}
            </div>
<InvoiceDeliveryActions
  invoice={invoice}
  onPdf={onPdf}
  onAsk={onAsk}
/>
<InvoicePaymentLink
  paymentLink={invoice.payment_link}
/>
<DetailSection title="Line items">
              {details.data.items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between border-b border-border py-3 text-sm"
                >
                  <span>
                    {item.description}{" "}
                    <span className="text-muted-foreground">× {item.quantity}</span>
                  </span>
                  <span>{displayMoney(Number(item.line_total), invoice.currency, lang)}</span>
                </div>
              ))}
            </DetailSection>
            <DetailSection title="Payments">
              {details.data.payments.length ? (
                details.data.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex justify-between border-b border-border py-3 text-sm"
                  >
                    <span>
                      {formatDate(payment.payment_date, lang)}
                      {payment.reversed_at && (
                        <span className="ms-2 text-destructive">Reversed</span>
                      )}
                    </span>
                    <span>{displayMoney(Number(payment.amount), payment.currency, lang)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              )}
            </DetailSection>
            {details.data.plan && (
              <DetailSection title="Payment plan">
                <p className="text-sm">
                  {displayMoney(
                    Number(details.data.plan.total_amount),
                    details.data.plan.currency,
                    lang,
                  )}{" "}
                  · {details.data.plan.status}
                </p>
                {(details.data.plan.payment_plan_installments ?? []).map(
                  (installment: {
                    id: string;
                    seq: number;
                    due_date: string;
                    amount: number;
                    status: string;
                  }) => (
                    <div
                      key={installment.id}
                      className="flex justify-between border-b border-border py-2 text-sm"
                    >
                      <span>
                        Installment {installment.seq} · {formatDate(installment.due_date, lang)}
                      </span>
                      <span>
                        {displayMoney(
                          Number(installment.amount),
                          details.data!.plan!.currency,
                          lang,
                        )}{" "}
                        · {installment.status}
                      </span>
                    </div>
                  ),
                )}
              </DetailSection>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function InvoiceDeliveryActions({
  invoice,
  onPdf,
  onAsk,
}: {
  invoice: InvoiceRow;
  onPdf: (row: InvoiceRow) => void;
  onAsk: (text: string) => void;
}) {
  const queryClient = useQueryClient();

  const [sending, setSending] = useState<
    "email" | "whatsapp" | null
  >(null);

  const [feedback, setFeedback] = useState("");

  const send = async (
    channel: "email" | "whatsapp",
  ) => {
    setSending(channel);
    setFeedback("");

    try {
      const result = await sendInvoiceFn({
        data: {
          invoice_id: invoice.id,
          channel,
        },
      });

      const response = result as {
        error?: string;
        message?: string;
      };

      if (response.error) {
        setFeedback(
          response.message ??
            response.error ??
            "Unable to send the invoice.",
        );
        return;
      }

      setFeedback(
        channel === "whatsapp"
          ? "Invoice sent by WhatsApp."
          : "Invoice sent by email.",
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["invoices"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["invoice", invoice.id],
        }),
      ]);
    } catch {
      setFeedback(
        "Unable to send the invoice.",
      );
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="mt-5 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={sending !== null}
          onClick={() => send("email")}
        >
          <Mail className="size-4" />
          {sending === "email"
            ? "Sending…"
            : "Email"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={sending !== null}
          onClick={() => send("whatsapp")}
        >
          <MessageCircle className="size-4" />
          {sending === "whatsapp"
            ? "Sending…"
            : "WhatsApp"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={
            Number(invoice.remaining_balance) <= 0
          }
          onClick={() =>
            onAsk(
              `Record a payment against invoice ${invoice.invoice_number} for ${
                invoice.clients?.name ?? "this client"
              }.`,
            )
          }
        >
          <Sparkles className="size-4" />
          Record payment
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPdf(invoice)}
        >
          <ArrowDownToLine className="size-4" />
          PDF
        </Button>
      </div>

      {feedback && (
        <p className="text-xs text-muted-foreground">
          {feedback}
        </p>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
