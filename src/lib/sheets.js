import { google } from 'googleapis';
import { getEnv } from './env';

let sheetsClient = null;
const LOG_SHEET_NAME = 'Instagram Log';
let logSheetReady = false;

function getSheetHeaders() {
  return [[
    'Timestamp', 'Type', 'Username', 'Incoming Message', 'Response',
    'Action', 'Category', 'Reason', 'Confidence', 'Severity',
    'Triggers', 'Needs Review',
  ]];
}

function getSheetsClient() {
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
  const sheetId = getEnv('GOOGLE_SHEET_ID');
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
  const sheetId = getEnv('GOOGLE_SHEET_ID');
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
  const sheetId = getEnv('GOOGLE_SHEET_ID');
  if (!sheetId) return [];

  const sheets = getSheetsClient();
  if (!sheets) return [];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${LOG_SHEET_NAME}!A2:L`,
    });

    const rows = res.data.values || [];
    return rows.slice(-limit).reverse();
  } catch (err) {
    console.error('[Sheets] Read logs failed:', err.message);
    return [];
  }
}
