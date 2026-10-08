import { createDB } from '../db';
import { settings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getAccessToken } from './google-auth';
import { extractSpreadsheetId, readSheet, appendSheetRows, ensureSheetTab } from './google-sheets';

interface SheetSettings {
  spreadsheetId: string;
  accessToken: string;
  sheetName: string;
}

export interface SheetLead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  account: string | null;
  address: string | null;
  brand: string | null;
  comments: string | null;
  socialTrading: string | null;
  type: string | null;
  originalDate: string | null;
  poi: string | null;
}

export interface SheetResponse {
  date: string;
  time: string;
  agent: string;
  leadName: string;
  phone: string;
  email: string;
  account: string;
  response: string;
  notes: string;
  followUpDate: string;
  followUpTime: string;
}

function phoneToId(phone: string): string {
  let hash = 0;
  for (let i = 0; i < phone.length; i++) {
    hash = ((hash << 5) - hash + phone.charCodeAt(i)) | 0;
  }
  return `sheet_${Math.abs(hash).toString(36)}`;
}

export async function getSheetSettings(db: ReturnType<typeof createDB>): Promise<SheetSettings | null> {
  const urlRow = await db.select().from(settings).where(eq(settings.key, 'google_sheet_url')).limit(1);
  const saRow = await db.select().from(settings).where(eq(settings.key, 'google_service_account')).limit(1);
  const sheetNameRow = await db.select().from(settings).where(eq(settings.key, 'google_sheet_name')).limit(1);
  if (!urlRow[0] || !saRow[0]) return null;
  const accessToken = await getAccessToken(saRow[0].value);
  return {
    spreadsheetId: extractSpreadsheetId(urlRow[0].value),
    accessToken,
    sheetName: sheetNameRow[0]?.value || 'Super Lead',
  };
}

export async function readLeadsFromSheet(ss: SheetSettings): Promise<SheetLead[]> {
  const data = await readSheet(ss.spreadsheetId, ss.sheetName, ss.accessToken);
  const rows = data.values || [];
  if (rows.length < 2) return [];

  const headers = rows[0].map((h: string) => h.toLowerCase().trim());
  const crmFields = ['name', 'email', 'phone', 'account', 'address', 'brand', 'comments', 'social_trading', 'type', 'original_date', 'poi'];
  const fieldMap: Record<string, number> = {};
  for (const field of crmFields) {
    const idx = headers.findIndex((h: string) => h === field || h === field.replace(/_/g, ' ') || h === field.replace(/_/g, ''));
    if (idx !== -1) fieldMap[field] = idx;
  }

  const result: SheetLead[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const get = (f: string) => { const idx = fieldMap[f]; return idx !== undefined ? (row[idx] || null) : null; };
    const phone = get('phone');
    const email = get('email');
    const name = get('name');
    if (!name && !email && !phone) continue;

    result.push({
      id: phone ? `${phoneToId(phone)}_${i}` : `row_${i}`,
      name, email, phone,
      account: get('account'), address: get('address'), brand: get('brand'),
      comments: get('comments'), socialTrading: get('social_trading'),
      type: get('type'), originalDate: get('original_date'), poi: get('poi'),
    });
  }
  return result;
}

export async function readResponsesFromSheet(ss: SheetSettings): Promise<SheetResponse[]> {
  let data;
  try { data = await readSheet(ss.spreadsheetId, 'Responses', ss.accessToken); } catch { return []; }
  const rows = data.values || [];
  if (rows.length < 2) return [];
  return rows.slice(1).map((row) => ({
    date: row[0] || '', time: row[1] || '', agent: row[2] || '',
    leadName: row[3] || '', phone: row[4] || '', email: row[5] || '',
    account: row[6] || '', response: row[7] || '', notes: row[8] || '',
    followUpDate: row[9] || '', followUpTime: row[10] || '',
  }));
}

export interface SheetAuditEntry {
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export async function readAuditFromSheet(ss: SheetSettings): Promise<SheetAuditEntry[]> {
  let data;
  try { data = await readSheet(ss.spreadsheetId, 'Audit', ss.accessToken); } catch { return []; }
  const rows = data.values || [];
  if (rows.length < 2) return [];
  return rows.slice(1).reverse().map((row) => ({
    timestamp: row[0] || '',
    user: row[1] || '',
    action: row[2] || '',
    details: row[3] || '',
  }));
}

export async function appendAuditToSheet(
  ss: SheetSettings,
  timestamp: string,
  user: string,
  action: string,
  details: string,
): Promise<void> {
  await ensureSheetTab(ss.spreadsheetId, 'Audit', ss.accessToken);

  let hasHeaders = false;
  try {
    const existing = await readSheet(ss.spreadsheetId, 'Audit', ss.accessToken);
    if (existing.values && existing.values.length > 0) hasHeaders = true;
  } catch {}

  if (!hasHeaders) {
    await appendSheetRows(ss.spreadsheetId, 'Audit', [
      ['Timestamp', 'User', 'Action', 'Details'],
    ], ss.accessToken);
  }

  await appendSheetRows(ss.spreadsheetId, 'Audit', [
    [timestamp, user, action, details || ''],
  ], ss.accessToken);
}

export async function submitResponseToSheet(
  ss: SheetSettings,
  leadData: { name: string; phone: string; email: string; account: string },
  response: string,
  notes: string,
  agentName: string,
  followUpDate?: string,
  followUpTime?: string,
): Promise<void> {
  await ensureSheetTab(ss.spreadsheetId, 'Responses', ss.accessToken);

  let hasHeaders = false;
  try {
    const existing = await readSheet(ss.spreadsheetId, 'Responses', ss.accessToken);
    if (existing.values && existing.values.length > 0) hasHeaders = true;
  } catch {}

  if (!hasHeaders) {
    await appendSheetRows(ss.spreadsheetId, 'Responses', [
      ['Date', 'Time', 'Agent', 'Lead Name', 'Phone', 'Email', 'Account', 'Response', 'Notes', 'Follow-up Date', 'Follow-up Time'],
    ], ss.accessToken);
  }

  const now = new Date();
  const row = [
    now.toLocaleDateString(), now.toLocaleTimeString(), agentName,
    leadData.name, leadData.phone, leadData.email, leadData.account,
    response, notes || '', followUpDate || '', followUpTime || '',
  ];

  await appendSheetRows(ss.spreadsheetId, 'Responses', [row], ss.accessToken);
}
