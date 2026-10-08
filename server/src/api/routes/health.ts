import { Hono } from 'hono';
import { Bindings } from '../types';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return c.json({
      status: 'degraded',
      db: 'disconnected',
      timestamp: new Date().toISOString(),
    }, 503);
  }
});

export default app;
