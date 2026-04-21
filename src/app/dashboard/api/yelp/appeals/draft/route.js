import { NextResponse } from 'next/server';
import { generateYelpAppeal } from '@/lib/claude';
import { getYelpAppeal, updateYelpAppeal } from '@/lib/yelp-appeals';
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

    const task = await getYelpAppeal(reviewId);
    if (!task) {
      return NextResponse.json({ error: 'Review not found in queue' }, { status: 404 });
    }

    const draft = await generateYelpAppeal(task);
    const nextStatus = task.status === 'new' ? 'drafting' : task.status;

    const updatedTask = await updateYelpAppeal(reviewId, {
      suggestedAppeal: draft.suggestedAppeal,
      status: nextStatus,
    });

    return NextResponse.json({ ok: true, task: updatedTask, draft });
  } catch (err) {
    console.error('[Yelp-Appeals] Draft generation failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
