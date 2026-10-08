// Idempotent schema initialization for the Node runtime.
// Applies the same two scripts used for the local/prod Cloudflare D1:
//   1. migration.sql  (drizzle baseline)
//   2. align.sql      (production-final 15-table schema + admin seed)
// Statements are executed individually so re-runs are safe, and the users
// table/seed is only (re)created when the database is empty — restarting the
// service never wipes admin-created users or resets the admin password.
import type { DatabaseSync } from 'node:sqlite';
import migrationSql from './migration.sql';
import alignSql from './align.sql';

function splitStatements(sql: string): string[] {
  const raw: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      cur += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      cur += ch;
      if (ch === '*' && next === '/') {
        cur += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (!inSingle && !inDouble && ch === '-' && next === '-') {
      inLineComment = true;
      cur += ch + next;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && ch === '/' && next === '*') {
      inBlockComment = true;
      cur += ch + next;
      i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      cur += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += ch;
      continue;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      raw.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) raw.push(cur);

  return raw
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const meaningful = s
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('--') && !line.startsWith('/*') && !line.startsWith('*/'));
      return meaningful.length > 0;
    });
}

function isIgnorableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already exists|duplicate column/i.test(msg);
}

function countUsers(db: DatabaseSync): number {
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number } | undefined;
    return Number(row?.c ?? 0);
  } catch {
    return 0;
  }
}

export function initDatabase(db: DatabaseSync): void {
  const usersExistWithRows = countUsers(db) > 0;

  // 1. Baseline (creates tables if missing; existing-table errors are ignored)
  for (const stmt of splitStatements(migrationSql)) {
    try {
      db.exec(stmt);
    } catch (err) {
      if (!isIgnorableError(err)) throw err;
    }
  }

  // 2. Production-final alignment (skip users drop/create/seed when populated)
  for (const stmt of splitStatements(alignSql)) {
    if (
      usersExistWithRows &&
      /DROP TABLE IF EXISTS users|CREATE TABLE users|INSERT OR REPLACE INTO users/i.test(stmt)
    ) {
      continue;
    }
    try {
      db.exec(stmt);
    } catch (err) {
      if (!isIgnorableError(err)) throw err;
    }
  }

  if (countUsers(db) === 0) {
    throw new Error('Database init failed: users table is empty after seeding');
  }
}
