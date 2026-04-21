'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './yelp.module.css';

const LAST_SUBMIT_KEY = 'yelp-last-submit-at';
const PACING_MIN_MS = 15 * 60 * 1000;

const STATUS_TABS = [
  { key: 'new', label: 'New' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'ready', label: 'Ready' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'restored', label: 'Restored' },
  { key: 'denied', label: 'Denied' },
  { key: 'no_response', label: 'No Response' },
  { key: 'blocked', label: 'Blocked' },
];

const STATUS_COLORS = {
  new: '#fff4cc',
  drafting: '#d8ebff',
  ready: '#dff6df',
  submitted: '#e7d7ff',
  restored: '#c9f0cb',
  denied: '#ffd9d6',
  no_response: '#eeeeee',
  blocked: '#ffd9d6',
};

const OUTCOME_OPTIONS = [
  { value: '', label: '—' },
  { value: 'restored', label: 'Restored' },
  { value: 'denied', label: 'Denied' },
  { value: 'no_response', label: 'No response' },
];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatRelative(value) {
  if (!value) return 'never';
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderStars(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) return '';
  const count = Math.round(value);
  return '★'.repeat(count) + '☆'.repeat(Math.max(0, 5 - count));
}

export default function YelpAppealsClient() {
  const [health, setHealth] = useState(null);
  const [queue, setQueue] = useState({
    ready: false,
    issues: [],
    sheetName: '',
    tasks: [],
    sessionReminder: null,
  });
  const [activeStatus, setActiveStatus] = useState('new');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingReviewId, setSavingReviewId] = useState('');
  const [draftingReviewId, setDraftingReviewId] = useState('');
  const [copiedReviewId, setCopiedReviewId] = useState('');
  const [lastSubmittedAt, setLastSubmittedAt] = useState('');
  const [pacingTick, setPacingTick] = useState(0);

  async function refreshDashboard() {
    setError('');
    try {
      const [healthRes, queueRes] = await Promise.all([
        fetch('/api/health', { cache: 'no-store' }),
        fetch('/dashboard/api/yelp/appeals', { cache: 'no-store' }),
      ]);

      const [healthData, queueData] = await Promise.all([
        healthRes.json(),
        queueRes.json(),
      ]);

      if (!healthRes.ok) {
        throw new Error(healthData.error || 'Failed to load health status');
      }

      if (!queueRes.ok && !queueData.tasks) {
        throw new Error(queueData.error || 'Failed to load Yelp appeals queue');
      }

      setHealth(healthData);
      setQueue(queueData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(LAST_SUBMIT_KEY) || '';
    setLastSubmittedAt(stored);
    refreshDashboard();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setPacingTick((n) => n + 1), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function handleUpdate(reviewId, patch) {
    setSavingReviewId(reviewId);
    setError('');
    try {
      const res = await fetch('/dashboard/api/yelp/appeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', reviewId, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update appeal');
      }
      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingReviewId('');
    }
  }

  async function handleGenerateDraft(reviewId) {
    setDraftingReviewId(reviewId);
    setError('');
    try {
      const res = await fetch('/dashboard/api/yelp/appeals/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate appeal draft');
      }
      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setDraftingReviewId('');
    }
  }

  async function handleCopyAppeal(reviewId, text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReviewId(reviewId);
      window.setTimeout(() => setCopiedReviewId(''), 2000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  }

  async function handleMarkSubmitted(reviewId) {
    const now = new Date().toISOString();
    await handleUpdate(reviewId, { status: 'submitted', submittedAt: now });
    window.localStorage.setItem(LAST_SUBMIT_KEY, now);
    setLastSubmittedAt(now);
  }

  const tasks = useMemo(() => queue.tasks || [], [queue.tasks]);
  const counts = useMemo(() => {
    const map = Object.fromEntries(STATUS_TABS.map((tab) => [tab.key, 0]));
    for (const task of tasks) {
      if (map[task.status] !== undefined) map[task.status] += 1;
    }
    return map;
  }, [tasks]);

  const visibleTasks = tasks.filter((task) => task.status === activeStatus);

  const pacing = useMemo(() => {
    // intentionally read pacingTick so this memo refreshes every 30s
    void pacingTick;
    if (!lastSubmittedAt) return { ok: true, message: '' };
    const elapsed = Date.now() - Date.parse(lastSubmittedAt);
    if (!Number.isFinite(elapsed)) return { ok: true, message: '' };
    if (elapsed < PACING_MIN_MS) {
      const remaining = Math.ceil((PACING_MIN_MS - elapsed) / 60_000);
      return {
        ok: false,
        message: `Consider waiting ${remaining} more minute${remaining === 1 ? '' : 's'} before the next submission to stay natural.`,
      };
    }
    return { ok: true, message: '' };
  }, [lastSubmittedAt, pacingTick]);

  const env = health?.env || {};

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>Silver Mirror Internal Ops</div>
            <h1 className={styles.heading}>Yelp Appeals Console</h1>
            <p className={styles.subheading}>
              Human-in-the-loop queue for 5-star reviews Yelp filtered into the
              &ldquo;not currently recommended&rdquo; section across all 10 Silver Mirror
              locations. Draft appeals here, then submit manually inside your
              logged-in Yelp Business session.
            </p>
            <div className={styles.heroActions}>
              <Link href="/dashboard" className={styles.secondaryLink}>Back to dashboard</Link>
              <Link href="/dashboard/tiktok" className={styles.secondaryLink}>TikTok Ops Console</Link>
            </div>
          </div>
          <div className={styles.heroMeta}>
            <div className={styles.heroMetaLabel}>Queue</div>
            <div className={styles.heroMetaValue}>{tasks.length}</div>
            <div className={styles.heroMetaHint}>hidden reviews tracked</div>
          </div>
        </section>

        <section
          className={`${styles.pacingCard} ${pacing.ok ? '' : styles.pacingCardWarn}`}
        >
          <div>
            <div className={styles.cardTitle}>Submit manually in Yelp Business — space submissions apart</div>
            <p className={styles.cardText}>
              Submit appeals in Yelp Business one at a time, spaced at least 15–30
              minutes apart. You are logged into Yelp Business in your own browser.
              Open each <strong>Review URL</strong>, navigate to the &ldquo;Report
              Review&rdquo; or &ldquo;Appeal&rdquo; option for that review, paste the
              drafted appeal, and submit. After submitting in Yelp, return here and
              click <strong>Mark Submitted</strong>.
            </p>
            <p className={styles.cardText} style={{ marginTop: '0.5rem' }}>
              Last submission: <strong>{lastSubmittedAt ? `${formatDate(lastSubmittedAt)} (${formatRelative(lastSubmittedAt)})` : 'none yet'}</strong>.
              {pacing.message ? ` ${pacing.message}` : ''}
            </p>
          </div>
        </section>

        {error ? <section className={styles.errorCard}>{error}</section> : null}

        <section className={styles.statusGrid}>
          <StatusCard
            title="Queue status"
            value={queue.ready ? 'Connected' : 'Needs config'}
            lines={[
              `Sheet: ${queue.sheetName || 'Yelp Appeals Queue'}`,
              `New ${counts.new} · Ready ${counts.ready} · Submitted ${counts.submitted}`,
              `Restored ${counts.restored} · Denied ${counts.denied}`,
              ...(queue.issues || []),
            ]}
          />
          <StatusCard
            title="Environment"
            value={env.yelpAppealsReady ? 'Ready' : 'Incomplete'}
            lines={[
              `Claude drafting: ${env.hasAnthropicKey ? 'yes' : 'no'}`,
              `Google Sheets: ${env.hasSheetId && env.hasGoogleCreds ? 'yes' : 'no'}`,
              `Cron auth: ${process.env.NODE_ENV === 'production' ? 'production' : 'dev'}`,
            ]}
          />
          <StatusCard
            title="Workflow mode"
            value="Human controlled"
            lines={[
              'Scanner detects hidden 5-star reviews every 12h.',
              'Claude drafts an appeal you can approve.',
              'Final submission happens in Yelp Business, paced manually.',
            ]}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Appeal queue</h2>
              <p className={styles.panelSubtitle}>
                Filter by workflow stage. Each row maps to one hidden review.
              </p>
            </div>
            <div className={styles.countBadge}>{visibleTasks.length}</div>
          </div>

          <div className={styles.filterBar}>
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveStatus(tab.key)}
                className={`${styles.filterPill} ${activeStatus === tab.key ? styles.filterPillActive : ''}`}
              >
                {tab.label}
                {' · '}
                <strong>{counts[tab.key] || 0}</strong>
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className={styles.emptyState}>Loading appeals…</div>
          ) : visibleTasks.length === 0 ? (
            <div className={styles.emptyState}>No appeals in this lane right now.</div>
          ) : (
            <div className={styles.taskStack}>
              {visibleTasks.map((task) => (
                <AppealCard
                  key={task.reviewId}
                  task={task}
                  isSaving={savingReviewId === task.reviewId}
                  isDrafting={draftingReviewId === task.reviewId}
                  isCopied={copiedReviewId === task.reviewId}
                  canGenerateDraft={Boolean(env.hasAnthropicKey)}
                  onUpdate={handleUpdate}
                  onGenerateDraft={handleGenerateDraft}
                  onCopyAppeal={handleCopyAppeal}
                  onMarkSubmitted={handleMarkSubmitted}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatusCard({ title, value, lines }) {
  return (
    <div className={styles.statusCard}>
      <div className={styles.statusLabel}>{title}</div>
      <div className={styles.statusValue}>{value}</div>
      <div className={styles.statusList}>
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function AppealCard({
  task,
  onUpdate,
  onGenerateDraft,
  onCopyAppeal,
  onMarkSubmitted,
  isSaving,
  isDrafting,
  isCopied,
  canGenerateDraft,
}) {
  const [draft, setDraft] = useState({
    status: task.status,
    priority: task.priority,
    suggestedAppeal: task.suggestedAppeal,
    outcome: task.outcome,
    operatorNote: task.operatorNote,
  });

  useEffect(() => {
    setDraft({
      status: task.status,
      priority: task.priority,
      suggestedAppeal: task.suggestedAppeal,
      outcome: task.outcome,
      operatorNote: task.operatorNote,
    });
  }, [task]);

  const isSubmittedOrLater = ['submitted', 'restored', 'denied', 'no_response'].includes(task.status);
  const appealText = draft.suggestedAppeal || '';
  const ratingLabel = renderStars(task.starRating);
  const snippet = (task.reviewText || '').slice(0, 280);

  return (
    <article className={styles.taskCard}>
      <div className={styles.taskHeader}>
        <div>
          <div className={styles.taskMeta}>
            <span className={styles.taskHandle}>{task.reviewerName || 'Unknown reviewer'}</span>
            <span className={styles.locationBadge}>{task.locationName || task.locationId || 'unknown location'}</span>
            <span className={styles.ratingStars}>{ratingLabel}</span>
          </div>
          <div className={styles.taskSecondaryMeta}>
            Review date: {task.reviewDate || '—'} · Detected {formatDate(task.detectedAt)}
          </div>
        </div>
        <span
          className={styles.statusPill}
          style={{ background: STATUS_COLORS[draft.status] || '#ececec' }}
        >
          {draft.status}
        </span>
      </div>

      <div className={styles.messageBox}>
        {snippet || 'No review text captured.'}
        {task.reviewText && task.reviewText.length > snippet.length ? '…' : ''}
      </div>

      <div className={styles.inlineGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Status</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
            className={styles.select}
          >
            <option value="new">New</option>
            <option value="drafting">Drafting</option>
            <option value="ready">Ready</option>
            <option value="submitted">Submitted</option>
            <option value="restored">Restored</option>
            <option value="denied">Denied</option>
            <option value="no_response">No response</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Priority</span>
          <select
            value={draft.priority}
            onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
            className={styles.select}
          >
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>

        {isSubmittedOrLater ? (
          <label className={styles.field}>
            <span className={styles.label}>Outcome</span>
            <select
              value={draft.outcome || ''}
              onChange={(event) => setDraft({ ...draft, outcome: event.target.value })}
              className={styles.select}
            >
              {OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Suggested appeal (edit before copying)</span>
        <textarea
          value={draft.suggestedAppeal || ''}
          onChange={(event) => setDraft({ ...draft, suggestedAppeal: event.target.value })}
          rows={6}
          className={styles.textarea}
          placeholder="Click Generate Appeal to have Claude draft something, or write the appeal by hand."
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Operator note</span>
        <textarea
          value={draft.operatorNote || ''}
          onChange={(event) => setDraft({ ...draft, operatorNote: event.target.value })}
          rows={2}
          className={styles.textarea}
          placeholder="Context, risk, or follow-up detail"
        />
      </label>

      <div className={styles.taskFooter}>
        <div className={styles.taskLinks}>
          {task.reviewUrl ? (
            <a href={task.reviewUrl} target="_blank" rel="noreferrer" className={styles.link}>
              Open in Yelp
            </a>
          ) : (
            <span className={styles.linkMuted}>No review URL</span>
          )}
          {task.reviewerProfileUrl ? (
            <a href={task.reviewerProfileUrl} target="_blank" rel="noreferrer" className={styles.link}>
              Reviewer profile
            </a>
          ) : null}
          {task.submittedAt ? (
            <span className={styles.linkMuted}>Submitted {formatDate(task.submittedAt)}</span>
          ) : null}
        </div>
        <div className={styles.taskActions}>
          <button
            type="button"
            onClick={() => onGenerateDraft(task.reviewId)}
            className={styles.secondaryButton}
            disabled={isDrafting || !canGenerateDraft}
          >
            {isDrafting ? 'Drafting…' : canGenerateDraft ? 'Generate Appeal' : 'Drafting unavailable'}
          </button>
          <button
            type="button"
            onClick={() => onCopyAppeal(task.reviewId, appealText)}
            className={styles.secondaryButton}
            disabled={!appealText}
          >
            {isCopied ? 'Copied' : 'Copy Appeal'}
          </button>
          <button
            type="button"
            onClick={() => onMarkSubmitted(task.reviewId)}
            className={styles.secondaryButton}
            disabled={isSaving || task.status === 'submitted' || task.status === 'restored' || task.status === 'denied' || task.status === 'no_response'}
          >
            Mark Submitted
          </button>
          <button
            type="button"
            onClick={() => onUpdate(task.reviewId, draft)}
            className={styles.primaryButton}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </article>
  );
}
