import { Hono } from 'hono';
import { eq, and, like, or, isNull } from 'drizzle-orm';
import { leadReservations, agentSessions, leads as leadsTable, responses as responsesTable } from '../db/schema';
import { createDB } from '../db';
import { requireAuth, requireAgent, type TokenPayload } from '../lib/auth';
import { uuid, now } from '../lib/utils';
import { Bindings, Variables } from '../types';
import { getSheetSettings, submitResponseToSheet } from '../lib/sheet-helpers';
import { activateFollowUpsForAgent } from '../services/followup-assign';

const RESERVATION_TTL_MS = 10 * 60 * 1000;

const leadsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

leadsRouter.use('*', requireAuth);

// Agent: get current reserved lead
leadsRouter.get('/current', requireAgent, async (c) => {
  const user = c.get('user') as TokenPayload;
  const db = createDB(c.env);

  const reservation = await db.select().from(leadReservations).where(
    and(eq(leadReservations.agentId, user.userId), eq(leadReservations.status, 'ACTIVE'))
  ).limit(1);

  if (!reservation[0]) return c.json({ lead: null });

  const expiresAt = new Date(reservation[0].expiresAt).getTime();
  if (Date.now() >= expiresAt) {
    await db.update(leadReservations).set({ status: 'EXPIRED' }).where(
      eq(leadReservations.id, reservation[0].id)
    );
    return c.json({ lead: null });
  }

  const lead = await db.select().from(leadsTable).where(
    eq(leadsTable.leadId, reservation[0].leadId)
  ).limit(1);

  if (!lead[0]) return c.json({ lead: null });

  const history = await getLeadHistoryFromD1(db, lead[0].phone);

  return c.json({ lead: lead[0], history, reservation: reservation[0] });
});

// Agent: search leads (from D1 — fast) — MUST be before /:id
leadsRouter.get('/search', requireAgent, async (c) => {
  const db = createDB(c.env);
  const q = c.req.query('q');
  if (!q || q.trim().length < 2) {
    return c.json({ error: 'Search query must be at least 2 characters' }, 400);
  }

  const query = q.trim().toLowerCase();

  const allLeads = await db.select().from(leadsTable);
  const matches = allLeads.filter((l) => {
    if (l.phone && l.phone.toLowerCase().includes(query)) return true;
    if (l.email && l.email.toLowerCase().includes(query)) return true;
    if (l.name && l.name.toLowerCase().includes(query)) return true;
    if (l.account && l.account.toLowerCase().includes(query)) return true;
    if (l.leadId && l.leadId.toLowerCase().includes(query)) return true;
    return false;
  }).slice(0, 10);

  const results = await Promise.all(matches.map(async (l) => {
    const history = await getLeadHistoryFromD1(db, l.phone);
    return { lead: l, history };
  }));

  return c.json({ results });
});

// Agent: get lead by ID (accepts leadId business key or primary key)
leadsRouter.get('/:id', requireAgent, async (c) => {
  const leadId = c.req.param('id') || '';
  const db = createDB(c.env);

  let lead = await db.select().from(leadsTable).where(eq(leadsTable.leadId, leadId)).limit(1);
  if (!lead[0]) {
    lead = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  }
  if (!lead[0]) return c.json({ error: 'Lead not found' }, 404);

  const history = await getLeadHistoryFromD1(db, lead[0].phone);
  return c.json({ lead: lead[0], history });
});

// Admin/agent: get response history for a lead (accepts leadId or pk)
leadsRouter.get('/:id/history', requireAuth, async (c) => {
  const leadId = c.req.param('id') || '';
  const db = createDB(c.env);

  let lead = await db.select().from(leadsTable).where(eq(leadsTable.leadId, leadId)).limit(1);
  if (!lead[0]) {
    lead = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  }

  let history: any[] = [];
  if (lead[0]) {
    history = await getLeadHistoryFromD1(db, lead[0].phone);
    if (history.length === 0) {
      history = await db.select().from(responsesTable).where(eq(responsesTable.leadId, lead[0].leadId));
    }
  }

  return c.json({
    history: history.map((h) => ({
      date: h.date, time: h.time, agent: h.agentName, response: h.response,
      notes: h.notes, followUpDate: h.followUpDate, followUpTime: h.followUpTime,
    })),
  });
});

