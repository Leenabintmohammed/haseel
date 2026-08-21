import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  Filter,
  Search,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/duely/StatusBadge";
import { getPaymentWorkspaceFn, type PaymentWorkspaceData } from "@/lib/payment.functions";
import { formatDate, formatMoney } from "@/lib/format";
import { useDuely } from "@/lib/duely-context";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Haseel" },
      { name: "description", content: "Track collections, payment behavior and receivables." },
    ],
  }),
  component: PaymentsPage,
});

const pageSize = 25;
const money = (value: number | null | undefined, currency: string, lang: "en" | "ar") =>
  formatMoney(value, currency, lang);
const grouped = (
  values: Record<
    string,
    {
      totalCollected?: number | null;
      outstandingReceivables?: number | null;
      overdueReceivables?: number | null;
    }
  >,
  key: "totalCollected" | "outstandingReceivables" | "overdueReceivables",
  lang: "en" | "ar",
) =>
  Object.entries(values)
    .map(([currency, summary]) => money(summary[key], currency, lang))
    .join(" · ") || "—";
const statusOf = (payment: PaymentWorkspaceData["payments"][number]) =>
  payment.reversed_at ? "reversed" : "recorded";
const clientName = (data: PaymentWorkspaceData, clientId: string | null) => {
  const client = data.clients.find((row) => row.id === clientId);
  return client?.company_name || client?.name || "Unassigned client";
};
const isNestedAction = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("button,a,input,select,textarea"));

