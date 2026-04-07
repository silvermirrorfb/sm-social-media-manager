// ─── CRM Sync Module ────────────────────────────────────────
// Syncs with Replit Influencer CRM to suppress auto-replies
// to active outreach leads, and notifies the CRM when a
// recognized influencer replies.

import { getEnv, hasEnv } from './env';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedHandles = null;
let cacheTimestamp = 0;

function getCrmConfig() {
  return {
    baseUrl: getEnv('REPLIT_CRM_BASE_URL'),
    syncKey: getEnv('REPLIT_SYNC_API_KEY'),
  };
}

export function isCrmConfigured() {
  return hasEnv('REPLIT_CRM_BASE_URL') && hasEnv('REPLIT_SYNC_API_KEY');
}

export function normalizeHandle(handle) {
  let h = (handle || '')
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, '')
    .split('?')[0];
  if (h.includes('/')) {
    h = h.replace(/\/+$/, '');
    h = h.split('/').pop() || '';
  }
  return h;
}

export async function fetchContactedHandles() {
  const { baseUrl, syncKey } = getCrmConfig();
  if (!baseUrl || !syncKey) {
    return cachedHandles || new Map();
  }

  const now = Date.now();
  if (cachedHandles && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedHandles;
  }

  try {
    const url = `${baseUrl}/api/sync/contacted-handles`;
    const response = await fetch(url, {
      headers: { 'X-Sync-Key': syncKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`[CRM-SYNC] Failed to fetch handles: ${response.status} ${response.statusText}`);
      return cachedHandles || new Map();
    }

    const data = await response.json();
    const handleMap = new Map();

    for (const entry of data.handles || []) {
      handleMap.set(entry.normalizedHandle, {
        handle: entry.handle,
        platform: entry.platform,
        status: entry.status,
        name: entry.name,
        owner: entry.owner,
        dmSentAt: entry.dmSentAt,
      });
    }

    cachedHandles = handleMap;
    cacheTimestamp = now;
    console.log(`[CRM-SYNC] Refreshed handle cache: ${handleMap.size} contacted handles`);
    return handleMap;
  } catch (err) {
    console.error(`[CRM-SYNC] Error fetching handles: ${err.message}`);
    return cachedHandles || new Map();
  }
}

export async function isContactedInfluencer(username) {
  if (!isCrmConfigured()) return null;
  const handles = await fetchContactedHandles();
  const normalized = normalizeHandle(username);
  return handles.get(normalized) || null;
}

export async function notifyInboundReply(handle, platform, messagePreview) {
  const { baseUrl, syncKey } = getCrmConfig();
  if (!baseUrl || !syncKey) return null;

  try {
    const url = `${baseUrl}/api/sync/inbound-reply`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Sync-Key': syncKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        handle: normalizeHandle(handle),
        platform,
        messagePreview: (messagePreview || '').substring(0, 500),
        receivedAt: new Date().toISOString(),
        vercelAction: 'suppressed_auto_reply',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`[CRM-SYNC] Failed to notify inbound reply: ${response.status}`);
      return null;
    }

    const result = await response.json();
    console.log(`[CRM-SYNC] Notified CRM of inbound reply from @${handle}: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    console.error(`[CRM-SYNC] Error notifying inbound reply: ${err.message}`);
    return null;
  }
}