// Agent: my responses (for activity feed)
leadsRouter.get('/my/responses', requireAgent, async (c) => {
  const user = c.get('user') as TokenPayload;
  const db = createDB(c.env);
  const results = await db.select().from(responsesTable).where(eq(responsesTable.agentName, user.name));
  return c.json({ responses: results });
});

// Agent: get next lead (reads from D1 — fast)
leadsRouter.post('/next', requireAgent, async (c) => {
  const user = c.get('user') as TokenPayload;
  const { deviceId, sessionId } = await c.req.json<{ deviceId: string; sessionId: string }>();

  if (!deviceId || !sessionId) {
    return c.json({ error: 'Device ID and Session ID required' }, 400);
  }

  const db = createDB(c.env);

  // Verify device
  const { devices } = await import('../db/schema');
  const existingDevice = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!existingDevice[0]) {
    if (user.role !== 'AGENT') return c.json({ error: 'Device not authorized' }, 403);
    await db.insert(devices).values({
      id: deviceId, name: deviceId, publicKey: 'auto-browser',
      status: 'ACTIVE', agentId: user.userId,
      registeredAt: now(), createdAt: now(), updatedAt: now(),
    });
  } else {
    const dev = existingDevice[0];
    if (dev.status === 'REVOKED' || dev.status === 'PENDING') {
      return c.json({ error: 'Device not authorized' }, 403);
    }
    if (dev.status === 'ACTIVE' && dev.agentId && dev.agentId !== user.userId) {
      return c.json({ error: 'Device assigned to another agent' }, 403);
    }
    if (dev.status === 'ACTIVE' && !dev.agentId && user.role === 'AGENT') {
      await db.update(devices).set({ agentId: user.userId, updatedAt: now() }).where(eq(devices.id, deviceId));
    }
  }

  // Verify session is ACTIVE
  const session = await db.select().from(agentSessions).where(
    and(eq(agentSessions.id, sessionId), eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'ACTIVE'))
  ).limit(1);
  if (!session[0]) return c.json({ error: 'Session not active. Click IN first.' }, 403);

  // Check for existing reservation
  const existingReservation = await db.select().from(leadReservations).where(
    and(eq(leadReservations.agentId, user.userId), eq(leadReservations.status, 'ACTIVE'))
  ).limit(1);

  if (existingReservation[0]) {
    const expiresAt = new Date(existingReservation[0].expiresAt).getTime();
    if (Date.now() < expiresAt) {
      const lead = await db.select().from(leadsTable).where(
        eq(leadsTable.leadId, existingReservation[0].leadId)
      ).limit(1);
      if (lead[0]) {
        const history = await getLeadHistoryFromD1(db, lead[0].phone);
        return c.json({ lead: lead[0], history, reservation: existingReservation[0] });
      }
    }
    await db.update(leadReservations).set({ status: 'EXPIRED' }).where(
      eq(leadReservations.id, existingReservation[0].id)
    );
  }

  // Check for follow-ups assigned to this agent first
  const timestamp = now();
  const nowDate = timestamp.slice(0, 10);
  const nowTime = timestamp.slice(11, 16);

  const assignedFollowUps = await db.select().from(leadsTable).where(
    and(
      eq(leadsTable.followUpAssignedTo, user.userId),
      eq(leadsTable.followUpStatus, 'ASSIGNED'),
    )
  );

  // Find the first assigned follow-up that is due
  for (const fuLead of assignedFollowUps) {
    if (!fuLead.followUpDate || !fuLead.followUpTime) continue;
    const isDue = fuLead.followUpDate < nowDate ||
      (fuLead.followUpDate === nowDate && fuLead.followUpTime <= nowTime);
    if (!isDue) continue;

    // Create reservation for this follow-up lead
    const reservationId = uuid();
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS).toISOString();

    await db.insert(leadReservations).values({
      id: reservationId,
      leadId: fuLead.leadId,
      agentId: user.userId,
      deviceId,
      sessionId,
      reservedAt: timestamp,
      expiresAt,
      status: 'ACTIVE',
      createdAt: timestamp,
    });

    // Mark follow-up as completed (being called now)
    await db.update(leadsTable).set({
      followUpStatus: 'COMPLETED',
      updatedAt: timestamp,
    }).where(eq(leadsTable.leadId, fuLead.leadId));

    const history = await getLeadHistoryFromD1(db, fuLead.phone);

    return c.json({
      lead: fuLead,
      history,
      reservation: { id: reservationId, expiresAt },
      followUp: true,
    });
  }

  // Get active reservations from all agents
  const activeReservations = await db.select().from(leadReservations).where(
    eq(leadReservations.status, 'ACTIVE')
  );
  const reservedLeadIds = new Set(activeReservations.map((r) => r.leadId));

  // Get DNC phones/emails from D1 responses
  const dncResponses = await db.select().from(responsesTable).where(
    eq(responsesTable.response, 'Do Not Call (DNC)')
  );
  const dncPhones = new Set(dncResponses.filter((r) => r.phone).map((r) => r.phone));
  const dncEmails = new Set(dncResponses.filter((r) => r.email).map((r) => r.email));

  // Get responded phones (leads that already have any response)
  const allResponses = await db.select().from(responsesTable);
  const respondedPhones = new Set(allResponses.filter((r) => r.phone).map((r) => r.phone));

  // Filter eligible leads from D1
  const eligible = await db.select().from(leadsTable).where(
    and(
      isNull(leadsTable.leadStatus),
      eq(leadsTable.dnc, false),
    )
  );

  const filtered = eligible.filter((l) => {
    if (!l.phone) return false;
    if (dncPhones.has(l.phone)) return false;
    if (l.email && dncEmails.has(l.email)) return false;
    if (reservedLeadIds.has(l.leadId)) return false;
    if (respondedPhones.has(l.phone)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return c.json({ error: 'No leads available' }, 404);
  }

  const nextLead = filtered[0];

  const reservationId = uuid();
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS).toISOString();

  await db.insert(leadReservations).values({
    id: reservationId,
    leadId: nextLead.leadId,
    agentId: user.userId,
    deviceId,
    sessionId,
    reservedAt: timestamp,
    expiresAt,
    status: 'ACTIVE',
    createdAt: timestamp,
  });

  const history = await getLeadHistoryFromD1(db, nextLead.phone);

  return c.json({
    lead: nextLead,
    history,
    reservation: { id: reservationId, expiresAt },
  });
});

