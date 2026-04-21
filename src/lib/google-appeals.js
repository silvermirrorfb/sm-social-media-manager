import { getEnv, hasEnv } from './env';
import { getSheetsClient, getSpreadsheetId } from './sheets';

export const GOOGLE_APPEAL_STATUSES = [
  'new',
  'drafting',
  'ready',
  'submitted',
  'restored',
  'denied',
  'no_response',
  'blocked',
  'not_appealing',
];

export const GOOGLE_APPEAL_PRIORITIES = ['high', 'normal', 'low'];

const DEFAULT_APPEALS_SHEET = 'Google Review Appeals Queue';
const DEFAULT_SNAPSHOTS_SHEET = 'Google Review Snapshots';

const APPEAL_HEADERS = [
  'Review ID',
  'Location ID',
  'Location Name',
  'Reviewer Name',
  'Star Rating',
  'Review Text',
  'Review Date',
  'Disappeared At',
  'Status',
  'Priority',
  'Suggested Appeal',
  'Submitted At',
  'Outcome',
  'Outcome Date',
  'Operator Note',
];

const SNAPSHOT_HEADERS = [
  'Location ID',
  'Review ID',
  'Reviewer Name',
  'Star Rating',
  'Review Text',
  'Review Date',
  'Snapshot Taken At',
];

const APPEAL_RANGE_END_COL = 'O';
const SNAPSHOT_RANGE_END_COL = 'G';
const SNAPSHOT_TEXT_MAX_CHARS = 500;
const SNAPSHOT_RETENTION_MS = 48 * 60 * 60 * 1000;

function getAppealsSheetName() {
  return getEnv('GOOGLE_APPEALS_SHEET_NAME') || DEFAULT_APPEALS_SHEET;
}

function getSnapshotsSheetName() {
  return getEnv('GOOGLE_SNAPSHOTS_SHEET_NAME') || DEFAULT_SNAPSHOTS_SHEET;
}

function quoteSheetName(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

function getAppealsRange(cellRange) {
  return `${quoteSheetName(getAppealsSheetName())}!${cellRange}`;
}

function getSnapshotsRange(cellRange) {
  return `${quoteSheetName(getSnapshotsSheetName())}!${cellRange}`;
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

function truncateText(value, maxChars) {
  const text = normalizeString(value);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function toAppealTaskFromRow(row = [], rowIndex) {
  const [
    reviewId = '',
    locationId = '',
    locationName = '',
    reviewerName = '',
    starRating = '',
    reviewText = '',
    reviewDate = '',
    disappearedAt = '',
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
    starRating: starRating === '' ? '' : Number(starRating) || starRating,
    reviewText,
    reviewDate,
    disappearedAt,
    status,
    priority,
    suggestedAppeal,
    submittedAt,
    outcome,
    outcomeDate,
    operatorNote,
  };
}

function toAppealRowFromTask(task) {
  return [
    task.reviewId || '',
    task.locationId || '',
    task.locationName || '',
    task.reviewerName || '',
    toStarRating(task.starRating),
    task.reviewText || '',
    task.reviewDate || '',
    task.disappearedAt || '',
    task.status || 'new',
    task.priority || 'normal',
    task.suggestedAppeal || '',
    task.submittedAt || '',
    task.outcome || '',
    task.outcomeDate || '',
    task.operatorNote || '',
  ];
}

function toSnapshotRowFromReview(locationId, review, takenAt) {
  return [
    locationId || '',
    review.reviewId || '',
    review.reviewerName || '',
    toStarRating(review.rating),
    truncateText(review.text, SNAPSHOT_TEXT_MAX_CHARS),
    review.date || '',
    takenAt,
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

export async function getGoogleAppealsConfig() {
  const issues = getConfigIssues();

  return {
    ready: issues.length === 0,
    issues,
    sheetName: getAppealsSheetName(),
    snapshotsSheetName: getSnapshotsSheetName(),
    mode: 'human_in_loop',
  };
}

async function ensureSheetTabsExist(sheets, spreadsheetId, desiredTitles) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });

  const existingTitles = (metadata.data.sheets || [])
    .map((sheet) => sheet.properties?.title)
    .filter(Boolean);

  const missing = desiredTitles.filter((title) => !existingTitles.includes(title));
  if (missing.length === 0) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: missing.map((title) => ({
        addSheet: {
          properties: { title },
        },
      })),
    },
  });
}

