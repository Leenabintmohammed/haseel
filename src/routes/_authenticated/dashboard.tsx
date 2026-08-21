import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Layers3,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardAnalyticsResult } from "@/lib/dashboard-analytics.server";
import { getDashboardAnalyticsFn } from "@/lib/dashboard.functions";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getCurrencyKeys,
  getDashboardViewState,
  getSelectedCurrency,
  isMultiCurrency,
} from "@/lib/dashboard-view-model";
import { useDuely } from "@/lib/duely-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Haseel" },
      {
        name: "description",
        content: "Financial position, collections, receivables and risk at a glance.",
      },
      { property: "og:title", content: "Dashboard — Haseel" },
      {
        property: "og:description",
        content: "Financial position, collections, receivables and risk at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

type TrendPeriod = "last30Days" | "last90Days" | "last12Months";

const trendLabels: Record<TrendPeriod, string> = {
  last30Days: "30D",
  last90Days: "90D",
  last12Months: "12M",
};

const trendTitles: Record<TrendPeriod, string> = {
  last30Days: "Last 30 days",
  last90Days: "Last 90 days",
  last12Months: "Last 12 months",
};

const agingLabels = [
  ["current", "Current"],
  ["days1to30", "1–30 days"],
  ["days31to60", "31–60 days"],
  ["days61to90", "61–90 days"],
  ["days90Plus", "90+ days"],
] as const;

const pipelineLabels = [
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["dueSoon", "Due soon"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
] as const;

function formatPercent(value: number | null) {
  if (value === null) return "—";
  const percentage = value * 100;
  return `${percentage.toFixed(percentage % 1 === 0 ? 0 : 1)}%`;
}

function formatMetric(value: number | null, currency: string | null, locale: string) {
  if (!currency || value === null) return "—";
  return formatMoney(value, currency, locale);
}

function trendLabel(period: string, locale: string) {
  const date = /^\d{4}-\d{2}$/.test(period)
    ? new Date(`${period}-01T00:00:00Z`)
    : new Date(`${period}T00:00:00Z`);
  return date.toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
    ...(date.getDate() === 1
      ? { month: "short", year: "2-digit" }
      : { day: "2-digit", month: "short" }),
  });
}

function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

function SkeletonBlock({ className }: { className: string }) {
  return <Skeleton className={cn("bg-secondary/70", className)} />;
}

