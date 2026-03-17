'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createDashboardSessionValue,
  getDashboardCookieName,
  getDashboardCookieOptions,
  verifyDashboardCredentials,
} from '@/lib/dashboard-auth';

function sanitizeNextPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/dashboard')) {
    return '/dashboard';
  }

  return value;
}

export async function loginAction(formData) {
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  const nextPath = sanitizeNextPath(String(formData.get('next') || '/dashboard'));

  const isValid = await verifyDashboardCredentials(username, password);
  if (!isValid) {
    redirect(`/dashboard/login?error=invalid&next=${encodeURIComponent(nextPath)}`);
  }

  const sessionValue = await createDashboardSessionValue();
  const cookieStore = await cookies();
  cookieStore.set(getDashboardCookieName(), sessionValue, getDashboardCookieOptions());
  redirect(nextPath);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(getDashboardCookieName());
  redirect('/dashboard/login');
}
