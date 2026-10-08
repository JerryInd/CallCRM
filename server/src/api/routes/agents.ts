import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, devices } from '../db/schema';
import { createDB } from '../db';
import { requireAuth, requireAdmin } from '../lib/auth';
import { uuid, now, hashPassword } from '../lib/utils';
import { Bindings, Variables } from '../types';
import { getSheetSettings, appendAuditToSheet } from '../lib/sheet-helpers';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

router.use('*', requireAuth);

// List agents
router.get('/', requireAdmin, async (c) => {
  const db = createDB(c.env);
  const url = new URL(c.req.url);
  const role = url.searchParams.get('role');

  let results: Array<{ id: string; name: string; email: string; role: string; active: boolean; createdAt: string; updatedAt: string; [key: string]: unknown }>;
  if (role === 'ADMIN' || role === 'AGENT') {
    results = await db.select().from(users).where(eq(users.role, role));
  } else {
    results = await db.select().from(users);
  }

  // Never expose password hashes
  results = results.map((u) => {
    const { passwordHash: _ph, ...rest } = u as Record<string, unknown> & { id: string };
    return rest as typeof results[number];
  });

  // Fetch device info for each agent
  const agentsWithDevices = await Promise.all(results.map(async (user) => {
    let deviceCode = null;
    let deviceStatus = null;
    if (user.role === 'AGENT') {
      const deviceResult = await db.select().from(devices)
        .where(eq(devices.agentId, user.id))
        .limit(1);
      if (deviceResult[0]) {
        deviceCode = deviceResult[0].registrationCode;
        deviceStatus = deviceResult[0].status;
      }
    }
    return { ...user, deviceCode, deviceStatus };
  }));

  return c.json({ users: agentsWithDevices });
});

// Create agent/admin
router.post('/', requireAdmin, async (c) => {
  const { name, email, password, role } = await c.req.json<{ name: string; email: string; password: string; role: string }>();
  if (!name || !email || !password) return c.json({ error: 'Missing required fields' }, 400);

  const db = createDB(c.env);
  const timestamp = now();

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return c.json({ error: 'Email already exists' }, 409);

  const passwordHash = await hashPassword(password);

  const userId = uuid();
  await db.insert(users).values({
    id: userId,
    name,
    email,
    passwordHash,
    role: role as 'SUPERADMIN' | 'ADMIN' | 'AGENT',
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Auto-create device for AGENT role
  let deviceCode = null;
  if (role === 'AGENT') {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const deviceId = uuid();
    await db.insert(devices).values({
      id: deviceId,
      name: `${name}'s Device`,
      publicKey: '',
      registrationCode: code,
      status: 'PENDING',
      agentId: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    deviceCode = code;
  }

  const adminUser = c.get('user');
  try {
    const ss = await getSheetSettings(db);
    if (ss) await appendAuditToSheet(ss, new Date().toISOString(), adminUser?.email || 'admin', 'CREATE_AGENT', `Agent ${name} (${email}) created`);
  } catch {}

  return c.json({ success: true, deviceCode });
});

// Generate device code for an agent (regenerate)
router.post('/generate-code', requireAdmin, async (c) => {
  const { agentId } = await c.req.json<{ agentId: string }>();
  if (!agentId) return c.json({ error: 'Agent ID required' }, 400);

  const db = createDB(c.env);

  // Check agent exists
  const agentResult = await db.select().from(users).where(eq(users.id, agentId)).limit(1);
  if (!agentResult[0]) return c.json({ error: 'Agent not found' }, 404);

  // Check if agent already has a device
  const existingDevice = await db.select().from(devices).where(eq(devices.agentId, agentId)).limit(1);
  if (existingDevice[0]) {
    // Delete old device
    await db.delete(devices).where(eq(devices.id, existingDevice[0].id));
  }

  // Create new device
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  const deviceId = uuid();
  const timestamp = now();

  await db.insert(devices).values({
    id: deviceId,
    name: `${agentResult[0].name}'s Device`,
    publicKey: '',
    registrationCode: code,
    status: 'PENDING',
    agentId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return c.json({ success: true, deviceCode: code, deviceId });
});

// Update agent
router.patch('/', requireAdmin, async (c) => {
  const { id, name, email, active, password } = await c.req.json<{ id: string; name?: string; email?: string; active?: boolean; password?: string }>();
  if (!id) return c.json({ error: 'ID required' }, 400);

  const db = createDB(c.env);

  const targetResults = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const target = targetResults[0];
  if (!target) return c.json({ error: 'User not found' }, 404);
  if (target.role === 'SUPERADMIN' && active === false) return c.json({ error: 'Cannot deactivate superadmin' }, 403);

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (active !== undefined) updates.active = active;
  if (password && password.length >= 6) updates.passwordHash = await hashPassword(password);

  await db.update(users).set(updates).where(eq(users.id, id));
  return c.json({ success: true });
});

// Delete agent
router.delete('/', requireAdmin, async (c) => {
  const { id } = await c.req.json<{ id: string }>();
  if (!id) return c.json({ error: 'ID required' }, 400);

  const db = createDB(c.env);

  const targetResults = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const target = targetResults[0];
  if (!target) return c.json({ error: 'User not found' }, 404);
  if (target.role === 'SUPERADMIN') return c.json({ error: 'Cannot delete superadmin' }, 403);

  await db.delete(users).where(eq(users.id, id));
  return c.json({ success: true });
});

export default router;
