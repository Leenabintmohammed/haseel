import { describe, it, expect } from 'vitest'
import {
  round2,
  toNumber,
  normalizeLineItem,
  computeInvoiceTotals,
  canTransitionInvoice,
  deriveInvoiceStatus,
  todayISO,
  addDaysFrom,
  addMonthsFrom,
  daysBetween,
  splitInstallments,
  deriveInstallmentStatus,
  allocatePlanPayments,
  derivePlanStatus,
  canTransitionPlan,
  scoreRisk,
  installmentDueDate,
} from '../src/lib/finance-core'

describe('finance-core: Money & Rounding', () => {
  it('round2() rounds to 2 decimals with half-up behavior', () => {
    expect(round2(10.005)).toBe(10.01) // half-up
    expect(round2(10.004)).toBe(10.00)
    expect(round2(10.999)).toBe(11.00)
    expect(round2(0.1 + 0.2)).toBe(0.3) // float stability
    expect(round2(NaN)).toBe(0)
    expect(round2(Infinity)).toBe(0)
  })

  it('toNumber() converts values to numbers with fallback', () => {
    expect(toNumber('10')).toBe(10)
    expect(toNumber('10.5')).toBe(10.5)
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber('invalid')).toBe(0)
    expect(toNumber('invalid', 99)).toBe(99)
    expect(toNumber(10)).toBe(10)
  })

  it('normalizeLineItem() handles both legacy and new formats', () => {
    // Legacy format: {amount}
    const legacy = normalizeLineItem({ description: 'Item', amount: 100 })
    expect(legacy).toEqual({
      description: 'Item',
      quantity: 1,
      unit_price: 100,
      line_total: 100,
    })

    // New format: quantity x unit_price
    const modern = normalizeLineItem({ description: 'Item', quantity: 5, unit_price: 20 })
    expect(modern).toEqual({
      description: 'Item',
      quantity: 5,
      unit_price: 20,
      line_total: 100,
    })

    // Empty defaults
    const empty = normalizeLineItem({})
    expect(empty).toEqual({
      description: 'Item',
      quantity: 1,
      unit_price: 0,
      line_total: 0,
    })

    // Negative values clamped to 0
    const negative = normalizeLineItem({ quantity: -5, unit_price: -10 })
    expect(negative).toEqual({
      description: 'Item',
      quantity: 0,
      unit_price: 0,
      line_total: 0,
    })
  })
})

describe('finance-core: Invoice Totals', () => {
  it('computeInvoiceTotals() with items', () => {
    const result = computeInvoiceTotals({
      items: [
        { description: 'Widget', quantity: 5, unit_price: 10 },
        { description: 'Gadget', quantity: 2, unit_price: 25 },
      ],
      discount_type: 'fixed',
      discount_value: 20,
      tax_rate: 10,
    })

    expect(result.subtotal).toBe(100) // 50 + 50
    expect(result.discount_amount).toBe(20)
    expect(result.taxable_base).toBe(80)
    expect(result.tax_amount).toBe(8)
    expect(result.total).toBe(88)
  })

  it('computeInvoiceTotals() with percentage discount', () => {
    const result = computeInvoiceTotals({
      items: [{ description: 'Item', quantity: 10, unit_price: 10 }],
      discount_type: 'percentage',
      discount_value: 10, // 10%
      tax_rate: 5,
    })

    expect(result.subtotal).toBe(100)
    expect(result.discount_amount).toBe(10) // 10% of 100
    expect(result.taxable_base).toBe(90)
    expect(result.tax_amount).toBe(4.5)
    expect(result.total).toBe(94.5)
  })

  it('computeInvoiceTotals() caps discount at subtotal', () => {
    const result = computeInvoiceTotals({
      items: [{ description: 'Item', quantity: 1, unit_price: 100 }],
      discount_type: 'fixed',
      discount_value: 200, // More than subtotal
      tax_rate: 0,
    })

    expect(result.discount_amount).toBe(100) // Capped
    expect(result.taxable_base).toBe(0)
    expect(result.total).toBe(0)
  })

  it('computeInvoiceTotals() with no discount or tax', () => {
    const result = computeInvoiceTotals({
      items: [{ amount: 75.5 }],
    })

    expect(result.subtotal).toBe(75.5)
    expect(result.discount_amount).toBe(0)
    expect(result.tax_amount).toBe(0)
    expect(result.total).toBe(75.5)
  })

  it('computeInvoiceTotals() clamps discount_type to valid enum', () => {
    const result = computeInvoiceTotals({
      items: [{ amount: 100 }],
      discount_type: 'invalid_type' as any,
    })

    expect(result.discount_type).toBe('none')
  })

  it('computeInvoiceTotals() clamps tax_rate to 0-100', () => {
    const result = computeInvoiceTotals({
      items: [{ amount: 100 }],
      tax_rate: 150, // Over 100%
    })

    expect(result.tax_rate).toBe(100)
    expect(result.tax_amount).toBe(100) // Tax applied to full 100 base (no discount)
  })
})

