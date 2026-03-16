import { getEnv } from './env';

// ─── Facebook Graph API Helpers ─────────────────────────────
// Handles all communication with Meta's Facebook Graph API.
// Mirrors the Instagram helper pattern for consistency.
// Docs: https://developers.facebook.com/docs/graph-api

const GRAPH_URL = 'https://graph.facebook.com/v21.0';

function getFacebookConfig() {
  return {
    accessToken: getEnv('FACEBOOK_PAGE_ACCESS_TOKEN'),
    pageId: getEnv('FACEBOOK_PAGE_ID'),
  };
}

function getRequestHeaders() {
  const { accessToken } = getFacebookConfig();
  if (!accessToken) {
    throw new Error('Missing FACEBOOK_PAGE_ACCESS_TOKEN');
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

// ─── Send a Messenger reply ─────────────────────────────────
export async function sendMessengerMessage(recipientId, text) {
  const { pageId } = getFacebookConfig();
  if (!pageId) {
    throw new Error('Missing FACEBOOK_PAGE_ID');
  }

  const url = `${GRAPH_URL}/${pageId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
    }),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Facebook] Send Messenger message failed:', {
      status: res.status,
      recipientId,
      error: err,
    });
    throw new Error(`Send Messenger message failed: ${res.status}`);
  }

  return res.json();
}

// ─── Reply to a Page comment ────────────────────────────────
export async function replyToPageComment(commentId, text) {
  const url = `${GRAPH_URL}/${commentId}/comments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      message: text,
    }),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Facebook] Reply to comment failed:', {
      status: res.status,
      commentId,
      error: err,
    });
    throw new Error(`Reply to Page comment failed: ${res.status}`);
  }

  return res.json();
}

// ─── Hide a Page comment ────────────────────────────────────
export async function hidePageComment(commentId) {
  const url = `${GRAPH_URL}/${commentId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      is_hidden: true,
    }),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Facebook] Hide comment failed:', {
      status: res.status,
      commentId,
      error: err,
    });
    throw new Error(`Hide Page comment failed: ${res.status}`);
  }

  return res.json();
}

// ─── Get comment details ────────────────────────────────────
export async function getPageComment(commentId) {
  const url = `${GRAPH_URL}/${commentId}?fields=id,message,from,created_time`;
  const res = await fetch(url, {
    headers: getRequestHeaders(),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Facebook] Get comment failed:', {
      status: res.status,
      commentId,
      error: err,
    });
    return null;
  }

  return res.json();
}

// ─── Get user profile info ──────────────────────────────────
export async function getFacebookUserProfile(userId) {
  const url = `${GRAPH_URL}/${userId}?fields=id,name`;
  const res = await fetch(url, {
    headers: getRequestHeaders(),
  });

  if (!res.ok) {
    const err = await parseApiError(res);
    console.error('[Facebook] Get user profile failed:', {
      status: res.status,
      userId,
      error: err,
    });
    return { id: userId, name: 'Unknown' };
  }

  return res.json();
}
