'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const LOCAL_STORAGE_KEY = 'tiktok-session-ack-at';
const LOGIN_REMINDER_WINDOW_MS = 8 * 60 * 60 * 1000;

const WORKFLOW_LABELS = {
  inbound_dm: 'Inbound DMs',
  influencer_dm: 'Influencer Outreach',
  comment_review: 'Negative Comment Review',
};

const STATUS_COLORS = {
  new: '#fff4cc',
  drafting: '#d8ebff',
  ready: '#dff6df',
  done: '#ececec',
  blocked: '#ffd9d6',
};

const EMPTY_TASK = {
  workflow: 'inbound_dm',
  priority: 'normal',
  handle: '',
  author: '',
  message: '',
  suggestedReply: '',
  suggestedAction: '',
  actionUrl: '',
  assignedTo: '',
  note: '',
};

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

function hoursSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;

  return (Date.now() - parsed) / (60 * 60 * 1000);
}

function toBookmarklet(origin, token) {
  if (!origin || !token) return '';

  const js = `
    (function(){
      try {
        var selection = window.getSelection ? String(window.getSelection()).trim() : '';
        var path = location.pathname.split('/').filter(Boolean);
        var inferredHandle = path[0] && ['inbox','messages','video'].indexOf(path[0].toLowerCase()) === -1 ? path[0].replace(/^@/,'') : '';
        var defaultWorkflow = /inbox|messages/i.test(location.pathname + ' ' + document.title) ? 'inbound_dm' : (selection ? 'comment_review' : 'influencer_dm');
        var workflow = prompt('Workflow: inbound_dm, influencer_dm, comment_review', defaultWorkflow) || defaultWorkflow;
        var message = selection || prompt('Paste the TikTok DM, comment, or creator context to capture', '') || '';
        if (!message.trim()) {
          alert('No TikTok text selected or pasted.');
          return;
        }
        var captureUrl = new URL(${JSON.stringify('/dashboard/tiktok/capture')}, ${JSON.stringify(origin)});
        captureUrl.searchParams.set('token', ${JSON.stringify(token)});
        captureUrl.searchParams.set('workflow', workflow);
        captureUrl.searchParams.set('message', message.slice(0, 3500));
        captureUrl.searchParams.set('actionUrl', location.href);
        captureUrl.searchParams.set('title', document.title);
        captureUrl.searchParams.set('handle', inferredHandle);
        captureUrl.searchParams.set('source', 'bookmarklet');
        window.open(captureUrl.toString(), '_blank', 'noopener,noreferrer');
      } catch (err) {
        alert('TikTok capture failed: ' + err.message);
      }
    })();
  `.replace(/\s+/g, ' ').trim();

  return `javascript:${js}`;
}

