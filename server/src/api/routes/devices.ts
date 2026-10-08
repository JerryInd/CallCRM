import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { devices, agentSessions, users } from '../db/schema';
import { createDB } from '../db';
import { requireAuth, requireAdmin } from '../lib/auth';
import { uuid, now } from '../lib/utils';
import { Bindings, Variables } from '../types';
import { getSheetSettings, appendAuditToSheet } from '../lib/sheet-helpers';
import { sendPushToUser } from '../services/push-notifications';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

router.get('/', requireAuth, requireAdmin, async (c) => {
  const db = createDB(c.env);
  const allDevices = await db.select({
    id: devices.id,
    name: devices.name,
    status: devices.status,
    agentId: devices.agentId,
    agentName: users.name,
    registrationCode: devices.registrationCode,
    createdAt: devices.createdAt,
    updatedAt: devices.updatedAt,
    registeredAt: devices.registeredAt,
    lastSeen: devices.updatedAt,
    pushToken: devices.pushToken,
    platform: devices.platform,
    publicKey: devices.publicKey,
  }).from(devices).leftJoin(users, eq(devices.agentId, users.id));
  return c.json({ devices: allDevices });
});

router.post('/register-code', requireAuth, requireAdmin, async (c) => {
  const { name, agentId } = await c.req.json<{ name: string; agentId?: string }>();
  if (!name) return c.json({ error: 'Device name required' }, 400);

  const db = createDB(c.env);
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  const id = uuid();
  const timestamp = now();

  await db.insert(devices).values({
    id,
    name,
    publicKey: '',
    registrationCode: code,
    status: 'PENDING',
    agentId: agentId || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  let assignedAgentName = null;
  if (agentId) {
    const agentResult = await db.select().from(users).where(eq(users.id, agentId)).limit(1);
    assignedAgentName = agentResult[0]?.name || null;
  }

  return c.json({ deviceId: id, code, name, agentId: agentId || null, agentName: assignedAgentName });
});

router.post('/register', async (c) => {
  const { code, publicKey, deviceName } = await c.req.json<{
    deviceId: string;
    code: string;
    publicKey: string;
    deviceName: string;
  }>();

  if (!code || !publicKey) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const db = createDB(c.env);
  const results = await db.select().from(devices).where(eq(devices.registrationCode, code)).limit(1);
  const device = results[0];

  if (!device) return c.json({ error: 'Invalid registration code' }, 404);
  if (device.status === 'ACTIVE') return c.json({ error: 'Device already registered' }, 400);
  if (device.status === 'REVOKED') return c.json({ error: 'Device access revoked' }, 403);

  const timestamp = now();
  await db.update(devices).set({
    publicKey,
    name: deviceName || device.name,
    status: 'PENDING',
    registeredAt: timestamp,
    updatedAt: timestamp,
  }).where(eq(devices.id, device.id));

  return c.json({ success: true, deviceId: device.id, status: 'PENDING', message: 'Device registered. Waiting for admin approval.' });
});

router.post('/challenge', async (c) => {
  const { deviceId } = await c.req.json<{ deviceId: string }>();
  if (!deviceId) return c.json({ error: 'Device ID required' }, 400);

  const db = createDB(c.env);
  const results = await db.select().from(devices).where(
    and(eq(devices.id, deviceId), eq(devices.status, 'ACTIVE'))
  ).limit(1);

  if (!results[0]) return c.json({ error: 'Device not authorized' }, 403);

  const challenge = crypto.randomUUID();
  const timestamp = now();

  await db.update(devices).set({
    registrationCode: challenge,
    updatedAt: timestamp,
  }).where(eq(devices.id, deviceId));

  return c.json({ challenge, deviceId });
});

router.post('/verify', async (c) => {
  const { deviceId, challenge, signature } = await c.req.json<{
    deviceId: string;
    challenge: string;
    signature: string;
  }>();

  if (!deviceId || !challenge || !signature) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const db = createDB(c.env);
  const results = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  const device = results[0];

  if (!device) return c.json({ error: 'Device not found' }, 404);
  if (device.status !== 'ACTIVE') return c.json({ error: 'Device not authorized' }, 403);
  if (device.registrationCode !== challenge) return c.json({ error: 'Invalid or expired challenge' }, 401);

  try {
    const publicKeyBuffer = Uint8Array.from(atob(device.publicKey), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      Uint8Array.from(atob(signature), c => c.charCodeAt(0)),
      new TextEncoder().encode(challenge)
    );

    if (!valid) return c.json({ error: 'Invalid signature' }, 401);
  } catch {
    return c.json({ error: 'Signature verification failed' }, 401);
  }

  await db.update(devices).set({
    registrationCode: null,
    updatedAt: now(),
  }).where(eq(devices.id, deviceId));

  return c.json({ success: true, deviceId, verified: true });
});

router.post('/assign', requireAuth, requireAdmin, async (c) => {
  const { deviceId, agentId } = await c.req.json<{ deviceId: string; agentId: string }>();
  if (!deviceId || !agentId) return c.json({ error: 'Missing required fields' }, 400);

  const db = createDB(c.env);
  const timestamp = now();

  await db.update(devices).set({
    agentId,
    updatedAt: timestamp,
  }).where(eq(devices.id, deviceId));

  return c.json({ success: true });
});

router.post('/revoke', requireAuth, requireAdmin, async (c) => {
  const { deviceId } = await c.req.json<{ deviceId: string }>();
  if (!deviceId) return c.json({ error: 'Device ID required' }, 400);

  const db = createDB(c.env);
  const result = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  await db.update(devices).set({
    status: 'REVOKED',
    updatedAt: now(),
  }).where(eq(devices.id, deviceId));

  const user = c.get('user');
  try {
    const ss = await getSheetSettings(db);
    if (ss) await appendAuditToSheet(ss, new Date().toISOString(), user?.email || 'admin', 'DEVICE_REVOKE', `Device ${result[0]?.name || deviceId} revoked`);
  } catch {}

  return c.json({ success: true });
});

router.post('/approve', requireAuth, requireAdmin, async (c) => {
  const { deviceId } = await c.req.json<{ deviceId: string }>();
  if (!deviceId) return c.json({ error: 'Device ID required' }, 400);

  const db = createDB(c.env);
  const result = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!result[0]) return c.json({ error: 'Device not found' }, 404);
  if (result[0].status !== 'PENDING') return c.json({ error: 'Device is not pending approval' }, 400);

  const timestamp = now();
  await db.update(devices).set({
    status: 'ACTIVE',
    registeredAt: timestamp,
    updatedAt: timestamp,
  }).where(eq(devices.id, deviceId));

  const user = c.get('user');
  try {
    const ss = await getSheetSettings(db);
    if (ss) await appendAuditToSheet(ss, new Date().toISOString(), user?.email || 'admin', 'DEVICE_APPROVE', `Device ${result[0].name} approved`);
  } catch {}

  return c.json({ success: true });
});

router.post('/force-logout', requireAuth, requireAdmin, async (c) => {
  const { agentId } = await c.req.json<{ agentId: string }>();
  if (!agentId) return c.json({ error: 'Agent ID required' }, 400);

  const db = createDB(c.env);
  const timestamp = now();

  const activeSession = await db.select().from(agentSessions).where(
    and(eq(agentSessions.agentId, agentId), eq(agentSessions.status, 'ACTIVE'))
  ).limit(1);

  if (!activeSession[0]) {
    const pausedSession = await db.select().from(agentSessions).where(
      and(eq(agentSessions.agentId, agentId), eq(agentSessions.status, 'PAUSED'))
    ).limit(1);

    if (!pausedSession[0]) return c.json({ error: 'No active session found for agent' }, 404);

    await db.update(agentSessions).set({
      clockOutAt: timestamp,
      status: 'ENDED',
      updatedAt: timestamp,
    }).where(eq(agentSessions.id, pausedSession[0].id));

    try { await sendPushToUser(db, agentId, 'Session Ended', 'Your session has been ended by an administrator.', { type: 'FORCE_LOGOUT' }); } catch {}

    return c.json({ success: true, sessionId: pausedSession[0].id });
  }

  await db.update(agentSessions).set({
    clockOutAt: timestamp,
    status: 'ENDED',
    updatedAt: timestamp,
  }).where(eq(agentSessions.id, activeSession[0].id));

  try { await sendPushToUser(db, agentId, 'Session Ended', 'Your session has been ended by an administrator.', { type: 'FORCE_LOGOUT' }); } catch {}

  return c.json({ success: true, sessionId: activeSession[0].id });
});

router.post('/reactivate', requireAuth, requireAdmin, async (c) => {
  const { deviceId } = await c.req.json<{ deviceId: string }>();
  if (!deviceId) return c.json({ error: 'Device ID required' }, 400);

  const db = createDB(c.env);
  const result = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!result[0]) return c.json({ error: 'Device not found' }, 404);
  if (result[0].status !== 'REVOKED') return c.json({ error: 'Device is not revoked' }, 400);

  const timestamp = now();
  await db.update(devices).set({
    status: 'ACTIVE',
    updatedAt: timestamp,
  }).where(eq(devices.id, deviceId));

  const user = c.get('user');
  try {
    const ss = await getSheetSettings(db);
    if (ss) await appendAuditToSheet(ss, new Date().toISOString(), user?.email || 'admin', 'DEVICE_REACTIVATE', `Device ${result[0].name} reactivated`);
  } catch {}

  return c.json({ success: true });
});