function PaymentsPage() {
  const { lang } = useI18n();
  const {
    setPage: setAppPage,
    setFocus,
    setPrefill,
    setAiOpen,
    selection,
    toggleSelected,
    setSelection,
  } = useDuely();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["payment_workspace"],
    queryFn: () => getPaymentWorkspaceFn({ data: { limit: 200 } }),
  });
  const data = query.data;
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("date");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  useEffect(() => setAppPage("payments"), [setAppPage]);
  const currencies = data ? [...new Set(data.payments.map((row) => row.currency))] : [];
  const methods = data
    ? [...new Set(data.payments.map((row) => row.payment_method).filter(Boolean) as string[])]
    : [];
  const filtered = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.payments
      .filter((payment) => {
        const haystack =
          `${payment.reference ?? ""} ${payment.id} ${clientName(data, payment.client_id)}`.toLowerCase();
        return (
          (!term || haystack.includes(term)) &&
          (clientFilter === "all" || payment.client_id === clientFilter) &&
          (currency === "all" || payment.currency === currency) &&
          (status === "all" || statusOf(payment) === status) &&
          (method === "all" || payment.payment_method === method) &&
          (!from || payment.payment_date >= from) &&
          (!to || payment.payment_date <= to)
        );
      })
      .sort((a, b) =>
        sort === "amount"
          ? Number(b.amount) - Number(a.amount)
          : sort === "client"
            ? clientName(data, a.client_id).localeCompare(clientName(data, b.client_id))
            : b.payment_date.localeCompare(a.payment_date),
      );
  }, [data, search, clientFilter, currency, status, method, from, to, sort]);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const visibleSelection = visible.filter((payment) =>
    selection.some((item) => item.type === "payment" && item.id === payment.id),
  );
  const allVisibleSelected = visible.length > 0 && visibleSelection.length === visible.length;
  const toggleVisible = () => {
    if (allVisibleSelected) {
      setSelection(
        selection.filter(
          (item) => !(item.type === "payment" && visible.some((payment) => payment.id === item.id)),
        ),
      );
    } else {
      visible.forEach((payment) => {
        if (!selection.some((item) => item.type === "payment" && item.id === payment.id)) {
          toggleSelected({ type: "payment", id: payment.id });
        }
      });
    }
  };
  const ask = (text: string) => {
    setPrefill(text);
    setAiOpen(true);
  };
  const selectPayment = (id: string) => {
    const payment = data?.payments.find((row) => row.id === id);
    if (!payment) return;
    setSelectedId(id);
    setFocus({
      type: "payment",
      id,
      summary: `${money(payment.amount, payment.currency, lang)} · ${clientName(data!, payment.client_id)}`,
    });
  };
  const clearFilters = () => {
    setSearch("");
    setClientFilter("all");
    setCurrency("all");
    setStatus("all");
    setMethod("all");
    setFrom("");
    setTo("");
    setSort("date");
    setPage(0);
  };
  return (
    <div className="space-y-6 p-5 sm:p-7 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-primary">Collection Center</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Payments &amp; Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track collections, payment behavior and receivables.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              document.getElementById("payment-search")?.focus();
            }}
          >
            <Search className="size-4" /> Search
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              document.getElementById("payment-filters")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <Filter className="size-4" /> Filters
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPrefill("Record a payment. Ask me for the client, invoice and amount.");
              setAiOpen(true);
            }}
          >
            <Sparkles className="size-4" /> Ask Haseel
          </Button>
        </div>
      </header>
      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          <Kpis data={data} lang={lang} />
          <Overview
            data={data}
            lang={lang}
            currency={currency === "all" ? currencies[0] : currency}
          />
          <Plans
            data={data}
            lang={lang}
            onSelect={(id) => {
              setFocus({ type: "payment_plan", id, summary: "Payment plan" });
              toggleSelected({ type: "payment_plan", id });
              ask("Show me the details and next action for this payment plan.");
            }}
          />
          <Signals
            data={data}
            lang={lang}
            onInvoice={(id) => {
              setFocus({ type: "invoice", id, summary: "Overdue invoice" });
              navigate({ to: "/invoices" });
            }}
            onClient={(id) => {
              setFocus({ type: "client", id, summary: clientName(data, id) });
              toggleSelected({ type: "client", id });
              ask(`Summarize ${clientName(data, id)}'s payment behavior and collection exposure.`);
            }}
          />
          <section id="payment-filters" className="space-y-3">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3">
              <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-input px-3 text-sm">
                <Search className="size-4 text-muted-foreground" />
                <Input
                  id="payment-search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Search payment, client or reference"
                  className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
                />
              </label>
              <Select value={clientFilter} onChange={setClientFilter} label="Client">
                <option value="all">All clients</option>
                {data.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name || client.name}
                  </option>
                ))}
              </Select>
              <Select value={currency} onChange={setCurrency} label="Currency">
                <option value="all">All currencies</option>
                {currencies.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
              <Select value={status} onChange={setStatus} label="Status">
                <option value="all">All statuses</option>
                <option value="recorded">Recorded</option>
                <option value="reversed">Reversed</option>
              </Select>
              <Select value={method} onChange={setMethod} label="Method">
                <option value="all">All methods</option>
                {methods.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
              <label className="flex items-center gap-2 rounded-lg border border-input px-3 text-xs text-muted-foreground">
                From{" "}
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="bg-transparent py-2 text-foreground outline-none"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-input px-3 text-xs text-muted-foreground">
                To{" "}
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="bg-transparent py-2 text-foreground outline-none"
                />
              </label>
              <Select value={sort} onChange={setSort} label="Sort">
                <option value="date">Newest</option>
                <option value="amount">Amount</option>
                <option value="client">Client</option>
              </Select>
              {(search ||
                clientFilter !== "all" ||
                currency !== "all" ||
                status !== "all" ||
                method !== "all" ||
                from ||
                to ||
                sort !== "date") && (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </section>
          <PaymentLedger
            data={data}
            rows={visible}
            total={filtered.length}
            page={page}
            lang={lang}
            selection={selection}
            allVisibleSelected={allVisibleSelected}
            onToggleVisible={toggleVisible}
            onToggle={(id) => toggleSelected({ type: "payment", id })}
            selectedId={selectedId}
            onSelect={selectPayment}
            onPage={setPage}
          />
          <Notifications data={data} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {visible.length} of {filtered.length} filtered payments. The ledger loads up
              to 200 recent records.
            </span>
            {data.payments.length >= 200 && <span>Use date filters to narrow this window.</span>}
          </div>
        </>
      )}
      {selectedId && data && (
        <PaymentDrawer
          data={data}
          paymentId={selectedId}
          lang={lang}
          onClose={() => setSelectedId(undefined)}
          onInvoice={(id) => navigate({ to: "/invoices" })}
          onAsk={ask}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["payment_workspace"] })}
          onToggleContext={toggleSelected}
        />
      )}
    </div>
  );
}