function DashboardLoading() {
  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        {Array.from({ length: 2 }, (_, index) => (
          <SkeletonBlock key={index} className="h-[330px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock key={index} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div
        role="alert"
        className="max-w-sm rounded-2xl border border-destructive/30 bg-card p-7 text-center shadow-lg"
      >
        <AlertCircle className="mx-auto size-8 text-destructive" />
        <h1 className="mt-4 text-base font-semibold">Unable to load your financial data</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your dashboard could not be refreshed. Try again.
        </p>
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="size-4" /> Try again
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-4 py-8 text-center">
      <Icon className="size-7 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Card({
  children,
  className,
  title,
  icon: Icon,
}: {
  children: ReactNode;
  className?: string;
  title: string;
  icon: LucideIcon;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_40px_oklch(0_0_0_/_10%)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Icon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "text-foreground",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-[0_12px_32px_oklch(0_0_0_/_8%)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <div className={cn("mt-5 truncate text-2xl font-semibold tracking-tight", tone)}>{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function MultiCurrencyList({
  breakdown,
  field,
  locale,
}: {
  breakdown: DashboardAnalyticsResult["currencyBreakdown"];
  field: "outstandingReceivables" | "overdueReceivables" | "totalCollected";
  locale: string;
}) {
  const entries = Object.entries(breakdown);
  if (!entries.length) return <span>—</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-base">
      {entries.map(([currency, summary]) => (
        <span key={currency}>{formatMoney(summary[field], currency, locale)}</span>
      ))}
    </span>
  );
}

function DashboardPage() {
  const { lang } = useI18n();
  const { setPage, setPrefill, setAiOpen } = useDuely();
  const analytics = useServerFn(getDashboardAnalyticsFn);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("last30Days");
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const query = useQuery({
    queryKey: ["dashboard-analytics", selectedCurrency],
    queryFn: () =>
      analytics({
        data: selectedCurrency ? { currency: selectedCurrency, limit: 25 } : { limit: 25 },
      }),
    staleTime: 30_000,
  });

  useEffect(() => setPage("dashboard"), [setPage]);

  const result = query.data;
  const currencies = getCurrencyKeys(result);
  const multiCurrency = isMultiCurrency(result, selectedCurrency);
  const currency = getSelectedCurrency(result, selectedCurrency);
  const trend = result?.trends[trendPeriod] ?? [];
  const hasFinancialData = currencies.length > 0 || (result?.notifications.length ?? 0) > 0;
  const viewState = getDashboardViewState(result, query.isLoading, query.isError);

  const ask = (prompt: string) => {
    setPrefill(prompt);
    setAiOpen(true);
  };

  if (viewState === "loading") return <DashboardLoading />;
  if (viewState === "error" || !result) return <DashboardError onRetry={() => query.refetch()} />;

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Financial command center
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your financial position at a glance.</p>
        </div>
        {currencies.length > 1 && (
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Currency</span>
            <select
              value={selectedCurrency}
              onChange={(event) => setSelectedCurrency(event.target.value)}
              className="rounded-lg border border-input bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All currencies</option>
              {currencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {!hasFinancialData && (
        <div className="rounded-2xl border border-primary/20 bg-primary-soft/40">
          <EmptyState
            icon={CircleDollarSign}
            title="No receivables yet"
            body="Create your first invoice to start tracking collections."
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Outstanding receivables"
          value={
            multiCurrency ? (
              <MultiCurrencyList
                breakdown={result.currencyBreakdown}
                field="outstandingReceivables"
                locale={lang}
              />
            ) : (
              formatMetric(result.summary.outstandingReceivables, currency, lang)
            )
          }
          detail={multiCurrency ? "Select a currency for charts" : "Open invoice balances"}
          icon={CircleDollarSign}
        />
        <MetricCard
          label="Overdue receivables"
          value={
            multiCurrency ? (
              <MultiCurrencyList
                breakdown={result.currencyBreakdown}
                field="overdueReceivables"
                locale={lang}
              />
            ) : (
              formatMetric(result.summary.overdueReceivables, currency, lang)
            )
          }
          detail={
            multiCurrency
              ? "Shown by currency"
              : `${result.overdueInvoices.length} invoices currently overdue`
          }
          icon={ShieldAlert}
          tone="text-warning"
        />
        <MetricCard
          label="Total collected"
          value={
            multiCurrency ? (
              <MultiCurrencyList
                breakdown={result.currencyBreakdown}
                field="totalCollected"
                locale={lang}
              />
            ) : (
              formatMetric(result.summary.totalCollected, currency, lang)
            )
          }
          detail={`${result.collections.paymentCount.value ?? 0} recorded payments`}
          icon={CheckCircle2}
          tone="text-success"
        />
        <MetricCard
          label="Collection rate"
          value={multiCurrency ? "—" : formatPercent(result.summary.collectionRate)}
          detail={multiCurrency ? "Available by currency" : "Collected against invoiced value"}
          icon={TrendingUp}
          tone="text-primary"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <Card title="Collection trend" icon={TrendingUp} className="min-h-[350px]">
          {multiCurrency ? (
            <EmptyState
              icon={CircleDollarSign}
              title="Choose a currency"
              body="Collection trends stay separate so currencies are never combined."
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-5 pt-4">
                <p className="text-xs text-muted-foreground">{trendTitles[trendPeriod]}</p>
                <div className="flex gap-1 rounded-lg bg-secondary p-1">
                  {(Object.keys(trendLabels) as TrendPeriod[]).map((period) => (
                    <button
                      key={period}
                      onClick={() => setTrendPeriod(period)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        trendPeriod === period
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {trendLabels[period]}
                    </button>
                  ))}
                </div>
              </div>
              {trend.length < 1 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No payment activity"
                  body="Collection activity will appear here once payments are recorded."
                />
              ) : (
                <div className="h-64 px-2 pb-4 pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid
                        stroke="var(--border)"
                        strokeDasharray="3 5"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="period"
                        tickFormatter={(value) => trendLabel(value, lang)}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={26}
                      />
                      <YAxis
                        tickFormatter={(value) => compactNumber(value)}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                      />
                      <Tooltip
                        content={<TrendTooltip currency={currency ?? "AED"} locale={lang} />}
                      />
                      <Line
                        type="monotone"
                        dataKey="invoiced"
                        name="Invoiced"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="collected"
                        name="Collected"
                        stroke="var(--pink)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </Card>
        <Card title="Receivables aging" icon={Clock3}>
          {multiCurrency ? (
            <EmptyState
              icon={Clock3}
              title="Choose a currency"
              body="Aging is kept currency-specific to avoid misleading totals."
            />
          ) : (
            <AgingContent result={result} currency={currency} locale={lang} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Invoice pipeline" icon={Layers3}>
          <PipelineContent
            result={result}
            currency={currency}
            locale={lang}
            multiCurrency={multiCurrency}
          />
        </Card>
        <Card title="Payment plans" icon={CalendarClock}>
          <PlansContent
            result={result}
            currency={currency}
            locale={lang}
            multiCurrency={multiCurrency}
          />
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="At-risk clients" icon={UsersRound}>
          <RiskContent result={result} currency={currency} locale={lang} />
        </Card>
        <Card title="Upcoming payments" icon={CalendarClock}>
          <UpcomingContent result={result} currency={currency} locale={lang} />
        </Card>
      </div>
      <Card title="Needs attention" icon={Sparkles}>
        {result.notifications.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="You're all caught up"
            body="New payment, invoice and approval activity will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {result.notifications.slice(0, 8).map((notification) => (
              <div key={notification.id} className="flex items-start gap-3 px-5 py-4">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{notification.title}</p>
                  {notification.body && (
                    <p className="mt-1 text-xs text-muted-foreground">{notification.body}</p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {notification.invoice_id
                      ? "Invoice"
                      : notification.client_id
                        ? "Client"
                        : notification.plan_id
                          ? "Payment plan"
                          : "Business"}{" "}
                    ·{" "}
                    {notification.created_at
                      ? formatDate(notification.created_at, lang)
                      : "Recently"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary-soft/30 px-5 py-4">
        <Sparkles className="size-4 text-primary" />
        <p className="flex-1 text-sm text-muted-foreground">
          Ask Haseel about your financial position.
        </p>
        <button
          onClick={() => ask("Which clients are most at risk?")}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          Ask Haseel
        </button>
        <button
          onClick={() => ask("What payments are due this week?")}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          Due this week
        </button>
      </div>
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
  currency,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; name?: string; color?: string }>;
  label?: string;
  currency: string;
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium">{label ? trendLabel(label, locale) : ""}</p>
      {payload.map((item) => (
        <p
          key={item.dataKey}
          className="flex items-center justify-between gap-4 text-muted-foreground"
        >
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-semibold text-foreground">
            {formatMoney(item.value ?? 0, currency, locale)}
          </span>
        </p>
      ))}
    </div>
  );
}

function AgingContent({
  result,
  currency,
  locale,
}: {
  result: DashboardAnalyticsResult;
  currency: string | null;
  locale: string;
}) {
  const total = agingLabels.reduce((sum, [key]) => sum + result.aging[key].amount, 0);
  if (total === 0)
    return (
      <EmptyState
        icon={Clock3}
        title="No receivables yet"
        body="Aging will appear once open invoices are recorded."
      />
    );
  return (
    <div className="space-y-4 px-5 py-5">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={agingLabels.map(([key, label]) => ({ label, amount: result.aging[key].amount }))}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--border)" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={72}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<AgingTooltip currency={currency ?? "AED"} locale={locale} />} />
            <Bar dataKey="amount" radius={[0, 5, 5, 0]}>
              {agingLabels.map(([key]) => (
                <Cell
                  key={key}
                  fill={
                    key === "current"
                      ? "var(--primary)"
                      : key === "days90Plus"
                        ? "var(--destructive)"
                        : "var(--chart-2)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {agingLabels.map(([key, label]) => (
          <div key={key}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-semibold">
              {formatMoney(result.aging[key].amount, currency ?? "AED", locale)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {Math.round((result.aging[key].amount / total) * 100)}% ·{" "}
              {result.aging[key].invoiceCount} invoices
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgingTooltip({
  active,
  payload,
  currency,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  currency: string;
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      {formatMoney(payload[0]?.value ?? 0, currency, locale)}
    </div>
  );
}

function PipelineContent({
  result,
  currency,
  locale,
  multiCurrency,
}: {
  result: DashboardAnalyticsResult;
  currency: string | null;
  locale: string;
  multiCurrency: boolean;
}) {
  const data = pipelineLabels.map(([key, label]) => ({
    label,
    amount: result.invoicePipeline[key].amount,
    count: result.invoicePipeline[key].count,
  }));
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  if (total === 0 && data.every((item) => item.count === 0))
    return (
      <EmptyState
        icon={FileCheck2}
        title="No invoices yet"
        body="Invoice stages will appear here once your first invoice is created."
      />
    );
  if (multiCurrency)
    return (
      <div className="grid grid-cols-2 gap-2 px-5 py-5">
        {data.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2"
          >
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-xs font-semibold">{item.count} invoices</span>
          </div>
        ))}
        <p className="col-span-2 pt-2 text-xs text-muted-foreground">
          Select a currency to view pipeline values.
        </p>
      </div>
    );
  return (
    <div className="space-y-4 px-5 py-5">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--border)" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={62}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<PipelineTooltip currency={currency ?? "AED"} locale={locale} />} />
            <Bar dataKey="amount" fill="var(--primary)" radius={[0, 5, 5, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2"
          >
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-xs font-semibold">
              {multiCurrency
                ? `${item.count} invoices`
                : `${item.count} · ${formatMoney(item.amount, currency ?? "AED", locale)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineTooltip({
  active,
  payload,
  currency,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { count?: number } }>;
  currency: string;
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <p>{formatMoney(payload[0]?.value ?? 0, currency, locale)}</p>
      <p className="mt-1 text-muted-foreground">{payload[0]?.payload?.count ?? 0} invoices</p>
    </div>
  );
}

function PlansContent({
  result,
  currency,
  locale,
  multiCurrency,
}: {
  result: DashboardAnalyticsResult;
  currency: string | null;
  locale: string;
  multiCurrency: boolean;
}) {
  const plans = result.paymentPlans;
  const progress =
    plans.collected + plans.remainingBalance > 0
      ? (plans.collected / (plans.collected + plans.remainingBalance)) * 100
      : 0;
  if (
    !plans.activePlans &&
    !plans.collected &&
    !plans.remainingBalance &&
    !plans.overdueInstallments
  )
    return (
      <EmptyState
        icon={CalendarClock}
        title="No payment plans yet"
        body="Active installment arrangements will appear here."
      />
    );
  return (
    <div className="space-y-5 px-5 py-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Active plans" value={String(plans.activePlans)} />
        <MiniStat
          label="At risk"
          value={String(plans.plansAtRisk)}
          tone={plans.plansAtRisk ? "text-warning" : undefined}
        />
        <MiniStat
          label="Overdue installments"
          value={String(plans.overdueInstallments)}
          tone={plans.overdueInstallments ? "text-warning" : undefined}
        />
        <MiniStat
          label="Collected"
          value={multiCurrency ? "—" : formatMoney(plans.collected, currency ?? "AED", locale)}
          tone="text-success"
        />
      </div>
      <div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Collected against planned balance</span>
          <span>{multiCurrency ? "Per currency" : `${Math.round(progress)}%`}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${multiCurrency ? 0 : progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Remaining:{" "}
          {multiCurrency ? "—" : formatMoney(plans.remainingBalance, currency ?? "AED", locale)}
        </p>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string | undefined;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", tone)}>{value}</p>
    </div>
  );
}

function RiskContent({
  result,
  currency,
  locale,
}: {
  result: DashboardAnalyticsResult;
  currency: string | null;
  locale: string;
}) {
  if (!result.atRiskClients.length)
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No at-risk clients"
        body="No clients currently require attention."
      />
    );
  return (
    <div className="divide-y divide-border">
      {result.atRiskClients.slice(0, 6).map((client) => (
        <div key={client.clientId} className="flex items-center gap-3 px-5 py-4">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
              client.riskLevel.toLowerCase() === "high"
                ? "bg-destructive/15 text-destructive"
                : client.riskLevel.toLowerCase() === "medium"
                  ? "bg-warning/15 text-warning"
                  : "bg-primary-soft text-primary",
            )}
          >
            {Math.round(client.riskScore)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{client.clientName}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {client.factors[0] ?? "Financial exposure requires review"}
            </p>
          </div>
          <div className="text-end">
            <p className="text-sm font-semibold">
              {currency ? formatMoney(client.outstandingExposure, currency, locale) : "—"}
            </p>
            <p
              className={cn(
                "mt-1 text-[11px] font-semibold uppercase",
                client.riskLevel.toLowerCase() === "high"
                  ? "text-destructive"
                  : client.riskLevel.toLowerCase() === "medium"
                    ? "text-warning"
                    : "text-primary",
              )}
            >
              {client.riskLevel}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function UpcomingContent({
  result,
  currency,
  locale,
}: {
  result: DashboardAnalyticsResult;
  currency: string | null;
  locale: string;
}) {
  if (!result.upcomingPayments.length)
    return (
      <EmptyState
        icon={CalendarClock}
        title="No upcoming payments"
        body="Upcoming receivables will appear here when invoices are due."
      />
    );
  return (
    <div className="divide-y divide-border">
      {result.upcomingPayments.slice(0, 6).map((payment) => (
        <div key={payment.id} className="flex items-center gap-3 px-5 py-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{payment.clientName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(payment.dueDate, locale)}
            </p>
          </div>
          <div className="text-end">
            <p className="text-sm font-semibold">
              {currency ? formatMoney(payment.outstandingAmount, currency, locale) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Outstanding</p>
          </div>
        </div>
      ))}
    </div>
  );
}
