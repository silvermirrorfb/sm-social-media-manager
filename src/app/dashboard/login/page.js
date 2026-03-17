import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import styles from './login.module.css';
import { loginAction } from './actions';
import {
  getDashboardCookieName,
  getDashboardUsername,
  hasValidDashboardSession,
} from '@/lib/dashboard-auth';

function sanitizeNextPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/dashboard')) {
    return '/dashboard';
  }

  return value;
}

export default async function DashboardLoginPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const nextPath = sanitizeNextPath(resolvedSearchParams?.next || '/dashboard');
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(getDashboardCookieName())?.value;

  if (await hasValidDashboardSession(sessionValue)) {
    redirect(nextPath);
  }

  const error = resolvedSearchParams?.error === 'invalid'
    ? 'That login did not match the dashboard credentials.'
    : '';

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Silver Mirror dashboard access</p>
        <h1 className={styles.title}>Private operations view</h1>
        <p className={styles.copy}>
          Sign in to review incoming social traffic, moderation actions, and the bot’s replies across the live dashboard.
        </p>
        <p className={styles.note}>
          Username: <strong>{getDashboardUsername()}</strong>
        </p>
        {error ? <p className={styles.note}>{error}</p> : null}

        <form className={styles.form} action={loginAction}>
          <input type="hidden" name="next" value={nextPath} />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">
              Login
            </label>
            <input className={styles.input} id="username" name="username" defaultValue={getDashboardUsername()} autoComplete="username" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input className={styles.input} id="password" name="password" type="password" autoComplete="current-password" />
          </div>
          <button className={styles.button} type="submit">
            Open dashboard
          </button>
        </form>
      </section>
    </main>
  );
}
