import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { users, devices } from '../db/schema';
import { createDB } from '../db';
import { requireAuth, signToken, signRefreshToken, setTokenCookie, clearTokenCookie, verifyToken } from '../lib/auth';
import { verifyPassword } from '../lib/utils';
import { Bindings, Variables } from '../types';
import { getSheetSettings, appendAuditToSheet } from '../lib/sheet-helpers';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

router.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400);

  const db = createDB(c.env);
  const results = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = results[0];

  if (!user || !user.active) return c.json({ error: 'Invalid credentials' }, 401);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401);

  const payload = { userId: user.id, name: user.name, email: user.email, role: user.role as 'SUPERADMIN' | 'ADMIN' | 'AGENT' };
  const token = await signToken(payload, c.env.JWT_SECRET || 'dev-secret');
  const refreshToken = await signRefreshToken(payload, c.env.JWT_SECRET || 'dev-secret');

  setTokenCookie(c, token);

  try {
    const ss = await getSheetSettings(db);
    if (ss) await appendAuditToSheet(ss, new Date().toISOString(), user.email, 'LOGIN', `User ${user.email} logged in`);
  } catch {}

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
    refreshToken,
  });
});

router.post('/device-login', async (c) => {
  const { email, password, deviceId } = await c.req.json<{ email: string; password: string; deviceId: string }>();
  if (!email || !password || !deviceId) return c.json({ error: 'Email, password, and deviceId required' }, 400);

  const db = createDB(c.env);
  const results = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = results[0];

  if (!user || !user.active) return c.json({ error: 'Invalid credentials' }, 401);
  if (user.role !== 'AGENT') return c.json({ error: 'Use standard login for admin accounts' }, 400);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401);

  const deviceResults = await db.select().from(devices).where(
    and(eq(devices.id, deviceId))
  ).limit(1);
  const device = deviceResults[0];

  if (!device) return c.json({ error: 'This device is not authorized. Contact your administrator.' }, 403);
  if (device.status === 'PENDING') return c.json({ error: 'Device is waiting for admin approval. Please wait for your administrator to approve this device.' }, 403);
  if (device.status === 'REVOKED') return c.json({ error: 'Device access has been revoked. Contact your administrator.' }, 403);
  if (device.status !== 'ACTIVE') return c.json({ error: 'This device is not authorized. Contact your administrator.' }, 403);
  if (device.agentId && device.agentId !== user.id) {
    return c.json({ error: 'This device is assigned to another agent.' }, 403);
  }

  if (!device.agentId) {
    await db.update(devices).set({ agentId: user.id, updatedAt: new Date().toISOString() }).where(eq(devices.id, deviceId));
  }

  const payload = { userId: user.id, name: user.name, email: user.email, role: user.role as 'SUPERADMIN' | 'ADMIN' | 'AGENT', deviceId };
  const token = await signToken(payload, c.env.JWT_SECRET || 'dev-secret');
  const refreshToken = await signRefreshToken(payload, c.env.JWT_SECRET || 'dev-secret');

  try {
    const ss = await getSheetSettings(db);
    if (ss) await appendAuditToSheet(ss, new Date().toISOString(), user.email, 'LOGIN', `User ${user.email} logged in via device ${device.name}`);
  } catch {}

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
    refreshToken,
    device: { id: device.id, name: device.name, status: device.status },
  });
});

router.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken: string }>();
  if (!refreshToken) return c.json({ error: 'Refresh token required' }, 400);

  const payload = await verifyToken(refreshToken, c.env.JWT_SECRET || 'dev-secret');
  if (!payload) return c.json({ error: 'Invalid refresh token' }, 401);
  if (payload.type !== 'refresh') return c.json({ error: 'Invalid token type' }, 401);

  const db = createDB(c.env);
  const userResults = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!userResults[0] || !userResults[0].active) return c.json({ error: 'User not found or inactive' }, 401);

  const user = userResults[0];
  const newPayload = { userId: user.id, name: user.name, email: user.email, role: user.role as 'SUPERADMIN' | 'ADMIN' | 'AGENT', deviceId: payload.deviceId };
  const newToken = await signToken(newPayload, c.env.JWT_SECRET || 'dev-secret');
  const newRefreshToken = await signRefreshToken(newPayload, c.env.JWT_SECRET || 'dev-secret');

  return c.json({ token: newToken, refreshToken: newRefreshToken });
});

router.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({ user: { id: user.userId, ...user } });
});

// Alias for mobile clients that call /api/auth/profile
router.get('/profile', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({ id: user.userId, ...user });
});

router.post('/logout', (c) => {
  clearTokenCookie(c);
  return c.json({ success: true });
});

export default router;
