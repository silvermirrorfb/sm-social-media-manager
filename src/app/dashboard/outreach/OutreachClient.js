'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './outreach.module.css';

const SAMPLE_HEADERS = 'platform,username,name,first_name,recipient_id,notes,email';
const LOCAL_TEMPLATE_KEY = 'sm_outreach_templates_v1';

function normalizePlatform(value, fallback = 'instagram') {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (['instagram', 'facebook', 'tiktok'].includes(normalized)) return normalized;
  return fallback;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  const input = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if (char === '\n' && !inQuotes) {
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);

  return rows;
}

function looksLikeHeader(row = []) {
  const joined = row.join(',').toLowerCase();
  return ['platform', 'username', 'recipient_id', 'name', 'first_name', 'notes', 'email']
    .some((token) => joined.includes(token));
}

function getHeaderMap(headerRow = []) {
  const aliases = {
    platform: ['platform', 'channel'],
    username: ['username', 'handle', 'ig_username', 'instagram_username', 'tiktok_username'],
    name: ['name', 'full_name'],
    firstName: ['first_name', 'firstname', 'first'],
    recipientId: ['recipient_id', 'recipientid', 'user_id', 'ig_user_id', 'psid', 'facebook_id'],
    notes: ['notes', 'note', 'context'],
    email: ['email', 'email_address'],
  };

  const lowerHeaders = headerRow.map((value) => String(value || '').trim().toLowerCase());
  const map = {};

  Object.entries(aliases).forEach(([key, options]) => {
    const index = lowerHeaders.findIndex((header) => options.includes(header));
    if (index >= 0) map[key] = index;
  });

  return map;
}

function toContact(row, headerMap, index, defaultPlatform) {
  const fromMap = (key) => {
    if (typeof headerMap[key] !== 'number') return '';
    return String(row[headerMap[key]] || '').trim();
  };

  const singleCell = row.length === 1 ? String(row[0] || '').trim() : '';
  const inferredUsername = singleCell.replace(/^@/, '');
  const platform = normalizePlatform(fromMap('platform'), defaultPlatform);

  const username = fromMap('username') || (singleCell.startsWith('@') ? inferredUsername : '');
  const name = fromMap('name') || (!singleCell.startsWith('@') ? singleCell : '');

  return {
    id: `${Date.now()}-${index}`,
    platform,
    username,
    name,
    firstName: fromMap('firstName'),
    recipientId: fromMap('recipientId'),
    notes: fromMap('notes'),
    email: fromMap('email'),
  };
}

function parseContacts(rawText, defaultPlatform) {
  const rows = parseCsvRows(rawText);
  if (rows.length === 0) return [];

  let startIndex = 0;
  let headerMap = {
    platform: -1,
    username: 0,
    name: 1,
    firstName: 2,
    recipientId: 3,
    notes: 4,
    email: 5,
  };

  if (looksLikeHeader(rows[0])) {
    headerMap = getHeaderMap(rows[0]);
    startIndex = 1;
  }

  const contacts = [];
  for (let i = startIndex; i < rows.length; i += 1) {
    const contact = toContact(rows[i], headerMap, i, defaultPlatform);
    const hasIdentity = contact.username || contact.name || contact.recipientId || contact.email;
    if (hasIdentity) contacts.push(contact);
  }

  return contacts;
}

function statusClass(status) {
  if (status === 'sent') return styles.chipLive;
  if (status === 'failed') return styles.chipError;
  if (status === 'skipped') return styles.chipSkip;
  return styles.chipDraft;
}

