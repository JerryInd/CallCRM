-- CRM v2 Schema
-- Google Sheets = live source of truth for leads
-- D1 = operational data only

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'AGENT')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  registration_code TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),
  agent_id TEXT,
  registered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  clock_in_at TEXT NOT NULL,
  clock_out_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED')),
  total_pause_seconds INTEGER NOT NULL DEFAULT 0,
  net_work_seconds INTEGER NOT NULL DEFAULT 0,
  calls_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_pauses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_reservations (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXPIRED', 'RELEASED')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dnc_suppression (
  id TEXT PRIMARY KEY,
  phone TEXT,
  email TEXT,
  account TEXT,
  reason TEXT,
  added_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_pools (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS call_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  response TEXT NOT NULL,
  notes TEXT,
  follow_up_date TEXT,
  follow_up_time TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  imported_rows INTEGER NOT NULL,
  duplicate_rows INTEGER NOT NULL,
  invalid_rows INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_agent ON devices(agent_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_reg_code ON devices(registration_code);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON agent_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_pauses_session ON session_pauses(session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_lead ON lead_reservations(lead_id);
CREATE INDEX IF NOT EXISTS idx_reservations_agent ON lead_reservations(agent_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON lead_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_session ON lead_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_dnc_phone ON dnc_suppression(phone);
CREATE INDEX IF NOT EXISTS idx_dnc_email ON dnc_suppression(email);
CREATE INDEX IF NOT EXISTS idx_call_activities_lead ON call_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_activities_agent ON call_activities(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
