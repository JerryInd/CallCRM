import { Hono } from 'hono';
import { eq, and, isNull, gte, lt } from 'drizzle-orm';
import { agentSessions, sessionPauses, users } from '../db/schema';
import { createDB } from '../db';
import { requireAuth, requireAgent } from '../lib/auth';
import { uuid, now, parseTimestamp } from '../lib/utils';
import { Bindings, Variables } from '../types';
import { activateFollowUpsForAgent } from '../services/followup-assign';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

router.use('*', requireAuth);

router.post('/clock-in', requireAgent, async (c) => {
  const user = c.get('user');
  const { deviceId } = await c.req.json<{ deviceId: string }>();
  if (!deviceId) return c.json({ error: 'Device ID required' }, 400);

  const db = createDB(c.env);

  const { devices } = await import('../db/schema');
  const existingDevice = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);

  if (!existingDevice[0]) {
    if (user.role !== 'AGENT') return c.json({ error: 'Device not authorized' }, 403);
    await db.insert(devices).values({
      id: deviceId,
      name: deviceId,
      publicKey: 'auto-browser',
      status: 'ACTIVE',
      agentId: user.userId,
      registeredAt: now(),
      createdAt: now(),
      updatedAt: now(),
    });
  } else {
    const dev = existingDevice[0];
    if (dev.status === 'REVOKED') return c.json({ error: 'Device not authorized' }, 403);
    if (dev.status === 'PENDING') return c.json({ error: 'Device not authorized' }, 403);
    if (dev.status === 'ACTIVE' && dev.agentId && dev.agentId !== user.userId) {
      return c.json({ error: 'Device assigned to another agent' }, 403);
    }
    if (dev.status === 'ACTIVE' && !dev.agentId && user.role === 'AGENT') {
      await db.update(devices).set({ agentId: user.userId, updatedAt: now() }).where(eq(devices.id, deviceId));
    }
  }

  const existing = await db.select().from(agentSessions).where(
    and(eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'ACTIVE'))
  ).limit(1);

  if (existing[0]) {
    return c.json({ session: existing[0] });
  }

  const timestamp = now();
  const sessionId = uuid();

  await db.insert(agentSessions).values({
    id: sessionId,
    agentId: user.userId,
    deviceId,
    clockInAt: timestamp,
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const session = await db.select().from(agentSessions).where(eq(agentSessions.id, sessionId)).limit(1);

  // Check for assigned follow-ups when agent clocks in
  try {
    await activateFollowUpsForAgent(c.env, user.userId);
  } catch {}

  return c.json({ session: session[0] });
});

router.get('/current', requireAgent, async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);

  const results = await db.select().from(agentSessions).where(
    and(eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'ACTIVE'))
  ).limit(1);

  if (!results[0]) {
    const paused = await db.select().from(agentSessions).where(
      and(eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'PAUSED'))
    ).limit(1);
    return c.json({ session: paused[0] || null });
  }

  return c.json({ session: results[0] });
});

router.post('/pause', requireAgent, async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);

  const results = await db.select().from(agentSessions).where(
    and(eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'ACTIVE'))
  ).limit(1);

  if (!results[0]) return c.json({ error: 'No active session' }, 400);

  const timestamp = now();
  const pauseId = uuid();

  await db.insert(sessionPauses).values({
    id: pauseId,
    sessionId: results[0].id,
    agentId: user.userId,
    startedAt: timestamp,
    createdAt: timestamp,
  });

  await db.update(agentSessions).set({
    status: 'PAUSED',
    updatedAt: timestamp,
  }).where(eq(agentSessions.id, results[0].id));

  return c.json({ success: true, sessionId: results[0].id });
});

router.post('/resume', requireAgent, async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);

  const results = await db.select().from(agentSessions).where(
    and(eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'PAUSED'))
  ).limit(1);

  if (!results[0]) return c.json({ error: 'No paused session' }, 400);

  const timestamp = now();

  const pause = await db.select().from(sessionPauses).where(
    and(eq(sessionPauses.sessionId, results[0].id), isNull(sessionPauses.endedAt))
  ).limit(1);

  if (pause[0]) {
    const pauseStart = parseTimestamp(pause[0].startedAt);
    const pauseEnd = parseTimestamp(timestamp);
    const durationSec = Math.floor((pauseEnd - pauseStart) / 1000);

    await db.update(sessionPauses).set({
      endedAt: timestamp,
      durationSeconds: durationSec,
    }).where(eq(sessionPauses.id, pause[0].id));

    await db.update(agentSessions).set({
      status: 'ACTIVE',
      totalPauseSeconds: results[0].totalPauseSeconds + durationSec,
      updatedAt: timestamp,
    }).where(eq(agentSessions.id, results[0].id));
  } else {
    await db.update(agentSessions).set({
      status: 'ACTIVE',
      updatedAt: timestamp,
    }).where(eq(agentSessions.id, results[0].id));
  }

  // Check for assigned follow-ups when agent resumes
  try {
    await activateFollowUpsForAgent(c.env, user.userId);
  } catch {}

  return c.json({ success: true, sessionId: results[0].id });
});

