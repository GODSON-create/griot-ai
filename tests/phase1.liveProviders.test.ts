// ============================================================================
// GRIOT AI — PHASE 1 CONDITIONAL REAL-PROVIDER INTEGRATION TEST SUITE
// Runs against live upstream provider endpoints ONLY when real API credentials
// are present in the environment. Explicitly marks tests as skipped when
// credentials are absent — never claims real-provider testing when mocked.
// ============================================================================

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AnthropicProviderAdapter,
  GeminiProviderAdapter,
  loadGriotConfig,
  MistralProviderAdapter,
  OpenAiProviderAdapter,
  type ModelRegistryEntry,
} from '../src/index.ts';

const config = loadGriotConfig();

describe('GRIOT AI — Phase 1 Conditional Live Provider Integration Tests', () => {
  it(
    'Live OpenAI Provider Integration (requires OPENAI_API_KEY)',
    { skip: !config.providers.openai.apiKey ? 'Skipped: OPENAI_API_KEY not set in environment' : false },
    async () => {
      const adapter = new OpenAiProviderAdapter();
      const model: ModelRegistryEntry = {
        id: 'openai:gpt-4o-mini',
        provider: 'openai',
        modelIdentifier: 'gpt-4o-mini',
        displayName: 'OpenAI GPT-4o Mini',
        capabilities: ['chat', 'streaming'],
        contextWindow: 128000,
        maxOutputTokens: 1024,
        inputPricingPer1M: 0.15,
        cachedInputPricingPer1M: 0.075,
        outputPricingPer1M: 0.6,
        availability: 'available',
        supportedModalities: { input: ['text'], output: ['text'] },
        routingEligibility: {
          eligible: true,
          tiers: ['economy'],
          reasoningTier: 'standard',
          latencyClass: 'fast',
          priorityWeight: 90,
        },
        deploymentType: 'cloud_managed_api',
      };
      const res = await adapter.generate(
        {
          requestId: 'live_openai_1',
          model,
          messages: [{ role: 'user', content: 'Reply with the single word GRIOT.' }],
          maxOutputTokens: 16,
        },
        config.providers.openai
      );
      assert.ok(res.content.length > 0);
      assert.ok(res.usage.inputTokens > 0);
    }
  );

  it(
    'Live Google Gemini Provider Integration (requires GEMINI_API_KEY)',
    { skip: !config.providers.gemini.apiKey ? 'Skipped: GEMINI_API_KEY not set in environment' : false },
    async () => {
      const adapter = new GeminiProviderAdapter();
      const model: ModelRegistryEntry = {
        id: 'gemini:gemini-2.0-flash',
        provider: 'gemini',
        modelIdentifier: 'gemini-2.0-flash',
        displayName: 'Google Gemini 2.0 Flash',
        capabilities: ['chat', 'streaming'],
        contextWindow: 1048576,
        maxOutputTokens: 1024,
        inputPricingPer1M: 0.1,
        cachedInputPricingPer1M: 0.025,
        outputPricingPer1M: 0.4,
        availability: 'available',
        supportedModalities: { input: ['text'], output: ['text'] },
        routingEligibility: {
          eligible: true,
          tiers: ['economy'],
          reasoningTier: 'standard',
          latencyClass: 'fast',
          priorityWeight: 96,
        },
        deploymentType: 'cloud_managed_api',
      };
      const res = await adapter.generate(
        {
          requestId: 'live_gemini_1',
          model,
          messages: [{ role: 'user', content: 'Reply with the single word GRIOT.' }],
          maxOutputTokens: 16,
        },
        config.providers.gemini
      );
      assert.ok(res.content.length > 0);
    }
  );

  it(
    'Live Anthropic Provider Integration (requires ANTHROPIC_API_KEY)',
    { skip: !config.providers.anthropic.apiKey ? 'Skipped: ANTHROPIC_API_KEY not set in environment' : false },
    async () => {
      const adapter = new AnthropicProviderAdapter();
      const model: ModelRegistryEntry = {
        id: 'anthropic:claude-3-5-haiku-20241022',
        provider: 'anthropic',
        modelIdentifier: 'claude-3-5-haiku-20241022',
        displayName: 'Anthropic Claude 3.5 Haiku',
        capabilities: ['chat', 'streaming'],
        contextWindow: 200000,
        maxOutputTokens: 1024,
        inputPricingPer1M: 0.8,
        cachedInputPricingPer1M: 0.08,
        outputPricingPer1M: 4.0,
        availability: 'available',
        supportedModalities: { input: ['text'], output: ['text'] },
        routingEligibility: {
          eligible: true,
          tiers: ['economy'],
          reasoningTier: 'standard',
          latencyClass: 'fast',
          priorityWeight: 84,
        },
        deploymentType: 'cloud_managed_api',
      };
      const res = await adapter.generate(
        {
          requestId: 'live_anthropic_1',
          model,
          messages: [{ role: 'user', content: 'Reply with the single word GRIOT.' }],
          maxOutputTokens: 16,
        },
        config.providers.anthropic
      );
      assert.ok(res.content.length > 0);
    }
  );

  it(
    'Live Mistral Provider Integration (requires MISTRAL_API_KEY)',
    { skip: !config.providers.mistral.apiKey ? 'Skipped: MISTRAL_API_KEY not set in environment' : false },
    async () => {
      const adapter = new MistralProviderAdapter();
      const model: ModelRegistryEntry = {
        id: 'mistral:mistral-small-latest',
        provider: 'mistral',
        modelIdentifier: 'mistral-small-latest',
        displayName: 'Mistral Small 3',
        capabilities: ['chat', 'streaming'],
        contextWindow: 32768,
        maxOutputTokens: 1024,
        inputPricingPer1M: 0.1,
        cachedInputPricingPer1M: 0.1,
        outputPricingPer1M: 0.3,
        availability: 'available',
        supportedModalities: { input: ['text'], output: ['text'] },
        routingEligibility: {
          eligible: true,
          tiers: ['economy'],
          reasoningTier: 'standard',
          latencyClass: 'fast',
          priorityWeight: 89,
        },
        deploymentType: 'cloud_managed_api',
      };
      const res = await adapter.generate(
        {
          requestId: 'live_mistral_1',
          model,
          messages: [{ role: 'user', content: 'Reply with the single word GRIOT.' }],
          maxOutputTokens: 16,
        },
        config.providers.mistral
      );
      assert.ok(res.content.length > 0);
    }
  );
});
