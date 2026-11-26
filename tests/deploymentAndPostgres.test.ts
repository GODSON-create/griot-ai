// ============================================================================
// GRIOT AI — DEPLOYMENT, POSTGRESQL ADAPTER, CORS & LOVABLE SECURITY TEST SUITE
// Verifies:
// 1. Production config validation (mandatory secrets, no silent mock mode, no '*' CORS)
// 2. PostgreSQL SQL translator, JSONB/TIMESTAMPTZ row normalizer & migration parser
// 3. Full GriotCore execution on the PostgreSQL adapter (transactions, savepoints, CRUD)
// 4. Strict CORS preflight (204 for Lovable origins, 403 for disallowed origins)
// 5. API key scope selection, builder:read / builder:write enforcement & admin scope block
// 6. Secure Lovable user session exchange & rejection of spoofed client userId
// 7. Enhanced /api/v1/health readiness & ephemeral storage warning diagnostics
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { GriotHttpServer } from '../src/api/httpServer.ts';
import {
  isOriginAllowed,
  loadGriotConfig,
  resolveBindHost,
  resolveListenPort,
} from '../src/config/env.ts';
import { GriotCore } from '../src/core/griotCore.ts';
import type { PostgresSyncExecutor, PreparedStatementResult } from '../src/db/database.ts';
import {
  normalizePostgresRow,
  splitPostgresMigrationStatements,
  translateSqliteToPostgres,
} from '../src/db/sqlTranslator.ts';
import { ProviderError } from '../src/providers/adapter.ts';
import { LOVABLE_APP_DEFAULT_SCOPES } from '../src/security/auth.ts';

/**
 * In-process PostgreSQL protocol verification harness:
 * Validates that every query received by the PostgreSQL executor has already been
 * translated from SQLite `?` syntax to PostgreSQL `$1..$N` syntax, executes the
 * query against an backing relational store, and returns rows with native PostgreSQL
 * types (parsed objects/arrays for JSONB `*_json` columns, `Date` instances for
 * `*_at` TIMESTAMPTZ columns, and string counts for aggregates) so the full
 * PostgreSQL adapter + row normalizer pipeline is verified end-to-end.
 */
class SimulatedPostgresExecutor implements PostgresSyncExecutor {
  public readonly executedSql: string[] = [];
  private readonly backingSqlite: DatabaseSync;

