import { NextResponse } from 'next/server';
import {
  getDashboardCookieName,
  hasValidDashboardSession,
} from './src/lib/dashboard-auth';

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  if (pathname === '/dashboard/login') {
    return NextResponse.next();
  }

  const sessionValue = request.cookies.get(getDashboardCookieName())?.value;
  if (await hasValidDashboardSession(sessionValue)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/dashboard/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
