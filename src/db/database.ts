// ============================================================================
// GRIOT AI — DUAL DATABASE ENGINE (SQLite for Local/Test + PostgreSQL for Render/Supabase)
// Selects PostgreSQL when GRIOT_DATABASE_URL is configured; preserves SQLite
// (node:sqlite DatabaseSync) for local development and automated test suites.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  MessageChannel,
  receiveMessageOnPort,
  Worker,
  type MessagePort,
} from 'node:worker_threads';
import {
  normalizePostgresParams,
  normalizePostgresRow,
  splitPostgresMigrationStatements,
  translateSqliteToPostgres,
} from './sqlTranslator.ts';

export interface PreparedStatementResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export interface GriotPreparedStatement {
  run(...params: unknown[]): PreparedStatementResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface GriotDatabaseDriver {
  prepare(sql: string): GriotPreparedStatement;
  exec(sql: string): void;
  close(): void;
}

export interface PostgresSyncExecutor {
  execBatch(statements: string[]): void;
  run(pgSql: string, params: unknown[]): PreparedStatementResult;
  get(pgSql: string, params: unknown[]): Record<string, unknown> | undefined;
  all(pgSql: string, params: unknown[]): Array<Record<string, unknown>>;
  close(): void;
}

export interface GriotDatabaseOptions {
  sqlitePath?: string;
  databaseUrl?: string | null;
  postgresExecutor?: PostgresSyncExecutor;
  queryTimeoutMs?: number;
}

/**
 * Synchronous Worker-Thread Bridge to `postgres@3.4.9`.
 * Maintains a single reserved PostgreSQL connection in the worker so
 * transactions (`BEGIN`, `SAVEPOINT`, `COMMIT`, `ROLLBACK`) execute with full session affinity.
 */
class WorkerPostgresSyncExecutor implements PostgresSyncExecutor {
  private readonly worker: Worker;
  private readonly localPort: MessagePort;
  private readonly timeoutMs: number;
  private nextReqId = 1;
  private closed = false;

  constructor(databaseUrl: string, timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
    const channel = new MessageChannel();
    this.localPort = channel.port1;
    const workerPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'postgresWorker.mjs'
    );

    this.worker = new Worker(workerPath, {
      workerData: {
        databaseUrl,
        responsePort: channel.port2,
      },
      transferList: [channel.port2],
    });
  }

  private callWorker<T>(payload: {
    action: 'exec_batch' | 'run' | 'get' | 'all' | 'close';
    sql?: string;
    statements?: string[];
    params?: unknown[];
  }): T {
    if (this.closed) {
      throw new Error('PostgreSQL database connection is already closed.');
    }
    const id = this.nextReqId++;
    const signalBuffer = new SharedArrayBuffer(4);
    const signal = new Int32Array(signalBuffer);
    Atomics.store(signal, 0, 0);

    this.worker.postMessage({
      id,
      ...payload,
      signalBuffer,
    });

    const waitStatus = Atomics.wait(signal, 0, 0, this.timeoutMs);
    if (waitStatus === 'timed-out') {
      throw new Error(
        `PostgreSQL query timed out after ${this.timeoutMs}ms (action: ${payload.action}).`
      );
    }

    const msgWrapper = receiveMessageOnPort(this.localPort);
    if (!msgWrapper || !msgWrapper.message) {
      throw new Error('Failed to receive response message from PostgreSQL worker.');
    }

    const msg = msgWrapper.message as {
      id: number;
      ok: boolean;
      result?: T;
      error?: string;
    };

    if (!msg.ok) {
      throw new Error(`PostgreSQL execution error: ${msg.error || 'Unknown error'}`);
    }

    return msg.result as T;
  }

  public execBatch(statements: string[]): void {
    this.callWorker({
      action: 'exec_batch',
      statements,
    });
  }

  public run(pgSql: string, params: unknown[]): PreparedStatementResult {
    return this.callWorker<PreparedStatementResult>({
      action: 'run',
      sql: pgSql,
      params,
    });
  }

  public get(pgSql: string, params: unknown[]): Record<string, unknown> | undefined {
    return this.callWorker<Record<string, unknown> | undefined>({
      action: 'get',
      sql: pgSql,
      params,
    });
  }

  public all(pgSql: string, params: unknown[]): Array<Record<string, unknown>> {
    return this.callWorker<Array<Record<string, unknown>>>({
      action: 'all',
      sql: pgSql,
      params,
    });
  }

  public close(): void {
    if (this.closed) return;
    try {
      this.callWorker({ action: 'close' });
    } catch {
      // Ignore shutdown errors
    } finally {
      this.closed = true;
      this.localPort.close();
      void this.worker.terminate();
    }
  }
}

/**
 * Driver wrapper around PostgresSyncExecutor that translates SQLite-dialect SQL
 * (`?` placeholders, `PRAGMA`, `BEGIN IMMEDIATE TRANSACTION`) and normalizes
 * PostgreSQL row types (`JSONB`, `TIMESTAMPTZ`, `NUMERIC`, `BIGINT`).
 */
class PostgresDriverAdapter implements GriotDatabaseDriver {
  private readonly executor: PostgresSyncExecutor;

  constructor(executor: PostgresSyncExecutor) {
    this.executor = executor;
  }

