import { eq } from 'drizzle-orm';
import { createDB } from '../db';
import { leads, responses, syncState } from '../db/schema';
import { getSheetSettings, readLeadsFromSheet, readResponsesFromSheet, SheetLead, SheetResponse } from '../lib/sheet-helpers';
import { uuid, now } from '../lib/utils';
import { Bindings } from '../types';

interface SyncResult {
  timestamp: string;
  leadsChecked: number;
  leadsAdded: number;
  leadsUpdated: number;
  leadsRemoved: number;
  responsesAdded: number;
  pendingCrmToSheet: number;
  errors: number;
  status: 'HEALTHY' | 'WARNING' | 'ERROR';
  errorMessage?: string;
}

function generateLeadId(existingIds: Set<string>): string {
  let counter = 1;
  while (counter < 999999) {
    const id = `LEAD-${String(counter).padStart(6, '0')}`;
    if (!existingIds.has(id)) return id;
    counter++;
  }
  return `LEAD-${Date.now()}`;
}

function sheetLeadToD1Fields(sheet: SheetLead): Partial<typeof leads.$inferInsert> {
  return {
    name: sheet.name,
    email: sheet.email,
    phone: sheet.phone,
    account: sheet.account,
    address: sheet.address,
    brand: sheet.brand,
    comments: sheet.comments,
    socialTrading: sheet.socialTrading,
    type: sheet.type,
    originalDate: sheet.originalDate,
    poi: sheet.poi,
  };
}

function sheetResponseToD1Fields(sheet: SheetResponse, leadId: string): Partial<typeof responses.$inferInsert> {
  return {
    leadId,
    phone: sheet.phone,
    email: sheet.email,
    agentName: sheet.agent,
    response: sheet.response,
    notes: sheet.notes,
    followUpDate: sheet.followUpDate,
    followUpTime: sheet.followUpTime,
    date: sheet.date,
    time: sheet.time,
  };
}