  constructor() {
    this.backingSqlite = new DatabaseSync(':memory:');
    const sqliteMigration = fs.readFileSync(
      path.resolve(process.cwd(), 'migrations', '001_griot_phase1_sqlite.sql'),
      'utf8'
    );
    this.backingSqlite.exec(sqliteMigration);
    this.backingSqlite.exec(`
      CREATE TABLE IF NOT EXISTS griot_schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
  }

  private convertPgToBackingSql(pgSql: string): string {
    // Verify no raw unquoted '?' placeholders leaked into Postgres executor
    const strippedQuotes = pgSql.replace(/'([^']|'')*'/g, "''");
    assert.equal(
      strippedQuotes.includes('?'),
      false,
      `Untranslated '?' placeholder leaked to Postgres executor: ${pgSql}`
    );
    return pgSql.replace(/\$\d+/g, '?');
  }

  private simulatePostgresNativeRowTypes(
    row: Record<string, unknown> | undefined
  ): Record<string, unknown> | undefined {
    if (!row) return undefined;
    const pgTyped: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined) {
        pgTyped[k] = null;
      } else if (k.endsWith('_json') && typeof v === 'string') {
        // postgres driver parses JSONB into JS objects/arrays automatically
        pgTyped[k] = JSON.parse(v);
      } else if (k.endsWith('_at') && typeof v === 'string') {
        // postgres driver returns Date instances for TIMESTAMPTZ columns
        pgTyped[k] = new Date(v);
      } else if (
        (k === 'c' || k === 'cnt' || k === 'total_requests') &&
        typeof v === 'number'
      ) {
        // postgres driver returns string for BIGINT COUNT(*)
        pgTyped[k] = String(v);
      } else {
        pgTyped[k] = v;
      }
    }
    return pgTyped;
  }

  public execBatch(statements: string[]): void {
    for (const stmt of statements) {
      this.executedSql.push(stmt);
      const upper = stmt.trim().toUpperCase();
      if (
        upper.startsWith('BEGIN') ||
        upper.startsWith('COMMIT') ||
        upper.startsWith('ROLLBACK') ||
        upper.startsWith('SAVEPOINT') ||
        upper.startsWith('RELEASE SAVEPOINT')
      ) {
        this.backingSqlite.exec(stmt);
      } else if (upper.includes('GRIOT_SCHEMA_MIGRATIONS') && upper.startsWith('INSERT')) {
        this.backingSqlite.exec(`
          INSERT OR IGNORE INTO griot_schema_migrations (version, applied_at)
          VALUES ('001_griot_phase1_postgres', datetime('now'));
        `);
      }
    }
  }

  public run(pgSql: string, params: unknown[]): PreparedStatementResult {
    this.executedSql.push(pgSql);
    const backingSql = this.convertPgToBackingSql(pgSql);
    const res = this.backingSqlite.prepare(backingSql).run(...(params as never[]));
    return {
      changes: Number(res.changes),
      lastInsertRowid: Number(res.lastInsertRowid),
    };
  }

  public get(pgSql: string, params: unknown[]): Record<string, unknown> | undefined {
    this.executedSql.push(pgSql);
    const backingSql = this.convertPgToBackingSql(pgSql);
    const row = this.backingSqlite
      .prepare(backingSql)
      .get(...(params as never[])) as Record<string, unknown> | undefined;
    return this.simulatePostgresNativeRowTypes(row);
  }

  public all(pgSql: string, params: unknown[]): Array<Record<string, unknown>> {
    this.executedSql.push(pgSql);
    const backingSql = this.convertPgToBackingSql(pgSql);
    const rows = this.backingSqlite
      .prepare(backingSql)
      .all(...(params as never[])) as Array<Record<string, unknown>>;
    return rows.map((r) => this.simulatePostgresNativeRowTypes(r)!);
  }

  public close(): void {
    this.backingSqlite.close();
  }
}

describe('Deployment, PostgreSQL Adapter, CORS & Lovable Integration Security', () => {
  it('1. Enforces mandatory cryptographic secrets, disables silent mock mode, rejects wildcard CORS, and forces 0.0.0.0 + process.env.PORT in production', async () => {
    // Missing secrets in production must throw
    assert.throws(
      () =>
        loadGriotConfig({
          env: 'production',
          jwtSecret: '',
          vaultMasterKey: '',
          fileSigningSecret: '',
        }),
      /CRITICAL SECURITY ERROR/
    );

    // Wildcard '*' in allowedOrigins in production must throw
    assert.throws(
      () =>
        loadGriotConfig({
          env: 'production',
          jwtSecret: 'prod-test-jwt-secret-placeholder-32chars',
          vaultMasterKey: 'prod-test-vault-secret-placeholder-32ch',
          fileSigningSecret: 'prod-test-file-secret-placeholder-32chr',
          allowedOrigins: ['*'],
        }),
      /Wildcard \(\*\) in GRIOT_ALLOWED_ORIGINS is forbidden/
    );

    // Production host resolution must ALWAYS be 0.0.0.0, even if 127.0.0.1 or localhost is passed
    assert.equal(resolveBindHost('production', '127.0.0.1'), '0.0.0.0');
    assert.equal(resolveBindHost('production', 'localhost'), '0.0.0.0');
    assert.equal(resolveBindHost('production', undefined), '0.0.0.0');
    assert.equal(resolveBindHost('development', undefined), '127.0.0.1');

    // Port resolution reads process.env.PORT first, falling back to GRIOT_PORT then 4100
    assert.equal(
      resolveListenPort({ envPort: '10000', griotPort: '4100' }),
      10000
    );
    assert.equal(
      resolveListenPort({ envPort: undefined, griotPort: '4200' }),
      4200
    );
    assert.equal(
      resolveListenPort({ envPort: undefined, griotPort: undefined }),
      4100
    );

    const prevPort = process.env.PORT;
    const prevGriotHost = process.env.GRIOT_HOST;
    process.env.PORT = '14589';
    process.env.GRIOT_HOST = '127.0.0.1';

    try {
      // Valid production config binds 0.0.0.0 (ignoring 127.0.0.1), uses injected PORT, disables mock fallback
      const prodCfg = loadGriotConfig({
        env: 'production',
        host: 'localhost',
        sqlitePath: ':memory:',
        jwtSecret: 'prod-test-jwt-secret-placeholder-32chars',
        vaultMasterKey: 'prod-test-vault-secret-placeholder-32ch',
        fileSigningSecret: 'prod-test-file-secret-placeholder-32chr',
      });

      assert.equal(prodCfg.env, 'production');
      assert.equal(prodCfg.host, '0.0.0.0');
      assert.equal(prodCfg.port, 14589);
      assert.equal(prodCfg.allowMockProvidersWhenUnconfigured, false);
      assert.equal(prodCfg.storageDurable, false);
      assert.equal(prodCfg.providers.open_weight.apiKey, null);

      // Start actual HTTP server in production mode and verify OS socket binds 0.0.0.0:14589
      const prodCore = new GriotCore({ config: prodCfg });
      const prodServer = new GriotHttpServer(prodCore);
      const boundPort = await prodServer.listen();
      try {
        const bound = prodServer.getBoundAddress();
        assert.ok(bound, 'Expected server.getBoundAddress() to return actual bound socket info');
        assert.equal(bound.host, '0.0.0.0');
        assert.equal(bound.port, 14589);
        assert.equal(boundPort, 14589);

        const healthCheck = await fetch(`http://127.0.0.1:${boundPort}/api/v1/health`);
        assert.equal(healthCheck.status, 200);
      } finally {
        await prodServer.close();
        prodCore.close();
      }
    } finally {
      if (prevPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = prevPort;
      }
      if (prevGriotHost === undefined) {
        delete process.env.GRIOT_HOST;
      } else {
        process.env.GRIOT_HOST = prevGriotHost;
      }
    }
  });

  it('2. Translates SQLite SQL to PostgreSQL ($1..$N), normalizes JSONB/TIMESTAMPTZ rows, and parses 001_griot_phase1_postgres.sql', () => {
    const pragmaRes = translateSqliteToPostgres('PRAGMA foreign_keys = ON;');
    assert.equal(pragmaRes.skip, true);

    const beginRes = translateSqliteToPostgres('BEGIN IMMEDIATE TRANSACTION;');
    assert.equal(beginRes.skip, false);
    assert.equal(beginRes.sql, 'BEGIN;');

    const queryRes = translateSqliteToPostgres(
      `SELECT * FROM messages WHERE conversation_id = ? AND content != 'What is ? in SQL?' AND role = ?`
    );
    assert.equal(queryRes.skip, false);
    assert.equal(queryRes.paramCount, 2);
    assert.equal(
      queryRes.sql,
      `SELECT * FROM messages WHERE conversation_id = $1 AND content != 'What is ? in SQL?' AND role = $2`
    );

    const sampleDate = new Date('2026-11-25T20:00:00.000Z');
    const normalized = normalizePostgresRow({
      id: 'org_123',
      is_avantage_internal: true,
      preferences_json: { costOptimizationMode: 'cost_first' },
      scopes_json: ['chat:write', 'builder:read'],
      created_at: sampleDate,
      total_requests: '42',
      free_credits_usd: '5.000000',
    });

    assert.ok(normalized);
    assert.equal(normalized.is_avantage_internal, 1);
    assert.equal(
      normalized.preferences_json,
      JSON.stringify({ costOptimizationMode: 'cost_first' })
    );
    assert.equal(
      normalized.scopes_json,
      JSON.stringify(['chat:write', 'builder:read'])
    );
    assert.equal(normalized.created_at, '2026-11-25T20:00:00.000Z');
    assert.equal(normalized.total_requests, 42);
    assert.equal(normalized.free_credits_usd, 5);

    const pgMigrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'migrations', '001_griot_phase1_postgres.sql'),
      'utf8'
    );
    const statements = splitPostgresMigrationStatements(pgMigrationSql);
    assert.ok(statements.length >= 20, `Expected >= 20 migration statements, got ${statements.length}`);
    assert.ok(
      statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS organisations')),
      'Expected organisations DDL statement'
    );
    assert.ok(
      statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS guided_projects')),
      'Expected guided_projects DDL statement'
    );
    assert.ok(
      statements.some((s) => s.includes('CREATE TABLE IF NOT EXISTS griot_schema_migrations')),
      'Expected griot_schema_migrations DDL statement'
    );
  });

  it('3. Executes full GriotCore workflows (Auth, Nested Savepoints, Conversations, Guided Builder, Health) on the PostgreSQL Adapter', async () => {
    const pgExecutor = new SimulatedPostgresExecutor();
    const core = new GriotCore({
      config: {
        env: 'test',
        databaseUrl: 'postgresql://postgres:test@db.example.supabase.co:5432/postgres',
      },
      postgresExecutor: pgExecutor,
    });

    try {
      assert.equal(core.database.getBackendType(), 'postgres');
      const dbHealth = core.database.checkHealth();
      assert.equal(dbHealth.backend, 'postgres');
      assert.equal(dbHealth.ready, true);
      assert.equal(dbHealth.migrationVersion, '001_griot_phase1_postgres');

      // 1. Create user account (uses outer transaction + nested savepoint for createOrganisation)
      const registered = core.tenantService.createUserAccount({
        email: 'pg.architect@avantage.com',
        displayName: 'Postgres Architect',
        password: 'SecurePassword123!',
      });
      assert.ok(registered.user.id.startsWith('usr_'));
      assert.ok(registered.personalOrg?.id.startsWith('org_'));
      assert.ok(registered.accessToken);

      // Verify SAVEPOINT was used on PostgreSQL
      assert.ok(
        pgExecutor.executedSql.some((s) => s.startsWith('SAVEPOINT sp_1')),
        'Expected nested transaction to emit SAVEPOINT sp_1 on PostgreSQL'
      );

      const auth = core.authService.authenticateJwt(registered.accessToken!);
      assert.equal(auth.orgId, registered.personalOrg!.id);
      assert.ok(auth.scopes.includes('builder:read'));
      assert.ok(auth.scopes.includes('builder:write'));

      // 2. Start and plan a Guided Builder project persisted via PostgreSQL JSONB columns
      const started = await core.guidedBuildEngine.startProject({
        auth,
        ideaDescription: 'Build an online booking website for a dental clinic',
        technicalExperience: 'complete_beginner',
        budgetConstraint: 'free_only',
      });
      assert.ok(started.id.startsWith('gproj_'));
      assert.ok(started.clarifyingQuestions.length > 0);

      const planned = await core.guidedBuildEngine.refineRequirementsAndPlan({
        projectId: started.id,
        auth,
        clarifyingAnswers: {
          q1: 'Patients booking dental checkups',
          q2: 'Appointment calendar and contact form',
        },
        mustHaveFeatures: ['Appointment booking form', 'Service list'],
      });
      assert.ok(planned.orderedSteps.length >= 4);

      const fetchedProject = core.guidedBuildEngine.getProject(started.id, auth);
      assert.equal(fetchedProject.id, started.id);
      assert.equal(fetchedProject.selectedToolId, planned.selectedToolId);
      assert.equal(fetchedProject.orderedSteps.length, planned.orderedSteps.length);
    } finally {
      core.close();
    }
  });

  it('4. Enforces strict CORS allowlist (204 for Lovable origins, 403 CORS_ORIGIN_DENIED for unapproved origins)', async () => {
    assert.equal(
      isOriginAllowed('https://lovable.dev', ['https://lovable.dev', 'https://*.lovable.app']),
      true
    );
    assert.equal(
      isOriginAllowed('https://griot-studio-preview.lovable.app', [
        'https://lovable.dev',
        'https://*.lovable.app',
      ]),
      true
    );
    assert.equal(
      isOriginAllowed('https://lovable.app.evil.com', [
        'https://lovable.dev',
        'https://*.lovable.app',
      ]),
      false
    );

    const core = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        allowedOrigins: [
          'https://lovable.dev',
          'https://*.lovable.app',
          'http://localhost:3000',
        ],
      },
    });
    const server = new GriotHttpServer(core);
    const port = await server.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Allowed Lovable subdomain preflight -> 204 No Content
      const preflightOk = await fetch(`${baseUrl}/api/v1/chat/completions`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://griot-frontend.lovable.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization, Content-Type, X-Griot-Api-Key',
        },
      });
      assert.equal(preflightOk.status, 204);
      assert.equal(
        preflightOk.headers.get('access-control-allow-origin'),
        'https://griot-frontend.lovable.app'
      );
      assert.equal(preflightOk.headers.get('access-control-allow-credentials'), 'true');
      assert.equal(preflightOk.headers.get('vary'), 'Origin');

      // 2. Unapproved origin preflight -> 403 CORS_ORIGIN_DENIED
      const preflightDenied = await fetch(`${baseUrl}/api/v1/chat/completions`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://attacker.example.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      assert.equal(preflightDenied.status, 403);
      const deniedBody = (await preflightDenied.json()) as {
        success: boolean;
        error: { code: string };
      };
      assert.equal(deniedBody.success, false);
      assert.equal(deniedBody.error.code, 'CORS_ORIGIN_DENIED');

      // 3. Same-origin POST request (hosted UI on Render sending Origin matching Host + X-Forwarded-Proto) -> permitted
      const sameOriginPost = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://griot-ai.onrender.com',
          'X-Forwarded-Host': 'griot-ai.onrender.com',
          'X-Forwarded-Proto': 'https',
        },
        body: JSON.stringify({
          email: 'sameorigin@griot.ai',
          displayName: 'Same Origin User',
          password: 'SameOriginPassword123!',
        }),
      });
      assert.equal(sameOriginPost.status, 201);
    } finally {
      await server.close();
      core.close();
    }
  });

  it('5. Enforces API key scopes (builder:read / builder:write), blocks admin scope privilege escalation, and supports Lovable user session exchange', async () => {
    const core = new GriotCore({
      config: {
        env: 'test',
        sqlitePath: ':memory:',
        storageDurable: false,
      },
    });
    const server = new GriotHttpServer(core);
    const port = await server.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Check /api/v1/health readiness structure
      const healthRes = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(healthRes.status, 200);
      const healthJson = (await healthRes.json()) as {
        data: {
          status: string;
          readiness: {
            backend: { ready: boolean };
            database: { backend: string; ready: boolean };
            privateStorage: { ready: boolean; writable: boolean; durable: boolean };
            ollama: { reachable: boolean; installedModelsCount: number };
            models: { ready: boolean; registeredCount: number };
          };
        };
      };
      assert.equal(healthJson.data.status, 'healthy');
      assert.equal(healthJson.data.readiness.backend.ready, true);
      assert.equal(healthJson.data.readiness.database.backend, 'sqlite');
      assert.equal(healthJson.data.readiness.database.ready, true);
      assert.equal(healthJson.data.readiness.privateStorage.writable, true);
      assert.equal(healthJson.data.readiness.privateStorage.durable, false);

      // 2. Register an organisation owner
      const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'owner@griot.ai',
          displayName: 'Griot Owner',
          password: 'OwnerPassword123!',
        }),
      });
      assert.equal(regRes.status, 201);
      const regData = (await regRes.json()) as {
        data: { accessToken: string; personalOrg: { id: string } };
      };
      const ownerJwt = regData.data.accessToken;

      // 3. Attempt to create an application API key with privileged 'org:admin' scope -> 403 FORBIDDEN_PRIVILEGED_API_KEY_SCOPE
      const badKeyRes = await fetch(`${baseUrl}/api/v1/organisations/current/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerJwt}`,
        },
        body: JSON.stringify({
          name: 'Overprivileged Key',
          scopes: ['chat:write', 'org:admin'],
        }),
      });
      assert.equal(badKeyRes.status, 403);
      const badKeyBody = (await badKeyRes.json()) as { error: { code: string } };
      assert.equal(badKeyBody.error.code, 'FORBIDDEN_PRIVILEGED_API_KEY_SCOPE');

      // 4. Create a chat-only API key (WITHOUT builder:read or builder:write)
      const chatOnlyKeyRes = await fetch(
        `${baseUrl}/api/v1/organisations/current/api-keys`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerJwt}`,
          },
          body: JSON.stringify({
            name: 'Chat Only Key',
            scopes: ['chat:write', 'models:read'],
          }),
        }
      );
      assert.equal(chatOnlyKeyRes.status, 201);
      const chatOnlyKey = ((await chatOnlyKeyRes.json()) as { data: { rawKey: string } })
        .data.rawKey;

      // Calling /api/v1/builder/tools with chat-only key must be rejected with 403 FORBIDDEN_SCOPE
      const forbiddenBuilderRes = await fetch(`${baseUrl}/api/v1/builder/tools`, {
        headers: { 'X-Griot-Api-Key': chatOnlyKey },
      });
      assert.equal(forbiddenBuilderRes.status, 403);
      const forbiddenBuilderBody = (await forbiddenBuilderRes.json()) as {
        error: { code: string };
      };
      assert.equal(forbiddenBuilderBody.error.code, 'FORBIDDEN_SCOPE');

      // 5. Create a properly scoped Lovable application API key
      const lovableKeyRes = await fetch(
        `${baseUrl}/api/v1/organisations/current/api-keys`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerJwt}`,
          },
          body: JSON.stringify({
            name: 'Lovable Frontend Application Key',
            scopes: LOVABLE_APP_DEFAULT_SCOPES,
          }),
        }
      );
      assert.equal(lovableKeyRes.status, 201);
      const lovableKeyData = (await lovableKeyRes.json()) as {
        data: { rawKey: string; scopes: string[] };
      };
      const lovableApiKey = lovableKeyData.data.rawKey;
      assert.ok(lovableKeyData.data.scopes.includes('builder:read'));
      assert.ok(lovableKeyData.data.scopes.includes('builder:write'));
      assert.equal(lovableKeyData.data.scopes.includes('org:admin'), false);
      assert.equal(lovableKeyData.data.scopes.includes('apikeys:manage'), false);

      // 6. Exchange an external Lovable user identity for a user-scoped GRIOT JWT
      const exchangeRes = await fetch(`${baseUrl}/api/v1/auth/session-exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Griot-Api-Key': lovableApiKey,
        },
        body: JSON.stringify({
          externalUserId: 'lovable_usr_9981',
          email: 'founder@startup.africa',
          displayName: 'Kofi Mensah',
        }),
      });
      assert.equal(exchangeRes.status, 200);
      const exchangeData = (await exchangeRes.json()) as {
        data: {
          user: { id: string; email: string; displayName: string };
          orgId: string;
          accessToken: string;
          expiresInSeconds: number;
        };
      };
      assert.ok(exchangeData.data.user.id.startsWith('usr_'));
      assert.equal(exchangeData.data.orgId, regData.data.personalOrg.id);
      assert.ok(exchangeData.data.accessToken.length > 20);

      const userJwt = exchangeData.data.accessToken;

      // 7. Verify spoofed client-supplied userId in request body is rejected with 403 UNVERIFIED_USER_ID_REJECTED
      const spoofRes = await fetch(`${baseUrl}/api/v1/builder/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userJwt}`,
        },
        body: JSON.stringify({
          userId: 'usr_arbitrary_unverified_spoof',
          ideaDescription: 'Build a personal portfolio site',
        }),
      });
      assert.equal(spoofRes.status, 403);
      const spoofBody = (await spoofRes.json()) as { error: { code: string } };
      assert.equal(spoofBody.error.code, 'UNVERIFIED_USER_ID_REJECTED');

      // 8. Valid builder project creation with userJwt succeeds and attributes project to verified userId
      const validBuilderRes = await fetch(`${baseUrl}/api/v1/builder/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userJwt}`,
        },
        body: JSON.stringify({
          ideaDescription: 'Build a clean landing page and booking form for my consulting business',
        }),
      });
      assert.equal(validBuilderRes.status, 201);
      const createdProj = (await validBuilderRes.json()) as {
        data: { id: string; userId: string; orgId: string };
      };
      assert.equal(createdProj.data.userId, exchangeData.data.user.id);
      assert.equal(createdProj.data.orgId, regData.data.personalOrg.id);
    } finally {
      await server.close();
      core.close();
    }
  });

  it('6. Routes free-tier Gemini requests to gemini:gemini-3.5-flash-lite first, retains gemini-3.8-flash second, and temporarily deprioritizes quota-exhausted models', () => {
    const core = new GriotCore({
      config: {
        env: 'production',
        sqlitePath: ':memory:',
        jwtSecret: 'prod-test-jwt-secret-placeholder-32chars',
        vaultMasterKey: 'prod-test-vault-secret-placeholder-32ch',
        fileSigningSecret: 'prod-test-file-secret-placeholder-32chr',
        providers: {
          gemini: {
            apiKey: 'test-gemini-live-key',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          },
          openai: { apiKey: null, baseUrl: 'https://api.openai.com/v1' },
          anthropic: { apiKey: null, baseUrl: 'https://api.anthropic.com/v1' },
          mistral: { apiKey: null, baseUrl: 'https://api.mistral.ai/v1' },
          open_weight: { apiKey: null, baseUrl: 'http://127.0.0.1:11434/v1' },
        },
      },
    });

    try {
      // 1. Ordinary free-tier chat request selects gemini:gemini-3.5-flash-lite first, with gemini-3.8-flash second
      const initialDecision = core.routingEngine.selectModel({
        messages: [{ role: 'user', content: 'Introduce yourself as GRIOT AI.' }],
        hints: { preferredProvider: 'gemini' },
      });

      assert.equal(initialDecision.selectedModel.id, 'gemini:gemini-3.5-flash-lite');
      assert.equal(initialDecision.fallbackChain[0]?.id, 'gemini:gemini-3.8-flash');
      assert.equal(
        initialDecision.fallbackChain[1]?.id,
        'gemini:gemini-3.1-pro-preview'
      );

      // 2. Simulate 429 quota_exceeded on gemini:gemini-3.5-flash-lite -> temporarily deprioritized
      core.providerManager.recordModelFailureCooldown(
        'gemini:gemini-3.5-flash-lite',
        new ProviderError({
          provider: 'gemini',
          category: 'quota_exceeded',
          statusCode: 429,
          message: 'Quota exceeded for metric',
        })
      );
      assert.equal(
        core.providerManager.isModelCoolingDown('gemini:gemini-3.5-flash-lite'),
        true
      );

      const postQuotaDecision = core.routingEngine.selectModel({
        messages: [{ role: 'user', content: 'Introduce yourself as GRIOT AI.' }],
        hints: { preferredProvider: 'gemini' },
      });
      assert.equal(postQuotaDecision.selectedModel.id, 'gemini:gemini-3.8-flash');
    } finally {
      core.close();
    }
  });
});