  public prepare(rawSql: string): GriotPreparedStatement {
    const translated = translateSqliteToPostgres(rawSql);

    return {
      run: (...params: unknown[]): PreparedStatementResult => {
        if (translated.skip) {
          return { changes: 0, lastInsertRowid: 0 };
        }
        const normParams = normalizePostgresParams(params);
        return this.executor.run(translated.sql, normParams);
      },
      get: (...params: unknown[]): unknown => {
        if (translated.skip) {
          return undefined;
        }
        const normParams = normalizePostgresParams(params);
        const row = this.executor.get(translated.sql, normParams);
        return normalizePostgresRow(row);
      },
      all: (...params: unknown[]): unknown[] => {
        if (translated.skip) {
          return [];
        }
        const normParams = normalizePostgresParams(params);
        const rows = this.executor.all(translated.sql, normParams);
        return rows.map((r) => normalizePostgresRow(r) as Record<string, unknown>);
      },
    };
  }

  public exec(rawSql: string): void {
    const statements = splitPostgresMigrationStatements(rawSql)
      .map((s) => translateSqliteToPostgres(s))
      .filter((t) => !t.skip && t.sql.length > 0)
      .map((t) => t.sql);

    if (statements.length === 0) return;
    this.executor.execBatch(statements);
  }

  public close(): void {
    this.executor.close();
  }
}

export class GriotDatabase {
  public readonly db: GriotDatabaseDriver;
  public readonly sqlitePath: string;
  public readonly databaseUrl: string | null;
  private readonly backendType: 'sqlite' | 'postgres';
  private transactionDepth = 0;

  constructor(optionsOrSqlitePath: string | GriotDatabaseOptions = ':memory:') {
    const opts: GriotDatabaseOptions =
      typeof optionsOrSqlitePath === 'string'
        ? { sqlitePath: optionsOrSqlitePath }
        : optionsOrSqlitePath;

    this.sqlitePath = opts.sqlitePath || ':memory:';
    this.databaseUrl =
      opts.databaseUrl && opts.databaseUrl.trim().length > 0
        ? opts.databaseUrl.trim()
        : null;

    if (this.databaseUrl || opts.postgresExecutor) {
      this.backendType = 'postgres';
      const executor =
        opts.postgresExecutor ??
        new WorkerPostgresSyncExecutor(this.databaseUrl!, opts.queryTimeoutMs ?? 30000);
      this.db = new PostgresDriverAdapter(executor);
      this.initializePostgresSchema();
    } else {
      this.backendType = 'sqlite';
      if (this.sqlitePath !== ':memory:') {
        const dir = path.dirname(path.resolve(this.sqlitePath));
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      this.db = new DatabaseSync(this.sqlitePath) as unknown as GriotDatabaseDriver;
      this.initializeSqliteSchema();
    }
  }

  public getBackendType(): 'sqlite' | 'postgres' {
    return this.backendType;
  }

  private initializeSqliteSchema(): void {
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (this.sqlitePath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }

    const migrationPath = path.resolve(
      process.cwd(),
      'migrations',
      '001_griot_phase1_sqlite.sql'
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`SQLite migration file not found at ${migrationPath}`);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    this.db.exec(sql);
  }

  private initializePostgresSchema(): void {
    const migrationPath = path.resolve(
      process.cwd(),
      'migrations',
      '001_griot_phase1_postgres.sql'
    );
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`PostgreSQL migration file not found at ${migrationPath}`);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    this.db.exec(sql);
  }

  public checkHealth(): {
    backend: 'sqlite' | 'postgres';
    ready: boolean;
    migrationVersion: string;
  } {
    try {
      const probe = this.db.prepare('SELECT 1 AS ok').get() as
        | { ok?: number | string }
        | undefined;
      const isReady = Boolean(probe && Number(probe.ok) === 1);
      return {
        backend: this.backendType,
        ready: isReady,
        migrationVersion:
          this.backendType === 'postgres'
            ? '001_griot_phase1_postgres'
            : '001_griot_phase1_sqlite',
      };
    } catch {
      return {
        backend: this.backendType,
        ready: false,
        migrationVersion:
          this.backendType === 'postgres'
            ? '001_griot_phase1_postgres'
            : '001_griot_phase1_sqlite',
      };
    }
  }

  public transaction<T>(fn: () => T): T {
    const isOuter = this.transactionDepth === 0;
    const savepointName = `sp_${this.transactionDepth}`;
    this.transactionDepth += 1;

    if (isOuter) {
      this.db.exec(
        this.backendType === 'postgres' ? 'BEGIN;' : 'BEGIN IMMEDIATE TRANSACTION;'
      );
    } else {
      this.db.exec(`SAVEPOINT ${savepointName};`);
    }

    try {
      const result = fn();
      if (isOuter) {
        this.db.exec('COMMIT;');
      } else {
        this.db.exec(`RELEASE SAVEPOINT ${savepointName};`);
      }
      return result;
    } catch (err) {
      try {
        if (isOuter) {
          this.db.exec('ROLLBACK;');
        } else {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
          this.db.exec(`RELEASE SAVEPOINT ${savepointName};`);
        }
      } catch {
        // Ignore rollback errors if transaction already aborted
      }
      throw err;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  public close(): void {
    this.db.close();
  }
}
