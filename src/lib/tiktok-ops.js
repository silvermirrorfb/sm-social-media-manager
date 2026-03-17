import { getEnv, hasEnv } from './env';
import { getSheetsClient, getSpreadsheetId } from './sheets';

export const TIKTOK_WORKFLOWS = [
  'inbound_dm',
  'influencer_dm',
  'comment_review',
];

export const TIKTOK_STATUSES = [
  'new',
  'drafting',
  'ready',
  'done',
  'blocked',
];

export const TIKTOK_PRIORITIES = [
  'high',
  'normal',
  'low',
];

const DEFAULT_SHEET_NAME = 'TikTok Ops Queue';
const HEADERS = [
  'Task ID',
  'Workflow',
  'Status',
  'Priority',
  'Handle',
  'Author',
  'Message',
  'Suggested Reply',
  'Suggested Action',
  'Action URL',
  'Assigned To',
  'Created At',
  'Updated At',
  'Last Operator Note',
  'Human Login Required',
  'Outcome',
];

function getQueueSheetName() {
  return getEnv('TIKTOK_OPS_SHEET_NAME') || DEFAULT_SHEET_NAME;
}

function quoteSheetName(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

function getSheetRange(cellRange) {
  return `${quoteSheetName(getQueueSheetName())}!${cellRange}`;
}

function normalizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function toTaskId() {
  return `tt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultSuggestedAction(workflow) {
  switch (workflow) {
    case 'influencer_dm':
      return 'Open the TikTok profile, confirm fit, then send outreach manually.';
    case 'comment_review':
      return 'Open the comment thread in TikTok, confirm context, then remove/hide/report manually.';
    case 'inbound_dm':
    default:
      return 'Open the TikTok inbox, review the draft, then send the reply manually.';
  }
}

function toTaskFromRow(row = [], rowIndex) {
  const [
    taskId = '',
    workflow = 'inbound_dm',
    status = 'new',
    priority = 'normal',
    handle = '',
    author = '',
    message = '',
    suggestedReply = '',
    suggestedAction = '',
    actionUrl = '',
    assignedTo = '',
    createdAt = '',
    updatedAt = '',
    note = '',
    humanLoginRequired = 'yes',
    outcome = '',
  ] = row;

  return {
    rowIndex,
    taskId,
    workflow,
    status,
    priority,
    handle,
    author,
    message,
    suggestedReply,
    suggestedAction,
    actionUrl,
    assignedTo,
    createdAt,
    updatedAt,
    note,
    humanLoginRequired,
    outcome,
  };
}

function toRowFromTask(task) {
  return [
    task.taskId,
    task.workflow,
    task.status,
    task.priority,
    task.handle,
    task.author,
    task.message,
    task.suggestedReply,
    task.suggestedAction,
    task.actionUrl,
    task.assignedTo,
    task.createdAt,
    task.updatedAt,
    task.note,
    task.humanLoginRequired,
    task.outcome,
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

export function getTikTokOpsConfig() {
  const issues = getConfigIssues();

  return {
    ready: issues.length === 0,
    issues,
    sheetName: getQueueSheetName(),
    mode: 'human_in_loop',
  };
}

async function ensureTikTokOpsSheet() {
  const config = getTikTokOpsConfig();
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
    range: getSheetRange('A1:P1'),
  });

  const existingHeader = headerRes.data.values?.[0] || [];
  const headersMatch = HEADERS.every((header, index) => existingHeader[index] === header);

  if (!headersMatch) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: getSheetRange('A1:P1'),
      valueInputOption: 'RAW',
      requestBody: {
        values: [HEADERS],
      },
    });
  }

  return config;
}

export async function listTikTokOpsTasks() {
  const config = await ensureTikTokOpsSheet();
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
    range: getSheetRange('A2:P'),
  });

  const tasks = (res.data.values || [])
    .map((row, index) => toTaskFromRow(row, index + 2))
    .filter((task) => task.taskId)
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || 0);
      const rightTime = Date.parse(right.updatedAt || right.createdAt || 0);
      return rightTime - leftTime;
    });

  return {
    ...config,
    tasks,
  };
}

export async function getTikTokOpsTask(taskId) {
  const listed = await listTikTokOpsTasks();
  if (!listed.ready) {
    throw new Error(listed.issues.join(', '));
  }

  const task = listed.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  return task;
}

export async function createTikTokOpsTask(input = {}) {
  const config = await ensureTikTokOpsSheet();
  if (!config.ready) {
    throw new Error(config.issues.join(', '));
  }

  const now = new Date().toISOString();
  const workflow = TIKTOK_WORKFLOWS.includes(input.workflow)
    ? input.workflow
    : 'inbound_dm';
  const status = TIKTOK_STATUSES.includes(input.status)
    ? input.status
    : 'new';
  const priority = TIKTOK_PRIORITIES.includes(input.priority)
    ? input.priority
    : 'normal';

  const task = {
    taskId: toTaskId(),
    workflow,
    status,
    priority,
    handle: normalizeString(input.handle),
    author: normalizeString(input.author),
    message: normalizeString(input.message),
    suggestedReply: normalizeString(input.suggestedReply),
    suggestedAction: normalizeString(input.suggestedAction) || getDefaultSuggestedAction(workflow),
    actionUrl: normalizeString(input.actionUrl),
    assignedTo: normalizeString(input.assignedTo),
    createdAt: now,
    updatedAt: now,
    note: normalizeString(input.note),
    humanLoginRequired: 'yes',
    outcome: normalizeString(input.outcome),
  };

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: getSheetRange('A:P'),
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [toRowFromTask(task)],
    },
  });

  return task;
}

export async function updateTikTokOpsTask(taskId, updates = {}) {
  const task = await getTikTokOpsTask(taskId);

  const nextWorkflow =
    hasOwn(updates, 'workflow') && TIKTOK_WORKFLOWS.includes(updates.workflow)
      ? updates.workflow
      : task.workflow;
  const nextStatus =
    hasOwn(updates, 'status') && TIKTOK_STATUSES.includes(updates.status)
      ? updates.status
      : task.status;
  const nextPriority =
    hasOwn(updates, 'priority') && TIKTOK_PRIORITIES.includes(updates.priority)
      ? updates.priority
      : task.priority;

  const updatedTask = {
    ...task,
    workflow: nextWorkflow,
    status: nextStatus,
    priority: nextPriority,
    handle: hasOwn(updates, 'handle') ? normalizeString(updates.handle) : task.handle,
    author: hasOwn(updates, 'author') ? normalizeString(updates.author) : task.author,
    message: hasOwn(updates, 'message') ? normalizeString(updates.message) : task.message,
    suggestedReply: hasOwn(updates, 'suggestedReply')
      ? normalizeString(updates.suggestedReply)
      : task.suggestedReply,
    suggestedAction: hasOwn(updates, 'suggestedAction')
      ? normalizeString(updates.suggestedAction)
      : (task.suggestedAction || getDefaultSuggestedAction(nextWorkflow)),
    actionUrl: hasOwn(updates, 'actionUrl') ? normalizeString(updates.actionUrl) : task.actionUrl,
    assignedTo: hasOwn(updates, 'assignedTo')
      ? normalizeString(updates.assignedTo)
      : task.assignedTo,
    updatedAt: new Date().toISOString(),
    note: hasOwn(updates, 'note') ? normalizeString(updates.note) : task.note,
    humanLoginRequired: 'yes',
    outcome: hasOwn(updates, 'outcome') ? normalizeString(updates.outcome) : task.outcome,
  };

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: getSheetRange(`A${task.rowIndex}:P${task.rowIndex}`),
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [toRowFromTask(updatedTask)],
    },
  });

  return updatedTask;
}
