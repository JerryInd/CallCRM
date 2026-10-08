import { Hono } from 'hono';
import { eq, and, or, lt, lte } from 'drizzle-orm';
import { leads, responses, users } from '../db/schema';
import { createDB } from '../db';
import { requireAuth, requireAdmin, requireAgent, type TokenPayload } from '../lib/auth';
import { Bindings } from '../types';

const router = new Hono<{ Bindings: Bindings }>();

router.get('/', requireAuth, requireAdmin, async (c) => {
  const db = createDB(c.env);
  const from = c.req.query('from');
  const to = c.req.query('to') || new Date().toISOString().slice(0, 10);

  const allResponses = await db.select().from(responses);
  let followups = allResponses.filter((r) => r.followUpDate && r.followUpDate <= to);
  if (from) followups = followups.filter((r) => r.followUpDate && r.followUpDate >= from);

  const allLeads = await db.select().from(leads);
  const leadMap = new Map(allLeads.map((l) => [l.leadId, l]));

  const enriched = followups.map((f) => ({
    ...f,
    leadName: leadMap.get(f.leadId)?.name || null,
    agent: f.agentName,
    followUpStatus: leadMap.get(f.leadId)?.followUpStatus || 'PENDING',
  }));

  return c.json({ followups: enriched, followUps: enriched });
});

// Agent: my follow-ups (assigned to me or from my responses)
router.get('/mine', requireAuth, requireAgent, async (c) => {
  const user = c.get('user') as TokenPayload;
  const db = createDB(c.env);

  const allLeads = await db.select().from(leads);
  const allResponses = await db.select().from(responses);
  const responseByLead = new Map(allResponses.map((r) => [r.leadId, r]));

  const today = new Date().toISOString().slice(0, 10);

  const mine = allLeads.filter((l) => {
    if (!l.followUpDate) return false;
    const isMine = l.followUpAssignedTo === user.userId;
    const lastResp = responseByLead.get(l.leadId);
    const isMyResponse = lastResp?.agentName === user.name;
    return (isMine || isMyResponse) && l.followUpStatus !== 'COMPLETED';
  });

  const results = mine.map((l) => {
    const lastResp = responseByLead.get(l.leadId);
    const fuDate = l.followUpDate;
    return {
      id: l.id,
      leadId: l.leadId,
      leadName: l.name,
      phone: l.phone,
      email: l.email,
      response: lastResp?.response || l.lastResponse,
      notes: lastResp?.notes,
      followUpDate: fuDate,
      followUpTime: l.followUpTime,
      followUpStatus: l.followUpStatus,
      followUpAssignedTo: l.followUpAssignedTo,
      isDue: !!fuDate && fuDate <= today,
      agent: lastResp?.agentName,
    };
  });

  return c.json({ followups: results, followUps: results });
});

export default router;
