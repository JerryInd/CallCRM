import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { createDB } from '../db';
import { agentSessions, users, leads, responses } from '../db/schema';
import { requireAuth } from '../lib/auth';
import { Bindings } from '../types';

const router = new Hono<{ Bindings: Bindings }>();

router.get('/stats', requireAuth, async (c) => {
  const db = createDB(c.env);

  const dateParam = c.req.query('date');
  const targetDate = dateParam || new Date().toISOString().slice(0, 10);

  const allLeads = await db.select().from(leads);
  const allResponses = await db.select().from(responses);

  const totalLeads = allLeads.filter((l) => l.leadStatus !== 'REMOVED').length;
  const today = new Date().toLocaleDateString();
  const todayIso = new Date().toISOString().slice(0, 10);

  let callsToday = 0;
  let dnc = 0;
  let conversions = 0;
  let followUpsDue = 0;
  const responseBreakdown: Record<string, number> = {};

  for (const r of allResponses) {
    const isTargetDay =
      r.date === targetDate ||
      r.date === today && targetDate === todayIso ||
      (r.createdAt && r.createdAt.startsWith(targetDate));
    if (isTargetDay) {
      callsToday++;
      if (r.response) responseBreakdown[r.response] = (responseBreakdown[r.response] || 0) + 1;
    }
    if (r.response === 'Do Not Call (DNC)') dnc++;
    if (r.response === 'Sale/Conversion Completed') conversions++;
    if (r.followUpDate && r.followUpDate <= todayIso) followUpsDue++;
  }

  const totalAgentsResult = await db.select({ count: users.id }).from(users).where(eq(users.role, 'AGENT'));
  const totalAgents = totalAgentsResult.length;

  const allSessions = await db.select().from(agentSessions);

  const todaySessions = allSessions.filter((s) => s.clockInAt.startsWith(targetDate));

  const agentsIn = todaySessions.filter((s) => s.status === 'ACTIVE').length;
  const agentsPaused = todaySessions.filter((s) => s.status === 'PAUSED').length;
  const agentsOut = todaySessions.filter((s) => s.status === 'ENDED').length;

  return c.json({
    totalLeads,
    callsToday,
    followUpsDue,
    totalAgents,
    agentsIn,
    agentsPaused,
    agentsOut,
    dnc,
    conversions,
    responseBreakdown,
  });
});

router.get('/agents', requireAuth, async (c) => {
  const db = createDB(c.env);

  const activeSessions = await db.select().from(agentSessions).where(eq(agentSessions.status, 'ACTIVE'));

  const agentIds = [...new Set(activeSessions.map((s) => s.agentId))];
  const agentList = agentIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, agentIds))
    : [];

  const agentsWithInfo = activeSessions.map((session) => {
    const agent = agentList.find((a) => a.id === session.agentId);
    return {
      ...session,
      agentName: agent?.name || 'Unknown',
      agentEmail: agent?.email || '',
    };
  });

  return c.json({ agents: agentsWithInfo });
});

export default router;