async function ensureSheetHeaders(sheets, spreadsheetId, range, headers) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const existing = res.data.values?.[0] || [];
  const matches = headers.every((header, index) => existing[index] === header);
  if (matches) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers],
    },
  });
}

async function ensureGoogleAppealsSheet() {
  const config = await getGoogleAppealsConfig();
  if (!config.ready) return config;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  await ensureSheetTabsExist(sheets, spreadsheetId, [
    getAppealsSheetName(),
    getSnapshotsSheetName(),
  ]);

  await ensureSheetHeaders(
    sheets,
    spreadsheetId,
    getAppealsRange(`A1:${APPEAL_RANGE_END_COL}1`),
    APPEAL_HEADERS
  );

  await ensureSheetHeaders(
    sheets,
    spreadsheetId,
    getSnapshotsRange(`A1:${SNAPSHOT_RANGE_END_COL}1`),
    SNAPSHOT_HEADERS
  );

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

export async function listGoogleAppeals(filters = {}) {
  const config = await ensureGoogleAppealsSheet();
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
    range: getAppealsRange(`A2:${APPEAL_RANGE_END_COL}`),
  });

  const allTasks = (res.data.values || [])
    .map((row, index) => toAppealTaskFromRow(row, index + 2))
    .filter((task) => task.reviewId);

  const tasks = allTasks
    .filter((task) => matchesFilter(task, filters))
    .sort((left, right) => {
      const leftTime = Date.parse(left.disappearedAt || 0);
      const rightTime = Date.parse(right.disappearedAt || 0);
      return rightTime - leftTime;
    });

  return {
    ...config,
    tasks,
  };
}

export async function getGoogleAppeal(reviewId) {
  if (!reviewId) return null;

  const listed = await listGoogleAppeals();
  if (!listed.ready) return null;

  return listed.tasks.find((task) => task.reviewId === reviewId) || null;
}

function normalizeAppealShape(input = {}, existing = null) {
  const now = new Date().toISOString();
  const merged = { ...(existing || {}), ...input };

  const status = GOOGLE_APPEAL_STATUSES.includes(merged.status) ? merged.status : 'new';
  const priority = GOOGLE_APPEAL_PRIORITIES.includes(merged.priority) ? merged.priority : 'normal';

  return {
    reviewId: normalizeString(merged.reviewId),
    locationId: normalizeString(merged.locationId),
    locationName: normalizeString(merged.locationName),
    reviewerName: normalizeString(merged.reviewerName),
    starRating:
      merged.starRating === '' || merged.starRating === null || merged.starRating === undefined
        ? ''
        : Number(merged.starRating) || '',
    reviewText: normalizeString(merged.reviewText),
    reviewDate: normalizeString(merged.reviewDate),
    disappearedAt: normalizeString(merged.disappearedAt) || now,
    status,
    priority,
    suggestedAppeal: normalizeString(merged.suggestedAppeal),
    submittedAt: normalizeString(merged.submittedAt),
    outcome: normalizeString(merged.outcome),
    outcomeDate: normalizeString(merged.outcomeDate),
    operatorNote: normalizeString(merged.operatorNote),
  };
}

export async function upsertGoogleAppeal(task = {}) {
  const config = await ensureGoogleAppealsSheet();
  if (!config.ready) {
    throw new Error(config.issues.join(', '));
  }

  if (!task.reviewId) {
    throw new Error('reviewId is required for upsertGoogleAppeal');
  }

  const existing = await getGoogleAppeal(task.reviewId);
  const normalized = normalizeAppealShape(task, existing);

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: getAppealsRange(`A${existing.rowIndex}:${APPEAL_RANGE_END_COL}${existing.rowIndex}`),
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [toAppealRowFromTask(normalized)],
      },
    });
    return { ...normalized, rowIndex: existing.rowIndex };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: getAppealsRange(`A:${APPEAL_RANGE_END_COL}`),
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [toAppealRowFromTask(normalized)],
    },
  });

  return normalized;
}