router.post('/clock-out', requireAgent, async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);

  const results = await db.select().from(agentSessions).where(
    and(eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'ACTIVE'))
  ).limit(1);

  if (!results[0]) {
    const paused = await db.select().from(agentSessions).where(
      and(eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'PAUSED'))
    ).limit(1);
    if (paused[0]) {
      const openPause = await db.select().from(sessionPauses).where(
        and(eq(sessionPauses.sessionId, paused[0].id), isNull(sessionPauses.endedAt))
      ).limit(1);
      if (openPause[0]) {
        const pauseStart = parseTimestamp(openPause[0].startedAt);
        const pauseEnd = Date.now();
        const durationSec = Math.floor((pauseEnd - pauseStart) / 1000);
        await db.update(sessionPauses).set({
          endedAt: now(),
          durationSeconds: durationSec,
        }).where(eq(sessionPauses.id, openPause[0].id));
      }

      const timestamp = now();
      const clockIn = parseTimestamp(paused[0].clockInAt);
      const totalPause = paused[0].totalPauseSeconds;
      const netSeconds = Math.floor((Date.now() - clockIn) / 1000) - totalPause;

      await db.update(agentSessions).set({
        clockOutAt: timestamp,
        status: 'ENDED',
        netWorkSeconds: Math.max(0, netSeconds),
        updatedAt: timestamp,
      }).where(eq(agentSessions.id, paused[0].id));

      return c.json({ success: true, session: { ...paused[0], status: 'ENDED', clockOutAt: timestamp } });
    }
    return c.json({ error: 'No active session' }, 400);
  }

  const timestamp = now();
  const clockIn = parseTimestamp(results[0].clockInAt);
  const totalPause = results[0].totalPauseSeconds;
  const netSeconds = Math.floor((Date.now() - clockIn) / 1000) - totalPause;

  await db.update(agentSessions).set({
    clockOutAt: timestamp,
    status: 'ENDED',
    netWorkSeconds: Math.max(0, netSeconds),
    updatedAt: timestamp,
  }).where(eq(agentSessions.id, results[0].id));

  return c.json({ success: true, session: { ...results[0], status: 'ENDED', clockOutAt: timestamp } });
});

router.get('/', requireAuth, async (c) => {
  const db = createDB(c.env);
  const url = new URL(c.req.url);
  const agentId = url.searchParams.get('agentId');

  let results;
  if (agentId) {
    results = await db.select().from(agentSessions).where(eq(agentSessions.agentId, agentId));
  } else {
    results = await db.select().from(agentSessions);
  }

  return c.json({ sessions: results });
});

router.get('/active', requireAuth, async (c) => {
  const db = createDB(c.env);
  const results = await db.select().from(agentSessions).where(
    eq(agentSessions.status, 'ACTIVE')
  );
  return c.json({ sessions: results });
});

