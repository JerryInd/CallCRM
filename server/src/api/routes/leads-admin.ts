import { Hono } from 'hono';
import { eq, and, like, or } from 'drizzle-orm';
import { createDB } from '../db';
import { leads, responses, users } from '../db/schema';
import { requireAuth, requireAdmin } from '../lib/auth';
import { Bindings } from '../types';

const router = new Hono<{ Bindings: Bindings }>();

router.use('*', requireAuth, requireAdmin);

// All leads from D1
router.get('/all', async (c) => {
  const db = createDB(c.env);

  const q = c.req.query('q')?.toLowerCase();
  const status = c.req.query('status');
  const brand = c.req.query('brand');
  const account = c.req.query('account');
  const dnc = c.req.query('dnc');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50')));

  let allLeads = await db.select().from(leads);

  let filtered = allLeads.filter((l) => l.leadStatus !== 'REMOVED');

  if (q) {
    filtered = filtered.filter((l) => {
      if (l.name?.toLowerCase().includes(q)) return true;
      if (l.phone?.toLowerCase().includes(q)) return true;
      if (l.email?.toLowerCase().includes(q)) return true;
      if (l.account?.toLowerCase().includes(q)) return true;
      if (l.leadId?.toLowerCase().includes(q)) return true;
      return false;
    });
  }
  if (brand) {
    filtered = filtered.filter((l) => l.brand?.toLowerCase() === brand.toLowerCase());
  }
  if (account) {
    filtered = filtered.filter((l) => l.account?.toLowerCase() === account.toLowerCase());
  }
  if (dnc === 'true') {
    filtered = filtered.filter((l) => l.dnc);
  }
  if (status) {
    const statusResponses = await db.select().from(responses).where(eq(responses.response, status));
    const phoneSet = new Set(statusResponses.filter((r) => r.phone).map((r) => r.phone));
    filtered = filtered.filter((l) => l.phone && phoneSet.has(l.phone));
  }

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const paged = filtered.slice(offset, offset + limit);

  return c.json({ leads: paged, total, page, limit });
});

// Responses from D1
router.get('/responses', async (c) => {
  const db = createDB(c.env);

  const q = c.req.query('q')?.toLowerCase();
  const agent = c.req.query('agent');
  const responseFilter = c.req.query('response') || c.req.query('type');
  const date = c.req.query('date');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50')));

  let allResponses = await db.select().from(responses);

  // Enrich with lead names
  const allLeads = await db.select().from(leads);
  const leadMap = new Map(allLeads.map((l) => [l.leadId, l]));

  let filtered = allResponses;
  if (q) {
    filtered = filtered.filter((r) => {
      if (r.leadId?.toLowerCase().includes(q)) return true;
      if (r.phone?.toLowerCase().includes(q)) return true;
      if (r.email?.toLowerCase().includes(q)) return true;
      if (r.agentName?.toLowerCase().includes(q)) return true;
      return false;
    });
  }
  if (agent) filtered = filtered.filter((r) => r.agentName?.toLowerCase() === agent.toLowerCase());
  if (responseFilter) filtered = filtered.filter((r) => r.response?.toLowerCase() === responseFilter.toLowerCase());
  if (date) filtered = filtered.filter((r) => r.date === date);

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const paged = filtered.slice(offset, offset + limit).map((r) => ({
    ...r,
    agent: r.agentName,
    leadName: leadMap.get(r.leadId)?.name || null,
  }));

  return c.json({ responses: paged, total, page, limit });
});

// Follow-ups from D1
router.get('/followups', async (c) => {
  const db = createDB(c.env);

  const from = c.req.query('from');
  const to = c.req.query('to');
  const date = c.req.query('date') || to || new Date().toISOString().slice(0, 10);
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50')));

  const allResponses = await db.select().from(responses);
  const followups = allResponses.filter((r) => {
    if (!r.followUpDate) return false;
    if (from && r.followUpDate < from) return false;
    if (to && r.followUpDate > to) return false;
    if (!from && r.followUpDate > date) return false;
    return true;
  });

  // Enrich with lead assignment status + lead name
  const allLeads = await db.select().from(leads);
  const leadMap = new Map(allLeads.map((l) => [l.leadId, l]));

  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const enriched = followups.map((f) => {
    const lead = leadMap.get(f.leadId);
    const assignedName = lead?.followUpAssignedTo ? userMap.get(lead.followUpAssignedTo) || lead.followUpAssignedTo : null;
    return {
      ...f,
      leadName: lead?.name || null,
      agent: f.agentName,
      followUpStatus: lead?.followUpStatus || 'PENDING',
      followUpAssignedTo: lead?.followUpAssignedTo || null,
      followUpAssignedToName: assignedName,
      followUpAssignedAt: lead?.followUpAssignedAt || null,
    };
  });

  const total = enriched.length;
  const offset = (page - 1) * limit;
  const paged = enriched.slice(offset, offset + limit);

  // Return both keys for frontend compatibility
  return c.json({ followups: paged, followUps: paged, total, page, limit });
});

// Stats from D1
router.get('/stats', async (c) => {
  const db = createDB(c.env);

  const allLeads = await db.select().from(leads);
  const allResponses = await db.select().from(responses);

  const today = new Date().toLocaleDateString();
  const todayIso = new Date().toISOString().slice(0, 10);

  const responseCounts: Record<string, number> = {};
  let callsToday = 0;
  let followUpsDue = 0;
  let dnc = 0;
  let conversions = 0;

  for (const r of allResponses) {
    responseCounts[r.response] = (responseCounts[r.response] || 0) + 1;
    if (r.date === today) callsToday++;
    if (r.response === 'Do Not Call (DNC)') dnc++;
    if (r.response === 'Sale/Conversion Completed') conversions++;
    if (r.followUpDate && r.followUpDate <= todayIso) followUpsDue++;
  }

  return c.json({
    totalLeads: allLeads.filter((l) => l.leadStatus !== 'REMOVED').length,
    totalResponses: allResponses.length,
    callsToday,
    followUpsDue,
    dnc,
    conversions,
    responseBreakdown: responseCounts,
  });
});

export default router;
