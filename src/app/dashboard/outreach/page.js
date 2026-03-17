import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDashboardCookieName, hasValidDashboardSession } from '@/lib/dashboard-auth';
import OutreachClient from './OutreachClient';

export const dynamic = 'force-dynamic';

export default async function OutreachPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(getDashboardCookieName())?.value;
  if (!(await hasValidDashboardSession(sessionValue))) {
    redirect('/dashboard/login?next=%2Fdashboard%2Foutreach');
  }

  return <OutreachClient />;
}
