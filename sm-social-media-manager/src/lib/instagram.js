// ─── Instagram Graph API Helpers ────────────────────────────
// Handles all communication with Meta's Instagram Graph API.
// Docs: https://developers.facebook.com/docs/instagram-platform

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
const GRAPH_URL = 'https://graph.instagram.com/v21.0';

// ─── Send a DM reply ────────────────────────────────────────
export async function sendDirectMessage(recipientId, text) {
  const url = `${GRAPH_URL}/${ACCOUNT_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      access_token: ACCESS_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Instagram] Send DM failed:', err);
    throw new Error(`Send DM failed: ${res.status}`);
  }

  return res.json();
}

// ─── Reply to a comment ─────────────────────────────────────
export async function replyToComment(commentId, text) {
  const url = `${GRAPH_URL}/${commentId}/replies`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text,
      access_token: ACCESS_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Instagram] Reply to comment failed:', err);
    throw new Error(`Reply to comment failed: ${res.status}`);
  }

  return res.json();
}

// ─── Hide a comment (better than delete — reversible) ───────
export async function hideComment(commentId) {
  const url = `${GRAPH_URL}/${commentId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hide: true,
      access_token: ACCESS_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Instagram] Hide comment failed:', err);
    throw new Error(`Hide comment failed: ${res.status}`);
  }

  return res.json();
}

// ─── Get comment details ────────────────────────────────────
export async function getComment(commentId) {
  const url = `${GRAPH_URL}/${commentId}?fields=id,text,username,timestamp,from&access_token=${ACCESS_TOKEN}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Instagram] Get comment failed:', err);
    return null;
  }

  return res.json();
}

// ─── Get user profile info ──────────────────────────────────
export async function getUserProfile(userId) {
  const url = `${GRAPH_URL}/${userId}?fields=id,username,name&access_token=${ACCESS_TOKEN}`;
  const res = await fetch(url);

  if (!res.ok) {
    return { id: userId, username: 'unknown', name: 'Unknown' };
  }

  return res.json();
}
