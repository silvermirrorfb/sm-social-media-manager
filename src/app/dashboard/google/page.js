import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createDashboardBridgeToken,
  getDashboardCookieName,
  hasValidDashboardSession,
} from '@/lib/dashboard-auth';
import { getGoogleLocations } from '@/lib/google-locations';
import GoogleAppealsClient from './GoogleAppealsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Google Review Monitor | Silver Mirror Social Media Manager',
  description:
    'Human-in-the-loop snapshot-diff monitor for Silver Mirror reviews that Google removes from our 10 Business Profiles.',
};

export default async function GoogleAppealsPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(getDashboardCookieName())?.value;

  if (!(await hasValidDashboardSession(sessionValue))) {
    redirect('/dashboard/login?next=/dashboard/google');
  }

  const scanToken = await createDashboardBridgeToken({ purpose: 'google_snapshot' });
  const configuredLocations = getGoogleLocations().map((loc) => ({
    id: loc.id,
    name: loc.name,
    city: loc.city,
    url: loc.url,
  }));

  return (
    <GoogleAppealsClient
      scanToken={scanToken}
      configuredLocations={configuredLocations}
    />
  );
}
