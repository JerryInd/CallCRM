import { eq } from 'drizzle-orm';
import { settings } from './schema';
import { now } from '../lib/utils';

interface SheetEnv {
  GOOGLE_SPREADSHEET_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
}

// Seeds the Google Sheet settings from server-side env vars (Voroa), so the
// Sheet ID and service-account key never live in git, the browser, or the APK.
// Only fills keys that are absent — an admin re-connecting via POST
// /api/sheets/connect takes precedence from then on. No network calls.
export async function bootstrapSheetFromEnv(
  db: { select: any; insert: any },
  env: SheetEnv
): Promise<boolean> {
  const sid = env.GOOGLE_SPREADSHEET_ID?.trim();
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const pk = env.GOOGLE_PRIVATE_KEY?.trim();
  if (!sid || !email || !pk) return false;

  const url = `https://docs.google.com/spreadsheets/d/${sid}`;
  const serviceAccount = JSON.stringify({
    type: 'service_account',
    client_email: email,
    private_key: pk.replace(/\\n/g, '\n'),
  });
  const timestamp = now();

  const entries: Array<[string, string]> = [
    ['google_sheet_url', url],
    ['google_sheet_id', sid],
    ['google_service_account', serviceAccount],
  ];
  for (const [key, value] of entries) {
    const existing = await db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    if (!existing[0]) {
      await db.insert(settings).values({ key, value, updatedAt: timestamp });
    }
  }
  console.log('Google Sheet settings seeded from GOOGLE_* env vars');
  return true;
}
