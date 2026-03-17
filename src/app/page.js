export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Silver Mirror Social Media Manager</h1>
      <p>AI-powered social inbox, moderation, and customer-support management for Silver Mirror.</p>
      <p><a href="/dashboard">→ Dashboard</a></p>
      <p><a href="/tiktok/connect">→ TikTok Connect</a></p>
      <p><a href="/privacy">Privacy Policy</a> {' · '} <a href="/terms">Terms of Service</a></p>
      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '2rem' }}>
        Webhook endpoint: <code>/api/instagram/webhook</code>
      </p>
    </main>
  );
}