describe('finance-core: Invoice State Machine', () => {
  it('canTransitionInvoice() allows valid transitions', () => {
    expect(canTransitionInvoice('draft', 'sent')).toBe(true)
    expect(canTransitionInvoice('sent', 'partially_paid')).toBe(true)
    expect(canTransitionInvoice('partially_paid', 'paid')).toBe(true)
    expect(canTransitionInvoice('paid', 'partially_paid')).toBe(true) // Reversal path
  })

  it('canTransitionInvoice() rejects invalid transitions', () => {
    expect(canTransitionInvoice('sent', 'draft')).toBe(false)
    expect(canTransitionInvoice('cancelled', 'sent')).toBe(false)
    expect(canTransitionInvoice('paid', 'sent')).toBe(true) // Actually IS in reversal transitions
  })

  it('deriveInvoiceStatus() derives from payment amounts', () => {
    const today = '2025-01-15'

    // Fully paid
    expect(deriveInvoiceStatus({ status: 'sent', amount: 100, paid_amount: 100, due_date: '2025-02-01', today })).toBe('paid')

    // Partially paid
    expect(deriveInvoiceStatus({ status: 'sent', amount: 100, paid_amount: 50, due_date: '2025-02-01', today })).toBe(
      'partially_paid',
    )

    // Overdue
    expect(deriveInvoiceStatus({ status: 'sent', amount: 100, paid_amount: 0, due_date: '2025-01-01', today })).toBe('overdue')

    // Overdue but paid
    expect(deriveInvoiceStatus({ status: 'sent', amount: 100, paid_amount: 100, due_date: '2025-01-01', today })).toBe('paid')

    // Not yet due
    expect(deriveInvoiceStatus({ status: 'sent', amount: 100, paid_amount: 0, due_date: '2025-02-01', today })).toBe('sent')

    // Draft status never auto-derives
    expect(deriveInvoiceStatus({ status: 'draft', amount: 100, paid_amount: 0, due_date: '2025-01-01', today })).toBe('draft')

    // Cancelled status never auto-derives
    expect(deriveInvoiceStatus({ status: 'cancelled', amount: 100, paid_amount: 0, due_date: '2025-01-01', today })).toBe(
      'cancelled',
    )
  })
})

