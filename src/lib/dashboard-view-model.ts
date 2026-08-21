import type { DashboardAnalyticsResult } from "./dashboard-analytics.server";

export type DashboardViewState = "loading" | "error" | "empty" | "ready";

export function getDashboardViewState(
  result: DashboardAnalyticsResult | undefined,
  isLoading: boolean,
  isError: boolean,
): DashboardViewState {
  if (isLoading) return "loading";
  if (isError || !result) return "error";

  const hasCurrencyData = Object.keys(result.currencyBreakdown).length > 0;
  return hasCurrencyData || result.notifications.length > 0 ? "ready" : "empty";
}

export function getCurrencyKeys(result: DashboardAnalyticsResult | undefined): string[] {
  return Object.keys(result?.currencyBreakdown ?? {});
}

export function isMultiCurrency(
  result: DashboardAnalyticsResult | undefined,
  selectedCurrency: string,
): boolean {
  return getCurrencyKeys(result).length > 1 && !selectedCurrency;
}

export function getSelectedCurrency(
  result: DashboardAnalyticsResult | undefined,
  selectedCurrency: string,
): string | null {
  if (selectedCurrency) return selectedCurrency;
  const currencies = getCurrencyKeys(result);
  return currencies.length === 1 ? (currencies[0] ?? null) : null;
}