function Kpis({ data, lang }: { data: PaymentWorkspaceData; lang: "en" | "ar" }) {
  const summary = data.analytics;
  const breakdown = summary.currencyBreakdown;
  const currencies = Object.keys(breakdown);
  const single = currencies.length === 1 ? currencies[0] : null;
  const average =
    single && summary.collections.averagePayment.value !== null
      ? money(summary.collections.averagePayment.value, single, lang)
      : "—";
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Kpi
        label="Total Collected"
        value={grouped(breakdown, "totalCollected", lang)}
        icon={<Check className="size-4" />}
        hint="Live payments grouped by currency"
      />
      <Kpi
        label="Outstanding"
        value={grouped(breakdown, "outstandingReceivables", lang)}
        icon={<CircleDollarSign className="size-4" />}
        hint="Open receivables grouped by currency"
      />
      <Kpi
        label="Overdue"
        value={grouped(breakdown, "overdueReceivables", lang)}
        icon={<CalendarClock className="size-4" />}
        hint="Past-due open receivables grouped by currency"
      />
      <Kpi
        label="Collection Rate"
        value={
          currencies.length
            ? currencies
                .map(
                  (currency) =>
                    `${currency} ${((breakdown[currency]?.collectionRate ?? 0) * 100).toFixed(0)}%`,
                )
                .join(" · ")
            : "—"
        }
        icon={<CircleDollarSign className="size-4" />}
        hint="Calculated independently for each currency"
      />
      <Kpi
        label="Average Payment"
        value={average}
        icon={<CreditCard className="size-4" />}
        hint={
          single
            ? "Authoritative average for the only currency in this workspace"
            : "Unavailable across multiple currencies"
        }
      />
      <Kpi
        label="On-Time Rate"
        value={
          summary.collections.onTimePaymentRate.value === null
            ? "—"
            : `${summary.collections.onTimePaymentRate.value}%`
        }
        icon={<Check className="size-4" />}
        hint="Based on payments matched to invoices"
      />
    </div>
  );
}
function Kpi({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  hint: string;
}) {
  return (
    <div title={hint} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-3 truncate text-lg font-semibold">{value}</p>
    </div>
  );
}

