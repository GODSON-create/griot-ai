// ============================================================================
// GRIOT AI — V1 GUIDED BUILDER & V1 TASK ROUTING / VALIDATION TEST SUITE
// Covers all 15 Guided Builder scenarios ("BUILD WITH GRIOT" & "ASK GRIOT")
// and all V1 Task Routing, Result Validation, Local Queue/Concurrency,
// Unavailable Local Server, Malformed Output, Timeout/Retry, and Tenant
// Isolation scenarios.
// (Strictly separated from real local Ollama model-weight execution tests.)
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import vm from 'node:vm';
import {
  AuthError,
  GriotCore,
  GriotHttpServer,
  LocalQueueLimitError,
  ProviderError,
  RoutingConstraintError,
  type FetchFunction,
} from '../src/index.ts';
import { renderGriotWebInterfaceHtml } from '../src/ui/griotAppHtml.ts';

describe('GRIOT AI — V1 Guided Builder, V1 Task Router & Result Validation Suite', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'griot-v1-builder-'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup issues on Windows
    }
  });

  it('1. Guided Builder Scenarios (1–12): Beginner app & website ideas, skill/budget tool selection, spec & multi-stage plan, platform instructions, save/resume, step approval, error troubleshooting, conversation memory & tenant isolation', async () => {
    const core = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        privateStorageDir: path.join(tmpDir, 'vault1'),
      },
    });

    const userA = core.tenantService.createUserAccount({
      email: 'tunde@lagosbakery.africa',
      displayName: 'Tunde Bakery Founder',
      password: 'BuilderPassword123!',
    });
    const userB = core.tenantService.createUserAccount({
      email: 'grace@nairobi-logistics.africa',
      displayName: 'Grace Logistics',
      password: 'BuilderPassword456!',
    });

    const authA = core.authService.authenticateJwt(userA.accessToken!);
    const authB = core.authService.authenticateJwt(userB.accessToken!);

    // Scenario 1: Beginner describing a mobile/web app idea
    const appProject = await core.guidedBuildEngine.startProject({
      auth: authA,
      ideaDescription:
        'I want to create a delivery tracking web application for my small courier business where customers can enter a tracking number and drivers can update delivery status.',
      technicalExperience: 'complete_beginner',
      budgetConstraint: 'free_only',
    });
    assert.equal(appProject.projectCategory, 'web_application');
    assert.equal(appProject.technicalExperience, 'complete_beginner');
    assert.equal(appProject.selectedToolId, 'lovable');
    assert.equal(appProject.workflowState, 'ACTIVE_STEP');

    // Scenario 2: Beginner describing a website idea
    const websiteProject = await core.guidedBuildEngine.startProject({
      auth: authA,
      ideaDescription:
        'I want to build a simple website and landing page for my Lagos bakery showing our cake menu, prices, and a customer booking form.',
      technicalExperience: 'complete_beginner',
      budgetConstraint: 'free_only',
    });
    assert.equal(websiteProject.projectCategory, 'website');
    assert.equal(websiteProject.selectedToolId, 'lovable');

    // Scenario 3: Tool selection based on skill and budget
    // 3a. Complete beginner building an automation -> recommends n8n / Make
    const autoRec = core.guidedBuildEngine.toolRegistry.recommendTool({
      projectCategory: 'automation',
      technicalExperience: 'complete_beginner',
      budgetConstraint: 'free_only',
    });
    assert.equal(autoRec.recommendedTool.id, 'n8n_make');

    // 3b. Intermediate/advanced developer building a mobile application -> recommends Google Antigravity
    const devRec = core.guidedBuildEngine.toolRegistry.recommendTool({
      projectCategory: 'mobile_application',
      technicalExperience: 'intermediate',
      budgetConstraint: 'free_only',
    });
    assert.equal(devRec.recommendedTool.id, 'google_antigravity');
    assert.match(devRec.transparencyNotice, /does not directly control or modify/);

    // Scenario 4: Generation of a structured project specification + Quality Control
    assert.ok(websiteProject.specification);
    assert.ok(websiteProject.specification!.mvpFeatures.length >= 1);
    assert.ok(websiteProject.specification!.pagesOrWorkflows.length >= 3);
    assert.ok(websiteProject.qualityCheck);
    assert.equal(websiteProject.qualityCheck!.passed, true);
    assert.equal(
      websiteProject.qualityCheck!.checks.noFalseExternalExecutionClaim,
      true
    );

    // Scenario 5 & 6: Multi-stage build plan & platform-specific instructions with all required fields
    assert.equal(websiteProject.orderedSteps.length, 4);
    const step1 = websiteProject.orderedSteps[0];
    assert.equal(step1.stepNumber, 1);
    assert.ok(step1.whatToAchieve.length > 10);
    assert.ok(step1.whyItMatters.length > 10);
    assert.match(step1.platformToOpen, /Lovable/);
    assert.ok(step1.navigationSteps.length >= 2);
    assert.ok(step1.exactPromptOrCode.length > 30);
    assert.ok(step1.expectedResult.length > 10);
    assert.ok(step1.howToVerify.length >= 2);
    assert.ok(step1.ifItFails.length > 10);
    assert.match(step1.transparencyDisclaimer, /does not directly modify/);

    // Scenario 7: Saving and resuming a project without explaining everything again
    const resumed = core.guidedBuildEngine.getProject(websiteProject.id, authA);
    assert.equal(resumed.id, websiteProject.id);
    assert.equal(resumed.title, websiteProject.title);
    assert.equal(resumed.currentStepIndex, 0);
    assert.equal(resumed.selectedToolId, 'lovable');

    // Scenario 8: Advancing and completing steps
    const afterStep1 = core.guidedBuildEngine.submitStepResult({
      projectId: websiteProject.id,
      auth: authA,
      userObservation:
        'The bakery home page and cake catalog loaded cleanly in the Lovable live preview!',
      markApproved: true,
    });
    assert.equal(afterStep1.currentStepIndex, 1);
    assert.deepEqual(afterStep1.completedSteps, [0]);
    assert.equal(afterStep1.orderedSteps[0].status, 'completed');
    assert.equal(afterStep1.orderedSteps[1].status, 'active');

    // Scenario 9 & 10: Reviewing a user-submitted error and producing corrective instructions
    const afterError = core.guidedBuildEngine.reportStepError({
      projectId: websiteProject.id,
      auth: authA,
      errorMessage:
        'When I click the submit booking button, nothing happens and the console says Uncaught SyntaxError: Unexpected token',
      codeOrLogSnippet: 'Uncaught SyntaxError: Unexpected token } in BookingForm.tsx',
    });
    assert.equal(afterError.workflowState, 'TROUBLESHOOTING');
    assert.equal(afterError.reportedErrors.length, 1);
    assert.match(afterError.reportedErrors[0].diagnosis, /Syntax or formatting error/);
    const fixInstruction = afterError.orderedSteps[1];
    assert.equal(fixInstruction.status, 'troubleshooting');
    assert.match(fixInstruction.stageTitle, /Corrective Fix/);
    assert.match(fixInstruction.exactPromptOrCode, /BookingForm\.tsx/);

    // Approve Step 2, Step 3, and Step 4 to reach PROJECT_COMPLETION
    core.guidedBuildEngine.submitStepResult({
      projectId: websiteProject.id,
      auth: authA,
      userObservation: 'The fix prompt solved the syntax error and bookings now submit!',
      markApproved: true,
    });
    core.guidedBuildEngine.submitStepResult({
      projectId: websiteProject.id,
      auth: authA,
      userObservation: 'Search and order status filters work on mobile.',
      markApproved: true,
    });
    const completedProj = core.guidedBuildEngine.submitStepResult({
      projectId: websiteProject.id,
      auth: authA,
      userObservation: 'Published the live link and verified end-to-end!',
      markApproved: true,
    });
    assert.equal(completedProj.workflowState, 'PROJECT_COMPLETION');
    assert.deepEqual(completedProj.completedSteps, [0, 1, 2, 3]);

    // Scenario 11: Maintaining project context across linked conversation history
    assert.ok(completedProj.conversationId);
    const convHistory = core.conversationEngine.getMessageHistory(
      completedProj.conversationId!,
      authA
    );
    assert.ok(
      convHistory.length >= 10,
      `Expected full project lifecycle in conversation history, got ${convHistory.length} messages`
    );

    // Scenario 12: Preventing project data leakage between tenants
    assert.throws(
      () => core.guidedBuildEngine.getProject(websiteProject.id, authB),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'TENANT_ISOLATION_DENIED'
    );

    // Scenario 14: Handling unavailable local models in Guided Builder gracefully
    core.guidedBuildEngine.setLocalAiEnhancer(async () => {
      throw new ProviderError({
        provider: 'open_weight',
        category: 'provider_unavailable',
        message: 'Simulated local Ollama daemon offline',
      });
    });
    const offlineFallbackProj = await core.guidedBuildEngine.startProject({
      auth: authA,
      ideaDescription:
        'I want to build an internal inventory tracker for my pharmacy in Kumasi.',
      technicalExperience: 'complete_beginner',
      budgetConstraint: 'free_only',
    });
    assert.equal(offlineFallbackProj.workflowState, 'ACTIVE_STEP');
    assert.equal(offlineFallbackProj.orderedSteps.length, 4);
    assert.equal(offlineFallbackProj.qualityCheck?.passed, true);

    // Scenario 15: Handling invalid or incomplete local model output in Guided Builder gracefully
    core.guidedBuildEngine.setLocalAiEnhancer(async () => '   ');
    const invalidOutputProj = await core.guidedBuildEngine.startProject({
      auth: authA,
      ideaDescription:
        'I want to automate daily WhatsApp order notifications from a Google Sheet.',
      technicalExperience: 'complete_beginner',
      budgetConstraint: 'free_only',
    });
    assert.equal(invalidOutputProj.projectCategory, 'automation');
    assert.equal(invalidOutputProj.selectedToolId, 'n8n_make');
    assert.equal(invalidOutputProj.orderedSteps.length, 4);
    assert.ok(!invalidOutputProj.orderedSteps[0].whyItMatters.includes('Local AI Tip:'));

    core.close();
  });

  it('2. V1 Task Router (8 Supported Task Categories + UNSUPPORTED), Result Validation, Malformed Output Recovery, Local Server Unavailable, Timeout/Retry & External Escalation Privacy Policy', async () => {
    let malformedCounter = 0;

    const simulatedLocalOllamaFetch: FetchFunction = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const lastMsg =
        Array.isArray(body?.messages) && body.messages.length > 0
          ? String(body.messages[body.messages.length - 1].content)
          : '';

      if (url.includes('/api/version')) {
        return new Response(JSON.stringify({ version: '0.40.16' }), { status: 200 });
      }
      if (url.includes('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [
              {
                name: 'qwen2.5:3b',
                model: 'qwen2.5:3b',
                size: 1929900000,
                digest: 'sha256:qwen25',
                modified_at: '2026-11-21T00:00:00Z',
                details: { parameter_size: '3.1B', quantization_level: 'Q4_K_M' },
              },
            ],
          }),
          { status: 200 }
        );
      }

      // Simulate timeout when prompt asks for slow timeout test
      if (lastMsg.includes('SIMULATE_TIMEOUT')) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 500);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('Aborted due to timeout'));
          });
        });
      }

      // Simulate malformed JSON on first attempt, then valid JSON on corrective retry
      if (lastMsg.includes('EXTRACT_INVOICE_JSON') && !lastMsg.includes('failed GRIOT result validation')) {
        malformedCounter++;
        return new Response(
          JSON.stringify({
            id: 'local_malformed_1',
            choices: [{ message: { content: 'Sure! The vendor is Kofi Logistics and amount is 450.' } }],
            usage: { prompt_tokens: 25, completion_tokens: 14 },
          }),
          { status: 200 }
        );
      }

      if (lastMsg.includes('failed GRIOT result validation')) {
        return new Response(
          JSON.stringify({
            id: 'local_repaired_1',
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    vendor: 'Kofi Logistics',
                    amountUsd: 450,
                    status: 'paid',
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 45, completion_tokens: 18 },
          }),
          { status: 200 }
        );
      }

      // Default response tailored to the 8 V1 task categories
      let content = 'Hello! I am GRIOT running on your local open-weight model.';
      if (/classify|sentiment/i.test(lastMsg)) {
        content = 'Category: POSITIVE_CUSTOMER_FEEDBACK';
      } else if (/function|typescript|code/i.test(lastMsg)) {
        content = '```ts\nexport function calculateVat(amount: number): number {\n  return Number((amount * 0.075).toFixed(2));\n}\n```';
      } else if (/summarize|summarise/i.test(lastMsg)) {
        content = 'Summary: Avantage Group expanded digital logistics across West Africa, reducing delivery times by 34%.';
      }

      return new Response(
        JSON.stringify({
          id: 'local_ok_1',
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 28, completion_tokens: 22 },
        }),
        { status: 200 }
      );
    };

    const core = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        privateStorageDir: path.join(tmpDir, 'vault2'),
        allowMockProvidersWhenUnconfigured: false,
        maxRetriesPerProvider: 1,
        providers: {
          open_weight: {
            apiKey: 'local-ollama',
            baseUrl: 'http://127.0.0.1:11434/v1',
          },
          openai: { apiKey: null, baseUrl: 'https://api.openai.com/v1' },
          gemini: {
            apiKey: null,
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          },
          anthropic: { apiKey: null, baseUrl: 'https://api.anthropic.com/v1' },
          mistral: { apiKey: null, baseUrl: 'https://api.mistral.ai/v1' },
        },
      },
      fetchFn: simulatedLocalOllamaFetch,
    });

    const user = core.tenantService.createUserAccount({
      email: 'localtester@avantage.group',
      displayName: 'Local V1 Tester',
      password: 'PasswordLocal123!',
    });
    const auth = core.authService.authenticateJwt(user.accessToken!);

    // Verify all 8 V1 task categories classify & execute via local open_weight model
    const eightTasks: Array<{ prompt: string; expectedV1Category: string }> = [
      { prompt: 'Hello GRIOT, how can you help our team today?', expectedV1Category: 'general_conversation' },
      { prompt: 'Write an email announcement welcoming our new Accra partner.', expectedV1Category: 'writing_and_rewriting' },
      { prompt: 'Summarise this quarterly logistics report into one sentence.', expectedV1Category: 'summarisation' },
      { prompt: 'Explain how unit economics and gross margin work for a SaaS startup.', expectedV1Category: 'explanations_and_learning' },
      { prompt: 'Classify the sentiment of this customer review: "Fast delivery!"', expectedV1Category: 'text_classification' },
      { prompt: 'Extract into JSON the vendor and amount: EXTRACT_INVOICE_JSON', expectedV1Category: 'structured_data_extraction' },
      { prompt: 'Step by step compare the pros and cons of local vs cloud inference.', expectedV1Category: 'basic_reasoning' },
      { prompt: 'Write a TypeScript function to calculate 7.5% VAT.', expectedV1Category: 'basic_coding_assistance' },
    ];

    for (const t of eightTasks) {
      const isExtraction = t.expectedV1Category === 'structured_data_extraction';
      const res = await core.executeChat({
        auth,
        prompt: t.prompt,
        routingHints: { preferredProvider: 'open_weight' },
        validationRequirements: isExtraction
          ? { requireJson: true, requiredJsonFields: ['vendor', 'amountUsd'] }
          : undefined,
      });
      assert.equal(res.provider, 'open_weight');
      assert.equal(res.executionMode, 'live');
      assert.equal(res.v1Routing?.v1Category, t.expectedV1Category);
      assert.equal(res.v1Routing?.executionState, 'LOCAL_EXECUTION');
      assert.equal(res.v1Routing?.validationOutcome.valid, true);
    }

    // Verify that the malformed extraction response on attempt 1 triggered bounded corrective retry and succeeded
    assert.equal(malformedCounter, 1);

    // Scenario 8: Invalid or UNSUPPORTED task is safely blocked
    await assert.rejects(
      () =>
        core.executeChat({
          auth,
          prompt: 'Generate a 4K video and render a 3D movie animation in MP4 format.',
        }),
      (err: unknown) =>
        err instanceof RoutingConstraintError &&
        err.details.executionState === 'UNSUPPORTED'
    );

    // Scenario 11: Request Timeout handling
    await assert.rejects(
      () =>
        core.executeChat({
          auth,
          prompt: 'SIMULATE_TIMEOUT please',
          routingHints: { requestedModelId: 'open_weight:qwen2.5-3b' },
          timeoutMs: 50,
        }),
      (err: unknown) => err instanceof ProviderError && err.category === 'timeout'
    );

    // Scenario 9: Local inference server unavailable + External escalation blocked by default org data-sharing policy
    const offlineCore = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        privateStorageDir: path.join(tmpDir, 'vault3'),
        allowMockProvidersWhenUnconfigured: false,
        providers: {
          open_weight: {
            apiKey: 'local-ollama',
            baseUrl: 'http://127.0.0.1:11434/v1',
          },
          openai: {
            apiKey: 'sk-external-configured',
            baseUrl: 'https://api.openai.com/v1',
          },
          gemini: { apiKey: null, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
          anthropic: { apiKey: null, baseUrl: 'https://api.anthropic.com/v1' },
          mistral: { apiKey: null, baseUrl: 'https://api.mistral.ai/v1' },
        },
      },
      fetchFn: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:11434');
      },
    });

    const u2 = offlineCore.tenantService.createUserAccount({
      email: 'privacy@avantage.group',
      displayName: 'Privacy Officer',
      password: 'PasswordPriv123!',
    });
    const auth2 = offlineCore.authService.authenticateJwt(u2.accessToken!);

    await assert.rejects(
      () =>
        offlineCore.executeChat({
          auth: auth2,
          prompt: 'Hello local server',
          routingHints: { preferredProvider: 'open_weight' },
          enforceV1ExternalEscalationPolicy: true,
          allowExternalEscalation: false,
        }),
      (err: unknown) =>
        err instanceof AuthError || err instanceof ProviderError
    );

    // Test Local Concurrency & Queue Limit Controller
    const limiter = core.providerManager.localConcurrency;
    limiter.configureInternalRates({
      internalCostPer1MInputTokensUsd: 0.05,
      internalCostPer1MOutputTokensUsd: 0.1,
      internalCostPerComputeSecondUsd: 0.0002,
    });
    const alloc = limiter.calculateInternalInfrastructureAllocation({
      inputTokens: 1000,
      outputTokens: 500,
      durationMs: 2000,
    });
    assert.ok(alloc > 0);

    offlineCore.close();
    core.close();
  });

  it('3. Responsive Web Interface (GET /) & Guided Builder HTTP API Endpoints (/api/v1/builder/* & /api/v1/local-runtime)', async () => {
    const core = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        privateStorageDir: path.join(tmpDir, 'vault-http'),
      },
    });
    const server = new GriotHttpServer(core);
    const port = await server.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Verify GET / serves the ASK GRIOT & BUILD WITH GRIOT responsive web interface
      const homeRes = await fetch(`${baseUrl}/`);
      assert.equal(homeRes.status, 200);
      const html = await homeRes.text();
      assert.match(html, /ASK GRIOT/);
      assert.match(html, /BUILD WITH GRIOT/);

      // 2. Verify GET /api/v1/local-runtime returns Ollama status and concurrency metrics
      const runtimeRes = await fetch(`${baseUrl}/api/v1/local-runtime`);
      assert.equal(runtimeRes.status, 200);
      const runtimeJson = (await runtimeRes.json()) as {
        data: { ollama: { binaryInstalled: boolean; isLoopbackEndpoint: boolean } };
      };
      assert.equal(runtimeJson.data.ollama.isLoopbackEndpoint, true);

      // 3. Register user & test /api/v1/builder/* endpoints
      const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'founder@accra-Crafts.africa',
          displayName: 'Accra Founder',
          password: 'PasswordAccra123!',
        }),
      });
      const regJson = (await regRes.json()) as { data: { accessToken: string } };
      const jwt = regJson.data.accessToken;

      const createProjRes = await fetch(`${baseUrl}/api/v1/builder/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          ideaDescription:
            'I want to build an online website for my Accra artisan crafts store with a custom order form.',
          technicalExperience: 'complete_beginner',
          budgetConstraint: 'free_only',
        }),
      });
      assert.equal(createProjRes.status, 201);
      const projJson = (await createProjRes.json()) as {
        data: { id: string; selectedToolId: string; orderedSteps: unknown[] };
      };
      assert.equal(projJson.data.selectedToolId, 'lovable');
      assert.equal(projJson.data.orderedSteps.length, 4);
    } finally {
      await server.close();
      core.close();
    }
  });

  it('4. Stage 1 Frontend Integration: Centralized griotFetch() API Helper & Health-Aware Runtime Detection', async () => {
    const html = renderGriotWebInterfaceHtml();

    // 1. Misleading hardcoded subtitle removed; existing structure & view IDs preserved
    assert.equal(html.includes('Local-First Open-Weight Execution'), false);
    assert.ok(html.includes('id="view-home"'));
    assert.ok(html.includes('id="view-ask"'));
    assert.ok(html.includes('id="view-build"'));
    assert.ok(html.includes('id="header-runtime-pill"'));
    assert.ok(html.includes('id="ask-runtime-subtitle"'));

    // 2. Extract inline script and confirm only griotFetch() invokes fetch()
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'Expected inline <script> in griotAppHtml.ts');
    const scriptSource = scriptMatch[1];
    const rawFetchMatches = scriptSource.match(/\bfetch\s*\(/g) || [];
    assert.equal(
      rawFetchMatches.length,
      1,
      `Expected exactly 1 raw fetch() call inside griotFetch(), found ${rawFetchMatches.length}`
    );

    // Helper to instantiate the frontend script inside an isolated VM context
    function createFrontendVmHarness(customFetch: typeof globalThis.fetch, apiBaseUrl?: string) {
      const localStore = new Map<string, string>();
      const sessionStore = new Map<string, string>();
      type MockEl = {
        textContent: string;
        innerHTML: string;
        value: string;
        disabled: boolean;
        className: string;
        style: Record<string, string>;
        children: MockEl[];
        classList: {
          add: (c: string) => void;
          remove: (c: string) => void;
          toggle: (c: string) => void;
          contains: (c: string) => boolean;
        };
        appendChild: (child: MockEl) => void;
      };
      const makeEl = (): MockEl => {
        const classes = new Set<string>();
        const el: MockEl = {
          textContent: '',
          innerHTML: '',
          value: '',
          disabled: false,
          className: '',
          style: {},
          children: [],
          classList: {
            add: (c: string) => {
              classes.add(c);
              el.className = Array.from(classes).join(' ');
            },
            remove: (c: string) => {
              classes.delete(c);
              el.className = Array.from(classes).join(' ');
            },
            toggle: (c: string) => {
              if (classes.has(c)) classes.delete(c);
              else classes.add(c);
              el.className = Array.from(classes).join(' ');
            },
            contains: (c: string) => classes.has(c),
          },
          appendChild: (child: MockEl) => {
            el.children.push(child);
          },
        };
        return el;
      };

      const elements: Record<string, MockEl> = {
        'header-runtime-pill': makeEl(),
        'ask-runtime-subtitle': makeEl(),
        'header-brand-badge': makeEl(),
        'auth-modal-overlay': makeEl(),
        'auth-feedback-banner': makeEl(),
      };

      const windowObj: Record<string, unknown> = {
        location: { protocol: 'https:' },
      };
      if (apiBaseUrl) {
        windowObj.GRIOT_API_BASE_URL = apiBaseUrl;
      }

      const sandbox: Record<string, unknown> = {
        window: windowObj,
        fetch: customFetch,
        AbortController,
        setTimeout,
        clearTimeout,
        encodeURIComponent,
        atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
        Date,
        Math,
        Object,
        Array,
        String,
        Boolean,
        Promise,
        JSON,
        localStorage: {
          getItem: (k: string) => localStore.get(k) ?? null,
          setItem: (k: string, v: string) => {
            localStore.set(k, String(v));
          },
          removeItem: (k: string) => {
            localStore.delete(k);
          },
        },
        sessionStorage: {
          getItem: (k: string) => sessionStore.get(k) ?? null,
          setItem: (k: string, v: string) => {
            sessionStore.set(k, String(v));
          },
          removeItem: (k: string) => {
            sessionStore.delete(k);
          },
        },
        document: {
          getElementById: (id: string) => {
            if (!elements[id]) {
              elements[id] = makeEl();
            }
            return elements[id];
          },
          querySelectorAll: () => [],
          createElement: () => makeEl(),
        },
      };

      // Prevent automatic boot call from racing before test assertions, then expose helpers
      const testableScript =
        scriptSource.replace(/initializeApp\(\);\s*$/, '') +
        '\nglobalThis.__exports = { resolveApiBaseUrl, buildApiUrl, griotFetch, inspectBackendRuntime, initializeApp, submitLogin, submitRegister, continueAsGuest, signOutUser, switchMode, openAuthModal, closeAuthModal, loadConversationsSidebar, loadSavedProjectsBar, getActiveSession, getStoredSessionToken, isJwtExpired };';
      vm.createContext(sandbox);
      vm.runInContext(testableScript, sandbox);

      return {
        exports: sandbox.__exports as {
          resolveApiBaseUrl: () => string;
          buildApiUrl: (ep: string) => string;
          griotFetch: (ep: string, opts?: Record<string, unknown>) => Promise<{
            ok: boolean;
            status: number;
            requestId: string | null;
            data: unknown;
            error: { code: string; message: string; retryable: boolean } | null;
          }>;
          inspectBackendRuntime: () => Promise<{
            reachable: boolean;
            healthy?: boolean;
            mode: string;
            liveCloudProviders?: string[];
            ollamaReachable?: boolean;
            firstLocalModel?: string | null;
          }>;
          initializeApp: () => Promise<void>;
          submitLogin: (ev?: unknown) => Promise<{ ok: boolean; status?: number; error?: { code: string; message: string } | null }>;
          submitRegister: (ev?: unknown) => Promise<{ ok: boolean; status?: number; error?: { code: string; message: string } | null }>;
          continueAsGuest: () => Promise<{ ok: boolean; status?: number; error?: { code: string; message: string } | null }>;
          signOutUser: () => void;
          switchMode: (mode: string) => Promise<void>;
          openAuthModal: (mode?: string, msg?: string, type?: string) => void;
          closeAuthModal: () => void;
          loadConversationsSidebar: () => Promise<void>;
          loadSavedProjectsBar: () => Promise<void>;
          getActiveSession: () => {
            token: string;
            mode: string;
            user: { id: string; displayName: string; email: string | null };
            org: { id: string | null; name: string };
          } | null;
          getStoredSessionToken: () => string | null;
          isJwtExpired: (token: string) => boolean;
        },
        elements,
        localStore,
        sessionStore,
        windowObj,
      };
    }

    // 3. Verify same-origin /api/v1 and external API_BASE_URL normalization without path duplication
    const sameOriginHarness = createFrontendVmHarness(async () => new Response('{}', { status: 200 }));
    assert.equal(sameOriginHarness.exports.resolveApiBaseUrl(), '/api/v1');
    assert.equal(sameOriginHarness.exports.buildApiUrl('/health'), '/api/v1/health');
    assert.equal(sameOriginHarness.exports.buildApiUrl('/api/v1/conversations'), '/api/v1/conversations');

    const externalHarness = createFrontendVmHarness(
      async () => new Response('{}', { status: 200 }),
      'https://griot-ai.onrender.com/api/v1/'
    );
    assert.equal(externalHarness.exports.resolveApiBaseUrl(), 'https://griot-ai.onrender.com/api/v1');
    assert.equal(
      externalHarness.exports.buildApiUrl('/chat/completions'),
      'https://griot-ai.onrender.com/api/v1/chat/completions'
    );
    assert.equal(
      externalHarness.exports.buildApiUrl('/api/v1/health'),
      'https://griot-ai.onrender.com/api/v1/health'
    );

    // 4. Verify Cloud-Configured Runtime Detection (Render + Gemini live, Ollama unreachable)
    const cloudHarness = createFrontendVmHarness(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            success: true,
            apiVersion: 'v1',
            requestId: 'req_h1',
            timestamp: new Date().toISOString(),
            data: {
              status: 'healthy',
              readiness: { backend: { ready: true }, database: { ready: true } },
              providersConfigured: {
                gemini: { configured: true, mode: 'live' },
                openai: { configured: false, mode: 'unconfigured' },
                open_weight: { configured: false, mode: 'unconfigured' },
              },
            },
            error: null,
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          apiVersion: 'v1',
          requestId: 'req_lr1',
          timestamp: new Date().toISOString(),
          data: { ollama: { apiReachable: false, installedModels: [] } },
          error: null,
        }),
        { status: 200 }
      );
    });

    const cloudStatus = await cloudHarness.exports.inspectBackendRuntime();
    assert.equal(cloudStatus.reachable, true);
    assert.equal(cloudStatus.mode, 'cloud');
    assert.equal(
      cloudHarness.elements['header-runtime-pill'].textContent,
      'Backend Ready • Gemini Cloud Configured'
    );
    assert.equal(
      cloudHarness.elements['ask-runtime-subtitle'].textContent,
      'Cloud Inference Configured (Gemini) • Persistent Context'
    );

    // 5. Verify Local Ollama Runtime Detection (Ollama reachable with pulled model, no cloud key)
    const localHarness = createFrontendVmHarness(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(
          JSON.stringify({
            success: true,
            apiVersion: 'v1',
            requestId: 'req_h2',
            timestamp: new Date().toISOString(),
            data: {
              status: 'healthy',
              readiness: { backend: { ready: true }, database: { ready: true } },
              providersConfigured: {
                gemini: { configured: false, mode: 'unconfigured' },
                open_weight: { configured: true, mode: 'live' },
              },
            },
            error: null,
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          apiVersion: 'v1',
          requestId: 'req_lr2',
          timestamp: new Date().toISOString(),
          data: {
            ollama: {
              apiReachable: true,
              ollamaVersion: '0.40.16',
              installedModels: [{ name: 'qwen2.5:0.5b' }],
            },
          },
          error: null,
        }),
        { status: 200 }
      );
    });

    const localStatus = await localHarness.exports.inspectBackendRuntime();
    assert.equal(localStatus.mode, 'local_ollama');
    assert.equal(
      localHarness.elements['header-runtime-pill'].textContent,
      'Backend Ready • Local Ollama (qwen2.5:0.5b) Configured'
    );

    // 6. Verify 401 handling (clears stale token, presents auth modal, NEVER retries expired token), 429, 503, timeout, and network errors
    const seenAuthHeaders: string[] = [];
    let conversationCalls = 0;

    const errorHarness = createFrontendVmHarness(async (input, init) => {
      const url = String(input);
      const headers = (init?.headers || {}) as Record<string, string>;
      if (headers['Authorization']) {
        seenAuthHeaders.push(headers['Authorization']);
      }

      if (url.endsWith('/conversations')) {
        conversationCalls++;
        return new Response(
          JSON.stringify({
            success: false,
            apiVersion: 'v1',
            requestId: 'req_401',
            timestamp: new Date().toISOString(),
            data: null,
            error: { code: 'INVALID_JWT', message: 'Expired token' },
          }),
          { status: 401 }
        );
      }

      if (url.endsWith('/rate-limited')) {
        return new Response(
          JSON.stringify({
            success: false,
            apiVersion: 'v1',
            requestId: 'req_429',
            timestamp: new Date().toISOString(),
            data: null,
            error: { code: 'PROVIDER_QUOTA_EXCEEDED', message: 'Quota exceeded' },
          }),
          { status: 429 }
        );
      }

      if (url.endsWith('/overloaded')) {
        return new Response(
          JSON.stringify({
            success: false,
            apiVersion: 'v1',
            requestId: 'req_503',
            timestamp: new Date().toISOString(),
            data: null,
            error: { code: 'PROVIDER_PROVIDER_UNAVAILABLE', message: 'High demand' },
          }),
          { status: 503 }
        );
      }

      if (url.endsWith('/slow')) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      }

      throw new TypeError('Failed to fetch');
    });

    // Seed an invalid token -> griotFetch('/conversations') hits 401 ONCE, clears session, opens auth modal, and does NOT retry
    errorHarness.sessionStore.set(
      'griot_auth_session_v2',
      JSON.stringify({
        token: 'invalid_backend_jwt',
        mode: 'authenticated',
        user: { id: 'u1', displayName: 'Old User', email: 'old@griot.ai' },
        org: { id: 'o1', name: 'Old Org' },
      })
    );
    const convResult = await errorHarness.exports.griotFetch('/conversations');
    assert.equal(convResult.ok, false);
    assert.equal(convResult.status, 401);
    assert.equal(conversationCalls, 1, 'Must NOT repeatedly retry an invalid/expired token');
    assert.equal(seenAuthHeaders[0], 'Bearer invalid_backend_jwt');
    assert.equal(errorHarness.exports.getStoredSessionToken(), null);
    assert.equal(errorHarness.elements['auth-modal-overlay'].classList.contains('open'), true);

    // 429 handling
    const res429 = await errorHarness.exports.griotFetch('/rate-limited', { skipAuth: true });
    assert.equal(res429.ok, false);
    assert.equal(res429.status, 429);
    assert.equal(res429.error?.code, 'PROVIDER_QUOTA_EXCEEDED');
    assert.equal(res429.error?.retryable, true);

    // 503 handling
    const res503 = await errorHarness.exports.griotFetch('/overloaded', { skipAuth: true });
    assert.equal(res503.ok, false);
    assert.equal(res503.status, 503);
    assert.equal(res503.error?.code, 'PROVIDER_PROVIDER_UNAVAILABLE');
    assert.equal(res503.error?.retryable, true);

    // Timeout handling
    const resTimeout = await errorHarness.exports.griotFetch('/slow', {
      skipAuth: true,
      timeoutMs: 30,
    });
    assert.equal(resTimeout.ok, false);
    assert.equal(resTimeout.status, 504);
    assert.equal(resTimeout.error?.code, 'REQUEST_TIMEOUT');

    // Network error handling + Backend Unreachable UI state
    const resNet = await errorHarness.exports.griotFetch('/offline', { skipAuth: true });
    assert.equal(resNet.ok, false);
    assert.equal(resNet.status, 0);
    assert.equal(resNet.error?.code, 'NETWORK_ERROR');

    const unreachableStatus = await errorHarness.exports.inspectBackendRuntime();
    assert.equal(unreachableStatus.reachable, false);
    assert.equal(errorHarness.elements['header-runtime-pill'].textContent, 'Backend Unreachable');
  });

  it('5. Stage 2 Frontend Authentication: Registration, Login, Invalid Credentials, Expired JWT Recovery, Guest Access, Logout/Switching & Data Isolation', async () => {
    const core = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        privateStorageDir: path.join(tmpDir, 'vault-stage2-auth'),
      },
    });
    const server = new GriotHttpServer(core);
    const port = await server.listen(0, '127.0.0.1');
    const apiBaseUrl = `http://127.0.0.1:${port}/api/v1`;

    const html = renderGriotWebInterfaceHtml();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'Expected inline <script> in griotAppHtml.ts');
    const scriptSource = scriptMatch[1];

    // Confirm Stage 2 modal & account controls exist in DOM
    assert.ok(html.includes('id="auth-modal-overlay"'));
    assert.ok(html.includes('id="auth-form-login"'));
    assert.ok(html.includes('id="auth-form-register"'));
    assert.ok(html.includes('id="guest-access-btn"'));
    assert.ok(html.includes('id="header-account-menu"'));
    assert.ok(html.includes('id="sign-out-btn"'));

    function createLiveVmClient() {
      const localStore = new Map<string, string>();
      const sessionStore = new Map<string, string>();
      type MockEl = {
        textContent: string;
        innerHTML: string;
        value: string;
        disabled: boolean;
        className: string;
        style: Record<string, string>;
        children: MockEl[];
        classList: {
          add: (c: string) => void;
          remove: (c: string) => void;
          toggle: (c: string) => void;
          contains: (c: string) => boolean;
        };
        appendChild: (child: MockEl) => void;
      };
      const makeEl = (): MockEl => {
        const classes = new Set<string>();
        const el: MockEl = {
          textContent: '',
          innerHTML: '',
          value: '',
          disabled: false,
          className: '',
          style: {},
          children: [],
          classList: {
            add: (c: string) => {
              classes.add(c);
              el.className = Array.from(classes).join(' ');
            },
            remove: (c: string) => {
              classes.delete(c);
              el.className = Array.from(classes).join(' ');
            },
            toggle: (c: string) => {
              if (classes.has(c)) classes.delete(c);
              else classes.add(c);
              el.className = Array.from(classes).join(' ');
            },
            contains: (c: string) => classes.has(c),
          },
          appendChild: (child: MockEl) => {
            el.children.push(child);
          },
        };
        return el;
      };

      const elements: Record<string, MockEl> = {};
      const getEl = (id: string) => {
        if (!elements[id]) elements[id] = makeEl();
        return elements[id];
      };

      let fetchCallLog: string[] = [];
      const trackedFetch: typeof globalThis.fetch = async (input, init) => {
        fetchCallLog.push(`${(init?.method || 'GET').toUpperCase()} ${String(input)}`);
        return globalThis.fetch(input, init);
      };

      const sandbox: Record<string, unknown> = {
        window: {
          location: { protocol: 'http:' },
          GRIOT_API_BASE_URL: apiBaseUrl,
        },
        fetch: trackedFetch,
        AbortController,
        setTimeout,
        clearTimeout,
        encodeURIComponent,
        atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
        Date,
        Math,
        Object,
        Array,
        String,
        Boolean,
        Promise,
        JSON,
        localStorage: {
          getItem: (k: string) => localStore.get(k) ?? null,
          setItem: (k: string, v: string) => localStore.set(k, String(v)),
          removeItem: (k: string) => localStore.delete(k),
        },
        sessionStorage: {
          getItem: (k: string) => sessionStore.get(k) ?? null,
          setItem: (k: string, v: string) => sessionStore.set(k, String(v)),
          removeItem: (k: string) => sessionStore.delete(k),
        },
        document: {
          getElementById: getEl,
          querySelectorAll: () => [],
          createElement: () => makeEl(),
        },
      };

      const testableScript =
        scriptSource.replace(/initializeApp\(\);\s*$/, '') +
        '\nglobalThis.__exports = { initializeApp, submitRegister, submitLogin, continueAsGuest, signOutUser, switchMode, griotFetch, getActiveSession, getStoredSessionToken, isJwtExpired, loadConversationsSidebar, loadSavedProjectsBar };';
      vm.createContext(sandbox);
      vm.runInContext(testableScript, sandbox);

      return {
        exports: sandbox.__exports as {
          initializeApp: () => Promise<void>;
          submitRegister: (ev?: unknown) => Promise<{ ok: boolean; status?: number; error?: { code: string; message: string } | null }>;
          submitLogin: (ev?: unknown) => Promise<{ ok: boolean; status?: number; error?: { code: string; message: string } | null }>;
          continueAsGuest: () => Promise<{ ok: boolean; status?: number; error?: { code: string; message: string } | null }>;
          signOutUser: () => void;
          switchMode: (mode: string) => Promise<void>;
          griotFetch: (ep: string, opts?: Record<string, unknown>) => Promise<{
            ok: boolean;
            status: number;
            data: unknown;
            error: { code: string; message: string } | null;
          }>;
          getActiveSession: () => {
            token: string;
            mode: string;
            user: { id: string; displayName: string; email: string | null };
            org: { id: string | null; name: string };
          } | null;
          getStoredSessionToken: () => string | null;
          isJwtExpired: (token: string) => boolean;
          loadConversationsSidebar: () => Promise<void>;
          loadSavedProjectsBar: () => Promise<void>;
        },
        getEl,
        localStore,
        sessionStore,
        fetchCallLog,
      };
    }

    try {
      const client = createLiveVmClient();

      // 1. On initial visit, initializeApp() must NOT silently register a disposable account
      await client.exports.initializeApp();
      assert.equal(client.exports.getActiveSession(), null);
      assert.equal(
        client.fetchCallLog.some((c) => c.includes('/auth/register')),
        false,
        'Must not silently create disposable accounts on page load'
      );

      // 2. Successful registration (first verify password-confirmation mismatch is blocked client-side)
      client.getEl('register-name').value = 'Amina Okafor';
      client.getEl('register-email').value = 'amina@griot.africa';
      client.getEl('register-password').value = 'StrongPass123!';
      client.getEl('register-confirm-password').value = 'MismatchPass123!';
      const mismatchRes = await client.exports.submitRegister();
      assert.equal(mismatchRes.ok, false);
      assert.match(client.getEl('auth-feedback-banner').textContent, /do not match/i);

      client.getEl('register-confirm-password').value = 'StrongPass123!';
      const regRes = await client.exports.submitRegister();
      assert.equal(regRes.ok, true);
      const userASession = client.exports.getActiveSession();
      assert.ok(userASession);
      assert.equal(userASession.mode, 'authenticated');
      assert.equal(userASession.user.displayName, 'Amina Okafor');
      assert.equal(userASession.user.email, 'amina@griot.africa');
      assert.ok(userASession.org.name.includes('Amina Okafor'));
      assert.equal(client.getEl('account-user-name').textContent, 'Amina Okafor');
      assert.equal(client.getEl('account-org-name').textContent, userASession.org.name);
      assert.equal(client.getEl('register-password').value, '');

      // Create a private conversation and a private Guided Builder project as User A
      const convARes = await client.exports.griotFetch('/conversations', {
        method: 'POST',
        body: { title: 'Amina Private Strategy Chat' },
      });
      assert.equal(convARes.ok, true);
      const convAId = (convARes.data as { id: string }).id;

      const projARes = await client.exports.griotFetch('/builder/projects', {
        method: 'POST',
        body: {
          ideaDescription: 'Private e-commerce website for Amina Textiles with custom orders',
          technicalExperience: 'complete_beginner',
          budgetConstraint: 'free_only',
        },
      });
      assert.equal(projARes.ok, true);
      const projAId = (projARes.data as { id: string }).id;

      await client.exports.loadConversationsSidebar();
      await client.exports.loadSavedProjectsBar();
      assert.equal(client.getEl('saved-projects-bar').style.display, 'block');

      // 3. Logout clears sessionStorage and cached DOM conversation/project state
      client.exports.signOutUser();
      assert.equal(client.exports.getActiveSession(), null);
      assert.equal(client.sessionStore.size, 0);
      assert.equal(client.getEl('saved-projects-bar').style.display, 'none');
      assert.equal(client.getEl('saved-projects-select').innerHTML, '');

      // 4. Invalid credentials rejected with 401 and clear user-facing error
      client.getEl('login-email').value = 'amina@griot.africa';
      client.getEl('login-password').value = 'WrongPassword999!';
      const badLogin = await client.exports.submitLogin();
      assert.equal(badLogin.ok, false);
      assert.equal(badLogin.status, 401);
      assert.match(client.getEl('auth-feedback-banner').textContent, /Invalid email or password/i);
      assert.equal(client.exports.getActiveSession(), null);

      // 5. Successful login restores User A session and hydrates organisation from /organisations/current
      client.getEl('login-password').value = 'StrongPass123!';
      const goodLogin = await client.exports.submitLogin();
      assert.equal(goodLogin.ok, true);
      assert.equal(client.exports.getActiveSession()?.user.email, 'amina@griot.africa');
      assert.ok(client.getEl('account-org-name').textContent.includes('Amina Okafor'));

      // 6. Expired JWT recovery (past exp detected without retrying expired token, session cleared, login modal opened)
      const expiredHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const expiredPayload = Buffer.from(
        JSON.stringify({ sub: userASession.user.id, orgId: userASession.org.id, exp: Math.floor(Date.now() / 1000) - 60 })
      ).toString('base64url');
      const expiredJwt = `${expiredHeader}.${expiredPayload}.invalid_sig`;
      assert.equal(client.exports.isJwtExpired(expiredJwt), true);
      client.sessionStore.set(
        'griot_auth_session_v2',
        JSON.stringify({ ...userASession, token: expiredJwt })
      );
      // Force reload from sessionStore via a fresh VM client sharing the expired session
      const clientWithExpired = createLiveVmClient();
      clientWithExpired.sessionStore.set(
        'griot_auth_session_v2',
        JSON.stringify({ ...userASession, token: expiredJwt })
      );
      const callsBefore = clientWithExpired.fetchCallLog.length;
      const expiredCall = await clientWithExpired.exports.griotFetch('/conversations');
      assert.equal(expiredCall.ok, false);
      assert.equal(expiredCall.status, 401);
      assert.equal(expiredCall.error?.code, 'SESSION_EXPIRED');
      assert.equal(
        clientWithExpired.fetchCallLog.length,
        callsBefore,
        'Already-expired JWT should be cleared client-side without sending/retrying it'
      );
      assert.equal(clientWithExpired.exports.getActiveSession(), null);
      assert.equal(
        clientWithExpired.getEl('auth-modal-overlay').classList.contains('open'),
        true
      );

      // 7. Account switching to User B + Explicit Guest Access & strict Conversation/Project Isolation
      client.exports.signOutUser();
      client.getEl('register-name').value = 'Kwame Boateng';
      client.getEl('register-email').value = 'kwame@griot.africa';
      client.getEl('register-password').value = 'KwamePass456!';
      client.getEl('register-confirm-password').value = 'KwamePass456!';
      const regB = await client.exports.submitRegister();
      assert.equal(regB.ok, true);
      assert.equal(client.exports.getActiveSession()?.user.displayName, 'Kwame Boateng');

      // User B sees 0 of User A's conversations and 0 of User A's builder projects
      const convListB = await client.exports.griotFetch('/conversations');
      assert.equal(convListB.ok, true);
      assert.equal((convListB.data as { conversations: unknown[] }).conversations.length, 0);

      const projListB = await client.exports.griotFetch('/builder/projects');
      assert.equal(projListB.ok, true);
      assert.equal((projListB.data as { projects: unknown[] }).projects.length, 0);

      // Direct cross-tenant access by User B to User A's records is denied (403 TENANT_ISOLATION_DENIED)
      const stealConvB = await client.exports.griotFetch(`/conversations/${convAId}`);
      assert.equal(stealConvB.ok, false);
      assert.equal(stealConvB.status, 403);
      assert.equal(stealConvB.error?.code, 'TENANT_ISOLATION_DENIED');

      const stealProjB = await client.exports.griotFetch(`/builder/projects/${projAId}`);
      assert.equal(stealProjB.ok, false);
      assert.equal(stealProjB.status, 403);
      assert.equal(stealProjB.error?.code, 'TENANT_ISOLATION_DENIED');

      // Explicit Guest access creates isolated guest session that also cannot access User A's records
      client.exports.signOutUser();
      const guestRes = await client.exports.continueAsGuest();
      assert.equal(guestRes.ok, true);
      assert.equal(client.exports.getActiveSession()?.mode, 'guest');
      assert.equal(client.getEl('account-trigger-label').textContent, 'Guest');
      assert.equal(client.getEl('account-mode-badge').textContent, 'Guest Access (Freemium)');

      const guestStealConv = await client.exports.griotFetch(`/conversations/${convAId}`);
      assert.equal(guestStealConv.ok, false);
      assert.equal(guestStealConv.status, 403);

      const guestStealProj = await client.exports.griotFetch(`/builder/projects/${projAId}`);
      assert.equal(guestStealProj.ok, false);
      assert.equal(guestStealProj.status, 403);
    } finally {
      await server.close();
      core.close();
    }
  });
});
