import { getEnv, hasEnv } from './env';
import { getSheetsClient, getSpreadsheetId } from './sheets';

export const YELP_APPEAL_STATUSES = [
  'new',
  'drafting',
  'ready',
  'submitted',
  'restored',
  'denied',
  'no_response',
  'blocked',
];

export const YELP_APPEAL_PRIORITIES = ['high', 'normal', 'low'];

const DEFAULT_SHEET_NAME = 'Yelp Appeals Queue';

const HEADERS = [
  'Review ID',
  'Location ID',
  'Location Name',
  'Reviewer Name',
  'Reviewer Profile URL',
  'Star Rating',
  'Review Text',
  'Review Date',
  'Review URL',
  'Detected At',
  'Status',
  'Priority',
  'Suggested Appeal',
  'Submitted At',
  'Outcome',
  'Outcome Date',
  'Operator Note',
];

const RANGE_END_COL = 'Q';

function getQueueSheetName() {
  return getEnv('YELP_APPEALS_SHEET_NAME') || DEFAULT_SHEET_NAME;
}

function quoteSheetName(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

function getSheetRange(cellRange) {
  return `${quoteSheetName(getQueueSheetName())}!${cellRange}`;
}

function normalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function toStarRating(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return String(parsed);
}

function toTaskFromRow(row = [], rowIndex) {
  const [
    reviewId = '',
    locationId = '',
    locationName = '',
    reviewerName = '',
    reviewerProfileUrl = '',
    starRating = '',
    reviewText = '',
    reviewDate = '',
    reviewUrl = '',
    detectedAt = '',
    status = 'new',
    priority = 'normal',
    suggestedAppeal = '',
    submittedAt = '',
    outcome = '',
    outcomeDate = '',
    operatorNote = '',
  ] = row;

  return {
    rowIndex,
    reviewId,
    locationId,
    locationName,
    reviewerName,
    reviewerProfileUrl,
    starRating: starRating === '' ? '' : Number(starRating) || starRating,
    reviewText,
    reviewDate,
    reviewUrl,
    detectedAt,
    status,
    priority,
    suggestedAppeal,
    submittedAt,
    outcome,
    outcomeDate,
    operatorNote,
  };
}

function toRowFromTask(task) {
  return [
    task.reviewId || '',
    task.locationId || '',
    task.locationName || '',
    task.reviewerName || '',
    task.reviewerProfileUrl || '',
    toStarRating(task.starRating),
    task.reviewText || '',
    task.reviewDate || '',
    task.reviewUrl || '',
    task.detectedAt || '',
    task.status || 'new',
    task.priority || 'normal',
    task.suggestedAppeal || '',
    task.submittedAt || '',
    task.outcome || '',
    task.outcomeDate || '',
    task.operatorNote || '',
  ];
}

function getConfigIssues() {
  const issues = [];

  if (!getSpreadsheetId()) {
    issues.push('Missing GOOGLE_SHEET_ID');
  }

  const hasGoogleCreds =
    hasEnv('GOOGLE_SERVICE_ACCOUNT_JSON') ||
    (hasEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL') && hasEnv('GOOGLE_PRIVATE_KEY'));

  if (!hasGoogleCreds) {
    issues.push('Missing Google Sheets credentials');
  }

  return issues;
}

export async function getYelpAppealsConfig() {
  const issues = getConfigIssues();

  return {
    ready: issues.length === 0,
    issues,
    sheetName: getQueueSheetName(),
    mode: 'human_in_loop',
  };
}

async function ensureYelpAppealsSheet() {
  const config = await getYelpAppealsConfig();
  if (!config.ready) return config;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getQueueSheetName();

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });

  const existingTitles = (metadata.data.sheets || [])
    .map((sheet) => sheet.properties?.title)
    .filter(Boolean);

  if (!existingTitles.includes(sheetName)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: sheetName },
            },
          },
        ],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: getSheetRange(`A1:${RANGE_END_COL}1`),
  });

  const existingHeader = headerRes.data.values?.[0] || [];
  const headersMatch = HEADERS.every((header, index) => existingHeader[index] === header);

  if (!headersMatch) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: getSheetRange(`A1:${RANGE_END_COL}1`),
      valueInputOption: 'RAW',
      requestBody: {
        values: [HEADERS],
      },
    });
  }

  return config;
}

function matchesFilter(task, filters) {
  if (!filters) return true;

  if (filters.status) {
    const allowed = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (!allowed.includes(task.status)) return false;
  }

  if (filters.priority) {
    const allowed = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
    if (!allowed.includes(task.priority)) return false;
  }

  if (filters.locationId) {
    const allowed = Array.isArray(filters.locationId) ? filters.locationId : [filters.locationId];
    if (!allowed.includes(task.locationId)) return false;
  }

  return true;
}

