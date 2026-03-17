import { NextResponse } from 'next/server';
import {
  createTikTokOpsTask,
  getTikTokOpsConfig,
  listTikTokOpsTasks,
  updateTikTokOpsTask,
} from '@/lib/tiktok-ops';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';

function getSessionReminder() {
  return {
    title: 'Log into TikTok before working the queue',
    steps: [
      'Open TikTok in this browser and complete login manually.',
      'Keep the inbox/comments tab open while working tasks.',
      'Use this dashboard to track drafts, approvals, and outcomes.',
    ],
  };
}

async function requireDashboardSession(request) {
  const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
  if (!(await hasValidDashboardSession(sessionValue))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request) {
  try {
    const unauthorized = await requireDashboardSession(request);
    if (unauthorized) return unauthorized;

    const queue = await listTikTokOpsTasks();

    return NextResponse.json({
      ...queue,
      sessionReminder: getSessionReminder(),
    });
  } catch (err) {
    const fallback = getTikTokOpsConfig();

    return NextResponse.json(
      {
        ...fallback,
        tasks: [],
        sessionReminder: getSessionReminder(),
        error: err.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const unauthorized = await requireDashboardSession(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const action = body.action || 'create';

    if (action === 'update') {
      if (!body.taskId) {
        return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
      }

      const task = await updateTikTokOpsTask(body.taskId, body);
      return NextResponse.json({ ok: true, task });
    }

    const task = await createTikTokOpsTask(body);
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
