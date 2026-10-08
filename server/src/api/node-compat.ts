// Node runtime compatibility layer for the Cloudflare Worker backend.
// - SqliteD1: D1Database-compatible facade over node:sqlite (drizzle-orm/d1 works unchanged)
// - ChatRoomNode / LeadReservationNode: in-process equivalents of the Durable Objects
// - createNodeBindings(): builds the `env` object (Bindings) the routes expect
import type { DatabaseSync } from 'node:sqlite';
import { processNotificationQueue } from './services/push-notifications';

function normalizeParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  return v;
}

interface D1Result {
  success: boolean;
  meta: { changes: number; last_row_id: number | bigint; duration?: number };
  results: unknown[];
  changes?: number;
  lastInsertRowid?: number | bigint;
}

class BoundStatement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: unknown[]
  ) {}

  private runSync(): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.db.prepare(this.sql);
    const p = this.params.map(normalizeParam);
    return stmt.run(...(p as any[])) as {
      changes: number;
      lastInsertRowid: number | bigint;
    };
  }

  private allSync(): Record<string, unknown>[] {
    const stmt = this.db.prepare(this.sql);
    const p = this.params.map(normalizeParam);
    return stmt.all(...(p as any[])) as Record<string, unknown>[];
  }

  async run(): Promise<D1Result> {
    const r = this.runSync();
    return {
      success: true,
      meta: { changes: Number(r.changes ?? 0), last_row_id: r.lastInsertRowid },
      results: [],
      changes: Number(r.changes ?? 0),
      lastInsertRowid: r.lastInsertRowid,
    };
  }

  async all(): Promise<{ results: unknown[]; success: boolean; meta: any }> {
    const rows = this.allSync();
    return {
      results: rows,
      success: true,
      meta: { changes: rows.length, last_row_id: 0 },
    };
  }

  async raw(): Promise<unknown[][]> {
    return this.allSync().map((row) => Object.values(row));
  }

  async first(colName?: string): Promise<unknown> {
    const stmt = this.db.prepare(this.sql);
    const p = this.params.map(normalizeParam);
    const row = stmt.get(...(p as any[])) as Record<string, unknown> | undefined;
    if (row === undefined || row === null) return null;
    if (colName !== undefined) return row[colName] ?? null;
    return row;
  }
}

class Prepared {
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...params: unknown[]): BoundStatement {
    return new BoundStatement(this.db, this.sql, params);
  }
  // Unbound shortcuts (D1 allows calling these directly when there are no params)
  run(): Promise<D1Result> {
    return this.bind().run();
  }
  all(): Promise<{ results: unknown[]; success: boolean; meta: any }> {
    return this.bind().all();
  }
  raw(): Promise<unknown[][]> {
    return this.bind().raw();
  }
  first(colName?: string): Promise<unknown> {
    return this.bind().first(colName);
  }
}

export class SqliteD1 {
  constructor(private sqlite: DatabaseSync) {}

  prepare(sql: string): Prepared {
    return new Prepared(this.sqlite, sql);
  }

  async batch(statements: BoundStatement[]): Promise<D1Result[]> {
    const results: D1Result[] = [];
    this.sqlite.exec('BEGIN');
    try {
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      this.sqlite.exec('COMMIT');
    } catch (err) {
      try {
        this.sqlite.exec('ROLLBACK');
      } catch {}
      throw err;
    }
    return results;
  }

  async exec(command: string): Promise<{ count: number; duration: number }> {
    const started = Date.now();
    this.sqlite.exec(command);
    return { count: 1, duration: Date.now() - started };
  }
}

// ---------------------------------------------------------------------------
// Chat room — in-process port of durable/chat-room.ts (Durable Object)
// ---------------------------------------------------------------------------

interface ConnectedClient {
  userId: string;
  userName: string;
  role: string;
  ws: { send: (data: string) => void; on?: any };
}

export class ChatRoomNode {
  private clients: Map<string, ConnectedClient> = new Map();

  addConnection(
    ws: { send: (data: string) => void },
    userId: string,
    userName: string,
    role: string
  ): void {
    this.clients.set(userId, { userId, userName, role, ws });
    this.broadcastPresence();
  }

  removeConnection(ws: { send: (data: string) => void }): void {
    for (const [userId, client] of this.clients) {
      if (client.ws === ws) {
        this.clients.delete(userId);
        break;
      }
    }
    this.broadcastPresence();
  }

