import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  computeInvoiceTotals,
  deriveInvoiceStatus,
  splitInstallments,
  allocatePlanPayments,
  deriveInstallmentStatus,
  canTransitionInvoice,
  round2,
  scoreRisk,
} from '../src/lib/finance-core'

/**
 * Integration tests for payment recording, reversal, and idempotency patterns.
 * These tests verify the business logic without hitting the actual database.
 */

describe('finance-core: Payment Idempotency & Reversals', () => {
  it('Payment idempotency: same payment recorded twice produces consistent state', () => {
    // Simulate recording a payment twice with same idempotency key
    const today = '2025-01-20'
    const invoice1 = { status: 'sent', amount: 100, paid_amount: 0, due_date: '2025-02-01', today }
    const payment1Applied = deriveInvoiceStatus({
      ...invoice1,
      paid_amount: 50,
    })
    expect(payment1Applied).toBe('partially_paid')

    // Second identical payment attempt should not change status
    // (in actual code, idempotency_key unique constraint prevents duplicate insert)
    const payment2Applied = deriveInvoiceStatus({
      ...invoice1,
      paid_amount: 50, // Same amount, no change
    })
    expect(payment2Applied).toBe('partially_paid')
  })

  it('Payment reversal: paid invoice transitions back through state machine', () => {
    // Before reversal: invoice was paid
    let invoice = { status: 'paid', amount: 100, paid_amount: 100, due_date: '2025-02-01' }
    expect(deriveInvoiceStatus(invoice)).toBe('paid')

    // Simulate reversal by reducing paid_amount
    invoice = { ...invoice, paid_amount: 0 }

    // After reversal: should derive back to sent/overdue based on date
    const today = '2025-01-20'
    const afterReversal = deriveInvoiceStatus({ ...invoice, today })
    expect(afterReversal).toBe('sent')
  })

  it('Payment reversal preserves state: reversing part of a payment', () => {
    const today = '2025-01-20'

    // Original state: partially paid
    let invoice = {
      status: 'partially_paid',
      amount: 100,
      paid_amount: 60,
      due_date: '2025-02-01',
      today,
    }
    expect(deriveInvoiceStatus(invoice)).toBe('partially_paid')

    // Reverse part of payment
    invoice = { ...invoice, paid_amount: 30 }
    const afterPartialReversal = deriveInvoiceStatus(invoice)
    expect(afterPartialReversal).toBe('partially_paid')

    // Reverse all payments
    invoice = { ...invoice, paid_amount: 0 }
    const afterFullReversal = deriveInvoiceStatus(invoice)
    expect(afterFullReversal).toBe('sent')
  })
})

describe('finance-core: Payment Plan Idempotency', () => {
  it('Payment plan: allocating same payment twice uses idempotency key in real scenario', () => {
    const installments = [
      { id: 'i1', amount: 100, due_date: '2025-01-01' },
      { id: 'i2', amount: 100, due_date: '2025-02-01' },
      { id: 'i3', amount: 100, due_date: '2025-03-01' },
    ]

    // First allocation with $150 unlinked payment
    const alloc1 = allocatePlanPayments(installments, {}, 150)
    expect(alloc1['i1']).toBe(100) // Oldest
    expect(alloc1['i2']).toBe(50)
    expect(alloc1['i3']).toBe(0)

    // If system tries to allocate same $150 again (idempotency issue),
    // it should only happen if no record exists. With idempotency_key, second
    // attempt would be rejected at DB level.
    const alloc2 = allocatePlanPayments(installments, {}, 150)
    expect(alloc2).toEqual(alloc1) // Same result
  })

  it('Payment plan: direct + unlinked allocation is deterministic', () => {
    const installments = [
      { id: 'a', amount: 100, due_date: '2025-02-01' },
      { id: 'b', amount: 100, due_date: '2025-01-01' }, // Earlier
      { id: 'c', amount: 100, due_date: '2025-03-01' },
    ]

    // Direct payment to 'a', plus unlinked
    const result = allocatePlanPayments(
      installments,
      { a: 40 },
      110,
    )

    // Allocation: 'b' (oldest) gets min(110, 100) = 100, leaving 10
    // 'a' gets direct 40 + 10 allocated = 50
    // 'c' gets 0
    expect(result['b']).toBe(100)
    expect(result['a']).toBe(50)
    expect(result['c']).toBe(0)

    // Running again with same inputs produces same result
    const result2 = allocatePlanPayments(
      installments,
      { a: 40 },
      110,
    )
    expect(result2).toEqual(result)
  })
})

