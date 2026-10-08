import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../lib/auth';
import { Bindings } from '../types';
import { runSync, getSyncStatus } from '../services/google-sheets-sync';

const router = new Hono<{ Bindings: Bindings }>();

// Get sync status
router.get('/status', requireAuth, requireAdmin, async (c) => {
  const status = await getSyncStatus(c.env);
  return c.json({ status });
});

// Manual sync trigger
router.post('/now', requireAuth, requireAdmin, async (c) => {
  const result = await runSync(c.env);
  return c.json({ result });
});

export default router;
