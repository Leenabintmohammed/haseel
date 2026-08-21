import { describe, it, expect, vi } from 'vitest'
import {
  buildApprovalActionInput,
  computeEntityStateHash,
  createApprovalSignature,
  validateActionBeforeExecution,
} from '../src/lib/ai.functions'

vi.stubEnv('APPROVAL_SIGNING_SECRET', 'approval-test-secret')

function makeSupabase(entity: Record<string, unknown>, userId = 'user_123') {
  return {
    from: vi.fn((table: string) => {
      const query: Record<string, any> = {
        _filters: [] as Array<[string, unknown]>,
        select: vi.fn(() => query),
        eq: vi.fn((field: string, value: unknown) => {
          query._filters.push([field, value]);
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          let data = table === 'invoices' && entity.id === 'inv_1' ? entity : null;
          for (const [field, value] of query._filters) {
            if (field === 'id' && data && data.id !== value) data = null;
            if (field === 'owner_id' && data && data.owner_id !== value) data = null;
            if (field === 'policy_key' && data && data.policy_key !== value) data = null;
          }
          return { data, error: null };
        }),
      };
      return query;
    }),
  }
}

function makeApproval(entity: Record<string, unknown>, expiresAt: string) {
  const action = {
    owner_id: 'user_123',
    intent: 'send_invoice',
    tool_name: 'send_invoice',
    autonomy_level: 'approval_required',
    parameters: { invoice_id: 'inv_1' },
    entity_type: 'invoices',
    entity_id: 'inv_1',
    state_hash: computeEntityStateHash(entity),
    expires_at: expiresAt,
    status: 'awaiting_approval',
  }
  return {
    ...action,
    server_signature: createApprovalSignature(action),
  }
}

it('preserves approval signatures across a PostgreSQL timestamptz round trip', () => {
  const approval = {
    owner_id: 'user_123',
    intent: 'send_invoice',
    tool_name: 'send_invoice',
    autonomy_level: 'approval_required',
    parameters: { invoice_id: 'inv_1' },
    entity_type: 'invoices',
    entity_id: 'inv_1',
    state_hash: 'state_hash',
    status: 'awaiting_approval',
  }

  const signatureAtCreation = createApprovalSignature({
    ...approval,
    expires_at: '2026-08-18T12:34:56.789Z',
  })
  const signatureAfterRead = createApprovalSignature({
    ...approval,
    expires_at: '2026-08-18T12:34:56.789+00:00',
  })

  expect(signatureAfterRead).toBe(signatureAtCreation)
})

describe('AI approval state hash', () => {
  it('creates an approval with a persisted state hash', async () => {
    const entity = {
      id: 'inv_1',
      owner_id: 'user_123',
      status: 'sent',
      amount: 1000,
      paid_amount: 250,
      updated_at: '2025-01-01T00:00:00.000Z',
    }

    const action = await buildApprovalActionInput({ supabase: makeSupabase(entity), userId: 'user_123' } as any, 'send_invoice', { invoice_id: 'inv_1' })

    expect(action.ok).toBe(true)
    expect(action.entity_type).toBe('invoices')
    expect(action.entity_id).toBe('inv_1')
    expect(action.state_hash).toBe(computeEntityStateHash(entity))
  })

  it('approves when the entity is unchanged', async () => {
    const entity = {
      id: 'inv_1',
      owner_id: 'user_123',
      status: 'sent',
      amount: 1000,
      paid_amount: 250,
      updated_at: '2025-01-01T00:00:00.000Z',
    }

    const ctx = { supabase: makeSupabase(entity), userId: 'user_123' }
    const action = makeApproval(entity, new Date(Date.now() + 60_000).toISOString())

    await expect(validateActionBeforeExecution(ctx as any, action as any)).resolves.toMatchObject({ valid: true })
  })

  it.each([
    ['status', { status: 'overdue' }],
    ['amount', { amount: 1250 }],
    ['paid_amount', { paid_amount: 300 }],
    ['updated_at', { updated_at: '2025-01-02T00:00:00.000Z' }],
  ])('rejects approval when %s changes', async (_, patch) => {
    const original = {
      id: 'inv_1',
      owner_id: 'user_123',
      status: 'sent',
      amount: 1000,
      paid_amount: 250,
      updated_at: '2025-01-01T00:00:00.000Z',
    }
    const changed = { ...original, ...patch }

    const ctx = { supabase: makeSupabase(changed), userId: 'user_123' }
    const action = makeApproval(original, new Date(Date.now() + 60_000).toISOString())

    await expect(validateActionBeforeExecution(ctx as any, action as any)).resolves.toMatchObject({
      valid: false,
      reason: 'state_changed',
    })
  })

  it('rejects when approval is expired', async () => {
    const entity = {
      id: 'inv_1',
      owner_id: 'user_123',
      status: 'sent',
      amount: 1000,
      paid_amount: 250,
      updated_at: '2025-01-01T00:00:00.000Z',
    }

    const ctx = { supabase: makeSupabase(entity), userId: 'user_123' }
    const action = makeApproval(entity, new Date(Date.now() - 60_000).toISOString())

    await expect(validateActionBeforeExecution(ctx as any, action as any)).resolves.toMatchObject({
      valid: false,
      reason: 'expired',
    })
  })
})
