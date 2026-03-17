import { NextResponse } from 'next/server';
import { generateTikTokDraft } from '@/lib/claude';
import { getTikTokOpsTask, updateTikTokOpsTask } from '@/lib/tiktok-ops';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';

export async function POST(request) {
  try {
    const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
    if (!(await hasValidDashboardSession(sessionValue))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const taskId = body.taskId;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    const task = await getTikTokOpsTask(taskId);
    const draft = await generateTikTokDraft(task);
    const nextStatus = task.status === 'new' ? 'drafting' : task.status;

    const updatedTask = await updateTikTokOpsTask(taskId, {
      suggestedReply: draft.suggestedReply,
      suggestedAction: draft.suggestedAction,
      note: draft.reason ? `${task.note ? `${task.note}\n\n` : ''}AI note: ${draft.reason}` : task.note,
      status: nextStatus,
    });

    return NextResponse.json({
      ok: true,
      task: updatedTask,
      draft,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
