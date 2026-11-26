// ============================================================================
// GRIOT AI — DEDICATED POSTGRESQL SESSION WORKER (postgres@3.4.9)
// Holds a reserved PostgreSQL connection session so synchronous transactional
// queries (BEGIN, SAVEPOINT, COMMIT, ROLLBACK) and parameterized statements
// execute deterministically via Atomics.wait + MessagePort.
// ============================================================================

import postgres from 'postgres';
import { parentPort, workerData } from 'node:worker_threads';

const { databaseUrl, responsePort } = workerData;

function resolveSslOption(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const sslMode = parsed.searchParams.get('sslmode');
    if (sslMode === 'disable') return false;
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    ) {
      return sslMode === 'require' ? 'require' : false;
    }
    // Supabase and Render managed PostgreSQL require TLS
    return 'require';
  } catch {
    return 'require';
  }
}

let sqlPool = null;
let reservedSession = null;

async function ensureSession() {
  if (reservedSession) return reservedSession;
  if (!sqlPool) {
    sqlPool = postgres(databaseUrl, {
      max: 2,
      idle_timeout: 30,
      connect_timeout: 15,
      ssl: resolveSslOption(databaseUrl),
      onnotice: () => {},
    });
  }
  reservedSession = await sqlPool.reserve();
  return reservedSession;
}

parentPort.on('message', async (msg) => {
  const { id, action, sql, statements, params, signalBuffer } = msg;
  const signal = new Int32Array(signalBuffer);

  const reply = (payload) => {
    responsePort.postMessage({ id, ...payload });
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0, 1);
  };

  try {
    if (action === 'close') {
      if (reservedSession) {
        try {
          reservedSession.release();
        } catch {
          // Ignore release error on shutdown
        }
        reservedSession = null;
      }
      if (sqlPool) {
        await sqlPool.end({ timeout: 3 });
        sqlPool = null;
      }
      reply({ ok: true, result: null });
      process.exit(0);
      return;
    }

    const session = await ensureSession();

    if (action === 'exec_batch') {
      for (const stmt of statements || []) {
        if (stmt && stmt.trim().length > 0) {
          await session.unsafe(stmt);
        }
      }
      reply({ ok: true, result: { changes: 0 } });
      return;
    }

    if (action === 'run') {
      const res = await session.unsafe(sql, params || []);
      reply({
        ok: true,
        result: {
          changes: typeof res.count === 'number' ? res.count : 0,
          lastInsertRowid: 0,
        },
      });
      return;
    }

    if (action === 'get') {
      const rows = await session.unsafe(sql, params || []);
      reply({
        ok: true,
        result: rows.length > 0 ? { ...rows[0] } : undefined,
      });
      return;
    }

    if (action === 'all') {
      const rows = await session.unsafe(sql, params || []);
      reply({
        ok: true,
        result: rows.map((r) => ({ ...r })),
      });
      return;
    }

    throw new Error(`Unsupported Postgres worker action: ${action}`);
  } catch (err) {
    reply({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: err && typeof err === 'object' && 'code' in err ? String(err.code) : undefined,
    });
  }
});
