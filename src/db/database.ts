// ============================================================================
// GRIOT AI — DATABASE ENGINE (SQLite via node:sqlite + Migration Loader)
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class GriotDatabase {
  public readonly db: DatabaseSync;
  public readonly sqlitePath: string;
  private transactionDepth = 0;

  constructor(sqlitePath = ':memory:') {
    this.sqlitePath = sqlitePath;
    if (sqlitePath !== ':memory:') {
      const dir = path.dirname(path.resolve(sqlitePath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(sqlitePath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
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
      throw new Error(`Database migration file not found at ${migrationPath}`);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    this.db.exec(sql);
  }

  public transaction<T>(fn: () => T): T {
    const isOuter = this.transactionDepth === 0;
    const savepointName = `sp_${this.transactionDepth}`;
    this.transactionDepth += 1;

    if (isOuter) {
      this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
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
