import { NextResponse } from 'next/server';
import {
  getYelpAppealsConfig,
  listYelpAppeals,
  upsertYelpAppeal,
  updateYelpAppeal,
} from '@/lib/yelp-appeals';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';

function getSessionReminder() {
  return {
    title: 'Log into Yelp Business before submitting appeals',
    steps: [
      'Open Yelp Business in this browser and complete login manually.',
      'Keep the Yelp Business tab open while working the queue.',
      'Open each Review URL, use the appeal / report-review option, paste the drafted text, and submit.',
      'Space submissions at least 15–30 minutes apart to stay natural.',
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

    const queue = await listYelpAppeals();

    return NextResponse.json({
      ...queue,
      sessionReminder: getSessionReminder(),
    });
  } catch (err) {
    const fallback = await getYelpAppealsConfig();

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
      if (!body.reviewId) {
        return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });
      }
      const { action: _action, reviewId, ...patch } = body;
      const task = await updateYelpAppeal(reviewId, patch);
      return NextResponse.json({ ok: true, task });
    }

    if (!body.reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });
    }

    const task = await upsertYelpAppeal(body);
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
