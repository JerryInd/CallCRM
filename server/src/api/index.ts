import { app } from './app';
import { Bindings } from './types';
import { runSync } from './services/google-sheets-sync';
import { processNotificationQueue } from './services/push-notifications';
import { autoAssignFollowUps } from './services/followup-assign';
export { LeadReservation } from './durable/lead-reservation';
export { ChatRoom } from './durable/chat-room';

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    // WebSocket upgrade for chat
    if (url.pathname === '/ws/chat') {
      return app.fetch(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },

  async queue(batch: MessageBatch<any>, env: Bindings, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processNotificationQueue(env, message);
      } catch (err) {
        console.error('Queue processing error:', err);
      }
    }
  },

  // Cron handler: runs every minute (Cloudflare minimum), syncs Sheets ↔ D1 + auto-assign follow-ups
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runSync(env));
    ctx.waitUntil(autoAssignFollowUps(env));
  },
};