  handleMessage(ws: { send: (data: string) => void }, data: string): void {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      if (msg.type === 'typing') {
        for (const [, client] of this.clients) {
          if (client.ws !== ws) {
            try {
              client.ws.send(
                JSON.stringify({
                  type: 'typing',
                  userId: msg.userId,
                  userName: msg.userName,
                })
              );
            } catch {}
          }
        }
      }
    } catch {}
  }

  private presenceList(): Array<{ userId: string; userName: string; role: string }> {
    const online: Array<{ userId: string; userName: string; role: string }> = [];
    for (const [, client] of this.clients) {
      online.push({ userId: client.userId, userName: client.userName, role: client.role });
    }
    return online;
  }

  private broadcastPresence(): void {
    const payload = JSON.stringify({ type: 'presence', online: this.presenceList() });
    for (const [, client] of this.clients) {
      try {
        client.ws.send(payload);
      } catch {}
    }
  }

  // HTTP-shim surface (same routes the Durable Object exposed via stub.fetch)
  async fetch(input: Request | string, init?: RequestInit): Promise<Response> {
    const req = new Request(typeof input === 'string' ? input : input.toString(), init);
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      // Real WebSocket upgrades are handled at the Node HTTP server level.
      return new Response(JSON.stringify({ error: 'WebSocket upgrade required' }), {
        status: 426,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/broadcast' && req.method === 'POST') {
      const body = (await req.json()) as { senderId: string; senderName: string; message: any };
      for (const [, client] of this.clients) {
        try {
          client.ws.send(
            JSON.stringify({
              type: 'message',
              senderId: body.senderId,
              senderName: body.senderName,
              message: body.message,
            })
          );
        } catch {}
      }
      return Response.json({ success: true, clientCount: this.clients.size });
    }

    if (url.pathname === '/presence') {
      return Response.json({ online: this.presenceList() });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

// ---------------------------------------------------------------------------
// Lead reservation — in-process port of durable/lead-reservation.ts
// (expiry is checked on read, matching the DO's read paths; the DO's alarm
//  only lazily marked EXPIRED for listing, which nothing reads)
// ---------------------------------------------------------------------------

interface ReservationState {
  leadId: string;
  agentId: string;
  deviceId: string;
  sessionId: string;
  reservedAt: string;
  expiresAt: string;
  status: string;
}

export class LeadReservationNode {
  private store: Map<string, ReservationState> = new Map();

  async fetch(input: Request | string, init?: RequestInit): Promise<Response> {
    const req = new Request(typeof input === 'string' ? input : input.toString(), init);
    const url = new URL(req.url);

    if (url.pathname === '/reserve' && req.method === 'POST') {
      const body = (await req.json()) as {
        leadId: string;
        agentId: string;
        deviceId: string;
        sessionId: string;
        ttlMs?: number;
      };

      const existing = this.store.get(`lead:${body.leadId}`);
      if (
        existing &&
        existing.status === 'ACTIVE' &&
        new Date(existing.expiresAt).getTime() > Date.now()
      ) {
        if (existing.agentId !== body.agentId) {
          return Response.json(
            { error: 'Lead already reserved by another agent' },
            { status: 409 }
          );
        }
        return Response.json({ reservation: existing });
      }

      const ttlMs = body.ttlMs || 10 * 60 * 1000;
      const reservation: ReservationState = {
        leadId: body.leadId,
        agentId: body.agentId,
        deviceId: body.deviceId,
        sessionId: body.sessionId,
        reservedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        status: 'ACTIVE',
      };

      this.store.set(`lead:${body.leadId}`, reservation);
      return Response.json({ reservation });
    }

    if (url.pathname === '/check') {
      const leadId = url.searchParams.get('leadId');
      if (!leadId) return Response.json({ error: 'leadId required' }, { status: 400 });

      const reservation = this.store.get(`lead:${leadId}`);
      if (
        !reservation ||
        reservation.status !== 'ACTIVE' ||
        new Date(reservation.expiresAt).getTime() < Date.now()
      ) {
        return Response.json({ reserved: false });
      }
      return Response.json({ reserved: true, reservation });
    }

    if (url.pathname === '/release' && req.method === 'POST') {
      const { leadId, agentId } = (await req.json()) as { leadId: string; agentId: string };
      const reservation = this.store.get(`lead:${leadId}`);
      if (reservation && reservation.agentId === agentId) {
        reservation.status = 'RELEASED';
        this.store.set(`lead:${leadId}`, reservation);
      }
      return Response.json({ success: true });
    }

    if (url.pathname === '/complete' && req.method === 'POST') {
      const { leadId, agentId } = (await req.json()) as { leadId: string; agentId: string };
      const reservation = this.store.get(`lead:${leadId}`);
      if (reservation && reservation.agentId === agentId) {
        reservation.status = 'COMPLETED';
        this.store.set(`lead:${leadId}`, reservation);
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

// ---------------------------------------------------------------------------
// Bindings factory
// ---------------------------------------------------------------------------

export interface NodeBindings {
  DB: SqliteD1;
  ASSETS: { fetch: typeof fetch };
  ENVIRONMENT: string;
  JWT_SECRET: string;
  LEAD_RESERVATION: { idFromName: (name: string) => any; get: (id: any) => any };
  CHAT_ROOM: { idFromName: (name: string) => any; get: (id: any) => any };
  NOTIFICATION_QUEUE: { send: (body: any) => Promise<void> };
}

export const chatRoom = new ChatRoomNode();
export const leadReservation = new LeadReservationNode();

export function createNodeBindings(sqlite: DatabaseSync): NodeBindings {
  const env = {
    DB: new SqliteD1(sqlite) as any,
    ASSETS: {
      fetch: async () => new Response('ASSETS binding is not used in the Node runtime', { status: 500 }),
    },
    ENVIRONMENT: process.env.ENVIRONMENT || 'production',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
    LEAD_RESERVATION: {
      idFromName: (name: string) => ({ name }),
      get: () => ({ fetch: (input: any, init?: any) => leadReservation.fetch(input, init) }),
    },
    CHAT_ROOM: {
      idFromName: (name: string) => ({ name }),
      get: () => ({ fetch: (input: any, init?: any) => chatRoom.fetch(input, init) }),
    },
    NOTIFICATION_QUEUE: {
      // Enqueue-semantics: return immediately, process in background (matches
      // the Cloudflare Queue producer whose consumer runs asynchronously).
      send: async (body: any) => {
        void processNotificationQueue(env as any, { body }).catch((err) => {
          console.error('Notification processing error:', err);
        });
      },
    },
  };
  return env as unknown as NodeBindings;
}