function Overview({
  data,
  lang,
  currency,
}: {
  data: PaymentWorkspaceData;
  lang: "en" | "ar";
  currency?: string | undefined;
}) {
  const analytics = currency ? data.currencyAnalytics[currency] : undefined;
  const trend = analytics?.trends.last90Days ?? [];
  const distribution = analytics?.summary;
  return (
    <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Collection overview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {currency
                ? `90-day view · ${currency}`
                : "Select one currency to view a comparable trend."}
            </p>
          </div>
          {currency && (
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs text-primary">
              {currency}
            </span>
          )}
        </div>
        {trend.length ? (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
                <XAxis dataKey="period" tick={{ fill: "#9ca9a1", fontSize: 10 }} />
                <YAxis
                  tick={{ fill: "#9ca9a1", fontSize: 10 }}
                  tickFormatter={(value) => `${currency} ${value}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1d2924",
                    border: "1px solid rgba(255,255,255,.12)",
                    borderRadius: 12,
                  }}
                  formatter={(value) => [
                    money(Number(value ?? 0), currency ?? "", lang),
                    "Collected",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.16}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty
            icon={<CircleDollarSign className="size-7" />}
            title="No collection history yet"
            text="Recorded payments will appear here once there is enough real history for a trend."
          />
        )}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Collection distribution</h2>
        {distribution && currency ? (
          <div className="mt-5 space-y-4">
            <Distribution
              label="Collected"
              value={money(distribution.totalCollected, currency, lang)}
              color="bg-primary"
            />
            <Distribution
              label="Outstanding"
              value={money(distribution.outstandingReceivables, currency, lang)}
              color="bg-info"
            />
            <Distribution
              label="Overdue"
              value={money(distribution.overdueReceivables, currency, lang)}
              color="bg-warning"
            />
            <p className="pt-2 text-xs text-muted-foreground">
              Amounts are shown for {currency} only. Other currencies remain separate in the KPI
              row.
            </p>
          </div>
        ) : (
          <Empty
            title="Choose a currency"
            text="Distribution is kept currency-specific so unlike currencies are never added together."
          />
        )}
      </div>
    </section>
  );
}
function Distribution({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`size-2 rounded-full ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}

function Plans({
  data,
  lang,
  onSelect,
}: {
  data: PaymentWorkspaceData;
  lang: "en" | "ar";
  onSelect: (id: string) => void;
}) {
  const plans = data.plans.filter((plan) => ["active", "at_risk", "paused"].includes(plan.status));
  const installments = plans.flatMap((plan) => plan.payment_plan_installments ?? []);
  const upcoming = installments
    .filter((row) => row.status !== "paid" && row.due_date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 4);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Payment plans</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Active arrangements and upcoming collection commitments.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{plans.length} active</span>
      </div>
      {plans.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {plans.slice(0, 6).map((plan) => (
            <button
              key={plan.id}
              onClick={() => onSelect(plan.id)}
              className="min-w-0 rounded-xl border border-border bg-secondary/30 p-3 text-left hover:border-primary/50"
            >
              <div className="flex justify-between gap-3">
                <span className="truncate font-medium">{clientName(data, plan.client_id)}</span>
                <StatusBadge status={plan.status} />
              </div>
              <p className="mt-2 truncate text-sm">
                {money(plan.remaining_amount, plan.currency, lang)} remaining
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {plan.installment_count} installments · {plan.frequency}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="No payment plans"
          text="Create a plan through Haseel when a client needs a structured way to settle an outstanding invoice."
        />
      )}
      {upcoming.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Upcoming installments</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {upcoming.map((installment) => {
              const plan = plans.find((row) => row.id === installment.plan_id);
              return (
                <div key={installment.id} className="min-w-0 text-xs">
                  <p className="truncate">
                    {plan ? clientName(data, plan.client_id) : "Payment plan"}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDate(installment.due_date, lang)} ·{" "}
                    {plan
                      ? money(
                          Number(installment.amount) - Number(installment.paid_amount),
                          plan.currency,
                          lang,
                        )
                      : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Signals({
  data,
  lang,
  onInvoice,
  onClient,
}: {
  data: PaymentWorkspaceData;
  lang: "en" | "ar";
  onInvoice: (id: string) => void;
  onClient: (id: string) => void;
}) {
  const analytics = data.analytics;
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Signal
        title="Overdue invoices"
        icon={<CalendarClock className="size-4" />}
        empty="No overdue invoices need attention."
        items={analytics.overdueInvoices.slice(0, 4).map((item) => ({
          id: item.id,
          title: item.invoiceNumber,
          detail: `${item.clientName} · ${item.daysOverdue} days overdue`,
          amount: String(item.outstandingAmount),
          currency: data.invoices.find((invoice) => invoice.id === item.id)?.currency ?? "AED",
          onClick: () => onInvoice(item.id),
        }))}
        lang={lang}
      />
      <Signal
        title="High exposure clients"
        icon={<CircleDollarSign className="size-4" />}
        empty="No elevated exposure signals are available."
        items={analytics.atRiskClients.slice(0, 4).map((item) => ({
          id: item.clientId,
          title: item.clientName,
          detail: `${item.riskLevel} risk · ${item.factors[0] ?? "Existing risk signal"}`,
          amount: String(item.outstandingExposure),
          currency:
            data.invoices.find((invoice) => invoice.client_id === item.clientId)?.currency ?? "AED",
          onClick: () => onClient(item.clientId),
        }))}
        lang={lang}
      />
      <Signal
        title="Installments needing attention"
        icon={<CreditCard className="size-4" />}
        empty="No installment alerts are currently available."
        items={data.plans
          .flatMap((plan) =>
            (plan.payment_plan_installments ?? [])
              .filter((row) => row.status === "overdue")
              .map((row) => ({
                id: plan.id,
                title: clientName(data, plan.client_id),
                detail: `Installment ${row.seq} · ${row.status}`,
                amount: String(Number(row.amount) - Number(row.paid_amount)),
                currency: plan.currency,
                onClick: () => onClient(plan.client_id),
              })),
          )
          .slice(0, 4)}
        lang={lang}
      />
    </section>
  );
}
function Signal({
  title,
  icon,
  empty,
  items,
  lang,
}: {
  title: string;
  icon: ReactNode;
  empty: string;
  items: {
    id: string;
    title: string;
    detail: string;
    amount: string;
    currency: string;
    onClick: () => void;
  }[];
  lang: "en" | "ar";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {items.length ? (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className="flex w-full min-w-0 items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <span className="shrink-0 text-xs font-medium">
                {money(Number(item.amount), item.currency, lang)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function PaymentLedger({
  data,
  rows,
  total,
  page,
  lang,
  selectedId,
  onSelect,
  onPage,
  selection,
  allVisibleSelected,
  onToggleVisible,
  onToggle,
}: {
  data: PaymentWorkspaceData;
  rows: PaymentWorkspaceData["payments"];
  total: number;
  page: number;
  lang: "en" | "ar";
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
  selection: { type: string; id: string }[];
  allVisibleSelected: boolean;
  onToggleVisible: () => void;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="font-semibold">Payment ledger</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Recorded money in, including reversed entries for audit visibility.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{total} results</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleVisible}
            aria-label={
              allVisibleSelected ? "Clear visible payment selection" : "Select all visible payments"
            }
          >
            {allVisibleSelected ? "Clear visible" : "Select all visible"}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="border-b border-border bg-secondary/30 text-left text-xs text-muted-foreground">
            <tr>
              {[
                "Payment",
                "Client",
                "Invoice",
                "Amount",
                "Currency",
                "Payment Date",
                "Method",
                "Status",
                "Reference",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="whitespace-nowrap px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((payment) => {
              const invoice = data.invoices.find((row) => row.id === payment.invoice_id);
              return (
                <tr
                  key={payment.id}
                  role="row"
                  tabIndex={0}
                  aria-selected={selection.some(
                    (item) => item.type === "payment" && item.id === payment.id,
                  )}
                  onClick={(event) => {
                    if (!isNestedAction(event.target)) onToggle(payment.id);
                  }}
                  onKeyDown={(event) => {
                    if (
                      (event.key === "Enter" || event.key === " ") &&
                      !isNestedAction(event.target)
                    ) {
                      event.preventDefault();
                      onToggle(payment.id);
                    }
                  }}
                  className={`${selection.some((item) => item.type === "payment" && item.id === payment.id) ? "border-s-2 border-primary bg-primary-soft/30" : "border-s-2 border-transparent hover:bg-secondary/20"} ${selectedId === payment.id ? "ring-1 ring-primary/20" : ""}`}
                >
                  <td className="max-w-36 px-4 py-4">
                    <button
                      onClick={() => onSelect(payment.id)}
                      title={payment.reference ?? payment.id}
                      className="block max-w-36 truncate text-left font-medium"
                    >
                      {payment.reference || payment.id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="max-w-40 px-4">
                    <span className="block truncate">{clientName(data, payment.client_id)}</span>
                  </td>
                  <td className="px-4">{invoice?.invoice_number ?? "Unlinked"}</td>
                  <td className="whitespace-nowrap px-4 font-medium text-success">
                    {money(payment.amount, payment.currency, lang)}
                  </td>
                  <td className="px-4">
                    <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                      {payment.currency}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 text-xs text-muted-foreground">
                    {formatDate(payment.payment_date, lang)}
                  </td>
                  <td className="px-4 text-xs text-muted-foreground">
                    {payment.payment_method || "—"}
                  </td>
                  <td className="px-4">
                    <StatusBadge status={statusOf(payment)} />
                  </td>
                  <td className="max-w-36 px-4">
                    <span className="block truncate" title={payment.reference ?? undefined}>
                      {payment.reference ?? "—"}
                    </span>
                  </td>
                  <td className="px-4">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Open payment details"
                      onClick={() => onSelect(payment.id)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <Empty
          title="No payments match these filters"
          text="Adjust the search or filters, or record a payment against an eligible invoice."
        />
      )}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <span className="text-xs text-muted-foreground">
          Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => onPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}

function PaymentDrawer({
  data,
  paymentId,
  lang,
  onClose,
  onInvoice,
  onAsk,
  onRefresh,
  onToggleContext,
}: {
  data: PaymentWorkspaceData;
  paymentId: string;
  lang: "en" | "ar";
  onClose: () => void;
  onInvoice: (id: string) => void;
  onAsk: (text: string) => void;
  onRefresh: () => void;
  onToggleContext: (selection: {
    type: "payment" | "invoice" | "client" | "payment_plan";
    id: string;
  }) => void;
}) {
  const payment = data.payments.find((row) => row.id === paymentId);
  const invoice = payment?.invoice_id
    ? data.invoices.find((row) => row.id === payment.invoice_id)
    : undefined;
  const client = payment?.client_id
    ? data.clients.find((row) => row.id === payment.client_id)
    : undefined;
  if (!payment) return null;
  const plan = payment.plan_id ? data.plans.find((row) => row.id === payment.plan_id) : undefined;
  const previous = undefined;
  return (
    <div className="fixed inset-0 z-40 bg-foreground/20 lg:end-[30%]">
      <section className="absolute inset-y-0 end-0 flex w-full max-w-xl flex-col overflow-hidden border-s border-border bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-primary">Payment details</p>
            <h2 className="truncate text-xl font-semibold">
              {money(payment.amount, payment.currency, lang)}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {payment.reference || payment.id}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close payment details">
            <X className="size-5" />
          </Button>
        </header>
        <div className="duely-scroll flex-1 space-y-5 overflow-y-auto p-5">
          <DetailSection title="Payment">
            <DetailGrid
              rows={[
                ["Payment ID", payment.id],
                ["Amount", money(payment.amount, payment.currency, lang)],
                ["Currency", payment.currency],
                ["Payment date", formatDate(payment.payment_date, lang)],
                ["Method", payment.payment_method || "—"],
                ["Status", statusOf(payment)],
                ["Reference", payment.reference || "—"],
              ]}
            />
          </DetailSection>
          <DetailSection title="Client">
            <DetailGrid
              rows={[
                ["Name", client?.name || "—"],
                ["Company", client?.company_name || "—"],
                ["Email", client?.email || "—"],
                ["Phone", client?.phone || "—"],
              ]}
            />
          </DetailSection>
          <DetailSection title="Invoice">
            <DetailGrid
              rows={[
                ["Invoice", invoice?.invoice_number || "Unlinked payment"],
                ["Invoice amount", invoice ? money(invoice.amount, invoice.currency, lang) : "—"],
                ["Paid amount", invoice ? money(invoice.paid_amount, invoice.currency, lang) : "—"],
                [
                  "Remaining balance",
                  invoice ? money(invoice.remaining_balance, invoice.currency, lang) : "—",
                ],
                ["Due date", invoice ? formatDate(invoice.due_date, lang) : "—"],
                ["Invoice status", invoice?.status || "—"],
              ]}
            />
          </DetailSection>
          <DetailSection title="Payment impact">
            <DetailGrid
              rows={[
                [
                  "Previous outstanding balance",
                  previous ? money(previous, payment.currency, lang) : "—",
                ],
                ["Payment amount", money(payment.amount, payment.currency, lang)],
                [
                  "Current remaining balance",
                  invoice ? money(invoice.remaining_balance, invoice.currency, lang) : "—",
                ],
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              The ledger does not store a pre-payment balance, so the previous balance is not
              inferred.
            </p>
          </DetailSection>
        </div>
        <footer className="flex flex-wrap gap-2 border-t border-border bg-surface p-4">
          <Button
            variant="outline"
            onClick={() => onToggleContext({ type: "payment", id: payment.id })}
          >
            <Sparkles className="size-4" /> Add Payment Context
          </Button>
          {invoice && (
            <Button variant="outline" onClick={() => onInvoice(invoice.id)}>
              <FileText className="size-4" /> View Invoice
            </Button>
          )}
          {client && (
            <Button
              variant="outline"
              onClick={() => onToggleContext({ type: "client", id: client.id })}
            >
              <CreditCard className="size-4" /> Add Client Context
            </Button>
          )}
          {invoice && (
            <Button
              variant="outline"
              onClick={() => onToggleContext({ type: "invoice", id: invoice.id })}
            >
              <FileText className="size-4" /> Add Invoice Context
            </Button>
          )}
          {plan && (
            <Button
              variant="outline"
              onClick={() => onToggleContext({ type: "payment_plan", id: plan.id })}
            >
              <CalendarClock className="size-4" /> Add Plan Context
            </Button>
          )}
          {client && (
            <Button
              variant="outline"
              onClick={() =>
                onAsk(`Summarize ${client.company_name || client.name}'s payment behavior.`)
              }
            >
              <CreditCard className="size-4" /> View Client
            </Button>
          )}
          {client && (
            <Button
              variant="outline"
              onClick={() =>
                onAsk(`Create a payment plan for ${client.company_name || client.name}.`)
              }
            >
              <CalendarClock className="size-4" /> Ask Haseel for a payment plan
            </Button>
          )}
          <Button
            onClick={() => onAsk(`Explain this payment and its impact on the related invoice.`)}
          >
            <Sparkles className="size-4" /> Ask Haseel
          </Button>
        </footer>
      </section>
    </div>
  );
}

function Notifications({ data }: { data: PaymentWorkspaceData }) {
  const notifications = data.analytics.notifications.filter(
    (item) =>
      item.event_type.includes("payment") ||
      item.event_type.includes("installment") ||
      item.event_type.includes("overdue"),
  );
  return notifications.length ? (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-semibold">Collection notifications</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {notifications.slice(0, 6).map((notification) => (
          <div key={notification.id} className="rounded-xl bg-secondary/30 p-3">
            <p className="text-sm font-medium">{notification.title}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {notification.body || "Review this collection event."}
            </p>
          </div>
        ))}
      </div>
    </section>
  ) : null;
}
function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-4 text-sm">
          <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 flex-1 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Empty({ icon, title, text }: { icon?: ReactNode; title: string; text: string }) {
  return (
    <div className="py-8 text-center">
      {icon && (
        <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
          {icon}
        </span>
      )}
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-input px-3 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="max-w-40 bg-transparent py-2.5 capitalize text-foreground outline-none"
      >
        {children}
      </select>
    </label>
  );
}
function LoadingState() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />
    </>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-card p-10 text-center">
      <p className="font-medium">Unable to load collection data</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Check your connection and retry. Financial records were not changed.
      </p>
      <Button className="mt-4" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
