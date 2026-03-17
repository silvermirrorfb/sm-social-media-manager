import { NextResponse } from 'next/server';
import { createTikTokOpsTask, TIKTOK_WORKFLOWS } from '@/lib/tiktok-ops';
import { verifyDashboardBridgeToken } from '@/lib/dashboard-auth';

function normalizeWorkflow(value) {
  const workflow = String(value || '').trim();
  if (TIKTOK_WORKFLOWS.includes(workflow)) return workflow;
  return 'inbound_dm';
}

function normalizeText(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function buildNote({ title, capturedAt, source }) {
  const parts = [];
  if (title) parts.push(`Captured title: ${title}`);
  if (source) parts.push(`Source: ${source}`);
  if (capturedAt) parts.push(`Captured at: ${capturedAt}`);
  return parts.join('\n');
}

function inferHandle(rawHandle, actionUrl) {
  const direct = normalizeText(rawHandle, 120).replace(/^@/, '');
  if (direct) return direct;

  try {
    const url = new URL(String(actionUrl || ''));
    const pathParts = url.pathname.split('/').filter(Boolean);
    const first = String(pathParts[0] || '').replace(/^@/, '');
    if (first && !['inbox', 'messages', 'video'].includes(first.toLowerCase())) {
      return first;
    }
  } catch {
    // noop
  }

  return '';
}

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const verification = await verifyDashboardBridgeToken(token, 'tiktok_capture');

  if (!verification.ok) {
    return NextResponse.redirect(new URL(`/dashboard/tiktok?capture_error=${verification.reason}`, url.origin));
  }

  const workflow = normalizeWorkflow(url.searchParams.get('workflow'));
  const message = normalizeText(url.searchParams.get('message'));
  const actionUrl = normalizeText(url.searchParams.get('actionUrl'), 1000);
  const title = normalizeText(url.searchParams.get('title'), 300);
  const source = normalizeText(url.searchParams.get('source'), 120) || 'bookmarklet';
  const author = normalizeText(url.searchParams.get('author'), 200);
  const handle = inferHandle(url.searchParams.get('handle'), actionUrl);

  if (!message) {
    return NextResponse.redirect(new URL('/dashboard/tiktok?capture_error=missing_message', url.origin));
  }

  const task = await createTikTokOpsTask({
    workflow,
    priority: workflow === 'comment_review' ? 'high' : 'normal',
    handle,
    author,
    message,
    actionUrl,
    note: buildNote({
      title,
      source,
      capturedAt: new Date().toISOString(),
    }),
  });

  const redirectUrl = new URL('/dashboard/tiktok', url.origin);
  redirectUrl.searchParams.set('captured', '1');
  redirectUrl.searchParams.set('taskId', task.taskId);
  redirectUrl.searchParams.set('workflow', workflow);
  if (handle) redirectUrl.searchParams.set('handle', handle);
  return NextResponse.redirect(redirectUrl);
}
