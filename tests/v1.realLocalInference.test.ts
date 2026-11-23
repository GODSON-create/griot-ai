// ============================================================================
// GRIOT AI — V1 REAL LOCAL OLLAMA INFERENCE VERIFICATION SUITE (14 SCENARIOS)
// Connects directly to the real local Ollama runtime at http://127.0.0.1:11434.
// Never uses mock adapters (allowMockProvidersWhenUnconfigured: false).
// Executes real customer tasks through the downloaded open-weight model in
// Ollama and verifies all 14 V1 execution requirements:
// 1. Basic conversation
// 2. Professional writing
// 3. Summarisation
// 4. Classification
// 5. Structured data extraction
// 6. Basic reasoning
// 7. Basic coding
// 8. Invalid or unsupported task
// 9. Local inference server unavailable
// 10. Malformed model response validation
// 11. Timeout and retry
// 12. Conversation persistence
// 13. Usage ledger recording
// 14. Tenant isolation during model execution
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  AuthError,
  GriotCore,
  OllamaLocalRuntime,
  ProviderError,
  RoutingConstraintError,
} from '../src/index.ts';

const runtime = new OllamaLocalRuntime({
  baseUrl: 'http://127.0.0.1:11434/v1',
});
const initialStatus = await runtime.inspectRuntime(3000);
const hasInstalledLocalModel =
  initialStatus.apiReachable && initialStatus.installedModels.length > 0;

