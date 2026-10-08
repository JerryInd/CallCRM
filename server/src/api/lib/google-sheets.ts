export interface SheetValues { values?: string[][] }
export interface SheetInfo {
  properties?: { title?: string };
  sheets?: Array<{ properties?: { title?: string } }>;
}

export function extractSpreadsheetId(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('Invalid Google Sheets URL');
  return match[1];
}

async function authedFetch(url: string, options: RequestInit, accessToken: string): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...options, headers });
}

export async function getSheetInfo(spreadsheetId: string, accessToken: string): Promise<SheetInfo> {
  const res = await authedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    {},
    accessToken
  );
  if (!res.ok) throw new Error(`Cannot access sheet: ${res.status}`);
  return res.json() as Promise<SheetInfo>;
}

function quoteSheetName(name: string): string {
  if (/^[A-Za-z0-9_]+$/.test(name)) return name;
  return `'${name}'`;
}

export async function readSheet(spreadsheetId: string, sheetName: string, accessToken: string, range?: string): Promise<SheetValues> {
  const sheetRange = range || `${quoteSheetName(sheetName)}!A:AZ`;
  const res = await authedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetRange)}`,
    {},
    accessToken
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cannot read sheet: ${res.status} ${err}`);
  }
  return res.json() as Promise<SheetValues>;
}

export async function updateSheetCells(spreadsheetId: string, range: string, values: string[][], accessToken: string) {
  const res = await authedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    },
    accessToken
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Update failed: ${err}`);
  }
  return res.json();
}

export async function appendSheetRows(spreadsheetId: string, sheetName: string, rows: string[][], accessToken: string) {
  const range = `${quoteSheetName(sheetName)}!A:AZ`;
  const res = await authedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    },
    accessToken
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Append failed: ${res.status} ${err}`);
  }
  return res.json();
}

export async function findRowByValue(spreadsheetId: string, sheetName: string, searchCol: number, searchValue: string, accessToken: string): Promise<number | null> {
  const data = await readSheet(spreadsheetId, sheetName, accessToken);
  const rows = data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][searchCol] === searchValue) {
      return i + 1;
    }
  }
  return null;
}

export async function sheetTabExists(spreadsheetId: string, sheetName: string, accessToken: string): Promise<boolean> {
  const info = await getSheetInfo(spreadsheetId, accessToken);
  const tabs = info.sheets || [];
  return tabs.some((s) => s.properties?.title === sheetName);
}

export async function createSheetTab(spreadsheetId: string, sheetName: string, accessToken: string): Promise<void> {
  const res = await authedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: { title: sheetName },
          },
        }],
      }),
    },
    accessToken
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create sheet tab: ${res.status} ${err}`);
  }
}

export async function ensureSheetTab(spreadsheetId: string, sheetName: string, accessToken: string): Promise<void> {
  const exists = await sheetTabExists(spreadsheetId, sheetName, accessToken);
  if (!exists) {
    await createSheetTab(spreadsheetId, sheetName, accessToken);
  }
}
