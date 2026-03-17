import { google } from 'googleapis';
import { getEnv } from './env';

let sheetsClient = null;
const LOG_SHEET_NAME = 'Moderation Log';
const LEGACY_SHEET_NAME = 'Instagram Log';
let logSheetReady = false;

function getSheetHeaders() {
  return [[
    'Timestamp', 'Type', 'Username', 'Incoming Message', 'Response',
    'Action', 'Category', 'Reason', 'Confidence', 'Severity',
    'Triggers', 'Needs Review',
  ]];
}

export function getSpreadsheetId() {
  return getEnv('GOOGLE_SHEET_ID');
}

export function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  // Support both patterns:
  // 1. GOOGLE_SERVICE_ACCOUNT_JSON (single JSON blob — same as cancel bot)
  // 2. Separate GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
  let credentials;
  const serviceAccountJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  const serviceAccountEmail = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = getEnv('GOOGLE_PRIVATE_KEY');

  if (serviceAccountJson) {
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch (err) {
      console.error('[Sheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
      return null;
    }
  } else if (serviceAccountEmail && privateKey) {
    credentials = {
      client_email: serviceAccountEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  } else {
    console.warn('[Sheets] No Google credentials configured');
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// ─── Log activity to Google Sheets ──────────────────────────
// Columns: Timestamp | Type | Username | Incoming Message | Response | Action |
//          Category | Reason | Confidence | Severity | Triggers | Needs Review
export async function logToSheet(data) {
  const sheetId = getSpreadsheetId();
  if (!sheetId) {
    console.warn('[Sheets] No GOOGLE_SHEET_ID configured — skipping log');
    return;
  }

  const sheets = getSheetsClient();
  if (!sheets) return;

  await ensureLogSheetReady(sheets, sheetId);

  const row = [
    data.timestamp || new Date().toISOString(),
    data.type || '',
    data.username || '',
    data.incomingMessage || '',
    data.response || '',
    data.action || '',
    data.category || '',
    data.reason || '',
    data.confidence || '',
    data.severity || '',
    data.triggers || '',
    data.needsReview || '',
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${LOG_SHEET_NAME}!A:L`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.error('[Sheets] Append failed:', err.message);
  }
}

// ─── Initialize sheet headers if empty ──────────────────────
export async function initSheetHeaders() {
  const sheetId = getSpreadsheetId();
  if (!sheetId) return;

  const sheets = getSheetsClient();
  if (!sheets) return;

  await ensureLogSheetReady(sheets, sheetId);
}

async function ensureLogSheetReady(sheets, sheetId) {
  if (logSheetReady) return;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${LOG_SHEET_NAME}!A1:L1`,
    });

    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${LOG_SHEET_NAME}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: getSheetHeaders(),
        },
      });
      console.log('[Sheets] Headers initialized');
    }
    logSheetReady = true;
  } catch (err) {
    if (!String(err.message || '').includes('Unable to parse range')) {
      console.error('[Sheets] Init headers failed:', err.message);
      return;
    }

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: LOG_SHEET_NAME,
              },
            },
          }],
        },
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${LOG_SHEET_NAME}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: getSheetHeaders(),
        },
      });

      logSheetReady = true;
      console.log('[Sheets] Created log sheet and initialized headers');
    } catch (createErr) {
      console.error('[Sheets] Failed to create log sheet:', createErr.message);
    }
  }
}

export async function getRecentLogRows(limit = 150) {
  const sheetId = getSpreadsheetId();
  if (!sheetId) return [];

  const sheets = getSheetsClient();
  if (!sheets) return [];

  // Read from both the current and legacy sheet names to preserve old data
  const allRows = [];
  for (const sheetName of [LOG_SHEET_NAME, LEGACY_SHEET_NAME]) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${sheetName}!A2:L`,
      });
      const rows = res.data.values || [];
      allRows.push(...rows);
    } catch {
      // Sheet may not exist — that's fine, skip it
    }
  }

  // Sort by timestamp descending and return the most recent entries
  allRows.sort((a, b) => {
    const ta = new Date(a[0] || 0).getTime();
    const tb = new Date(b[0] || 0).getTime();
    return tb - ta;
  });

  return allRows.slice(0, limit);
}

export async function getPersistentSpamCount({ type, username, windowDays = 30 }) {
  const normalizedType = String(type || '').trim().toUpperCase();
  const normalizedUsername = String(username || '').trim().replace(/^@/, '').toLowerCase();
  if (!normalizedType || !normalizedUsername) return 0;

  const sheetId = getSpreadsheetId();
  if (!sheetId) return 0;

  const sheets = getSheetsClient();
  if (!sheets) return 0;

  const cutoff = Date.now() - (Number(windowDays || 30) * 24 * 60 * 60 * 1000);
  let count = 0;

  for (const sheetName of [LOG_SHEET_NAME, LEGACY_SHEET_NAME]) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${sheetName}!A2:L`,
      });

      const rows = res.data.values || [];
      for (const row of rows) {
        const timestamp = new Date(row[0] || 0).getTime();
        const rowType = String(row[1] || '').trim().toUpperCase();
        const rowUsername = String(row[2] || '').trim().replace(/^@/, '').toLowerCase();
        const action = String(row[5] || '').trim().toLowerCase();

        if (Number.isNaN(timestamp) || timestamp < cutoff) continue;
        if (rowType !== normalizedType) continue;
        if (rowUsername !== normalizedUsername) continue;
        if (!action.includes('hide_auto_spam')) continue;

        count += 1;
      }
    } catch {
      // Sheet may not exist or be temporarily unavailable.
    }
  }

  return count;
}
