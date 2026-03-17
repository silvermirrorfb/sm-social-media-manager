import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createDashboardBridgeToken,
  getDashboardCookieName,
  hasValidDashboardSession,
} from '@/lib/dashboard-auth';
import TikTokOpsClient from './TikTokOpsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'TikTok Ops Console | Silver Mirror Social Media Manager',
  description: 'Human-in-the-loop TikTok operations queue for Silver Mirror.',
};

export default async function TikTokOpsPage({ searchParams }) {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(getDashboardCookieName())?.value;
  const resolvedSearchParams = await searchParams;

  if (!(await hasValidDashboardSession(sessionValue))) {
    redirect('/dashboard/login?next=/dashboard/tiktok');
  }

  const bridgeToken = await createDashboardBridgeToken({ purpose: 'tiktok_capture' });
  const flash =
    resolvedSearchParams?.captured === '1'
      ? {
          type: 'success',
          message: `Captured TikTok context into the queue${resolvedSearchParams?.handle ? ` for @${resolvedSearchParams.handle}` : ''}.`,
        }
      : resolvedSearchParams?.capture_error
        ? {
            type: 'error',
            message: `TikTok capture failed: ${resolvedSearchParams.capture_error}.`,
          }
        : null;

  return <TikTokOpsClient bridgeToken={bridgeToken} flash={flash} />;
}
