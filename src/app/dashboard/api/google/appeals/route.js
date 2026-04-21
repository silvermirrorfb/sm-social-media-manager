import { NextResponse } from 'next/server';
import {
  getGoogleAppealsConfig,
  listGoogleAppeals,
  upsertGoogleAppeal,
  updateGoogleAppeal,
} from '@/lib/google-appeals';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';

function getSessionReminder() {
  return {
    title: 'Log into Google Business Profile before submitting appeals',
    steps: [
      'Open Google Business Profile in this browser and make sure you are logged in.',
      'For each queued review, open that Silver Mirror location in Google Business Profile → Reviews.',
      'Use the three-dot menu on the specific review and choose "Report review", or submit through the support form.',
      'Always note that the review came from a verified customer and does not violate Google content policies.',
      'Space submissions at least 15–30 minutes apart to stay natural.',
      'If the reviewer deleted their own review (rather than Google removing it), use "Mark as Reviewer Deleted" instead of appealing.',
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

    const queue = await listGoogleAppeals();

    return NextResponse.json({
      ...queue,
      sessionReminder: getSessionReminder(),
    });
  } catch (err) {
    const fallback = await getGoogleAppealsConfig();

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
      const task = await updateGoogleAppeal(reviewId, patch);
      return NextResponse.json({ ok: true, task });
    }

    if (!body.reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });
    }

    const task = await upsertGoogleAppeal(body);
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
