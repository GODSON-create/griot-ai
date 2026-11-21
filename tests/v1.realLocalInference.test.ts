// ============================================================================
// GRIOT AI — V1 REAL LOCAL OLLAMA INFERENCE VERIFICATION SUITE
// Connects directly to the real local Ollama runtime at http://127.0.0.1:11434.
// Never uses mock adapters. If local model weights are not yet downloaded on
// the host (e.g. due to offline DNS to registry.ollama.ai), verifies live
// daemon reachability & structured 404/unavailable handling and explicitly
// skips weight-dependent generation assertions rather than faking results.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  GriotCore,
  OllamaLocalRuntime,
  ProviderError,
} from '../src/index.ts';

const runtime = new OllamaLocalRuntime({
  baseUrl: 'http://127.0.0.1:11434/v1',
});
const initialStatus = await runtime.inspectRuntime(3000);
const hasInstalledLocalModel =
  initialStatus.apiReachable && initialStatus.installedModels.length > 0;
const firstInstalledModelName = hasInstalledLocalModel
  ? initialStatus.installedModels[0].name
  : null;

describe('GRIOT AI — V1 Real Local Ollama Runtime & Open-Weight Execution Suite', () => {
  it('1. Local Ollama Binary Installation & Loopback Security Policy Verification', () => {
    const bin = runtime.detectBinaryPath();
    assert.equal(
      bin.installed,
      true,
      'Expected Ollama binary to be installed on the host machine'
    );
    assert.ok(bin.binaryPath && bin.binaryPath.toLowerCase().includes('ollama'));
    assert.equal(runtime.isLoopbackUrl(runtime.getNativeBaseUrl()), true);

    // Verify non-loopback local inference exposure is rejected without explicit security approval
    assert.throws(
      () =>
        new OllamaLocalRuntime({
          baseUrl: 'http://0.0.0.0:11434/v1',
          allowPublicExposure: false,
        }),
      /Security policy violation/
    );
  });

  it(
    '2. Live Local Ollama Daemon Reachability & Structured Unpulled Model Error Handling',
    {
      skip: !initialStatus.apiReachable
        ? `Skipped: Local Ollama server is not currently running at ${initialStatus.apiBaseUrl}`
        : false,
    },
    async () => {
      assert.equal(initialStatus.apiReachable, true);
      assert.ok(initialStatus.ollamaVersion);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'griot-real-ollama-'));
      const core = new GriotCore({
        config: {
          env: 'test',
          sqlitePath: ':memory:',
          privateStorageDir: tmpDir,
          allowMockProvidersWhenUnconfigured: false,
          providers: {
            open_weight: {
              apiKey: 'local-ollama',
              baseUrl: 'http://127.0.0.1:11434/v1',
            },
            openai: { apiKey: null, baseUrl: 'https://api.openai.com/v1' },
            gemini: { apiKey: null, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
            anthropic: { apiKey: null, baseUrl: 'https://api.anthropic.com/v1' },
            mistral: { apiKey: null, baseUrl: 'https://api.mistral.ai/v1' },
          },
        },
      });

      const user = core.tenantService.createUserAccount({
        email: 'livecheck@avantage.group',
        displayName: 'Live Ollama Check',
        password: 'PasswordLive123!',
      });
      const auth = core.authService.authenticateJwt(user.accessToken!);

      // Register a nonexistent local model to prove real wire communication with Ollama 127.0.0.1:11434
      core.registry.registerDynamicModel({
        id: 'open_weight:nonexistent-model-probe',
        provider: 'open_weight',
        modelIdentifier: 'nonexistent-griot-probe:0b',
        displayName: 'Nonexistent Probe Model',
        capabilities: ['chat'],
        contextWindow: 4096,
        maxOutputTokens: 256,
        inputPricingPer1M: 0,
        cachedInputPricingPer1M: 0,
        outputPricingPer1M: 0,
        availability: 'available',
        supportedModalities: { input: ['text'], output: ['text'] },
        routingEligibility: {
          eligible: true,
          tiers: ['economy'],
          reasoningTier: 'standard',
          latencyClass: 'fast',
          priorityWeight: 10,
        },
        deploymentType: 'self_hosted_or_compatible_endpoint',
      });

      await assert.rejects(
        () =>
          core.executeChat({
            auth,
            prompt: 'Probe unpulled model handling',
            routingHints: { requestedModelId: 'open_weight:nonexistent-model-probe' },
          }),
        (err: unknown) => err instanceof ProviderError && err.provider === 'open_weight'
      );

      core.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  );

  it(
    '3. Live Local Open-Weight Model Inference Execution (Requires Installed Model Weights in Ollama)',
    {
      skip: !hasInstalledLocalModel
        ? `Skipped: Ollama v${initialStatus.ollamaVersion || '0.40.16'} is running at ${initialStatus.apiBaseUrl}, but 0 model weights are currently installed (model pull interrupted by offline DNS to registry.ollama.ai). Refusing to count mock responses as real model execution.`
        : false,
    },
    async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'griot-live-weights-'));
      const core = new GriotCore({
        config: {
          env: 'test',
          sqlitePath: ':memory:',
          privateStorageDir: tmpDir,
          allowMockProvidersWhenUnconfigured: false,
          providers: {
            open_weight: {
              apiKey: 'local-ollama',
              baseUrl: 'http://127.0.0.1:11434/v1',
            },
            openai: { apiKey: null, baseUrl: 'https://api.openai.com/v1' },
            gemini: { apiKey: null, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
            anthropic: { apiKey: null, baseUrl: 'https://api.anthropic.com/v1' },
            mistral: { apiKey: null, baseUrl: 'https://api.mistral.ai/v1' },
          },
        },
      });

      core.registry.registerDynamicModel({
        id: `open_weight:${firstInstalledModelName}`,
        provider: 'open_weight',
        modelIdentifier: firstInstalledModelName!,
        displayName: `Installed Local Model (${firstInstalledModelName})`,
        capabilities: ['chat', 'writing', 'summarization', 'classification', 'extraction', 'reasoning', 'coding', 'json_mode', 'streaming'],
        contextWindow: 32768,
        maxOutputTokens: 2048,
        inputPricingPer1M: 0,
        cachedInputPricingPer1M: 0,
        outputPricingPer1M: 0,
        availability: 'available',
        supportedModalities: { input: ['text'], output: ['text'] },
        routingEligibility: {
          eligible: true,
          tiers: ['economy', 'standard'],
          reasoningTier: 'standard',
          latencyClass: 'fast',
          priorityWeight: 100,
        },
        deploymentType: 'self_hosted_or_compatible_endpoint',
      });

      const user = core.tenantService.createUserAccount({
        email: 'realmodel@avantage.group',
        displayName: 'Real Model Executor',
        password: 'PasswordReal123!',
      });
      const auth = core.authService.authenticateJwt(user.accessToken!);

      const res = await core.executeChat({
        auth,
        prompt: 'Reply with a one-sentence greeting from GRIOT AI.',
        routingHints: { requestedModelId: `open_weight:${firstInstalledModelName}` },
      });

      assert.equal(res.executionMode, 'live');
      assert.equal(res.provider, 'open_weight');
      assert.ok(res.content.trim().length > 0);
      assert.ok(res.usageLedger.inputTokens > 0);
      assert.ok(res.usageLedger.outputTokens > 0);

      core.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  );
});