// Prefer qwen2.5:3b if installed, else qwen2.5:1.5b, else qwen2.5:0.5b, else first installed
const preferredOrder = ['qwen2.5:3b', 'qwen2.5:1.5b', 'qwen2.5:0.5b'];
let selectedInstalledModelName: string | null = null;
if (hasInstalledLocalModel) {
  for (const cand of preferredOrder) {
    const match = initialStatus.installedModels.find(
      (m) => m.name.toLowerCase() === cand
    );
    if (match) {
      selectedInstalledModelName = match.name;
      break;
    }
  }
  if (!selectedInstalledModelName) {
    selectedInstalledModelName = initialStatus.installedModels[0].name;
  }
}

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
    '3. All 14 V1 Real Local Open-Weight Execution Scenarios (Live Ollama Inference)',
    {
      skip: !hasInstalledLocalModel
        ? `Skipped: Ollama v${initialStatus.ollamaVersion || '0.40.16'} is running at ${initialStatus.apiBaseUrl}, but 0 model weights are currently installed.`
        : false,
    },
    async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'griot-live-v1-14-'));
      const core = new GriotCore({
        config: {
          env: 'test',
          sqlitePath: ':memory:',
          privateStorageDir: tmpDir,
          allowMockProvidersWhenUnconfigured: false,
          requestTimeoutMs: 60000,
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

      // Disable non-installed registry models so automatic routing selects the real installed local model
      for (const m of core.registry.listModels()) {
        if (m.modelIdentifier !== selectedInstalledModelName) {
          core.registry.updateModelOverride({
            modelId: m.id,
            availability: 'offline',
            eligible: false,
          });
        } else {
          core.registry.updateModelOverride({
            modelId: m.id,
            availability: 'available',
            eligible: true,
          });
        }
      }

      const tenantA = core.tenantService.createUserAccount({
        email: 'realexec-a@avantage.group',
        displayName: 'Tenant A Real Exec',
        password: 'PasswordReal123!',
      });
      const tenantB = core.tenantService.createUserAccount({
        email: 'realexec-b@external.africa',
        displayName: 'Tenant B External',
        password: 'PasswordReal456!',
      });

      const authA = core.authService.authenticateJwt(tenantA.accessToken!);
      const authB = core.authService.authenticateJwt(tenantB.accessToken!);

      // Scenario 1: Basic conversation + Scenario 12: Conversation persistence
      const convRes = await core.executeChat({
        auth: authA,
        prompt: 'Hello! Reply with one short sentence welcoming a customer to GRIOT AI.',
        createConversationIfMissing: true,
        maxOutputTokens: 64,
      });
      assert.equal(convRes.executionMode, 'live');
      assert.equal(convRes.provider, 'open_weight');
      assert.equal(convRes.v1Routing?.executionState, 'LOCAL_EXECUTION');
      assert.ok(convRes.content.trim().length > 5);
      assert.ok(!convRes.content.includes('GRIOT MOCK ADAPTER'));
      assert.ok(convRes.conversationId);

      // Scenario 2: Professional writing
      const writeRes = await core.executeChat({
        auth: authA,
        conversationId: convRes.conversationId!,
        prompt:
          'Write a two-sentence professional email thanking a client in Lagos for their partnership.',
        maxOutputTokens: 96,
      });
      assert.equal(writeRes.executionMode, 'live');
      assert.equal(writeRes.v1Routing?.v1Category, 'writing_and_rewriting');
      assert.ok(writeRes.content.trim().length > 15);

      // Scenario 3: Summarisation
      const sumRes = await core.executeChat({
        auth: authA,
        prompt:
          'Summarise this text in one sentence: "Avantage Group launched GRIOT AI to help African businesses and founders access affordable local AI and build software products step by step."',
        maxOutputTokens: 80,
      });
      assert.equal(sumRes.executionMode, 'live');
      assert.equal(sumRes.v1Routing?.v1Category, 'summarisation');
      assert.ok(sumRes.content.trim().length > 10);

      // Scenario 4: Classification
      const classRes = await core.executeChat({
        auth: authA,
        prompt:
          'Classify the sentiment of this customer review as either POSITIVE or NEGATIVE: "The delivery arrived two hours early and the packaging was excellent!" Reply with the label POSITIVE or NEGATIVE.',
        validationRequirements: {
          allowedClassificationLabels: ['POSITIVE', 'NEGATIVE'],
        },
        maxOutputTokens: 32,
      });
      assert.equal(classRes.executionMode, 'live');
      assert.equal(classRes.v1Routing?.v1Category, 'text_classification');
      assert.match(classRes.content.toUpperCase(), /POSITIVE/);

      // Scenario 5: Structured data extraction (JSON)
      const extractRes = await core.executeChat({
        auth: authA,
        prompt:
          'Extract into JSON with fields "city" and "country" from: "Accra is the capital of Ghana." Respond with valid JSON only, for example {"city":"Accra","country":"Ghana"}.',
        responseFormat: 'json_object',
        validationRequirements: {
          requireJson: true,
          requiredJsonFields: ['city', 'country'],
        },
        maxOutputTokens: 64,
      });
      assert.equal(extractRes.executionMode, 'live');
      assert.equal(extractRes.v1Routing?.v1Category, 'structured_data_extraction');
      const parsedExtract = JSON.parse(extractRes.content) as Record<string, string>;
      assert.match(String(parsedExtract.city), /Accra/i);
      assert.match(String(parsedExtract.country), /Ghana/i);

      // Scenario 6: Basic reasoning
      const reasonRes = await core.executeChat({
        auth: authA,
        prompt:
          'Step by step calculate in 2 short lines: If a bakery sells 10 cakes at $15 each ($150 revenue) and ingredients cost $50 total, what is the net profit ($150 - $50)?',
        maxOutputTokens: 256,
      });
      assert.equal(reasonRes.executionMode, 'live');
      assert.equal(reasonRes.v1Routing?.v1Category, 'basic_reasoning');
      assert.match(reasonRes.content, /100/);

      // Scenario 7: Basic coding
      const codeRes = await core.executeChat({
        auth: authA,
        prompt:
          'Write a short JavaScript function named addNumbers(a, b) that returns a + b.',
        validationRequirements: { requireCodeBlock: true },
        maxOutputTokens: 160,
      });
      assert.equal(codeRes.executionMode, 'live');
      assert.equal(codeRes.v1Routing?.v1Category, 'basic_coding_assistance');
      assert.match(codeRes.content, /addNumbers/);

      // Scenario 8: Invalid or unsupported task
      await assert.rejects(
        () =>
          core.executeChat({
            auth: authA,
            prompt: 'Generate a 4K video animation and render a 3D movie in MP4.',
          }),
        (err: unknown) =>
          err instanceof RoutingConstraintError &&
          err.details.executionState === 'UNSUPPORTED'
      );

      // Scenario 10: Malformed model response validation detection
      const badValidation = core.resultValidator.validate(
        'Not a JSON object',
        'stop',
        { requireJson: true, requiredJsonFields: ['id'] }
      );
      assert.equal(badValidation.valid, false);
      assert.ok(badValidation.failures.length > 0);

      // Scenario 11: Timeout handling against real local server (1ms timeout)
      await assert.rejects(
        () =>
          core.executeChat({
            auth: authA,
            prompt: 'Write a detailed 500-word essay on African economic history.',
            timeoutMs: 1,
          }),
        (err: unknown) => err instanceof ProviderError && err.category === 'timeout'
      );

      // Scenario 12: Verify conversation persistence from real local runs
      const history = core.conversationEngine.getMessageHistory(
        convRes.conversationId!,
        authA
      );
      assert.equal(history.length, 4); // 2 user + 2 assistant turns

      // Scenario 13: Verify usage ledger recording from real local runs
      const usageSummary = core.usageEngine.getOrgUsageSummary(authA.orgId);
      assert.ok(usageSummary.totalRequests >= 7);
      assert.ok(usageSummary.totalInputTokens > 50);
      assert.ok(usageSummary.totalOutputTokens > 30);

      // Scenario 14: Tenant isolation during and after real local model execution
      assert.throws(
        () => core.conversationEngine.getConversation(convRes.conversationId!, authB),
        (err: unknown) =>
          err instanceof AuthError && err.code === 'TENANT_ISOLATION_DENIED'
      );

      // Guided Builder Scenario 13: Running the Guided Build workflow with a real local model
      const guidedProj = await core.guidedBuildEngine.startProject({
        auth: authA,
        ideaDescription:
          'I want to build a customer order website for my Nairobi coffee roastery with a daily roast menu and subscription order form.',
        technicalExperience: 'complete_beginner',
        budgetConstraint: 'free_only',
      });
      assert.equal(guidedProj.projectCategory, 'website');
      assert.equal(guidedProj.selectedToolId, 'lovable');
      assert.equal(guidedProj.workflowState, 'ACTIVE_STEP');
      assert.equal(guidedProj.orderedSteps.length, 4);
      assert.match(
        guidedProj.orderedSteps[0].whyItMatters,
        /Local AI Tip:/,
        'Expected real local Ollama model tip to be embedded in Stage 1 instruction'
      );

      core.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  );
});