router.get('/attendance', requireAuth, async (c) => {
  const db = createDB(c.env);
  const agentId = c.req.query('agentId');
  const date = c.req.query('date');
  const status = c.req.query('status');

  const today = new Date().toISOString().slice(0, 10);
  const filterDate = date || today;
  const dayStart = `${filterDate}T00:00:00`;
  const dayEnd = `${filterDate}T23:59:59`;
  const nowMs = Date.now();
  const FIVE_MIN = 5 * 60 * 1000;

  const conditions = [
    gte(agentSessions.clockInAt, dayStart),
    lt(agentSessions.clockInAt, dayEnd + 'Z'),
  ];
  // agentId may be a UUID or a free-text agent name search
  const isUuid = agentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId);
  if (agentId && isUuid) conditions.push(eq(agentSessions.agentId, agentId));
  if (status) conditions.push(eq(agentSessions.status, status as 'ACTIVE' | 'PAUSED' | 'ENDED'));

  const results = await db.select({
    id: agentSessions.id,
    agentId: agentSessions.agentId,
    deviceId: agentSessions.deviceId,
    clockInAt: agentSessions.clockInAt,
    clockOutAt: agentSessions.clockOutAt,
    status: agentSessions.status,
    totalPauseSeconds: agentSessions.totalPauseSeconds,
    netWorkSeconds: agentSessions.netWorkSeconds,
    callsCompleted: agentSessions.callsCompleted,
    createdAt: agentSessions.createdAt,
    updatedAt: agentSessions.updatedAt,
    agentName: users.name,
    agentEmail: users.email,
  }).from(agentSessions)
    .innerJoin(users, eq(agentSessions.agentId, users.id))
    .where(and(...conditions));

  const agentMap = new Map<string, any>();
  for (const r of results) {
    const existing = agentMap.get(r.agentId);
    if (!existing || new Date(r.clockInAt).getTime() > new Date(existing.clockInAt).getTime()) {
      agentMap.set(r.agentId, r);
    }
  }

  const enriched = Array.from(agentMap.values()).map((r) => {
    let displayStatus = r.status;
    if (r.status === 'ACTIVE' || r.status === 'PAUSED') {
      const lastSeen = r.updatedAt ? new Date(r.updatedAt + (r.updatedAt.endsWith('Z') || r.updatedAt.includes('+') ? '' : 'Z')).getTime() : 0;
      if (lastSeen && (nowMs - lastSeen > FIVE_MIN)) {
        displayStatus = 'OFFLINE';
      } else if (r.status === 'ACTIVE') {
        displayStatus = 'ONLINE';
      }
    }
    return { ...r, displayStatus };
  });

  // Add agents with no sessions today as OFFLINE
  const allAgents = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'AGENT'));
  for (const agent of allAgents) {
    if (!enriched.some((r) => r.agentId === agent.id)) {
      enriched.push({
        id: `none-${agent.id}`,
        agentId: agent.id,
        agentName: agent.name,
        deviceId: '',
        clockInAt: '',
        clockOutAt: null,
        status: 'ENDED',
        displayStatus: 'OFFLINE',
        totalPauseSeconds: 0,
        netWorkSeconds: 0,
        callsCompleted: 0,
        createdAt: '',
        updatedAt: '',
        agentEmail: '',
      });
    }
  }

  // Apply status filter on enriched data if set
  let filtered = status ? enriched.filter((r) => r.displayStatus === status.toUpperCase() || (status === 'ACTIVE' && r.displayStatus === 'ONLINE')) : enriched;

  // Free-text agent name search when agentId was not a UUID
  if (agentId && !isUuid) {
    const q = agentId.toLowerCase();
    filtered = filtered.filter((r) => r.agentName?.toLowerCase().includes(q));
  }

  return c.json({ sessions: filtered, totalAgents: filtered.length });
});

router.get('/attendance/history', requireAuth, async (c) => {
  const db = createDB(c.env);
  const agentId = c.req.query('agentId');
  if (!agentId) return c.json({ error: 'agentId required' }, 400);

  const results = await db.select({
    id: agentSessions.id,
    agentId: agentSessions.agentId,
    clockInAt: agentSessions.clockInAt,
    clockOutAt: agentSessions.clockOutAt,
    status: agentSessions.status,
    totalPauseSeconds: agentSessions.totalPauseSeconds,
    netWorkSeconds: agentSessions.netWorkSeconds,
    callsCompleted: agentSessions.callsCompleted,
    agentName: users.name,
  }).from(agentSessions)
    .innerJoin(users, eq(agentSessions.agentId, users.id))
    .where(eq(agentSessions.agentId, agentId))
    .orderBy(agentSessions.clockInAt);

  return c.json({ sessions: results });
});

router.post('/:id/heartbeat', requireAgent, async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  if (!sessionId) return c.json({ error: 'Session ID required' }, 400);
  const db = createDB(c.env);

  const session = await db.select().from(agentSessions).where(
    and(eq(agentSessions.id, sessionId), eq(agentSessions.agentId, user.userId))
  ).limit(1);

  if (!session[0]) return c.json({ error: 'Session not found' }, 404);

  if (session[0].status === 'ENDED') {
    return c.json({ success: true, status: 'ENDED' });
  }

  await db.update(agentSessions).set({ updatedAt: now() }).where(eq(agentSessions.id, sessionId));

  return c.json({ success: true, status: session[0].status });
});

export default router;