// Agent: submit response — writes to D1 immediately, then pushes to Google Sheets
// Alias: /:id/respond (mobile) and /:id/response (legacy)
async function submitLeadResponse(c: any) {
  const user = c.get('user') as TokenPayload;
  const leadId = c.req.param('id') || '';
  const body = await c.req.json();

  if (!body.response || !body.reservationId) {
    return c.json({ error: 'Response and reservation ID required' }, 400);
  }

  const db = createDB(c.env);

  // Verify reservation
  const reservation = await db.select().from(leadReservations).where(
    and(
      eq(leadReservations.id, body.reservationId),
      eq(leadReservations.agentId, user.userId),
      eq(leadReservations.status, 'ACTIVE')
    )
  ).limit(1);

  if (!reservation[0]) {
    return c.json({ error: 'Invalid or expired reservation' }, 403);
  }

  // Validate conditional fields — accept both spaced and unspaced option labels
  const norm = (s: string) => s.replace(/\s*\/\s*/g, '/').trim();
  const respNorm = norm(body.response);
  const followUpResponses = ['Interested', 'Call Back/Follow-up', 'Appointment/Meeting Scheduled'];
  const noteResponses = ['Sale/Conversion Completed', 'Other'];

  if (followUpResponses.includes(respNorm)) {
    if (!body.followUpDate || !body.followUpTime) {
      return c.json({ error: 'Follow-up date and time required for this response' }, 400);
    }
  }

  if (noteResponses.includes(respNorm)) {
    if (!body.notes || body.notes.trim() === '') {
      return c.json({ error: 'Notes required for this response' }, 400);
    }
  }

  // Get lead data — accept leadId or pk
  let lead = await db.select().from(leadsTable).where(eq(leadsTable.leadId, leadId)).limit(1);
  if (!lead[0]) {
    lead = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  }
  const leadData = lead[0];
  const businessLeadId = leadData?.leadId || leadId;

  const timestamp = now();
  const today = new Date();
  const dateStr = today.toLocaleDateString();
  const timeStr = today.toLocaleTimeString();

  // Canonical response value stored in D1 (unspaced form matches backend checks)
  const canonical = respNorm === 'Call Back/Follow-up' ? 'Call Back / Follow-up' : body.response;

  // 1. Save response to D1 immediately
  await db.insert(responsesTable).values({
    id: uuid(),
    leadId: businessLeadId,
    phone: leadData?.phone || null,
    email: leadData?.email || null,
    agentName: user.name,
    response: canonical,
    notes: body.notes || null,
    followUpDate: body.followUpDate || null,
    followUpTime: body.followUpTime || null,
    date: dateStr,
    time: timeStr,
    pendingSync: true,
    createdAt: timestamp,
  });

  // 2. Update lead in D1
  if (leadData) {
    const updateData: Record<string, unknown> = {
      lastResponse: canonical,
      lastCalled: timestamp,
      attemptCount: leadData.attemptCount + 1,
      updatedAt: timestamp,
    };
    if (respNorm === 'Do Not Call (DNC)') updateData.dnc = true;
    if (body.followUpDate) {
      updateData.followUpDate = body.followUpDate;
      updateData.followUpStatus = 'PENDING';
      updateData.followUpAssignedTo = null;
      updateData.followUpAssignedAt = null;
    }
    if (body.followUpTime) updateData.followUpTime = body.followUpTime;
    if (respNorm === 'Sale/Conversion Completed') updateData.conversion = 'COMPLETED';
    if (respNorm === 'Appointment/Meeting Scheduled') updateData.appointment = 'SCHEDULED';

    await db.update(leadsTable).set(updateData).where(eq(leadsTable.leadId, leadData.leadId));
  }

  // 3. Push to Google Sheets (async, don't block agent)
  try {
    const ss = await getSheetSettings(db);
    if (ss && leadData) {
      await submitResponseToSheet(
        ss,
        {
          name: leadData.name || '',
          phone: leadData.phone || '',
          email: leadData.email || '',
          account: leadData.account || '',
        },
        canonical,
        body.notes || '',
        user.name,
        body.followUpDate,
        body.followUpTime
      );
    }
  } catch {
    // Response saved to D1 — will sync later
  }

  // 4. Complete reservation
  await db.update(leadReservations).set({
    status: 'COMPLETED',
  }).where(eq(leadReservations.id, body.reservationId));

  // 5. Update session call count
  const session = await db.select().from(agentSessions).where(
    and(eq(agentSessions.agentId, user.userId), eq(agentSessions.status, 'ACTIVE'))
  ).limit(1);

  if (session[0]) {
    await db.update(agentSessions).set({
      callsCompleted: session[0].callsCompleted + 1,
      updatedAt: timestamp,
    }).where(eq(agentSessions.id, session[0].id));
  }

  // 6. Audit log
  try {
    const { getSheetSettings: getSS, appendAuditToSheet } = await import('../lib/sheet-helpers');
    const ss = await getSS(db);
    if (ss) await appendAuditToSheet(ss, timestamp, user.email || user.name, 'LEAD_RESPONSE', JSON.stringify({ leadId: businessLeadId, response: canonical }));
  } catch {}

  return c.json({ success: true });
}

leadsRouter.post('/:id/response', requireAgent, submitLeadResponse);
leadsRouter.post('/:id/respond', requireAgent, submitLeadResponse);

// Agent: release current lead
leadsRouter.post('/release', requireAgent, async (c) => {
  const user = c.get('user') as TokenPayload;
  const db = createDB(c.env);

  const reservation = await db.select().from(leadReservations).where(
    and(eq(leadReservations.agentId, user.userId), eq(leadReservations.status, 'ACTIVE'))
  ).limit(1);

  if (reservation[0]) {
    await db.update(leadReservations).set({ status: 'RELEASED' }).where(
      eq(leadReservations.id, reservation[0].id)
    );
  }

  return c.json({ success: true });
});

async function getLeadHistoryFromD1(db: ReturnType<typeof createDB>, phone: string | null) {
  if (!phone) return [];
  try {
    return await db.select().from(responsesTable).where(eq(responsesTable.phone, phone));
  } catch {
    return [];
  }
}

export default leadsRouter;
