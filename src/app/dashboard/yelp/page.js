import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createDashboardBridgeToken,
  getDashboardCookieName,
  hasValidDashboardSession,
} from '@/lib/dashboard-auth';
import { getConfiguredYelpLocations } from '@/lib/yelp-locations';
import YelpAppealsClient from './YelpAppealsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Yelp Appeals Console | Silver Mirror Social Media Manager',
  description: 'Human-in-the-loop queue for appealing Silver Mirror Yelp reviews filtered into "not currently recommended".',
};

export default async function YelpAppealsPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(getDashboardCookieName())?.value;

  if (!(await hasValidDashboardSession(sessionValue))) {
    redirect('/dashboard/login?next=/dashboard/yelp');
  }

  const scanToken = await createDashboardBridgeToken({ purpose: 'yelp_scan' });
  const configuredLocations = getConfiguredYelpLocations().map((loc) => ({
    id: loc.id,
    name: loc.name,
    city: loc.city,
    url: loc.url,
  }));

  return (
    <YelpAppealsClient
      scanToken={scanToken}
      configuredLocations={configuredLocations}
    />
  );
}
