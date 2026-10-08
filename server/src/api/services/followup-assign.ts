import { eq, and, isNull } from 'drizzle-orm';
import { createDB } from '../db';
import { leads, responses, agentSessions, users, notifications, devices, leadReservations } from '../db/schema';
import { uuid, now } from '../lib/utils';

interface AssignableFollowUp {
  leadId: string;
  leadRowId: string;
  phone: string | null;
  name: string | null;
  followUpDate: string;
  followUpTime: string;
  lastAgentName: string | null;
}

export async function autoAssignFollowUps(env: { DB: D1Database }): Promise<void> {
  const db = createDB(env);
  const timestamp = now();
  const nowDate = timestamp.slice(0, 10);
  const nowTime = timestamp.slice(11, 16);

  // Find leads that are due for follow-up and not yet assigned/completed
  const allLeads = await db.select().from(leads);

  const dueFollowUps: AssignableFollowUp[] = [];

  for (const lead of allLeads) {
    if (!lead.followUpDate || !lead.followUpTime) continue;
    if (lead.followUpStatus === 'COMPLETED') continue;
    if (lead.followUpStatus === 'ASSIGNED' && lead.followUpAssignedTo) continue;
    if (lead.dnc) continue;
    if (lead.leadStatus === 'REMOVED') continue;

    // Check if the follow-up is due (date <= today and time <= now)
    const isDue = lead.followUpDate < nowDate ||
      (lead.followUpDate === nowDate && lead.followUpTime <= nowTime);

    if (!isDue) continue;

    // Find who last responded to this lead
    const allResponses = await db.select().from(responses).where(
      eq(responses.leadId, lead.leadId)
    );
    const lastResponse = allResponses.sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )[0];

    dueFollowUps.push({
      leadId: lead.leadId,
      leadRowId: lead.id,
      phone: lead.phone,
      name: lead.name,
      followUpDate: lead.followUpDate,
      followUpTime: lead.followUpTime,
      lastAgentName: lastResponse?.agentName || null,
    });
  }

  if (dueFollowUps.length === 0) return;

  // Find active sessions (agents currently IN)
  const activeSessions = await db.select().from(agentSessions).where(
    eq(agentSessions.status, 'ACTIVE')
  );

  // Find paused sessions (agents who are paused but still "at work")
  const pausedSessions = await db.select().from(agentSessions).where(
    eq(agentSessions.status, 'PAUSED')
  );

  const allOnlineSessions = [...activeSessions, ...pausedSessions];
  const onlineAgentIds = [...new Set(allOnlineSessions.map((s) => s.agentId))];

  if (onlineAgentIds.length === 0) {
    // No agents online — follow-ups stay as PENDING, will be picked up when agents come IN
    return;
  }

  // Get agent info
  const allUsers = await db.select().from(users);
  const agentMap = new Map(allUsers.map((u) => [u.id, u]));

  // Count active reservations per agent (to determine least busy)
  const allReservations = await db.select().from(leadReservations).where(
    eq(leadReservations.status, 'ACTIVE')
  );
  const reservationCounts = new Map<string, number>();
  for (const r of allReservations) {
    reservationCounts.set(r.agentId, (reservationCounts.get(r.agentId) || 0) + 1);
  }

  for (const fu of dueFollowUps) {
    // Find original agent
    let targetAgentId: string | null = null;

    if (fu.lastAgentName) {
      const originalAgent = allUsers.find(
        (u) => u.name === fu.lastAgentName && u.role === 'AGENT'
      );
      if (originalAgent && onlineAgentIds.includes(originalAgent.id)) {
        targetAgentId = originalAgent.id;
      }
    }

    // If original agent not available, find least busy online agent
    if (!targetAgentId) {
      const sorted = [...onlineAgentIds].sort((a, b) => {
        const countA = reservationCounts.get(a) || 0;
        const countB = reservationCounts.get(b) || 0;
        return countA - countB;
      });
      targetAgentId = sorted[0];
    }

    if (!targetAgentId) continue;

    // Assign the follow-up
    await db.update(leads).set({
      followUpAssignedTo: targetAgentId,
      followUpStatus: 'ASSIGNED',
      followUpAssignedAt: timestamp,
      updatedAt: timestamp,
    }).where(eq(leads.leadId, fu.leadId));

    // Send notification
    try {
      const agent = agentMap.get(targetAgentId);
      if (agent) {
        // Insert notification record
        await db.insert(notifications).values({
          id: uuid(),
          userId: targetAgentId,
          type: 'FOLLOW_UP_ASSIGNED',
          title: 'Follow-up Assigned',
          message: `Follow-up for ${fu.name || fu.phone} is due. You have been assigned this call.`,
          referenceId: fu.leadId,
          referenceType: 'LEAD',
          read: false,
          createdAt: timestamp,
        });

        // Send push notification
        const userDevices = await db.select().from(devices).where(
          eq(devices.agentId, targetAgentId)
        );
        for (const device of userDevices) {
          if (device.pushToken && device.status === 'ACTIVE') {
            try {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: device.pushToken,
                  title: 'Follow-up Assigned',
                  body: `Follow-up for ${fu.name || fu.phone} is due now.`,
                  data: { type: 'FOLLOW_UP_ASSIGNED', leadId: fu.leadId },
                  sound: 'default',
                }),
              });
            } catch {}
          }
        }
      }
    } catch {}
  }
}

// When an agent comes back online (resume or new clock-in), check for assigned follow-ups
export async function activateFollowUpsForAgent(
  env: { DB: D1Database },
  agentId: string
): Promise<void> {
  const db = createDB(env);
  const timestamp = now();

  // Find follow-ups assigned to this agent that are due
  const assignedLeads = await db.select().from(leads).where(
    and(
      eq(leads.followUpAssignedTo, agentId),
      eq(leads.followUpStatus, 'ASSIGNED'),
    )
  );

  const nowDate = timestamp.slice(0, 10);
  const nowTime = timestamp.slice(11, 16);

  for (const lead of assignedLeads) {
    if (!lead.followUpDate || !lead.followUpTime) continue;
    const isDue = lead.followUpDate < nowDate ||
      (lead.followUpDate === nowDate && lead.followUpTime <= nowTime);

    if (isDue) {
      // These are already ASSIGNED — they'll be picked up by getNextLead
      // Just ensure they stay marked as ASSIGNED
    } else {
      // Not yet due — reset to PENDING so cron picks them up later
      await db.update(leads).set({
        followUpStatus: 'PENDING',
        followUpAssignedTo: null,
        followUpAssignedAt: null,
        updatedAt: timestamp,
      }).where(eq(leads.leadId, lead.leadId));
    }
  }
}