export async function updateGoogleAppeal(reviewId, patch = {}) {
  if (!reviewId) {
    throw new Error('reviewId is required for updateGoogleAppeal');
  }

  const existing = await getGoogleAppeal(reviewId);
  if (!existing) {
    throw new Error(`Google appeal not found: ${reviewId}`);
  }

  const next = { ...existing };

  const mergeKeys = [
    'locationId',
    'locationName',
    'reviewerName',
    'starRating',
    'reviewText',
    'reviewDate',
    'disappearedAt',
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

  const normalized = normalizeAppealShape(next, existing);

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: getAppealsRange(`A${existing.rowIndex}:${APPEAL_RANGE_END_COL}${existing.rowIndex}`),
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [toAppealRowFromTask(normalized)],
    },
  });

  return { ...normalized, rowIndex: existing.rowIndex };
}

function toSnapshotReviewFromRow(row = []) {
  const [
    locationId = '',
    reviewId = '',
    reviewerName = '',
    starRating = '',
    reviewText = '',
    reviewDate = '',
    snapshotTakenAt = '',
  ] = row;

  return {
    locationId,
    reviewId,
    reviewerName,
    rating: starRating === '' ? null : Number(starRating) || null,
    text: reviewText,
    date: reviewDate,
    snapshotTakenAt,
  };
}

async function readAllSnapshotRows() {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: getSnapshotsRange(`A2:${SNAPSHOT_RANGE_END_COL}`),
  });

  const rows = res.data.values || [];
  return rows.map((row, index) => ({
    rowIndex: index + 2,
    review: toSnapshotReviewFromRow(row),
  }));
}

export async function getLatestSnapshot(locationId) {
  if (!locationId) return [];

  const config = await ensureGoogleAppealsSheet();
  if (!config.ready) return [];

  const rows = await readAllSnapshotRows();
  const locationRows = rows.filter(
    ({ review }) => review.locationId === locationId && review.reviewId
  );

  if (locationRows.length === 0) return [];

  let latestKey = '';
  for (const { review } of locationRows) {
    if (review.snapshotTakenAt && review.snapshotTakenAt > latestKey) {
      latestKey = review.snapshotTakenAt;
    }
  }

  if (!latestKey) return [];

  return locationRows
    .filter(({ review }) => review.snapshotTakenAt === latestKey)
    .map(({ review }) => ({
      reviewId: review.reviewId,
      reviewerName: review.reviewerName,
      rating: review.rating,
      text: review.text,
      date: review.date,
    }));
}

async function clearSnapshotRows(rowIndices) {
  if (!rowIndices.length) return;

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const sorted = [...rowIndices].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push([start, end]);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push([start, end]);

  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: {
      ranges: ranges.map(([s, e]) => getSnapshotsRange(`A${s}:${SNAPSHOT_RANGE_END_COL}${e}`)),
    },
  });
}

export async function writeSnapshot(locationId, reviews = []) {
  if (!locationId) {
    throw new Error('locationId is required for writeSnapshot');
  }

  const config = await ensureGoogleAppealsSheet();
  if (!config.ready) {
    throw new Error(config.issues.join(', '));
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const takenAt = new Date().toISOString();

  if (reviews.length > 0) {
    const rowsToAppend = reviews
      .filter((review) => review && review.reviewId)
      .map((review) => toSnapshotRowFromReview(locationId, review, takenAt));

    if (rowsToAppend.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: getSnapshotsRange(`A:${SNAPSHOT_RANGE_END_COL}`),
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: rowsToAppend,
        },
      });
    }
  }

  const cutoffMs = Date.now() - SNAPSHOT_RETENTION_MS;
  const allRows = await readAllSnapshotRows();
  const staleRowIndices = allRows
    .filter(({ review }) => {
      if (review.locationId !== locationId) return false;
      const parsed = Date.parse(review.snapshotTakenAt || '');
      if (!Number.isFinite(parsed)) return false;
      return parsed < cutoffMs;
    })
    .map(({ rowIndex }) => rowIndex);

  if (staleRowIndices.length > 0) {
    await clearSnapshotRows(staleRowIndices);
  }

  return {
    ok: true,
    locationId,
    takenAt,
    writtenCount: reviews.length,
    prunedCount: staleRowIndices.length,
  };
}
