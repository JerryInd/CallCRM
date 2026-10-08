import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { notifications, users } from '../db/schema';
import { createDB } from '../db';
import { requireAuth, requireAdmin } from '../lib/auth';
import { uuid, now } from '../lib/utils';
import { Bindings, Variables } from '../types';
import { getSheetSettings, appendAuditToSheet } from '../lib/sheet-helpers';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

router.use('*', requireAuth);

// Get notifications for current user
router.get('/', async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);
  const url = new URL(c.req.url);
  const category = url.searchParams.get('category');

  let query = db.select().from(notifications)
    .where(eq(notifications.userId, user.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const results = await query;

  let filtered = results;
  if (category && category !== 'ALL') {
    const categoryMap: Record<string, string[]> = {
      MESSAGES: ['NEW_MESSAGE'],
      LEADS: ['NEW_LEAD'],
      'FOLLOW-UPS': ['FOLLOW_UP_DUE', 'FOLLOW_UP_ASSIGNED'],
      SYSTEM: ['ADMIN_ANNOUNCEMENT', 'DEVICE_SUSPENDED', 'DEVICE_REVOKED', 'ACCOUNT_ACTION', 'IMPORTANT_SYSTEM_ALERT'],
    };
    const types = categoryMap[category] || [];
    filtered = results.filter(n => types.includes(n.type));
  }

  return c.json({ notifications: filtered });
});

// Get unread count
router.get('/unread-count', async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);

  const all = await db.select().from(notifications)
    .where(and(eq(notifications.userId, user.userId), eq(notifications.read, false)));

  return c.json({ count: all.length });
});

// Mark notification as read
router.post('/:id/read', async (c) => {
  const user = c.get('user');
  const notifId = c.req.param('id');
  const db = createDB(c.env);
  const timestamp = now();

  await db.update(notifications)
    .set({ read: true, readAt: timestamp })
    .where(and(
      eq(notifications.id, notifId),
      eq(notifications.userId, user.userId)
    ));

  return c.json({ success: true });
});

// Mark all as read
router.post('/read-all', async (c) => {
  const user = c.get('user');
  const db = createDB(c.env);
  const timestamp = now();

  await db.update(notifications)
    .set({ read: true, readAt: timestamp })
    .where(and(
      eq(notifications.userId, user.userId),
      eq(notifications.read, false)
    ));

  return c.json({ success: true });
});

// Create notification (admin only — prevents agents spamming other users)
router.post('/', requireAdmin, async (c) => {
  const { userId, type, title, message, referenceId, referenceType } = await c.req.json<{
    userId: string;
    type: string;
    title: string;
    message: string;
    referenceId?: string;
    referenceType?: string;
  }>();

  if (!userId || !type || !title || !message) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const db = createDB(c.env);
  const timestamp = now();
  const id = uuid();

  await db.insert(notifications).values({
    id,
    userId,
    type: type as any,
    title,
    message,
    referenceId: referenceId || null,
    referenceType: referenceType || null,
    read: false,
    createdAt: timestamp,
  });

  // Queue push notification
  try {
    await c.env.NOTIFICATION_QUEUE.send({
      notificationId: id,
      userId,
      type,
      title,
      message,
      referenceId,
      referenceType,
    });
  } catch {}

  return c.json({ success: true, id });
});

// Broadcast notification to all active agents (admin only)
router.post('/broadcast', requireAdmin, async (c) => {
  const { title, message, type } = await c.req.json<{
    title: string;
    message: string;
    type?: string;
  }>();
  if (!title || !message) return c.json({ error: 'Title and message required' }, 400);

  const db = createDB(c.env);
  const timestamp = now();
  const notifType = (type as any) || 'ADMIN_ANNOUNCEMENT';

  // Get all active agents
  const agents = await db.select().from(users).where(eq(users.role, 'AGENT'));

  let created = 0;
  for (const agent of agents) {
    if (!agent.active) continue;
    const id = uuid();
    await db.insert(notifications).values({
      id,
      userId: agent.id,
      type: notifType,
      title,
      message,
      referenceType: 'ADMIN_ANNOUNCEMENT',
      read: false,
      createdAt: timestamp,
    });

    // Queue push notification
    try {
      await c.env.NOTIFICATION_QUEUE.send({
        notificationId: id,
        userId: agent.id,
        type: notifType,
        title,
        message,
        referenceType: 'ADMIN_ANNOUNCEMENT',
      });
    } catch {}

    created++;
  }

  const adminUser = c.get('user');
  try {
    const ss = await getSheetSettings(db);
    if (ss) await appendAuditToSheet(ss, new Date().toISOString(), adminUser?.email || 'admin', 'NOTIFICATION_BROADCAST', `Broadcast "${title}" to ${created} agents`);
  } catch {}

  return c.json({ success: true, sent: created });
});

export default router;
