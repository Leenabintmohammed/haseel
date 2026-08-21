/// <reference types="node" />

import { describe, it, expect, vi, beforeEach } from 'vitest'

const createOpenAI = vi.fn()

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (options: { apiKey?: string } = {}) => {
    createOpenAI(options)
    return vi.fn((modelId: string) => ({ modelId, provider: 'openai', apiKey: options.apiKey }))
  },
}))

describe('AI provider selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.OPENAI_API_KEY
    delete process.env.DUELY_AI_MODEL
  })

  it('uses OPENAI_API_KEY and the default Luna model', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const { getDuelyModel, hasAiProvider } = await import('../src/lib/ai-provider.server')

    expect(hasAiProvider()).toBe(true)

    const model = getDuelyModel()
    expect(model).toMatchObject({ modelId: 'gpt-5.6-luna', provider: 'openai', apiKey: 'test-key' })
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'test-key' })
  })

  it('uses the reasoning model when requested and honors the override', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.DUELY_AI_MODEL = 'gpt-4.1-mini'

    const { getDuelyModel } = await import('../src/lib/ai-provider.server')

    const model = getDuelyModel('reasoning')
    expect(model).toMatchObject({ modelId: 'gpt-4.1-mini', provider: 'openai', apiKey: 'test-key' })
  })
})
