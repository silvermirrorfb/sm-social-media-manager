import { getEnv } from './env';

// ─── Instagram Graph API Helpers ────────────────────────────
// Handles all communication with Meta's Instagram Graph API.
// Docs: https://developers.facebook.com/docs/instagram-platform

const GRAPH_URL = 'https://graph.instagram.com/v21.0';

function getInstagramConfig() {
  return {
    accessToken: getEnv('INSTAGRAM_ACCESS_TOKEN'),
    accountId: getEnv('INSTAGRAM_ACCOUNT', 'INSTAGRAM_ACCOUNT_ID'),
  };
}

function getRequestHeaders() {
  const { accessToken } = getInstagramConfig();
  if (!accessToken) {
    throw new Error('Missing INSTAGRAM_ACCESS_TOKEN');
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function parseApiError(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─── Send a DM reply ────────────────────────────────────────
export async function sendDirectMessage(recipientId, text) {
  const { accountId } = getInstagramConfig();
  if (!accountId) {
    throw new Error('Missing Instagram account ID');
  }

  const url = `${GRAPH_URL}/${accountId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Instagram] Send DM failed:', {
      status: res.status,
      recipientId,
      error: err,
    });
    throw new Error(`Send DM failed: ${res.status}`);
  }

  return res.json();
}

// ─── Reply to a comment ─────────────────────────────────────
export async function replyToComment(commentId, text) {
  const url = `${GRAPH_URL}/${commentId}/replies`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      message: text,
    }),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Instagram] Reply to comment failed:', {
      status: res.status,
      commentId,
      error: err,
    });
    throw new Error(`Reply to comment failed: ${res.status}`);
  }

  return res.json();
}

// ─── Hide a comment (better than delete — reversible) ───────
export async function hideComment(commentId) {
  const url = `${GRAPH_URL}/${commentId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      hide: true,
    }),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Instagram] Hide comment failed:', {
      status: res.status,
      commentId,
      error: err,
    });
    throw new Error(`Hide comment failed: ${res.status}`);
  }

  return res.json();
}

// ─── Get comment details ────────────────────────────────────
export async function getComment(commentId) {
  const url = `${GRAPH_URL}/${commentId}?fields=id,text,username,timestamp,from`;
  const res = await fetch(url, {
    headers: getRequestHeaders(),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Instagram] Get comment failed:', {
      status: res.status,
      commentId,
      error: err,
    });
    return null;
  }

  return res.json();
}

// ─── Get user profile info ──────────────────────────────────
export async function getUserProfile(userId) {
  const url = `${GRAPH_URL}/${userId}?fields=id,username,name`;
  const res = await fetch(url, {
    headers: getRequestHeaders(),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Instagram] Get user profile failed:', {
      status: res.status,
      userId,
      error: err,
    });
    return { id: userId, username: 'unknown', name: 'Unknown' };
  }

  return res.json();
}