router.post('/my', requireAuth, async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);

  const userDevices = await db.select().from(devices).where(eq(devices.agentId, user.userId));
  return c.json({ devices: userDevices });
});

router.post('/push-token', requireAuth, async (c) => {
  const user = c.get('user');
  const { pushToken, platform } = await c.req.json<{ pushToken: string; platform: string }>();
  if (!pushToken) return c.json({ error: 'Push token required' }, 400);

  const db = createDB(c.env);
  const userDevices = await db.select().from(devices).where(eq(devices.agentId, user.userId)).limit(1);

  if (userDevices[0]) {
    await db.update(devices).set({
      pushToken,
      platform: platform || 'android',
      updatedAt: now(),
    }).where(eq(devices.id, userDevices[0].id));
  }

  return c.json({ success: true });
});

router.post('/delete', requireAuth, requireAdmin, async (c) => {
  const { deviceId } = await c.req.json<{ deviceId: string }>();
  if (!deviceId) return c.json({ error: 'Device ID required' }, 400);

  const db = createDB(c.env);
  const result = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!result[0]) return c.json({ error: 'Device not found' }, 404);

  await db.delete(devices).where(eq(devices.id, deviceId));

  const user = c.get('user');
  try {
    const ss = await getSheetSettings(db);
    if (ss) await appendAuditToSheet(ss, new Date().toISOString(), user?.email || 'admin', 'DEVICE_DELETE', `Device ${result[0].name} deleted`);
  } catch {}

  return c.json({ success: true });
});

export default router;