export default function TikTokOpsClient({ bridgeToken = '', flash = null }) {
  const [health, setHealth] = useState(null);
  const [queue, setQueue] = useState({
    ready: false,
    issues: [],
    sheetName: '',
    tasks: [],
    sessionReminder: null,
  });
  const [newTask, setNewTask] = useState(EMPTY_TASK);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState('');
  const [draftingTaskId, setDraftingTaskId] = useState('');
  const [error, setError] = useState('');
  const [sessionAckAt, setSessionAckAt] = useState('');
  const [origin, setOrigin] = useState('');
  const [bridgeCopied, setBridgeCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function refreshDashboard() {
    setError('');

    try {
      const [healthRes, queueRes] = await Promise.all([
        fetch('/api/health', { cache: 'no-store' }),
        fetch('/dashboard/api/tiktok/ops', { cache: 'no-store' }),
      ]);

      const [healthData, queueData] = await Promise.all([
        healthRes.json(),
        queueRes.json(),
      ]);

      if (!healthRes.ok) {
        throw new Error(healthData.error || 'Failed to load health status');
      }

      if (!queueRes.ok && !queueData.tasks) {
        throw new Error(queueData.error || 'Failed to load TikTok ops queue');
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
    const storedAck = window.localStorage.getItem(LOCAL_STORAGE_KEY) || '';
    setSessionAckAt(storedAck);
    refreshDashboard();
  }, []);

  async function handleCreateTask(event) {
    event.preventDefault();
    setIsCreating(true);
    setError('');

    try {
      const res = await fetch('/dashboard/api/tiktok/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create task');
      }

      setNewTask(EMPTY_TASK);
      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveTask(taskId, updates) {
    setSavingTaskId(taskId);
    setError('');

    try {
      const res = await fetch('/dashboard/api/tiktok/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          taskId,
          ...updates,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update task');
      }

      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTaskId('');
    }
  }

  async function handleGenerateDraft(taskId) {
    setDraftingTaskId(taskId);
    setError('');

    try {
      const res = await fetch('/dashboard/api/tiktok/ops/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate draft');
      }

      await refreshDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setDraftingTaskId('');
    }
  }

  function acknowledgeSession() {
    const now = new Date().toISOString();
    window.localStorage.setItem(LOCAL_STORAGE_KEY, now);
    setSessionAckAt(now);
  }

  const loginIsStale = (hoursSince(sessionAckAt) * 60 * 60 * 1000) >= LOGIN_REMINDER_WINDOW_MS;
  const tasks = queue.tasks || [];
  const queueCounts = {
    total: tasks.length,
    new: tasks.filter((task) => task.status === 'new').length,
    ready: tasks.filter((task) => task.status === 'ready').length,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
  };

  const groupedTasks = {
    inbound_dm: tasks.filter((task) => task.workflow === 'inbound_dm'),
    influencer_dm: tasks.filter((task) => task.workflow === 'influencer_dm'),
    comment_review: tasks.filter((task) => task.workflow === 'comment_review'),
  };

  const env = health?.env || {};
  const bookmarkletHref = toBookmarklet(origin, bridgeToken);

  async function copyBookmarklet() {
    if (!bookmarkletHref) return;
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      setBridgeCopied(true);
      window.setTimeout(() => setBridgeCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy bookmarklet:', err);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Silver Mirror Internal Ops</div>
          <h1 style={styles.heading}>TikTok Human-in-the-Loop Console</h1>
          <p style={styles.subheading}>
            Queue inbound DMs, influencer outreach, and negative-comment actions here.
            Final TikTok work stays manual in a logged-in browser session.
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/dashboard" style={styles.secondaryLink}>Back to dashboard</Link>
            <Link href="/tiktok/connect" style={styles.secondaryLink}>TikTok Connect</Link>
          </div>
        </div>
        <div style={styles.heroMeta}>
          <div style={styles.heroMetaLabel}>Queue</div>
          <div style={styles.heroMetaValue}>{queueCounts.total}</div>
          <div style={styles.heroMetaHint}>active tasks</div>
        </div>
      </section>

      {loginIsStale ? (
        <section style={styles.warningCard}>
          <div>
            <div style={styles.cardTitle}>TikTok login required</div>
            <p style={styles.cardText}>
              Open TikTok in this browser before touching the queue. The human operator
              should complete login and keep the TikTok tab open while working tasks.
            </p>
          </div>
          <button onClick={acknowledgeSession} style={styles.primaryButton}>
            I&apos;m logged into TikTok
          </button>
        </section>
      ) : (
        <section style={styles.successCard}>
          <div>
            <div style={styles.cardTitle}>TikTok session acknowledged</div>
            <p style={styles.cardText}>
              Last confirmed {formatDate(sessionAckAt)}. Reconfirm after logout, session
              expiry, or browser restart.
            </p>
          </div>
          <button onClick={acknowledgeSession} style={styles.secondaryButton}>
            Refresh login reminder
          </button>
        </section>
      )}

      {error ? <section style={styles.errorCard}>{error}</section> : null}
      {flash ? (
        <section style={flash.type === 'success' ? styles.successCard : styles.errorCard}>
          <div>
            <div style={styles.cardTitle}>{flash.type === 'success' ? 'Capture complete' : 'Capture issue'}</div>
            <p style={styles.cardText}>{flash.message}</p>
          </div>
        </section>
      ) : null}

      <section style={styles.grid}>
        <StatusCard
          title="Queue status"
          value={queue.ready ? 'Connected' : 'Needs config'}
          lines={[
            `Sheet: ${queue.sheetName || 'TikTok Ops Queue'}`,
            `New ${queueCounts.new} | Ready ${queueCounts.ready} | Blocked ${queueCounts.blocked}`,
            ...(queue.issues || []),
          ]}
        />
        <StatusCard
          title="Environment"
          value={env.tikTokOpsQueueReady ? 'Ready' : 'Incomplete'}
          lines={[
            `Claude drafting: ${env.hasAnthropicKey ? 'yes' : 'no'}`,
            `TikTok client key: ${env.hasTikTokClientKey ? 'yes' : 'no'}`,
            `TikTok client secret: ${env.hasTikTokClientSecret ? 'yes' : 'no'}`,
            `Google Sheets: ${env.hasSheetId && env.hasGoogleCreds ? 'yes' : 'no'}`,
          ]}
        />
        <StatusCard
          title="Workflow mode"
          value="Human controlled"
          lines={[
            'Dashboard drafts and tracks work.',
            'TikTok inbox/comments actions happen manually.',
            'Browser extension or local agent can attach later.',
          ]}
        />
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>TikTok Capture Bridge</h2>
            <p style={styles.panelSubtitle}>
              This is the first live content bridge. Install the bookmarklet, open TikTok in the same browser,
              select text or stay on the relevant page, and send that context straight into this queue.
            </p>
          </div>
        </div>
        <div style={styles.captureGrid}>
          <div style={styles.captureCard}>
            <strong style={styles.captureTitle}>1. Install bookmarklet</strong>
            <p style={styles.cardText}>
              Drag this button to your bookmarks bar, or copy the script and save it as a bookmark URL.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <a href={bookmarkletHref || '#'} style={styles.primaryLink}>
                Save TikTok Capture
              </a>
              <button type="button" onClick={copyBookmarklet} style={styles.secondaryButton}>
                {bridgeCopied ? 'Copied' : 'Copy bookmarklet code'}
              </button>
            </div>
          </div>
          <div style={styles.captureCard}>
            <strong style={styles.captureTitle}>2. Use it on TikTok</strong>
            <ol style={styles.captureList}>
              <li>Select a DM or comment if you want exact text captured.</li>
              <li>Click the bookmarklet while you are on TikTok.</li>
              <li>Choose the workflow when prompted.</li>
              <li>The queue item will open back here with the page URL and context saved.</li>
            </ol>
          </div>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>Add task</h2>
            <p style={styles.panelSubtitle}>
              Use this for manual intake today. Later the browser agent can post into the
              same queue automatically.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateTask} style={styles.formGrid}>
          <label style={styles.field}>
            <span style={styles.label}>Workflow</span>
            <select
              value={newTask.workflow}
              onChange={(event) => setNewTask({ ...newTask, workflow: event.target.value })}
              style={styles.select}
            >
              <option value="inbound_dm">Inbound DMs</option>
              <option value="influencer_dm">Influencer Outreach</option>
              <option value="comment_review">Negative Comment Review</option>
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Priority</span>
            <select
              value={newTask.priority}
              onChange={(event) => setNewTask({ ...newTask, priority: event.target.value })}
              style={styles.select}
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Handle</span>
            <input
              value={newTask.handle}
              onChange={(event) => setNewTask({ ...newTask, handle: event.target.value })}
              placeholder="@creator"
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Author / owner</span>
            <input
              value={newTask.author}
              onChange={(event) => setNewTask({ ...newTask, author: event.target.value })}
              placeholder="Optional display name"
              style={styles.input}
            />
          </label>

          <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
            <span style={styles.label}>Message or comment</span>
            <textarea
              value={newTask.message}
              onChange={(event) => setNewTask({ ...newTask, message: event.target.value })}
              placeholder="Paste the TikTok DM, outreach brief, or negative comment here"
              rows={4}
              style={styles.textarea}
              required
            />
          </label>

          <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
            <span style={styles.label}>Suggested reply</span>
            <textarea
              value={newTask.suggestedReply}
              onChange={(event) => setNewTask({ ...newTask, suggestedReply: event.target.value })}
              placeholder="Optional AI draft or operator notes"
              rows={3}
              style={styles.textarea}
            />
          </label>

          <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
            <span style={styles.label}>Suggested action</span>
            <textarea
              value={newTask.suggestedAction}
              onChange={(event) => setNewTask({ ...newTask, suggestedAction: event.target.value })}
              placeholder="What should the operator do inside TikTok?"
              rows={2}
              style={styles.textarea}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Action URL</span>
            <input
              value={newTask.actionUrl}
              onChange={(event) => setNewTask({ ...newTask, actionUrl: event.target.value })}
              placeholder="https://www.tiktok.com/..."
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Assigned to</span>
            <input
              value={newTask.assignedTo}
              onChange={(event) => setNewTask({ ...newTask, assignedTo: event.target.value })}
              placeholder="Operator name"
              style={styles.input}
            />
          </label>

          <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
            <span style={styles.label}>Operator note</span>
            <textarea
              value={newTask.note}
              onChange={(event) => setNewTask({ ...newTask, note: event.target.value })}
              placeholder="Context, risk, or follow-up detail"
              rows={2}
              style={styles.textarea}
            />
          </label>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" style={styles.primaryButton} disabled={isCreating}>
              {isCreating ? 'Adding…' : 'Add to queue'}
            </button>
          </div>
        </form>
      </section>

      <section style={styles.workflowStack}>
        {Object.entries(WORKFLOW_LABELS).map(([workflow, label]) => (
          <div key={workflow} style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <h2 style={styles.panelTitle}>{label}</h2>
                <p style={styles.panelSubtitle}>
                  {workflow === 'inbound_dm'
                    ? 'Reply drafts and inbox follow-up'
                    : workflow === 'influencer_dm'
                      ? 'Outbound creator outreach tasks'
                      : 'Comment triage for hiding, reporting, or escalation'}
                </p>
              </div>
              <div style={styles.countBadge}>{groupedTasks[workflow].length}</div>
            </div>

            {isLoading ? (
              <div style={styles.emptyState}>Loading tasks…</div>
            ) : groupedTasks[workflow].length === 0 ? (
              <div style={styles.emptyState}>No tasks in this lane yet.</div>
            ) : (
              <div style={styles.taskStack}>
                {groupedTasks[workflow].map((task) => (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    isSaving={savingTaskId === task.taskId}
                    isDrafting={draftingTaskId === task.taskId}
                    canGenerateDraft={Boolean(env.hasAnthropicKey)}
                    onSave={handleSaveTask}
                    onGenerateDraft={handleGenerateDraft}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}

function StatusCard({ title, value, lines }) {
  return (
    <div style={styles.statusCard}>
      <div style={styles.statusLabel}>{title}</div>
      <div style={styles.statusValue}>{value}</div>
      <div style={styles.statusList}>
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task, onSave, onGenerateDraft, isSaving, isDrafting, canGenerateDraft }) {
  const [draft, setDraft] = useState({
    status: task.status,
    priority: task.priority,
    suggestedReply: task.suggestedReply,
    suggestedAction: task.suggestedAction,
    assignedTo: task.assignedTo,
    note: task.note,
    outcome: task.outcome,
  });

  useEffect(() => {
    setDraft({
      status: task.status,
      priority: task.priority,
      suggestedReply: task.suggestedReply,
      suggestedAction: task.suggestedAction,
      assignedTo: task.assignedTo,
      note: task.note,
      outcome: task.outcome,
    });
  }, [task]);

  async function handleCopyDraft() {
    const text = draft.suggestedReply || draft.suggestedAction;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  }

  return (
    <article style={styles.taskCard}>
      <div style={styles.taskHeader}>
        <div>
          <div style={styles.taskMeta}>
            <span style={styles.taskHandle}>{task.handle || '@unknown'}</span>
            <span style={styles.taskTimestamp}>{formatDate(task.createdAt)}</span>
          </div>
          <div style={styles.taskSecondaryMeta}>
            {task.author || 'No author'} • {task.taskId}
          </div>
        </div>
        <span
          style={{
            ...styles.statusPill,
            background: STATUS_COLORS[draft.status] || '#ececec',
          }}
        >
          {draft.status}
        </span>
      </div>

      <div style={styles.messageBox}>{task.message || 'No message captured.'}</div>

      <div style={styles.inlineGrid}>
        <label style={styles.field}>
          <span style={styles.label}>Status</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
            style={styles.select}
          >
            <option value="new">New</option>
            <option value="drafting">Drafting</option>
            <option value="ready">Ready</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Priority</span>
          <select
            value={draft.priority}
            onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
            style={styles.select}
          >
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Assigned to</span>
          <input
            value={draft.assignedTo}
            onChange={(event) => setDraft({ ...draft, assignedTo: event.target.value })}
            style={styles.input}
          />
        </label>
      </div>

      <label style={styles.field}>
        <span style={styles.label}>Suggested reply</span>
        <textarea
          value={draft.suggestedReply}
          onChange={(event) => setDraft({ ...draft, suggestedReply: event.target.value })}
          rows={3}
          style={styles.textarea}
        />
      </label>

      <label style={styles.field}>
        <span style={styles.label}>Suggested action</span>
        <textarea
          value={draft.suggestedAction}
          onChange={(event) => setDraft({ ...draft, suggestedAction: event.target.value })}
          rows={2}
          style={styles.textarea}
        />
      </label>

      <label style={styles.field}>
        <span style={styles.label}>Operator note</span>
        <textarea
          value={draft.note}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          rows={2}
          style={styles.textarea}
        />
      </label>

      <label style={styles.field}>
        <span style={styles.label}>Outcome</span>
        <input
          value={draft.outcome}
          onChange={(event) => setDraft({ ...draft, outcome: event.target.value })}
          placeholder="Sent, removed, escalated, no response, etc."
          style={styles.input}
        />
      </label>

      <div style={styles.taskFooter}>
        <div style={styles.taskLinks}>
          {task.actionUrl ? (
            <a href={task.actionUrl} target="_blank" rel="noreferrer" style={styles.link}>
              Open source
            </a>
          ) : (
            <span style={styles.linkMuted}>No source URL yet</span>
          )}
          <span style={styles.linkMuted}>Updated {formatDate(task.updatedAt)}</span>
        </div>
        <div style={styles.taskActions}>
          <button
            onClick={() => onGenerateDraft(task.taskId)}
            style={styles.secondaryButton}
            disabled={isDrafting || !canGenerateDraft}
          >
            {isDrafting ? 'Drafting…' : (canGenerateDraft ? 'Generate Draft' : 'Drafting unavailable')}
          </button>
          <button
            onClick={handleCopyDraft}
            style={styles.secondaryButton}
            disabled={!draft.suggestedReply && !draft.suggestedAction}
          >
            Copy Draft
          </button>
          <button
            onClick={() => onSave(task.taskId, draft)}
            style={styles.secondaryButton}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save task'}
          </button>
        </div>
      </div>
    </article>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f6f2e8 0%, #fffdfa 45%, #ffffff 100%)',
    color: '#1f1f1a',
    fontFamily: 'Georgia, ui-serif, serif',
    padding: '2rem 1.25rem 4rem',
  },
  hero: {
    maxWidth: '1180px',
    margin: '0 auto 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'flex-end',
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
    fontSize: '0.75rem',
    color: '#7c5c42',
    marginBottom: '0.5rem',
  },
  heading: {
    fontSize: 'clamp(2rem, 4vw, 3.5rem)',
    lineHeight: 1,
    margin: 0,
  },
  subheading: {
    maxWidth: '760px',
    fontSize: '1rem',
    lineHeight: 1.6,
    color: '#5c5145',
    margin: '0.9rem 0 0',
  },
  heroMeta: {
    minWidth: '180px',
    padding: '1rem 1.1rem',
    background: '#1f1f1a',
    color: '#f9f4ed',
    borderRadius: '20px',
    textAlign: 'center',
  },
  heroMetaLabel: {
    fontSize: '0.75rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  heroMetaValue: {
    fontSize: '2.3rem',
    lineHeight: 1,
    margin: '0.35rem 0',
  },
  heroMetaHint: {
    fontSize: '0.95rem',
    opacity: 0.82,
  },
  secondaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.7rem 1rem',
    borderRadius: '999px',
    border: '1px solid #d8cdbc',
    background: '#fffdf8',
    color: '#40362d',
    textDecoration: 'none',
    fontWeight: 600,
  },
  warningCard: {
    maxWidth: '1180px',
    margin: '0 auto 1rem',
    padding: '1rem 1.1rem',
    borderRadius: '18px',
    background: '#fff1cb',
    border: '1px solid #ebcd72',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'center',
  },
  successCard: {
    maxWidth: '1180px',
    margin: '0 auto 1rem',
    padding: '1rem 1.1rem',
    borderRadius: '18px',
    background: '#edf8ed',
    border: '1px solid #b9ddb9',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    marginBottom: '0.25rem',
  },
  cardText: {
    margin: 0,
    lineHeight: 1.5,
    color: '#584d40',
  },
  errorCard: {
    maxWidth: '1180px',
    margin: '0 auto 1rem',
    padding: '1rem 1.1rem',
    borderRadius: '14px',
    background: '#ffe0dc',
    border: '1px solid #f2a79c',
    color: '#7d2418',
  },
  grid: {
    maxWidth: '1180px',
    margin: '0 auto 1rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '1rem',
  },
  statusCard: {
    background: 'rgba(255,255,255,0.9)',
    borderRadius: '18px',
    border: '1px solid #eadfce',
    padding: '1rem',
    boxShadow: '0 18px 45px rgba(95, 76, 52, 0.08)',
  },
  statusLabel: {
    fontSize: '0.82rem',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: '#7c5c42',
    marginBottom: '0.45rem',
  },
  statusValue: {
    fontSize: '1.35rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
  },
  statusList: {
    fontSize: '0.94rem',
    lineHeight: 1.6,
    color: '#5c5145',
  },
  panel: {
    maxWidth: '1180px',
    margin: '0 auto 1rem',
    background: 'rgba(255,255,255,0.92)',
    borderRadius: '22px',
    border: '1px solid #eadfce',
    padding: '1.2rem',
    boxShadow: '0 18px 45px rgba(95, 76, 52, 0.08)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  panelTitle: {
    fontSize: '1.4rem',
    margin: 0,
  },
  panelSubtitle: {
    margin: '0.35rem 0 0',
    color: '#6c6156',
    lineHeight: 1.5,
  },
  captureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '1rem',
  },
  captureCard: {
    borderRadius: '18px',
    border: '1px solid #e6d7c4',
    background: '#fffcf7',
    padding: '1rem',
  },
  captureTitle: {
    display: 'block',
    fontSize: '1rem',
    marginBottom: '0.45rem',
  },
  captureList: {
    margin: '0.5rem 0 0',
    paddingLeft: '1.15rem',
    color: '#584d40',
    lineHeight: 1.6,
  },
  countBadge: {
    minWidth: '44px',
    height: '44px',
    borderRadius: '999px',
    background: '#f2eadc',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 700,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '0.9rem 1rem',
  },
  inlineGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '0.9rem 1rem',
  },
  field: {
    display: 'grid',
    gap: '0.35rem',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#4f453a',
  },
  input: {
    width: '100%',
    borderRadius: '12px',
    border: '1px solid #d8cab6',
    padding: '0.8rem 0.9rem',
    fontSize: '0.95rem',
    background: '#fffdf9',
    color: '#1f1f1a',
  },
  select: {
    width: '100%',
    borderRadius: '12px',
    border: '1px solid #d8cab6',
    padding: '0.8rem 0.9rem',
    fontSize: '0.95rem',
    background: '#fffdf9',
    color: '#1f1f1a',
  },
  textarea: {
    width: '100%',
    borderRadius: '12px',
    border: '1px solid #d8cab6',
    padding: '0.8rem 0.9rem',
    fontSize: '0.95rem',
    background: '#fffdf9',
    color: '#1f1f1a',
    resize: 'vertical',
  },
  primaryButton: {
    border: 'none',
    borderRadius: '999px',
    background: '#1f1f1a',
    color: '#f9f4ed',
    padding: '0.85rem 1.25rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid #cbb79c',
    borderRadius: '999px',
    background: '#fffdf9',
    color: '#3b3128',
    padding: '0.78rem 1.15rem',
    fontSize: '0.92rem',
    cursor: 'pointer',
  },
  primaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '999px',
    background: '#1f1f1a',
    color: '#f9f4ed',
    padding: '0.85rem 1.25rem',
    fontSize: '0.95rem',
    cursor: 'grab',
    textDecoration: 'none',
    fontWeight: 600,
  },
  workflowStack: {
    maxWidth: '1180px',
    margin: '0 auto',
  },
  taskStack: {
    display: 'grid',
    gap: '0.9rem',
  },
  taskCard: {
    borderRadius: '18px',
    border: '1px solid #e6d7c4',
    background: '#fffcf7',
    padding: '1rem',
  },
  taskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'flex-start',
    marginBottom: '0.8rem',
  },
  taskMeta: {
    display: 'flex',
    gap: '0.65rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  taskHandle: {
    fontWeight: 700,
    fontSize: '1rem',
  },
  taskTimestamp: {
    fontSize: '0.88rem',
    color: '#7b7065',
  },
  taskSecondaryMeta: {
    fontSize: '0.86rem',
    color: '#7b7065',
    marginTop: '0.2rem',
  },
  statusPill: {
    borderRadius: '999px',
    padding: '0.4rem 0.7rem',
    textTransform: 'capitalize',
    fontSize: '0.84rem',
    fontWeight: 700,
  },
  messageBox: {
    borderRadius: '14px',
    background: '#f8f2e8',
    padding: '0.9rem',
    marginBottom: '0.9rem',
    lineHeight: 1.55,
    color: '#41372e',
    whiteSpace: 'pre-wrap',
  },
  taskFooter: {
    marginTop: '0.95rem',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  taskLinks: {
    display: 'flex',
    gap: '0.9rem',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  link: {
    color: '#83572c',
    textDecoration: 'underline',
  },
  linkMuted: {
    color: '#7b7065',
    fontSize: '0.88rem',
  },
  taskActions: {
    display: 'flex',
    gap: '0.65rem',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  emptyState: {
    borderRadius: '14px',
    background: '#faf5ec',
    padding: '1rem',
    color: '#6c6156',
  },
};
