import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getDashboardCookieName,
  hasValidDashboardSession,
} from '@/lib/dashboard-auth';
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

  return <YelpAppealsClient />;
}