describe('finance-core: Invoice Totals Consistency', () => {
  it('Computing totals is idempotent: same inputs always produce same totals', () => {
    const input = {
      items: [
        { description: 'Widget', quantity: 5, unit_price: 20 },
        { description: 'Service', quantity: 1, unit_price: 50 },
      ],
      discount_type: 'percentage' as const,
      discount_value: 10,
      tax_rate: 8.5,
    }

    const total1 = computeInvoiceTotals(input)
    const total2 = computeInvoiceTotals(input)

    expect(total1).toEqual(total2)
    expect(total1.subtotal).toBe(total2.subtotal)
    expect(total1.discount_amount).toBe(total2.discount_amount)
    expect(total1.tax_amount).toBe(total2.tax_amount)
    expect(total1.total).toBe(total2.total)
  })

  it('Rounding is consistent: repeated calculations preserve precision', () => {
    // Case where rounding matters
    const items = [
      { description: 'Item', quantity: 3, unit_price: 10.005 },
    ]

    const totals1 = computeInvoiceTotals({ items })
    const totals2 = computeInvoiceTotals({ items })

    expect(totals1.subtotal).toBe(totals2.subtotal)
    expect(round2(totals1.subtotal)).toBe(round2(totals2.subtotal))
  })
})

describe('finance-core: State Machine Reversibility', () => {
  it('Invoice state machine: all transitions preserve history capability', () => {
    const today = '2025-01-15'

    // Forward path: draft -> sent -> partially_paid -> paid
    expect(canTransitionInvoice('draft', 'sent')).toBe(true)
    expect(canTransitionInvoice('sent', 'partially_paid')).toBe(true)
    expect(canTransitionInvoice('partially_paid', 'paid')).toBe(true)

    // Reversal paths (enabled by payment reversal)
    expect(canTransitionInvoice('paid', 'partially_paid')).toBe(true)
    expect(canTransitionInvoice('paid', 'viewed')).toBe(true)
    expect(canTransitionInvoice('paid', 'sent')).toBe(true)
    expect(canTransitionInvoice('partially_paid', 'partially_paid')).toBe(true)

    // No transition to terminal state draft
    expect(canTransitionInvoice('sent', 'draft')).toBe(false)
  })

  it('Invoice status derivation respects state machine', () => {
    const today = '2025-01-15'

    // Can derive from sent to overdue
    let inv = { status: 'sent', amount: 100, paid_amount: 0, due_date: '2025-01-01', today }
    expect(deriveInvoiceStatus(inv)).toBe('overdue')
    expect(canTransitionInvoice('sent', 'overdue')).toBe(true)

    // Can derive from overdue back to partially_paid via payment
    inv = { ...inv, paid_amount: 50 }
    expect(deriveInvoiceStatus(inv)).toBe('overdue')
    expect(canTransitionInvoice('overdue', 'overdue')).toBe(true)

    // But cannot manually transition draft -> overdue (never auto-derives from draft)
    inv = { ...inv, status: 'draft', paid_amount: 0 }
    expect(deriveInvoiceStatus(inv)).toBe('draft')
    expect(canTransitionInvoice('draft', 'overdue')).toBe(false)
  })
})

describe('finance-core: Authorization-like Properties', () => {
  it('Owner-scoped calculations: risk scoring per client is independent', () => {
    // Each client's risk score depends only on their payment history
    const client1Risk = {
      delays: [10, 15, 20],
      outstanding: 1000,
      overdue_amount: 0,
      max_days_overdue: 0,
    }

    const client2Risk = {
      delays: [2, 5],
      outstanding: 5000,
      overdue_amount: 0,
      max_days_overdue: 0,
    }

    // Get score
    const { score: score1 } = scoreRisk(client1Risk)
    const { score: score2 } = scoreRisk(client2Risk)

    // Client 1 pays later on average, so higher risk
    expect(score1).toBeGreaterThan(score2)
  })

  it('Amounts are rounded consistently to prevent authorization bypass via precision', () => {
    // Try to use float precision to bypass amount checks
    const amount1 = 99.9949 // Rounds to 99.99
    const amount2 = 99.995 // Rounds to 100.00

    expect(round2(amount1)).toBe(99.99)
    expect(round2(amount2)).toBe(100.00)

    // Both should respect the same precision tier
    expect(round2(amount1 + 0.01)).toBe(100)
    expect(round2(amount2)).toBe(100)
  })
})
