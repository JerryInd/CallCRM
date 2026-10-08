import { Hono } from 'hono';
import { createDB } from '../db';
import { requireAuth, requireAdmin } from '../lib/auth';
import { Bindings } from '../types';
import { getSheetSettings, readAuditFromSheet } from '../lib/sheet-helpers';

const router = new Hono<{ Bindings: Bindings }>();

router.get('/', requireAuth, requireAdmin, async (c) => {
  const db = createDB(c.env);
  const ss = await getSheetSettings(db);
  if (!ss) return c.json({ logs: [], total: 0 });

  const logs = await readAuditFromSheet(ss);
  const action = new URL(c.req.url).searchParams.get('action');
  const filtered = action ? logs.filter((l) => l.action === action) : logs;

  return c.json({ logs: filtered, total: filtered.length });
});

export default router;