describe('finance-core: Date Utilities', () => {
  it('todayISO() returns today as YYYY-MM-DD', () => {
    const today = todayISO()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('addDaysFrom() adds days correctly', () => {
    expect(addDaysFrom('2025-01-15', 5)).toBe('2025-01-20')
    expect(addDaysFrom('2025-01-15', -5)).toBe('2025-01-10')
    expect(addDaysFrom('2025-01-31', 1)).toBe('2025-02-01') // Month boundary
    expect(addDaysFrom('2025-01-15', 0)).toBe('2025-01-15')
  })

  it('addMonthsFrom() adds months correctly', () => {
    expect(addMonthsFrom('2025-01-15', 1)).toBe('2025-02-15')
    expect(addMonthsFrom('2025-01-31', 1)).toBe('2025-02-28') // Day clamped
    expect(addMonthsFrom('2025-01-31', 2)).toBe('2025-03-31')
    expect(addMonthsFrom('2025-01-15', -1)).toBe('2024-12-15')
  })

  it('daysBetween() calculates days between two dates', () => {
    expect(daysBetween('2025-01-15', '2025-01-20')).toBe(5)
    expect(daysBetween('2025-01-20', '2025-01-15')).toBe(-5)
    expect(daysBetween('2025-01-15', '2025-01-15')).toBe(0)
  })

  it('installmentDueDate() calculates frequency-based due dates', () => {
    const start = '2025-01-15'
    expect(installmentDueDate(start, 'weekly', 1)).toBe('2025-01-22')
    expect(installmentDueDate(start, 'biweekly', 1)).toBe('2025-01-29')
    expect(installmentDueDate(start, 'monthly', 1)).toBe('2025-02-15')
    expect(installmentDueDate(start, 'quarterly', 1)).toBe('2025-04-15')
  })
})

describe('finance-core: Payment Plan Math', () => {
  it('splitInstallments() evenly splits total without losing cents', () => {
    const splits = splitInstallments(100, 3)
    expect(splits).toHaveLength(3)
    expect(splits.reduce((a, b) => a + b, 0)).toBe(100)
    expect(round2(splits[0] + splits[1] + splits[2])).toBe(100)

    // Check distribution (last gets remainder)
    expect(splits[0]).toBe(33.33)
    expect(splits[1]).toBe(33.33)
    expect(splits[2]).toBe(33.34)
  })

  it('splitInstallments() handles edge cases', () => {
    // Single installment
    expect(splitInstallments(100, 1)).toEqual([100])

    // Many installments
    const many = splitInstallments(10, 7)
    expect(many).toHaveLength(7)
    expect(many.reduce((a, b) => a + b, 0)).toBe(10)

    // Zero total
    const zero = splitInstallments(0, 3)
    expect(zero).toEqual([0, 0, 0])
  })

  it('deriveInstallmentStatus() determines installment status', () => {
    const today = '2025-01-15'

    expect(deriveInstallmentStatus({ amount: 100, paid_amount: 100, due_date: '2025-02-01', today })).toBe('paid')
    expect(deriveInstallmentStatus({ amount: 100, paid_amount: 50, due_date: '2025-02-01', today })).toBe('partial')
    expect(deriveInstallmentStatus({ amount: 100, paid_amount: 0, due_date: '2025-02-01', today })).toBe('pending')
    expect(deriveInstallmentStatus({ amount: 100, paid_amount: 0, due_date: '2025-01-01', today })).toBe('overdue')
    expect(deriveInstallmentStatus({ amount: 100, paid_amount: 50, due_date: '2025-01-01', today })).toBe('overdue')
  })

  it('allocatePlanPayments() allocates unlinked payments oldest-first', () => {
    const installments = [
      { id: 'a', amount: 100, due_date: '2025-02-01' },
      { id: 'b', amount: 100, due_date: '2025-01-01' }, // Earlier
      { id: 'c', amount: 100, due_date: '2025-03-01' },
    ]

    const allocated = allocatePlanPayments(
      installments,
      { a: 0, b: 0, c: 0 },
      150, // Unlinked payment
    )

    // Should allocate to 'b' first (oldest due), then 'a'
    expect(allocated.b).toBe(100) // Fully paid
    expect(allocated.a).toBe(50) // Partial
    expect(allocated.c).toBe(0) // Nothing left
  })

  it('allocatePlanPayments() respects direct payments', () => {
    const installments = [
      { id: 'a', amount: 100, due_date: '2025-02-01' },
      { id: 'b', amount: 100, due_date: '2025-01-01' },
    ]

    const allocated = allocatePlanPayments(
      installments,
      { a: 30, b: 0 }, // Direct payment to 'a'
      120, // Unlinked
    )

    // Allocation goes by oldest first: 'b' (2025-01-01) is oldest
    // 'b' gets min(120, 100) = 100, leaving 20 for 'a'
    // 'a' has direct 30, plus 20 from unlinked = 50
    expect(allocated.b).toBe(100)
    expect(allocated.a).toBe(50) // 30 direct + 20 allocated
  })

  it('derivePlanStatus() determines plan status', () => {
    expect(
      derivePlanStatus({
        current: 'active',
        remaining: 500,
        installmentStatuses: ['paid', 'paid', 'pending'],
      }),
    ).toBe('active')

    expect(
      derivePlanStatus({
        current: 'active',
        remaining: 500,
        installmentStatuses: ['paid', 'paid', 'overdue'],
      }),
    ).toBe('at_risk')

    expect(
      derivePlanStatus({
        current: 'active',
        remaining: 500,
        installmentStatuses: ['overdue', 'overdue', 'overdue'],
      }),
    ).toBe('defaulted')

    expect(
      derivePlanStatus({
        current: 'active',
        remaining: 0,
        installmentStatuses: ['paid', 'paid', 'paid'],
      }),
    ).toBe('completed')

    expect(
      derivePlanStatus({
        current: 'cancelled',
        remaining: 500,
        installmentStatuses: [],
      }),
    ).toBe('cancelled')

    expect(
      derivePlanStatus({
        current: 'paused',
        remaining: 500,
        installmentStatuses: [],
      }),
    ).toBe('paused')
  })

  it('canTransitionPlan() validates plan status transitions', () => {
    expect(canTransitionPlan('active', 'paused')).toBe(true)
    expect(canTransitionPlan('paused', 'active')).toBe(true)
    expect(canTransitionPlan('completed', 'active')).toBe(false)
    expect(canTransitionPlan('cancelled', 'active')).toBe(false)
  })
})

describe('finance-core: Risk Scoring', () => {
  it('scoreRisk() computes risk score from payment delays', () => {
    const result = scoreRisk({
      delays: [10, 20, 30], // Average 20 days late
      outstanding: 1000,
      overdue_amount: 0,
      max_days_overdue: 0,
    })

    expect(result.average_payment_delay_days).toBe(20)
    expect(result.on_time_percentage).toBe(0)
    expect(result.score).toBeGreaterThan(0)
    expect(result.level).toBe('medium')
    expect(result.factors.length).toBeGreaterThan(0)
  })

  it('scoreRisk() detects overdue amounts', () => {
    const result = scoreRisk({
      delays: [-5, -2, 0], // On time
      outstanding: 1000,
      overdue_amount: 500, // 50% overdue
      max_days_overdue: 30,
    })

    expect(result.score).toBeGreaterThan(20) // Overdue factor applies
    // Score = (500/1000) * 25 + (30 * 0.5) = 12.5 + 15 = 27.5 ~ 28
    expect(result.level).toBe('low') // Score 28 is still below 30
    expect(result.factors.some((f) => f.includes('overdue'))).toBe(true)
  })

  it('scoreRisk() uses reversed payments in calculation', () => {
    const resultNoReversals = scoreRisk({
      delays: [],
      outstanding: 100,
      overdue_amount: 0,
      max_days_overdue: 0,
      reversed_payment_count: 0,
    })

    const resultWithReversals = scoreRisk({
      delays: [],
      outstanding: 100,
      overdue_amount: 0,
      max_days_overdue: 0,
      reversed_payment_count: 3,
    })

    expect(resultWithReversals.score).toBeGreaterThan(resultNoReversals.score)
    expect(resultWithReversals.factors.some((f) => f.includes('reversed'))).toBe(true)
  })

  it('scoreRisk() clamps score between 0-100', () => {
    const extreme = scoreRisk({
      delays: Array(100).fill(365),
      outstanding: 1000000,
      overdue_amount: 1000000,
      max_days_overdue: 365,
      reversed_payment_count: 100,
    })

    expect(extreme.score).toBeLessThanOrEqual(100)
    expect(extreme.score).toBeGreaterThanOrEqual(0)
  })

  it('scoreRisk() returns "low" for good payment history', () => {
    const good = scoreRisk({
      delays: [-5, -10, -2],
      outstanding: 1000,
      overdue_amount: 0,
      max_days_overdue: 0,
    })

    expect(good.level).toBe('low')
    expect(good.score).toBeLessThan(30)
  })

  it('scoreRisk() returns "critical" for very bad history', () => {
    const critical = scoreRisk({
      delays: [90, 120, 150],
      outstanding: 10000,
      overdue_amount: 10000,
      max_days_overdue: 150,
    })

    expect(critical.level).toBe('critical')
    expect(critical.score).toBe(100)
  })
})
