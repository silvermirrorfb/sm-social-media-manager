import { NextResponse } from 'next/server';
import { generateGoogleRemovalAppeal } from '@/lib/claude';
import { getGoogleAppeal, updateGoogleAppeal } from '@/lib/google-appeals';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';

export async function POST(request) {
  try {
    const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
    if (!(await hasValidDashboardSession(sessionValue))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const reviewId = body.reviewId;
    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });
    }

    const task = await getGoogleAppeal(reviewId);
    if (!task) {
      return NextResponse.json({ error: 'Review not found in queue' }, { status: 404 });
    }

    const draft = await generateGoogleRemovalAppeal(task);
    const nextStatus = task.status === 'new' ? 'drafting' : task.status;

    const updatedTask = await updateGoogleAppeal(reviewId, {
      suggestedAppeal: draft.suggestedAppeal,
      status: nextStatus,
    });

    return NextResponse.json({ ok: true, task: updatedTask, draft });
  } catch (err) {
    console.error('[Google-Appeals] Draft generation failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