export async function runSync(env: Bindings): Promise<SyncResult> {
  const db = createDB(env);
  const timestamp = now();
  const result: SyncResult = {
    timestamp,
    leadsChecked: 0,
    leadsAdded: 0,
    leadsUpdated: 0,
    leadsRemoved: 0,
    responsesAdded: 0,
    pendingCrmToSheet: 0,
    errors: 0,
    status: 'HEALTHY',
  };

  try {
    const ss = await getSheetSettings(db);
    if (!ss) {
      result.status = 'ERROR';
      result.errorMessage = 'Google Sheets not connected';
      await updateSyncState(db, result);
      return result;
    }

    // Read from Google Sheets (master)
    let sheetLeads: SheetLead[];
    let sheetResponses: SheetResponse[];
    try {
      [sheetLeads, sheetResponses] = await Promise.all([
        readLeadsFromSheet(ss),
        readResponsesFromSheet(ss),
      ]);
    } catch (err) {
      result.status = 'ERROR';
      result.errorMessage = `Google Sheets unavailable: ${err instanceof Error ? err.message : 'unknown'}`;
      await updateSyncState(db, result);
      return result;
    }

    result.leadsChecked = sheetLeads.length;

    // Get existing D1 leads
    const existingLeads = await db.select().from(leads);
    const existingLeadMap = new Map(existingLeads.map((l) => [l.leadId, l]));
    const allLeadIds = new Set(existingLeads.map((l) => l.leadId));

    // Sync leads: Google Sheets → D1
    const sheetPhoneToLeadId = new Map<string, string>();
    const BATCH_SIZE = 100;
    const newLeadsBatch: any[] = [];
    const updatesToProcess: Array<{ existing: any; d1Fields: any }> = [];

    for (const sl of sheetLeads) {
      const existingByLeadId = sl.id ? existingLeadMap.get(sl.id) : undefined;

      if (existingByLeadId) {
        const d1Fields = sheetLeadToD1Fields(sl);
        const needsUpdate = Object.entries(d1Fields).some(([key, val]) => {
          const current = existingByLeadId[key as keyof typeof existingByLeadId];
          return current !== val && val !== null;
        });
        if (needsUpdate) {
          updatesToProcess.push({ existing: existingByLeadId, d1Fields });
        }
        if (sl.phone) sheetPhoneToLeadId.set(sl.phone, existingByLeadId.leadId);
      } else {
        const candidateId = sl.id || generateLeadId(allLeadIds);
        allLeadIds.add(candidateId);

        newLeadsBatch.push({
          id: uuid(),
          leadId: candidateId,
          name: sl.name,
          email: sl.email,
          phone: sl.phone,
          account: sl.account,
          address: sl.address,
          brand: sl.brand,
          comments: sl.comments,
          socialTrading: sl.socialTrading,
          type: sl.type,
          originalDate: sl.originalDate,
          poi: sl.poi,
          leadStatus: null,
          attemptCount: 0,
          lastCalled: null,
          lastResponse: null,
          followUpDate: null,
          followUpTime: null,
          dnc: false,
          conversion: null,
          appointment: null,
          pendingSync: false,
          sheetRow: null,
          lastSyncedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        if (sl.phone) sheetPhoneToLeadId.set(sl.phone, candidateId);
      }
    }

    // Process updates in chunks
    for (const { existing, d1Fields } of updatesToProcess) {
      try {
        await db.update(leads).set({
          ...d1Fields,
          lastSyncedAt: timestamp,
          updatedAt: timestamp,
        }).where(eq(leads.id, existing.id));
        result.leadsUpdated++;
      } catch { result.errors++; }
    }

    // Process new inserts in batches of BATCH_SIZE
    for (let i = 0; i < newLeadsBatch.length; i += BATCH_SIZE) {
      const chunk = newLeadsBatch.slice(i, i + BATCH_SIZE);
      try {
        await db.batch(chunk.map((values) => db.insert(leads).values(values)));
        result.leadsAdded += chunk.length;
      } catch (err) {
        // If batch fails, try individually
        for (const values of chunk) {
          try {
            await db.insert(leads).values(values);
            result.leadsAdded++;
          } catch { result.errors++; }
        }
      }
    }

    // Batch: mark removed leads
    const sheetLeadIds = new Set(sheetLeads.map((l) => l.id));
    const removedUpdates = existingLeads
      .filter((e) => e.leadId && !sheetLeadIds.has(e.leadId))
      .map((e) => db.update(leads).set({ leadStatus: 'REMOVED', updatedAt: timestamp }).where(eq(leads.id, e.id)));
    result.leadsRemoved = removedUpdates.length;
    if (removedUpdates.length > 0) {
      try { await db.batch(removedUpdates); } catch { result.errors++; }
    }

    // Batch: mark DNC leads
    const dncPhones = new Set<string>();
    const dncEmails = new Set<string>();
    for (const r of sheetResponses) {
      if (r.response === 'Do Not Call (DNC)') {
        if (r.phone) dncPhones.add(r.phone);
        if (r.email) dncEmails.add(r.email);
      }
    }
    const dncUpdates = existingLeads
      .filter((e) => !e.dnc && ((e.phone && dncPhones.has(e.phone)) || (e.email && dncEmails.has(e.email))))
      .map((e) => db.update(leads).set({ dnc: true, updatedAt: timestamp }).where(eq(leads.id, e.id)));
    if (dncUpdates.length > 0) {
      try { await db.batch(dncUpdates); } catch { result.errors++; }
    }

    // Sync responses: Google Sheets → D1 (batched)
    const existingResponses = await db.select().from(responses);
    const existingResponseKeys = new Set(
      existingResponses.map((r) => `${r.phone}|${r.date}|${r.time}|${r.response}`)
    );

    const newResponsesBatch: any[] = [];
    for (const sr of sheetResponses) {
      const key = `${sr.phone}|${sr.date}|${sr.time}|${sr.response}`;
      if (!existingResponseKeys.has(key)) {
        const leadId = (sr.phone && sheetPhoneToLeadId.get(sr.phone)) || 'unknown';
        newResponsesBatch.push({
          id: uuid(),
          leadId,
          phone: sr.phone,
          email: sr.email,
          agentName: sr.agent,
          response: sr.response,
          notes: sr.notes,
          followUpDate: sr.followUpDate,
          followUpTime: sr.followUpTime,
          date: sr.date,
          time: sr.time,
          pendingSync: false,
          createdAt: timestamp,
        });
      }
    }

    // Insert responses in batches
    for (let i = 0; i < newResponsesBatch.length; i += BATCH_SIZE) {
      const chunk = newResponsesBatch.slice(i, i + BATCH_SIZE);
      try {
        await db.batch(chunk.map((values) => db.insert(responses).values(values)));
        result.responsesAdded += chunk.length;
      } catch {
        for (const values of chunk) {
          try {
            await db.insert(responses).values(values);
            result.responsesAdded++;
          } catch { result.errors++; }
        }
      }
    }

    // Count pending CRM → Sheet pushes
    const pendingLeads = await db.select({ count: leads.id }).from(leads).where(eq(leads.pendingSync, true));
    const pendingResponses = await db.select({ count: responses.id }).from(responses).where(eq(responses.pendingSync, true));
    result.pendingCrmToSheet = (pendingLeads.length || 0) + (pendingResponses.length || 0);

  } catch (err) {
    result.status = 'ERROR';
    result.errorMessage = err instanceof Error ? err.message : 'Unknown sync error';
    result.errors++;
  }

  await updateSyncState(db, result);
  return result;
}

async function updateSyncState(db: ReturnType<typeof createDB>, result: SyncResult): Promise<void> {
  const timestamp = now();
  const stateEntries = [
    { key: 'last_sync_result', value: JSON.stringify(result), updatedAt: timestamp },
    { key: 'last_sync_timestamp', value: result.timestamp, updatedAt: timestamp },
    { key: 'last_sync_status', value: result.status, updatedAt: timestamp },
    { key: 'leads_checked', value: String(result.leadsChecked), updatedAt: timestamp },
    { key: 'leads_added', value: String(result.leadsAdded), updatedAt: timestamp },
    { key: 'leads_updated', value: String(result.leadsUpdated), updatedAt: timestamp },
    { key: 'leads_removed', value: String(result.leadsRemoved), updatedAt: timestamp },
    { key: 'responses_added', value: String(result.responsesAdded), updatedAt: timestamp },
    { key: 'pending_crm_to_sheet', value: String(result.pendingCrmToSheet), updatedAt: timestamp },
    { key: 'sync_errors', value: String(result.errors), updatedAt: timestamp },
    { key: 'sync_health', value: result.status, updatedAt: timestamp },
    { key: 'error_message', value: result.errorMessage || '', updatedAt: timestamp },
  ];

  for (const entry of stateEntries) {
    const existing = await db.select().from(syncState).where(eq(syncState.key, entry.key)).limit(1);
    if (existing[0]) {
      await db.update(syncState).set(entry).where(eq(syncState.key, entry.key));
    } else {
      await db.insert(syncState).values(entry);
    }
  }
}

export async function getSyncStatus(env: Bindings): Promise<Record<string, string>> {
  const db = createDB(env);
  const rows = await db.select().from(syncState);
  const status: Record<string, string> = {};
  for (const row of rows) {
    status[row.key] = row.value;
  }
  return status;
}
