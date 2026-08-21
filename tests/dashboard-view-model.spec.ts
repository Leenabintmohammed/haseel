import { describe, expect, it } from "vitest";
import type { DashboardAnalyticsResult } from "../src/lib/dashboard-analytics.server";
import {
  getCurrencyKeys,
  getDashboardViewState,
  getSelectedCurrency,
  isMultiCurrency,
} from "../src/lib/dashboard-view-model";

function result(overrides: Partial<DashboardAnalyticsResult> = {}): DashboardAnalyticsResult {
  return {
    summary: {
      outstandingReceivables: null,
      overdueReceivables: null,
      dueIn7Days: null,
      dueIn30Days: null,
      dueIn60Days: null,
      dueIn90Days: null,
      dueIn12Months: null,
      totalCollected: null,
      collectionRate: null,
      atRiskReceivables: null,
    },
    aging: {
      current: { amount: 0, invoiceCount: 0 },
      days1to30: { amount: 0, invoiceCount: 0 },
      days31to60: { amount: 0, invoiceCount: 0 },
      days61to90: { amount: 0, invoiceCount: 0 },
      days90Plus: { amount: 0, invoiceCount: 0 },
    },
    collections: {
      totalCollected: { value: null, available: false },
      paymentCount: { value: null, available: false },
      averagePayment: { value: null, available: false },
      onTimePaymentRate: { value: null, available: false },
      latePaymentRate: { value: null, available: false },
      averageDaysToPay: { value: null, available: false },
    },
    trends: { last30Days: [], last90Days: [], last12Months: [] },
    upcomingPayments: [],
    overdueInvoices: [],
    atRiskClients: [],
    paymentPlans: {
      activePlans: 0,
      remainingBalance: 0,
      dueThisPeriod: 0,
      overdueInstallments: 0,
      collected: 0,
      plansAtRisk: 0,
    },
    notifications: [],
    invoicePipeline: {
      draft: { amount: 0, count: 0 },
      sent: { amount: 0, count: 0 },
      dueSoon: { amount: 0, count: 0 },
      overdue: { amount: 0, count: 0 },
      paid: { amount: 0, count: 0 },
    },
    currencyBreakdown: {},
    filters: {},
    ...overrides,
  };
}

describe("dashboard view model", () => {
  it("distinguishes loading, error, empty, and ready states", () => {
    expect(getDashboardViewState(undefined, true, false)).toBe("loading");
    expect(getDashboardViewState(undefined, false, true)).toBe("error");
    expect(getDashboardViewState(result(), false, false)).toBe("empty");
    expect(
      getDashboardViewState(result({ notifications: [{ id: "n1" } as never] }), false, false),
    ).toBe("ready");
  });

  it("keeps multiple currencies separate until one is selected", () => {
    const dashboard = result({
      currencyBreakdown: {
        AED: result().summary,
        USD: result().summary,
      },
    });

    expect(getCurrencyKeys(dashboard)).toEqual(["AED", "USD"]);
    expect(isMultiCurrency(dashboard, "")).toBe(true);
    expect(isMultiCurrency(dashboard, "USD")).toBe(false);
    expect(getSelectedCurrency(dashboard, "USD")).toBe("USD");
    expect(getSelectedCurrency(dashboard, "")).toBeNull();
  });

  it("selects the only available currency without combining values", () => {
    const dashboard = result({ currencyBreakdown: { AED: result().summary } });

    expect(getSelectedCurrency(dashboard, "")).toBe("AED");
    expect(isMultiCurrency(dashboard, "")).toBe(false);
  });
});
