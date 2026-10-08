-- Minimal seed: admin user only
-- Password: admin123 (bcrypt hash)
INSERT OR IGNORE INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
VALUES ('admin-001', 'Admin', 'admin@crm.com', '$2a$12$LJ3m4ys3Lz0YBNOURq0Y3OjCfKJmKPOJYqDTPVCKzLOBhZMHfWO6e', 'ADMIN', 1, datetime('now'), datetime('now'));