function toCsv(value) {
  if (value == null) return '';
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export default function OutreachPage() {
  const [campaignName, setCampaignName] = useState('Influencer Outreach');
  const [defaultPlatform, setDefaultPlatform] = useState('instagram');
  const [basePitch, setBasePitch] = useState(
    "We'd love to invite you in for a Silver Mirror experience and collaborate on content if it's a fit."
  );
  const [rawContacts, setRawContacts] = useState(`${SAMPLE_HEADERS}\ninstagram,@examplecreator,Example Creator,Example,,Beauty/lifestyle creator,`);
  const [contacts, setContacts] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sendSummary, setSendSummary] = useState(null);
  const [templateName, setTemplateName] = useState('Brand Collab Template');
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [segmentQuery, setSegmentQuery] = useState('');
  const [followUpGoal, setFollowUpGoal] = useState('Quick nudge and invite them to reply if interested.');
  const [followUpNumber, setFollowUpNumber] = useState(1);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_TEMPLATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedTemplates(parsed);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_TEMPLATE_KEY, JSON.stringify(savedTemplates));
    } catch {
      // noop
    }
  }, [savedTemplates]);

  const sendableDrafts = useMemo(
    () => drafts.filter((item) => item.canSendNow),
    [drafts]
  );

  const selectedSendableCount = useMemo(() => {
    let count = 0;
    drafts.forEach((item) => {
      if (item.canSendNow && selectedIds.has(item.id)) count += 1;
    });
    return count;
  }, [drafts, selectedIds]);

  const selectedDraftCount = useMemo(() => {
    let count = 0;
    drafts.forEach((item) => {
      if (selectedIds.has(item.id)) count += 1;
    });
    return count;
  }, [drafts, selectedIds]);

  const failedSendableCount = useMemo(
    () => drafts.filter((item) => item.status === 'failed' && item.canSendNow).length,
    [drafts]
  );

  function buildSendItemsFromDrafts(sourceDrafts) {
    return sourceDrafts
      .filter((item) => item.canSendNow)
      .map((item) => ({
        id: item.id,
        platform: item.platform,
        recipientId: item.recipientId,
        username: item.username,
        name: item.name,
        message: item.message,
      }));
  }

  function handleParse() {
    setIsParsing(true);
    setErrorMessage('');

    try {
      const parsed = parseContacts(rawContacts, defaultPlatform);
      setContacts(parsed);
      setDrafts([]);
      setSelectedIds(new Set());
      setSendSummary(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to parse CSV.');
    } finally {
      setIsParsing(false);
    }
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawContacts(text);
  }

  async function handleGenerate() {
    setErrorMessage('');
    setIsGenerating(true);
    setSendSummary(null);

    try {
      const response = await fetch('/dashboard/api/outreach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName,
          defaultPlatform,
          basePitch,
          contacts,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Draft generation failed.');
      }

      setDrafts(payload.results || []);
      const nextSelected = new Set();
      (payload.results || []).forEach((item) => {
        if (item.canSendNow) nextSelected.add(item.id);
      });
      setSelectedIds(nextSelected);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Draft generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function sendItems(items) {
    setErrorMessage('');
    setIsSending(true);

    try {
      if (items.length === 0) {
        throw new Error('No sendable recipients selected.');
      }

      const response = await fetch('/dashboard/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName,
          items,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Bulk send failed.');
      }

      setSendSummary(payload);
      const statusMapById = new Map((payload.results || []).map((item) => [item.id, item]));
      const statusMapByKey = new Map((payload.results || []).map((item) => [`${item.platform}:${item.recipientId}:${item.message}`, item]));
      setDrafts((current) =>
        current.map((draft) => {
          const byId = statusMapById.get(draft.id);
          const byKey = statusMapByKey.get(`${draft.platform}:${draft.recipientId}:${draft.message}`);
          const result = byId || byKey;
          if (!result) return draft;
          return {
            ...draft,
            status: result.status,
            sendReason: result.reason || '',
          };
        })
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Bulk send failed.');
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendSelected() {
    const items = buildSendItemsFromDrafts(drafts.filter((item) => selectedIds.has(item.id)));
    await sendItems(items);
  }

  function saveCurrentTemplate() {
    const name = templateName.trim();
    if (!name) {
      setErrorMessage('Template name is required.');
      return;
    }

    const next = [
      {
        id: `${Date.now()}`,
        name,
        campaignName,
        defaultPlatform,
        basePitch,
        followUpGoal,
        createdAt: new Date().toISOString(),
      },
      ...savedTemplates.filter((item) => item.name !== name),
    ].slice(0, 25);
    setSavedTemplates(next);
    setSelectedTemplateId(next[0]?.id || '');
  }

  function applySelectedTemplate() {
    const selected = savedTemplates.find((item) => item.id === selectedTemplateId);
    if (!selected) return;
    setTemplateName(selected.name || templateName);
    setCampaignName(selected.campaignName || campaignName);
    setDefaultPlatform(selected.defaultPlatform || defaultPlatform);
    setBasePitch(selected.basePitch || basePitch);
    setFollowUpGoal(selected.followUpGoal || followUpGoal);
  }

  function deleteSelectedTemplate() {
    if (!selectedTemplateId) return;
    const next = savedTemplates.filter((item) => item.id !== selectedTemplateId);
    setSavedTemplates(next);
    setSelectedTemplateId(next[0]?.id || '');
  }

  function setSelectionBySegment(mode) {
    const next = new Set();
    const query = segmentQuery.trim().toLowerCase();
    drafts.forEach((item) => {
      const haystack = [item.username, item.name, item.notes, item.email, item.platform]
        .join(' ')
        .toLowerCase();

      const matchesCustom = query && haystack.includes(query);
      if (mode === 'all') next.add(item.id);
      if (mode === 'sendable' && item.canSendNow) next.add(item.id);
      if (mode === 'failed' && item.status === 'failed') next.add(item.id);
      if (mode === 'instagram' && item.platform === 'instagram') next.add(item.id);
      if (mode === 'facebook' && item.platform === 'facebook') next.add(item.id);
      if (mode === 'tiktok' && item.platform === 'tiktok') next.add(item.id);
      if (mode === 'custom' && matchesCustom) next.add(item.id);
    });
    setSelectedIds(next);
  }

  async function generateFollowUpForSelected() {
    setErrorMessage('');
    setIsGenerating(true);

    try {
      const items = drafts.filter((item) => selectedIds.has(item.id));
      if (items.length === 0) {
        throw new Error('Select at least one draft first.');
      }

      const response = await fetch('/dashboard/api/outreach/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName,
          followUpGoal,
          followUpNumber,
          items,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to generate follow-up drafts.');
      }

      const map = new Map((payload.results || []).map((item) => [item.id, item]));
      setDrafts((current) => current.map((draft) => map.get(draft.id) || draft));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Follow-up generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function retryFailedSends() {
    const failedDrafts = drafts.filter((item) => item.status === 'failed' && item.canSendNow);
    if (failedDrafts.length === 0) {
      setErrorMessage('No failed sendable drafts to retry.');
      return;
    }
    setSelectedIds(new Set(failedDrafts.map((item) => item.id)));
    const items = buildSendItemsFromDrafts(failedDrafts);
    await sendItems(items);
  }

  async function copyDraftsToClipboard() {
    const text = drafts
      .map((item) => {
        const who = item.username ? `@${item.username}` : item.name || item.recipientId || 'contact';
        return `${who}\n${item.message}\n`;
      })
      .join('\n');

    await navigator.clipboard.writeText(text);
  }

  function downloadDraftCsv() {
    const lines = [
      ['platform', 'username', 'name', 'first_name', 'recipient_id', 'email', 'notes', 'message', 'status', 'send_reason'],
      ...drafts.map((item) => [
        item.platform,
        item.username,
        item.name,
        item.firstName,
        item.recipientId,
        item.email,
        item.notes,
        item.message,
        item.status || '',
        item.sendReason || '',
      ]),
    ];

    const csv = lines.map((line) => line.map(toCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `outreach-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Silver Mirror Outreach CRM</p>
          <div className={styles.heroTop}>
            <div>
              <h1 className={styles.title}>Bulk influencer outreach with AI-personalized drafts</h1>
              <p className={styles.lede}>
                Upload or paste contacts, write your base pitch once, and generate customized messages in bulk.
                Send live for Instagram/Facebook recipients with `recipient_id`, or export/copy drafts.
              </p>
            </div>
            <div className={styles.buttonRow}>
              <Link href="/dashboard" className={styles.linkButton}>Back to Dashboard</Link>
              <Link href="/tiktok/connect" className={styles.linkButton}>TikTok Connect</Link>
            </div>
          </div>
        </section>

        <div className={styles.grid}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Campaign setup</h2>
            <div className={styles.row}>
              <div>
                <label className={styles.label} htmlFor="campaignName">Campaign name</label>
                <input
                  id="campaignName"
                  className={styles.input}
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="defaultPlatform">Default platform</label>
                <select
                  id="defaultPlatform"
                  className={styles.select}
                  value={defaultPlatform}
                  onChange={(event) => setDefaultPlatform(event.target.value)}
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok (draft/export)</option>
                </select>
              </div>
            </div>

            <div className={styles.toolbarGrid}>
              <div>
                <label className={styles.label} htmlFor="selectedTemplateId">Saved template</label>
                <select
                  id="selectedTemplateId"
                  className={styles.select}
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                >
                  <option value="">Select a template...</option>
                  {savedTemplates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <div className={styles.buttonRow} style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className={`${styles.secondaryButton} ${!selectedTemplateId ? styles.disabled : ''}`}
                    onClick={applySelectedTemplate}
                    disabled={!selectedTemplateId}
                  >
                    Apply Template
                  </button>
                  <button
                    type="button"
                    className={`${styles.secondaryButton} ${!selectedTemplateId ? styles.disabled : ''}`}
                    onClick={deleteSelectedTemplate}
                    disabled={!selectedTemplateId}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div>
                <label className={styles.label} htmlFor="templateName">Template name</label>
                <input
                  id="templateName"
                  className={styles.input}
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
                <button
                  type="button"
                  className={`${styles.secondaryButton} ${!templateName.trim() ? styles.disabled : ''}`}
                  onClick={saveCurrentTemplate}
                  disabled={!templateName.trim()}
                  style={{ marginTop: 8 }}
                >
                  Save Current as Template
                </button>
              </div>

              <div>
                <label className={styles.label} htmlFor="followUpGoal">Default follow-up goal</label>
                <textarea
                  id="followUpGoal"
                  className={styles.textarea}
                  value={followUpGoal}
                  onChange={(event) => setFollowUpGoal(event.target.value)}
                  style={{ minHeight: 110 }}
                />
                <p className={styles.subtle}>Used by the follow-up generator for selected drafts.</p>
              </div>
            </div>

            <label className={styles.label} htmlFor="basePitch">Base pitch</label>
            <textarea
              id="basePitch"
              className={styles.textarea}
              value={basePitch}
              onChange={(event) => setBasePitch(event.target.value)}
            />
            <p className={styles.help}>
              The bot rewrites this per contact. Keep the intent clear, then let AI personalize tone/opening.
            </p>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Contacts import</h2>
            <label className={styles.label} htmlFor="csvInput">Paste CSV or one handle/name per line</label>
            <textarea
              id="csvInput"
              className={styles.textarea}
              value={rawContacts}
              onChange={(event) => setRawContacts(event.target.value)}
            />
            <p className={styles.help}>Suggested headers: <code>{SAMPLE_HEADERS}</code></p>
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${isParsing ? styles.disabled : ''}`}
                onClick={handleParse}
                disabled={isParsing}
              >
                {isParsing ? 'Parsing...' : 'Parse Contacts'}
              </button>
              <label className={styles.linkButton} htmlFor="csvFileInput">
                Upload CSV
              </label>
              <input
                id="csvFileInput"
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
          </section>
        </div>

        <section className={styles.card} style={{ marginTop: 16 }}>
          <h2 className={styles.cardTitle}>Workflow</h2>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={`${styles.primaryButton} ${isGenerating || contacts.length === 0 ? styles.disabled : ''}`}
              onClick={handleGenerate}
              disabled={isGenerating || contacts.length === 0}
            >
              {isGenerating ? 'Generating drafts...' : 'Generate Personalized Drafts'}
            </button>
            <button
              type="button"
              className={`${styles.secondaryButton} ${drafts.length === 0 ? styles.disabled : ''}`}
              onClick={copyDraftsToClipboard}
              disabled={drafts.length === 0}
            >
              Copy Drafts
            </button>
            <button
              type="button"
              className={`${styles.secondaryButton} ${drafts.length === 0 ? styles.disabled : ''}`}
              onClick={downloadDraftCsv}
              disabled={drafts.length === 0}
            >
              Export Draft CSV
            </button>
            <button
              type="button"
              className={`${styles.dangerButton} ${isSending || selectedSendableCount === 0 ? styles.disabled : ''}`}
              onClick={handleSendSelected}
              disabled={isSending || selectedSendableCount === 0}
            >
              {isSending ? 'Sending...' : `Send Selected Live (${selectedSendableCount})`}
            </button>
          </div>

          <div className={styles.chipRow}>
            <button type="button" className={styles.chipButton} onClick={() => setSelectionBySegment('all')}>
              Select All Drafts
            </button>
            <button type="button" className={styles.chipButton} onClick={() => setSelectionBySegment('sendable')}>
              Select Sendable
            </button>
            <button type="button" className={styles.chipButton} onClick={() => setSelectionBySegment('failed')}>
              Select Failed
            </button>
            <button type="button" className={styles.chipButton} onClick={() => setSelectionBySegment('instagram')}>
              Instagram
            </button>
            <button type="button" className={styles.chipButton} onClick={() => setSelectionBySegment('facebook')}>
              Facebook
            </button>
            <button type="button" className={styles.chipButton} onClick={() => setSelectionBySegment('tiktok')}>
              TikTok
            </button>
            <button
              type="button"
              className={styles.chipButton}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
          <div className={styles.row} style={{ marginTop: 10 }}>
            <div>
              <label className={styles.label} htmlFor="segmentQuery">Segment filter (name, username, note, email)</label>
              <input
                id="segmentQuery"
                className={styles.input}
                value={segmentQuery}
                onChange={(event) => setSegmentQuery(event.target.value)}
                placeholder="e.g. miami, wellness, @handle"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${!segmentQuery.trim() ? styles.disabled : ''}`}
                onClick={() => setSelectionBySegment('custom')}
                disabled={!segmentQuery.trim()}
              >
                Select Matching Segment
              </button>
            </div>
          </div>

          <div className={styles.row} style={{ marginTop: 10 }}>
            <div>
              <label className={styles.label} htmlFor="followUpNumber">Follow-up number</label>
              <input
                id="followUpNumber"
                type="number"
                min="1"
                max="4"
                className={styles.input}
                value={followUpNumber}
                onChange={(event) => {
                  const next = Number(event.target.value || 1);
                  if (Number.isNaN(next)) return;
                  setFollowUpNumber(Math.max(1, Math.min(4, next)));
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${isGenerating || selectedDraftCount === 0 ? styles.disabled : ''}`}
                onClick={generateFollowUpForSelected}
                disabled={isGenerating || selectedDraftCount === 0}
              >
                {isGenerating ? 'Generating...' : `Generate Follow-up (${selectedDraftCount})`}
              </button>
              <button
                type="button"
                className={`${styles.secondaryButton} ${isSending || failedSendableCount === 0 ? styles.disabled : ''}`}
                onClick={retryFailedSends}
                disabled={isSending || failedSendableCount === 0}
              >
                Retry Failed Sends ({failedSendableCount})
              </button>
            </div>
          </div>

          <div className={styles.warning}>
            Outbound platform policies still apply. Live send currently supports Instagram + Facebook rows that include `recipient_id`.
            TikTok is draft/export mode in this app for now.
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Parsed Contacts</div>
              <div className={styles.statValue}>{contacts.length}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Generated Drafts</div>
              <div className={styles.statValue}>{drafts.length}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Sendable Now</div>
              <div className={styles.statValue}>{sendableDrafts.length}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Selected to Send</div>
              <div className={styles.statValue}>{selectedSendableCount}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Selected Drafts</div>
              <div className={styles.statValue}>{selectedDraftCount}</div>
            </div>
          </div>

          {errorMessage ? <div className={styles.warning} style={{ marginTop: 12 }}>{errorMessage}</div> : null}
          {sendSummary ? (
            <div className={styles.warning} style={{ marginTop: 12 }}>
              Send complete: {sendSummary.sentCount} sent, {sendSummary.failedCount} failed, {sendSummary.skippedCount} skipped.
            </div>
          ) : null}
        </section>

        <section className={styles.card} style={{ marginTop: 16 }}>
          <h2 className={styles.cardTitle}>Contact preview</h2>
          {contacts.length === 0 ? (
            <p className={styles.help}>Parse contacts to preview rows before generation.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Recipient ID</th>
                    <th>Email</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>{contact.platform}</td>
                      <td>{contact.username ? `@${contact.username}` : ''}</td>
                      <td>{contact.name || contact.firstName || ''}</td>
                      <td className={styles.mono}>{contact.recipientId || ''}</td>
                      <td>{contact.email || ''}</td>
                      <td>{contact.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.card} style={{ marginTop: 16 }}>
          <h2 className={styles.cardTitle}>Generated drafts</h2>
          {drafts.length === 0 ? (
            <p className={styles.help}>Generate drafts to review personalized messages here.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Send</th>
                    <th>Status</th>
                    <th>Platform</th>
                    <th>Who</th>
                    <th>Recipient ID</th>
                    <th>Message</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={(event) => {
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td>
                        <span className={statusClass(item.status)}>
                          {item.status || 'draft'}
                        </span>
                      </td>
                      <td>{item.platform}</td>
                      <td>{item.username ? `@${item.username}` : (item.name || item.email || 'Unknown')}</td>
                      <td className={styles.mono}>{item.recipientId || ''}</td>
                      <td>{item.message}</td>
                      <td>{item.sendReason || (item.canSendNow ? 'ready_to_send' : 'draft_only_or_missing_recipient_id')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
