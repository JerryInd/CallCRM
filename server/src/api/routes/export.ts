import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../lib/auth';
import { Bindings } from '../types';

const router = new Hono<{ Bindings: Bindings }>();

router.get('/', requireAuth, requireAdmin, async (c) => {
  return c.json({ error: 'Export from Google Sheets directly.' }, 400);
});

export default router;
