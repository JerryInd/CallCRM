-- Align fresh database to the production-final schema (15 tables).
-- Applied after migration.sql; every statement is safe to re-run.

-- 1. users: prod replaced the v2 table (SUPERADMIN role allowed)
DROP TABLE IF EXISTS users;
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('SUPERADMIN', 'ADMIN', 'AGENT')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

-- 2. devices: prod ALTERs
ALTER TABLE devices ADD COLUMN push_token TEXT;
ALTER TABLE devices ADD COLUMN platform TEXT;

-- 3. tables prod created ad-hoc (missing from migration.sql)
CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL UNIQUE, name TEXT, email TEXT, phone TEXT, account TEXT, address TEXT, brand TEXT, comments TEXT, social_trading TEXT, type TEXT, original_date TEXT, poi TEXT, lead_status TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, last_called TEXT, last_response TEXT, follow_up_date TEXT, follow_up_time TEXT, dnc INTEGER NOT NULL DEFAULT 0, conversion TEXT, appointment TEXT, pending_sync INTEGER NOT NULL DEFAULT 0, sheet_row INTEGER, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, phone TEXT, email TEXT, agent_name TEXT NOT NULL, response TEXT NOT NULL, notes TEXT, follow_up_date TEXT, follow_up_time TEXT, date TEXT NOT NULL, time TEXT NOT NULL, pending_sync INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_conversations (id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'DIRECT', title TEXT, lead_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_participants (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_id TEXT NOT NULL, last_read_at TEXT, muted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL, content TEXT NOT NULL, lead_id TEXT, status TEXT NOT NULL DEFAULT 'SENT', created_at TEXT NOT NULL, delivered_at TEXT, read_at TEXT);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, reference_id TEXT, reference_type TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, read_at TEXT);

-- 4. leads follow-up assignment columns (prod ALTERs)
ALTER TABLE leads ADD COLUMN follow_up_assigned_to text;
ALTER TABLE leads ADD COLUMN follow_up_status text DEFAULT 'PENDING';
ALTER TABLE leads ADD COLUMN follow_up_assigned_at text;

-- 5. tables that were in migration.sql but NEVER in prod-final
DROP TABLE IF EXISTS dnc_suppression;
DROP TABLE IF EXISTS lead_pools;
DROP TABLE IF EXISTS agent_pools;
DROP TABLE IF EXISTS call_activities;
DROP TABLE IF EXISTS import_batches;

-- 6. admin seed (original seed.sql hash was invalid — verified pre-existing bug)
INSERT OR REPLACE INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
VALUES ('admin-001', 'Admin', 'canyoujerry@gmail.com', '$2b$12$.Z1xqL3iujzgK4ocPzxRBe3V0C68SwdzQM/8ty.ekimy/BMTk9AgC', 'ADMIN', 1, datetime('now'), datetime('now'));

-- 6b. migrate an already-seeded default admin row to the new default credentials
UPDATE users SET email = 'canyoujerry@gmail.com', password_hash = '$2b$12$.Z1xqL3iujzgK4ocPzxRBe3V0C68SwdzQM/8ty.ekimy/BMTk9AgC', updated_at = datetime('now') WHERE email = 'admin@crm.com';