export async function listYelpAppeals(filters = {}) {
  const config = await ensureYelpAppealsSheet();
  if (!config.ready) {
    return {
      ...config,
      tasks: [],
    };
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: getSheetRange(`A2:${RANGE_END_COL}`),
  });

  const allTasks = (res.data.values || [])
    .map((row, index) => toTaskFromRow(row, index + 2))
    .filter((task) => task.reviewId);

  const tasks = allTasks
    .filter((task) => matchesFilter(task, filters))
    .sort((left, right) => {
      const leftTime = Date.parse(left.detectedAt || 0);
      const rightTime = Date.parse(right.detectedAt || 0);
      return rightTime - leftTime;
    });

  return {
    ...config,
    tasks,
  };
}

export async function getYelpAppeal(reviewId) {
  if (!reviewId) return null;

  const listed = await listYelpAppeals();
  if (!listed.ready) return null;

  return listed.tasks.find((task) => task.reviewId === reviewId) || null;
}

function normalizeTaskShape(input = {}, existing = null) {
  const now = new Date().toISOString();
  const merged = { ...(existing || {}), ...input };

  const status = YELP_APPEAL_STATUSES.includes(merged.status) ? merged.status : 'new';
  const priority = YELP_APPEAL_PRIORITIES.includes(merged.priority) ? merged.priority : 'normal';

  return {
    reviewId: normalizeString(merged.reviewId),
    locationId: normalizeString(merged.locationId),
    locationName: normalizeString(merged.locationName),
    reviewerName: normalizeString(merged.reviewerName),
    reviewerProfileUrl: normalizeString(merged.reviewerProfileUrl),
    starRating: merged.starRating === '' || merged.starRating === null || merged.starRating === undefined
      ? ''
      : Number(merged.starRating) || '',
    reviewText: normalizeString(merged.reviewText),
    reviewDate: normalizeString(merged.reviewDate),
    reviewUrl: normalizeString(merged.reviewUrl),
    detectedAt: normalizeString(merged.detectedAt) || now,
    status,
    priority,
    suggestedAppeal: normalizeString(merged.suggestedAppeal),
    submittedAt: normalizeString(merged.submittedAt),
    outcome: normalizeString(merged.outcome),
    outcomeDate: normalizeString(merged.outcomeDate),
    operatorNote: normalizeString(merged.operatorNote),
  };
}

export async function upsertYelpAppeal(task = {}) {
  const config = await ensureYelpAppealsSheet();
  if (!config.ready) {
    throw new Error(config.issues.join(', '));
  }

  if (!task.reviewId) {
    throw new Error('reviewId is required for upsertYelpAppeal');
  }

  const existing = await getYelpAppeal(task.reviewId);
  const normalized = normalizeTaskShape(task, existing);

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: getSheetRange(`A${existing.rowIndex}:${RANGE_END_COL}${existing.rowIndex}`),
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [toRowFromTask(normalized)],
      },
    });
    return { ...normalized, rowIndex: existing.rowIndex };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: getSheetRange(`A:${RANGE_END_COL}`),
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [toRowFromTask(normalized)],
    },
  });

  return normalized;
}

export async function updateYelpAppeal(reviewId, patch = {}) {
  if (!reviewId) {
    throw new Error('reviewId is required for updateYelpAppeal');
  }

  const existing = await getYelpAppeal(reviewId);
  if (!existing) {
    throw new Error(`Yelp appeal not found: ${reviewId}`);
  }

  const next = { ...existing };

  const mergeKeys = [
    'locationId',
    'locationName',
    'reviewerName',
    'reviewerProfileUrl',
    'starRating',
    'reviewText',
    'reviewDate',
    'reviewUrl',
    'detectedAt',
    'status',
    'priority',
    'suggestedAppeal',
    'submittedAt',
    'outcome',
    'outcomeDate',
    'operatorNote',
  ];

  for (const key of mergeKeys) {
    if (hasOwn(patch, key)) {
      next[key] = patch[key];
    }
  }

  next.reviewId = existing.reviewId;

  const normalized = normalizeTaskShape(next, existing);

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: getSheetRange(`A${existing.rowIndex}:${RANGE_END_COL}${existing.rowIndex}`),
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [toRowFromTask(normalized)],
    },
  });

  return { ...normalized, rowIndex: existing.rowIndex };
}
