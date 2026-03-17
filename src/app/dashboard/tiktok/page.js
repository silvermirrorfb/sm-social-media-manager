import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';
import TikTokOpsClient from './TikTokOpsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'TikTok Ops Console | Silver Mirror Social Media Manager',
  description: 'Human-in-the-loop TikTok operations queue for Silver Mirror.',
};

export default async function TikTokOpsPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(getDashboardCookieName())?.value;

  if (!(await hasValidDashboardSession(sessionValue))) {
    redirect('/dashboard/login?next=/dashboard/tiktok');
  }

  return <TikTokOpsClient />;
}
