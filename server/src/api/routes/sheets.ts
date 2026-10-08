import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDB } from '../db';
import { settings } from '../db/schema';
import { requireAuth, requireAdmin } from '../lib/auth';
import { now } from '../lib/utils';
import { Bindings } from '../types';
import { getAccessToken, getServiceAccountEmail } from '../lib/google-auth';
import { extractSpreadsheetId, getSheetInfo, readSheet } from '../lib/google-sheets';

const router = new Hono<{ Bindings: Bindings }>();

async function getSheetConfig(db: ReturnType<typeof createDB>) {
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

router.post('/connect', requireAuth, requireAdmin, async (c) => {
  const { url, serviceAccount } = await c.req.json<{ url: string; serviceAccount: string }>();
  if (!url || !serviceAccount) return c.json({ error: 'URL and Service Account required' }, 400);

  const db = createDB(c.env);
  const timestamp = now();

  try {
    const spreadsheetId = extractSpreadsheetId(url);
    const saEmail = getServiceAccountEmail(serviceAccount);
    const accessToken = await getAccessToken(serviceAccount);
    const info = await getSheetInfo(spreadsheetId, accessToken);
    const firstSheet = info.sheets?.[0]?.properties?.title || 'Super Lead';

    await db.insert(settings).values({ key: 'google_sheet_url', value: url, updatedAt: timestamp })
      .onConflictDoUpdate({ target: settings.key, set: { value: url, updatedAt: timestamp } });
    await db.insert(settings).values({ key: 'google_sheet_id', value: spreadsheetId, updatedAt: timestamp })
      .onConflictDoUpdate({ target: settings.key, set: { value: spreadsheetId, updatedAt: timestamp } });
    await db.insert(settings).values({ key: 'google_service_account', value: serviceAccount, updatedAt: timestamp })
      .onConflictDoUpdate({ target: settings.key, set: { value: serviceAccount, updatedAt: timestamp } });
    await db.insert(settings).values({ key: 'google_sheet_name', value: firstSheet, updatedAt: timestamp })
      .onConflictDoUpdate({ target: settings.key, set: { value: firstSheet, updatedAt: timestamp } });

    return c.json({ success: true, title: info.properties?.title, sheets: info.sheets?.map((s) => s.properties?.title), serviceAccountEmail: saEmail });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Connection failed' }, 400);
  }
});

router.get('/status', requireAuth, requireAdmin, async (c) => {
  const db = createDB(c.env);
  const urlRow = await db.select().from(settings).where(eq(settings.key, 'google_sheet_url')).limit(1);
  const saRow = await db.select().from(settings).where(eq(settings.key, 'google_service_account')).limit(1);
  let saEmail: string | null = null;
  if (saRow[0]) { try { saEmail = getServiceAccountEmail(saRow[0].value); } catch {} }
  return c.json({ connected: !!urlRow[0] && !!saRow[0], url: urlRow[0]?.value || null, serviceAccountEmail: saEmail });
});

router.get('/preview', requireAuth, requireAdmin, async (c) => {
  const db = createDB(c.env);
  const ss = await getSheetConfig(db);
  if (!ss) return c.json({ error: 'Not connected' }, 400);
  const data = await readSheet(ss.spreadsheetId, ss.sheetName, ss.accessToken);
  const rows = (data.values || []).slice(0, 6);
  return c.json({ headers: rows[0] || [], sample: rows.slice(1) });
});

export default router;
