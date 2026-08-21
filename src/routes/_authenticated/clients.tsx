import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  Filter,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/duely/StatusBadge";
import { getClientWorkspaceFn, type ClientWorkspaceData } from "@/lib/client.functions";
import { formatDate, formatMoney } from "@/lib/format";
import { useDuely } from "@/lib/duely-context";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Haseel" },
      {
        name: "description",
        content: "Understand your customers, exposure and financial relationships.",
      },
    ],
  }),
  component: ClientsPage,
});

type Sort = "name" | "outstanding" | "overdue" | "invoices" | "last_payment" | "created";
type Totals = Record<string, number>;
type Client = ClientWorkspaceData["clients"][number];
const clientName = (client: Client) => client.company_name || client.name;
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
const currencyTotals = (values: { currency: string; amount: number }[]) =>
  values.reduce<Totals>((result, value) => {
    result[value.currency] = (result[value.currency] ?? 0) + Number(value.amount);
    return result;
  }, {});
const renderTotals = (values: Totals, lang: "en" | "ar") =>
  Object.entries(values)
    .map(([currency, value]) => formatMoney(value, currency, lang))
    .join(" · ") || "—";
const insight = (data: ClientWorkspaceData, id: string) => data.insights[id];
const currenciesFor = (data: ClientWorkspaceData, id: string) => [
  ...new Set(data.invoices.filter((row) => row.client_id === id).map((row) => row.currency)),
];
const isNestedAction = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("button,a,input,select,textarea"));

