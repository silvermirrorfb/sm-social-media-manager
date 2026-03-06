import { google } from 'googleapis';

let sheetsClient = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// ─── Log activity to Google Sheets ──────────────────────────
// Columns: Timestamp | Type | Username | Incoming Message | Response | Action | Category | Reason
export async function logToSheet(data) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    console.warn('[Sheets] No GOOGLE_SHEET_ID configured — skipping log');
    return;
  }

  const sheets = getSheetsClient();
  const row = [
    data.timestamp || new Date().toISOString(),
    data.type || '',
    data.username || '',
    data.incomingMessage || '',
    data.response || '',
    data.action || '',
    data.category || '',
    data.reason || '',
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Instagram Log!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.error('[Sheets] Append failed:', err.message);
  }
}

// ─── Initialize sheet headers if empty ──────────────────────
export async function initSheetHeaders() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return;

  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Instagram Log!A1:H1',
    });

    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Instagram Log!A1:H1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Timestamp', 'Type', 'Username', 'Incoming Message', 'Response', 'Action', 'Category', 'Reason']],
        },
      });
      console.log('[Sheets] Headers initialized');
    }
  } catch (err) {
    console.error('[Sheets] Init headers failed:', err.message);
  }
}
