// CallCRM Node runtime entry point.
// Serves the Hono API, the built admin SPA, and the chat WebSocket on one
// port (process.env.PORT), and runs the every-minute Sheets sync cron.
import { serve } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { app } from './api/app';
import { createNodeBindings, chatRoom } from './api/node-compat';
import { initDatabase } from './api/db/init';
import { createDB } from './api/db';
import { bootstrapSheetFromEnv } from './api/db/env-bootstrap';
import { verifyToken } from './api/lib/auth';
import { runSync } from './api/services/google-sheets-sync';
import { autoAssignFollowUps } from './api/services/followup-assign';

const PORT = Number(process.env.PORT || 8787);
const DIST = path.resolve(process.cwd(), 'frontend/dist');
const DB_FILE = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), 'data/callcrm.sqlite');

mkdirSync(path.dirname(DB_FILE), { recursive: true });
const sqlite = new DatabaseSync(DB_FILE);
initDatabase(sqlite);
const env = createNodeBindings(sqlite);

bootstrapSheetFromEnv(createDB(env as any), process.env).catch((err) => {
  console.error('Sheet env bootstrap error:', err);
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function staticHandler(req: Request): Response {
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let pathname = decodeURIComponent(new URL(req.url).pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  let filePath = path.resolve(DIST, '.' + pathname);
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
    filePath = ''; // path traversal attempt
  }
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback — mirrors wrangler.toml not_found_handling = "single-page-application"
    filePath = path.join(DIST, 'index.html');
  }
  if (!existsSync(filePath)) {
    return new Response('frontend/dist not found — run the frontend build first', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const body = readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const headers: Record<string, string> = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control':
      filePath.endsWith('index.html') || pathname.includes('/index.html')
        ? 'no-cache'
        : pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
  };
  return new Response(new Uint8Array(body), { status: 200, headers });
}

const server = serve({
  fetch: (req) => {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/') || pathname === '/ws/chat') {
      return app.fetch(req, env as any, undefined as any);
    }
    return staticHandler(req);
  },
  port: PORT,
});

// --- Chat WebSocket (port of the /ws/chat Durable Object upgrade) ----------

const wss = new WebSocketServer({ noServer: true });

function rejectUpgrade(socket: Duplex, status: string): void {
  try {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  } catch {}
  socket.destroy();
}

server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  let url: URL;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch {
    socket.destroy();
    return;
  }
  if (url.pathname !== '/ws/chat') {
    socket.destroy();
    return;
  }

  void (async () => {
    let token = url.searchParams.get('token');
    if (!token) {
      const cookieHeader = req.headers.cookie || '';
      const match = cookieHeader.match(/(?:^|;\s*)crm_token=([^;]+)/);
      if (match) token = match[1];
    }
    if (!token) {
      rejectUpgrade(socket, '401 Unauthorized');
      return;
    }
    const payload = await verifyToken(token, env.JWT_SECRET || 'dev-secret');
    if (!payload) {
      rejectUpgrade(socket, '401 Unauthorized');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      chatRoom.addConnection(ws, payload.userId, payload.name, payload.role);
      ws.on('message', (data) => chatRoom.handleMessage(ws, data.toString()));
      ws.on('close', () => chatRoom.removeConnection(ws));
      ws.on('error', () => chatRoom.removeConnection(ws));
    });
  })().catch(() => {
    try {
      socket.destroy();
    } catch {}
  });
});

// --- Every-minute cron (wrangler.toml crons = ["* * * * *"]) ----------------

setInterval(() => {
  void Promise.allSettled([runSync(env as any), autoAssignFollowUps(env as any)]).then(
    (results) => {
      for (const r of results) {
        if (r.status === 'rejected') {
          console.error('Scheduled job error:', r.reason);
        }
      }
    }
  );
}, 60_000);

console.log(`CallCRM listening on http://0.0.0.0:${PORT} (db: ${DB_FILE})`);