function ClientsPage() {
  const { lang } = useI18n();
  const {
    setPage,
    focus,
    setFocus,
    setPrefill,
    setAiOpen,
    selection,
    toggleSelected,
    setSelection,
  } = useDuely();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [risk, setRisk] = useState("all");
  const [exposure, setExposure] = useState("all");
  const [overdue, setOverdue] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [hasInvoices, setHasInvoices] = useState("all");
  const [sort, setSort] = useState<Sort>("name");
  const [selectedId, setSelectedId] = useState<string>();
  const query = useQuery({
    queryKey: ["client_workspace", search],
    queryFn: () => getClientWorkspaceFn({ data: { ...(search ? { search } : {}), limit: 100 } }),
  });
  const data = query.data;
  useEffect(() => setPage("clients"), [setPage]);
  const rows = useMemo(() => {
    if (!data) return [];
    return data.clients
      .map((client) => ({
        client,
        analytics: insight(data, client.id),
        risk: data.risks[client.id],
        summary: data.summaries[client.id],
      }))
      .filter(({ client, analytics, risk: clientRisk }) => {
        const amounts = analytics?.currencyBreakdown ?? {};
        const outstanding = total(
          Object.values(amounts).map((value) => value.outstandingReceivables ?? 0),
        );
        const overdueValue = total(
          Object.values(amounts).map((value) => value.overdueReceivables ?? 0),
        );
        const invoiceCount = analytics?.invoicePipeline
          ? Object.values(analytics.invoicePipeline).reduce((sum, row) => sum + row.count, 0)
          : 0;
        return (
          (status === "all" || client.status === status) &&
          (risk === "all" || clientRisk?.level === risk) &&
          (exposure === "all" || (exposure === "owed" ? outstanding > 0 : outstanding === 0)) &&
          (overdue === "all" || (overdue === "yes" ? overdueValue > 0 : overdueValue === 0)) &&
          (currency === "all" || Boolean(amounts[currency])) &&
          (hasInvoices === "all" || (hasInvoices === "yes" ? invoiceCount > 0 : invoiceCount === 0))
        );
      })
      .sort((a, b) => {
        const av = sortValue(a.client, a.analytics, a.summary?.last_payment, sort);
        const bv = sortValue(b.client, b.analytics, b.summary?.last_payment, sort);
        return typeof av === "string" ? av.localeCompare(bv as string) : Number(bv) - Number(av);
      });
  }, [data, status, risk, exposure, overdue, currency, hasInvoices, sort]);
  const ask = (message: string) => {
    setPrefill(message);
    setAiOpen(true);
  };
  const openClient = (id: string) => {
    const client = data?.clients.find((row) => row.id === id);
    if (!client) return;
    setSelectedId(id);
    setFocus({ type: "client", id, summary: clientName(client) });
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["client_workspace"] });
  const kpis = data ? buildKpis(data) : null;
  return (
    <div className="space-y-6 p-5 sm:p-7 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-primary">Customer intelligence</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Understand your customers, exposure and financial relationships.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => searchRef.current?.focus()}>
            <Search className="size-4" /> Search
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              document.getElementById("client-filters")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <Filter className="size-4" /> Filters
          </Button>
          <Button
            onClick={() =>
              ask("Add a new client. Ask me for their name, company, email and phone.")
            }
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
          <Kpis data={kpis} lang={lang} />
          <section
            id="client-filters"
            className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-3"
          >
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-input px-3 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, company, email or phone"
                className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </label>
            <Select
              label="Status"
              value={status}
              onChange={setStatus}
              options={["all", "active", "inactive"]}
            />
            <Select
              label="Risk"
              value={risk}
              onChange={setRisk}
              options={["all", "low", "medium", "high", "critical"]}
            />
            <Select
              label="Exposure"
              value={exposure}
              onChange={setExposure}
              options={["all", "owed", "clear"]}
            />
            <Select
              label="Overdue"
              value={overdue}
              onChange={setOverdue}
              options={["all", "yes", "no"]}
            />
            <Select
              label="Currency"
              value={currency}
              onChange={setCurrency}
              options={["all", ...new Set(data.invoices.map((row) => row.currency))]}
            />
            <Select
              label="Invoices"
              value={hasInvoices}
              onChange={setHasInvoices}
              options={["all", "yes", "no"]}
            />
            <Select
              label="Sort"
              value={sort}
              onChange={(value) => setSort(value as Sort)}
              options={["name", "outstanding", "overdue", "invoices", "last_payment", "created"]}
            />
          </section>
          {rows.length ? (
            <ClientTable
              rows={rows}
              data={data}
              lang={lang}
              selectedId={selectedId}
              onSelect={openClient}
              selection={selection}
              onToggle={(id) =>
                toggleSelected({
                  type: "client",
                  id,
                  label: `Client · ${clientName(data.clients.find((row) => row.id === id)!)}`,
                })
              }
            />
          ) : (
            <Empty
              title={
                data.clients.length
                  ? "No clients match these filters"
                  : "Your client directory is ready"
              }
              text={
                data.clients.length
                  ? "Clear a filter or try a different search."
                  : "Add your first client to connect identity, invoices, payments and collection signals."
              }
              onAction={
                !data.clients.length
                  ? () => ask("Add a new client. Tell me their name and contact details.")
                  : undefined
              }
              action="Ask Haseel"
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
                  onClick={() =>
                    ask("Compare the selected client records and tell me what needs attention.")
                  }
                >
                  <Sparkles className="size-4" /> Ask Haseel
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelection([])}>
                  Clear
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {selectedId && data && (
        <ClientDrawer
          clientId={selectedId}
          data={data}
          lang={lang}
          onClose={() => {
            setSelectedId(undefined);
            if (focus?.type === "client") setFocus(null);
          }}
          onAsk={ask}
          onInvoice={(id) => {
            setFocus({ type: "invoice", id, summary: "Client invoice" });
            navigate({ to: "/invoices" });
          }}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

function sortValue(
  client: Client,
  analytics: ClientWorkspaceData["insights"][string] | undefined,
  lastPayment: string | null | undefined,
  sort: Sort,
): string | number {
  if (sort === "name") return clientName(client).toLowerCase();
  if (sort === "created") return client.created_at;
  if (sort === "last_payment") return lastPayment ?? "";
  if (sort === "invoices")
    return Object.values(analytics?.invoicePipeline ?? {}).reduce((sum, row) => sum + row.count, 0);
  return Object.values(analytics?.currencyBreakdown ?? {}).reduce(
    (sum, row) =>
      sum +
      (sort === "overdue" ? (row.overdueReceivables ?? 0) : (row.outstandingReceivables ?? 0)),
    0,
  );
}
function buildKpis(data: ClientWorkspaceData) {
  const currencies = [...new Set(data.invoices.map((row) => row.currency))];
  const outstanding = currencies.reduce<Totals>((result, currency) => {
    result[currency] = data.insights
      ? total(
          data.clients.map(
            (client) =>
              data.insights[client.id]?.currencyBreakdown[currency]?.outstandingReceivables ?? 0,
          ),
        )
      : 0;
    return result;
  }, {});
  const overdue = currencies.reduce<Totals>((result, currency) => {
    result[currency] = total(
      data.clients.map(
        (client) => data.insights[client.id]?.currencyBreakdown[currency]?.overdueReceivables ?? 0,
      ),
    );
    return result;
  }, {});
  return {
    total: data.clients.length,
    active: data.clients.filter((row) => row.status === "active").length,
    outstanding,
    overdue,
    atRisk: Object.values(data.risks).filter((row) => row.level !== "low").length,
    exposure:
      currencies.length === 1 && data.clients.length
        ? total(
            data.clients.map(
              (client) =>
                data.insights[client.id]?.currencyBreakdown[currencies[0]!]
                  ?.outstandingReceivables ?? 0,
            ),
          ) / data.clients.length
        : null,
    currency: currencies.length === 1 ? currencies[0] : null,
  };
}
function Kpis({ data, lang }: { data: ReturnType<typeof buildKpis> | null; lang: "en" | "ar" }) {
  if (!data)
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    );
  const items = [
    ["Total Clients", String(data.total), "Directory records"],
    ["Active Clients", String(data.active), "Clients marked active"],
    ["Total Outstanding", renderTotals(data.outstanding, lang), "Currency-specific open exposure"],
    ["Total Overdue", renderTotals(data.overdue, lang), "Currency-specific overdue exposure"],
    ["At-Risk Clients", String(data.atRisk), "Existing finance risk engine"],
    [
      "Average Client Exposure",
      data.exposure === null || !data.currency
        ? "—"
        : formatMoney(data.exposure, data.currency, lang),
      data.currency
        ? `Average open exposure in ${data.currency}`
        : "Unavailable across multiple currencies",
    ],
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value, hint]) => (
        <div
          key={label}
          title={hint}
          className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="mt-3 truncate text-lg font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}
function ClientTable({
  rows,
  data,
  lang,
  selectedId,
  onSelect,
  selection,
  onToggle,
}: {
  rows: {
    client: Client;
    analytics: ClientWorkspaceData["insights"][string] | undefined;
    risk: ClientWorkspaceData["risks"][string] | undefined;
  }[];
  data: ClientWorkspaceData;
  lang: "en" | "ar";
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
  selection: { type: string; id: string }[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="border-b border-border bg-secondary/30 text-left text-xs text-muted-foreground">
            <tr>
              {[
                "Client",
                "Company",
                "Contact",
                "Outstanding",
                "Overdue",
                "Invoices",
                "Last Payment",
                "Risk",
                "Status",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="whitespace-nowrap px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ client, analytics, risk }) => {
              const breakdown = analytics?.currencyBreakdown ?? {};
              const invoices = Object.values(analytics?.invoicePipeline ?? {}).reduce(
                (sum, row) => sum + row.count,
                0,
              );
              return (
                <tr
                  key={client.id}
                  role="row"
                  tabIndex={0}
                  aria-selected={selection.some(
                    (item) => item.type === "client" && item.id === client.id,
                  )}
                  onClick={(event) => {
                    if (!isNestedAction(event.target)) onToggle(client.id);
                  }}
                  onKeyDown={(event) => {
                    if (
                      (event.key === "Enter" || event.key === " ") &&
                      !isNestedAction(event.target)
                    ) {
                      event.preventDefault();
                      onToggle(client.id);
                    }
                  }}
                  className={`${selection.some((item) => item.type === "client" && item.id === client.id) ? "border-s-2 border-primary bg-primary-soft/30" : "border-s-2 border-transparent hover:bg-secondary/20"} ${selectedId === client.id ? "ring-1 ring-primary/20" : ""}`}
                >
                  <td className="max-w-48 px-4 py-4">
                    <button
                      title={clientName(client)}
                      onClick={() => onSelect(client.id)}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                        <UserRound className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{client.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {client.email || client.phone || "No contact details"}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="max-w-40 px-4">
                    <span className="block truncate">{client.company_name || "—"}</span>
                  </td>
                  <td className="max-w-44 px-4">
                    <span className="block truncate text-xs text-muted-foreground">
                      {client.email || client.phone || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 font-medium">
                    {renderTotals(
                      Object.fromEntries(
                        Object.entries(breakdown).map(([key, value]) => [
                          key,
                          value.outstandingReceivables ?? 0,
                        ]),
                      ),
                      lang,
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 text-warning">
                    {renderTotals(
                      Object.fromEntries(
                        Object.entries(breakdown).map(([key, value]) => [
                          key,
                          value.overdueReceivables ?? 0,
                        ]),
                      ),
                      lang,
                    )}
                  </td>
                  <td className="px-4">{invoices}</td>
                  <td className="whitespace-nowrap px-4 text-xs text-muted-foreground">
                    {analytics?.collections.averageDaysToPay.value == null
                      ? "—"
                      : `${analytics.collections.averageDaysToPay.value} days avg`}
                  </td>
                  <td className="px-4">
                    <Risk risk={risk} />
                  </td>
                  <td className="px-4">
                    <StatusBadge status={client.status} />
                  </td>
                  <td className="px-4">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Open client intelligence"
                      onClick={() => onSelect(client.id)}
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
    </div>
  );
}
function Risk({ risk }: { risk: ClientWorkspaceData["risks"][string] | undefined }) {
  return risk ? (
    <span
      className={
        risk.level === "low"
          ? "text-success"
          : risk.level === "medium"
            ? "text-warning"
            : "text-destructive"
      }
    >
      {risk.level}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function ClientDrawer({
  clientId,
  data,
  lang,
  onClose,
  onAsk,
  onInvoice,
  onRefresh,
}: {
  clientId: string;
  data: ClientWorkspaceData;
  lang: "en" | "ar";
  onClose: () => void;
  onAsk: (text: string) => void;
  onInvoice: (id: string) => void;
  onRefresh: () => void;
}) {
  const client = data.clients.find((row) => row.id === clientId);
  const analytics = insight(data, clientId);
  const summary = data.summaries[clientId];
  const risk = data.risks[clientId];
  if (!client || !analytics) return null;
  const invoices = data.invoices.filter((row) => row.client_id === clientId);
  const payments = data.payments.filter((row) => row.client_id === clientId);
  const plans = data.plans.filter((row) => row.client_id === clientId);
  const lastPayment = payments.find((row) => !row.reversed_at);
  return (
    <div className="fixed inset-0 z-40 bg-foreground/20 lg:end-[30%]">
      <section className="absolute inset-y-0 end-0 flex w-full max-w-2xl flex-col overflow-hidden border-s border-border bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-primary">Customer intelligence</p>
            <h2 className="truncate text-xl font-semibold">{clientName(client)}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {client.email || client.phone || "No contact details"}
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close details">
              <X className="size-5" />
            </Button>
          </div>
        </header>
        <div className="duely-scroll flex-1 space-y-5 overflow-y-auto p-5">
          <section className="flex flex-wrap gap-2">
            <StatusBadge status={client.status} />
            <span className="text-xs text-muted-foreground">
              Created {formatDate(client.created_at, lang)}
            </span>
          </section>
          <Section title="Client profile">
            <Details
              rows={[
                ["Name", client.name],
                ["Company", client.company_name || "—"],
                ["Email", client.email || "—"],
                ["Phone", client.phone || "—"],
                ["Address", client.billing_address || "—"],
                ["Notes", client.notes || "—"],
              ]}
            />
          </Section>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Outstanding", analytics.summary.outstandingReceivables],
              ["Overdue", analytics.summary.overdueReceivables],
              ["Invoices", String(summary?.invoice_count ?? "—")],
              ["Payments", String(summary?.payment_count ?? "—")],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {typeof value === "number"
                    ? renderTotals(
                        Object.fromEntries(
                          Object.entries(analytics.currencyBreakdown).map(([key, row]) => [
                            key,
                            label === "Overdue"
                              ? (row.overdueReceivables ?? 0)
                              : (row.outstandingReceivables ?? 0),
                          ]),
                        ),
                        lang,
                      )
                    : value}
                </p>
              </div>
            ))}
          </section>
          <Section title="Financial summary">
            <Details
              rows={[
                ["Total invoiced", renderTotals(summary?.total_invoiced ?? {}, lang)],
                ["Total paid", renderTotals(summary?.total_paid ?? {}, lang)],
                ["Invoice count", String(summary?.invoice_count ?? "—")],
                ["Payment count", String(summary?.payment_count ?? "—")],
                ["Payment plan count", String(summary?.payment_plan_count ?? "—")],
              ]}
            />
          </Section>
          <Section title="Exposure and risk">
            <Details
              rows={[
                ["Risk", risk?.level || "Risk data unavailable"],
                ["Risk factors", risk?.factors.join(" · ") || "No factual risk factors returned"],
                [
                  "Average payment delay",
                  risk?.average_payment_delay_days == null
                    ? "—"
                    : `${risk.average_payment_delay_days} days`,
                ],
                [
                  "On-time rate",
                  risk?.on_time_percentage == null ? "—" : `${risk.on_time_percentage}%`,
                ],
              ]}
            />
            <Aging aging={data.aging_by_currency[clientId] ?? {}} lang={lang} />
          </Section>
          <Section title="Invoices">
            <div className="space-y-2">
              {invoices.length ? (
                invoices.slice(0, 10).map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <button
                        className="truncate text-left font-medium hover:text-primary"
                        onClick={() => onInvoice(invoice.id)}
                      >
                        {invoice.invoice_number}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(invoice.issue_date, lang)} · due{" "}
                        {formatDate(invoice.due_date, lang)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p>{formatMoney(invoice.amount, invoice.currency, lang)}</p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.status} ·{" "}
                        {formatMoney(invoice.remaining_balance, invoice.currency, lang)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title="No invoices yet"
                  text="Create an invoice for this client to begin tracking exposure."
                />
              )}
            </div>
          </Section>
          <Section title="Payment history">
            {payments.length ? (
              <div className="space-y-2">
                {payments.slice(0, 10).map((payment) => (
                  <div key={payment.id} className="flex justify-between gap-3 text-sm">
                    <div>
                      <p>
                        {formatDate(payment.payment_date, lang)} · {payment.payment_method || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {data.invoices.find((row) => row.id === payment.invoice_id)
                          ?.invoice_number || "Unlinked"}{" "}
                        · {payment.reversed_at ? "reversed" : "recorded"}
                      </p>
                    </div>
                    <span className="text-success">
                      {formatMoney(payment.amount, payment.currency, lang)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="No payments yet"
                text="Record a payment when this client settles an eligible invoice."
              />
            )}
          </Section>
          <Section title="Payment plans">
            {plans.length ? (
              plans.map((plan) => (
                <div key={plan.id} className="rounded-xl bg-secondary/30 p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span>
                      {plan.invoice_id
                        ? data.invoices.find((row) => row.id === plan.invoice_id)?.invoice_number
                        : "Unlinked plan"}
                    </span>
                    <StatusBadge status={plan.status} />
                  </div>
                  <p className="mt-1">
                    {formatMoney(plan.total_amount, plan.currency, lang)} total ·{" "}
                    {formatMoney(plan.paid_amount, plan.currency, lang)} paid ·{" "}
                    {formatMoney(plan.remaining_amount, plan.currency, lang)} remaining
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Next installment: {nextInstallment(plan, lang)}
                  </p>
                </div>
              ))
            ) : (
              <Empty
                title="No payment plans"
                text="Create a plan through Haseel when a structured arrangement is appropriate."
              />
            )}
          </Section>
          <Section title="Activity">
            {data.notifications.filter((item) => item.client_id === clientId).length ? (
              <div className="space-y-2">
                {data.notifications
                  .filter((item) => item.client_id === clientId)
                  .slice(0, 8)
                  .map((item) => (
                    <div key={item.id} className="flex justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{item.title}</p>
                        <p className="break-words text-xs text-muted-foreground">
                          {item.body || item.event_type}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(item.created_at, lang)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <Empty
                title="No client activity"
                text="Notifications will appear here when this client has collection events."
              />
            )}
          </Section>
        </div>
        <footer className="flex flex-wrap gap-2 border-t border-border bg-surface p-4">
          <Button
            variant="outline"
            onClick={() => onAsk(`Create an invoice for ${clientName(client)}.`)}
          >
            <FileText className="size-4" /> Ask Haseel to invoice
          </Button>
          <Button
            variant="outline"
            onClick={() => onAsk(`Record a payment from ${clientName(client)}.`)}
          >
            <CreditCard className="size-4" /> Ask Haseel to record payment
          </Button>
          <Button
            variant="outline"
            onClick={() => onAsk(`Create a payment plan for ${clientName(client)}.`)}
          >
            <CalendarClock className="size-4" /> Ask Haseel for a plan
          </Button>
          <Button
            onClick={() =>
              onAsk(`Summarize ${clientName(client)}'s financial relationship with us.`)
            }
          >
            <Sparkles className="size-4" /> Ask Haseel
          </Button>
        </footer>
      </section>
    </div>
  );
}

function Aging({
  aging,
  lang,
}: {
  aging: ClientWorkspaceData["aging_by_currency"][string];
  lang: "en" | "ar";
}) {
  const rows = Object.entries(aging).flatMap(
    ([currency, buckets]) =>
      [
        [`Current · ${currency}`, buckets.current],
        [`1–30 · ${currency}`, buckets.days1to30],
        [`31–60 · ${currency}`, buckets.days31to60],
        [`61–90 · ${currency}`, buckets.days61to90],
        [`90+ · ${currency}`, buckets.days90Plus],
      ] as const,
  );
  return (
    <div className="mt-4 space-y-2">
      {rows.map(([label, row]) => (
        <div key={label} className="flex justify-between gap-3 text-xs">
          <span>
            {label} days · {row.invoiceCount} invoices
          </span>
          <span>
            {row.amount ? formatMoney(row.amount, label.split(" · ").at(-1) ?? "", lang) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
function nextInstallment(plan: ClientWorkspaceData["plans"][number], lang: "en" | "ar") {
  const installment = (plan.payment_plan_installments ?? [])
    .filter((row) => row.status !== "paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return installment
    ? `${formatDate(installment.due_date, lang)} · ${formatMoney(Number(installment.amount) - Number(installment.paid_amount), plan.currency, lang)}`
    : "—";
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function Details({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-3 text-sm">
          <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 flex-1 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-input px-3 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-32 bg-transparent py-2.5 capitalize text-foreground outline-none"
      >
        {options.map((option) => (
          <option key={option}>{option.replace("_", " ")}</option>
        ))}
      </select>
    </label>
  );
}
function Empty({
  title,
  text,
  onAction,
  action,
}: {
  title: string;
  text: string;
  onAction?: (() => void) | undefined;
  action?: string | undefined;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <UserRound className="mx-auto size-8 text-primary" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>
      {onAction && (
        <Button className="mt-4" onClick={onAction}>
          <Plus className="size-4" /> {action}
        </Button>
      )}
    </div>
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
      <div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />
    </>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-card p-10 text-center">
      <p className="font-medium">Unable to load client intelligence</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Check your connection and retry. Financial records were not changed.
      </p>
      <Button className="mt-4" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
