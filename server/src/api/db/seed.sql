-- Minimal seed: admin user only
-- Password: Sushil$21 (bcrypt hash)
INSERT OR IGNORE INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
VALUES ('admin-001', 'Admin', 'canyoujerry@gmail.com', '$2b$12$.Z1xqL3iujzgK4ocPzxRBe3V0C68SwdzQM/8ty.ekimy/BMTk9AgC', 'ADMIN', 1, datetime('now'), datetime('now'));
