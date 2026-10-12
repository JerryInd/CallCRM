import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, Variables } from './types';
import { verifyToken } from './lib/auth';
import authRouter from './routes/auth';
import agentsRouter from './routes/agents';
import devicesRouter from './routes/devices';
import sessionsRouter from './routes/sessions';
import leadsRouter from './routes/leads';
import sheetsRouter from './routes/sheets';
import dashboardRouter from './routes/dashboard';
import auditRouter from './routes/audit';
import exportRouter from './routes/export';
import followupsRouter from './routes/followups';
import leadsAdminRouter from './routes/leads-admin';
import syncRouter from './routes/sync';
import chatRouter from './routes/chat';
import notificationsRouter from './routes/notifications';

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors({
  origin: [
    'https://crm-dialer.canyoujerry.workers.dev',
    'https://crm.lakshmiclub.com',
    'http://localhost:5173',
    'http://localhost:8081',
  ],
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.route('/api/auth', authRouter);
app.route('/api/agents', agentsRouter);
app.route('/api/devices', devicesRouter);
app.route('/api/sessions', sessionsRouter);
app.route('/api/leads', leadsRouter);
app.route('/api/sheets', sheetsRouter);
app.route('/api/dashboard', dashboardRouter);
app.route('/api/audit', auditRouter);
app.route('/api/export', exportRouter);
app.route('/api/followups', followupsRouter);
app.route('/api/leads-admin', leadsAdminRouter);
app.route('/api/leads/admin', leadsAdminRouter);
app.route('/api/sync', syncRouter);
app.route('/api/chat', chatRouter);
app.route('/api/notifications', notificationsRouter);

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Branded APK download link — serves the APK shipped in frontend/public
app.get('/download', (c) => c.redirect('/CallCRM.apk', 302));

// WebSocket route for chat — token via query param or auth cookie
app.get('/ws/chat', async (c) => {
  const url = new URL(c.req.url);
  let token = url.searchParams.get('token');

  if (!token) {
    const cookieHeader = c.req.header('Cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)crm_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    return c.json({ error: 'Token required' }, 401);
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET || 'dev-secret');
  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Route to the global ChatRoom Durable Object
  const roomId = `global`;
  const doId = c.env.CHAT_ROOM.idFromName(roomId);
  const stub = c.env.CHAT_ROOM.get(doId);

  const wsUrl = new URL(`https://fake-host/ws`);
  wsUrl.searchParams.set('userId', payload.userId);
  wsUrl.searchParams.set('userName', payload.name);
  wsUrl.searchParams.set('role', payload.role);

  // Forward Upgrade so the DO's 101 response is valid (stub.fetch(url) alone
  // creates a plain request and workerd rejects returning a WebSocket on it)
  return stub.fetch(new Request(wsUrl.toString(), { headers: { Upgrade: 'websocket' } }));
});

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});
