'use client';

export default function Dashboard() {
  return (
    <main style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '2rem',
      maxWidth: '800px',
      margin: '0 auto',
      color: '#333',
    }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
        Silver Mirror — Social Media Manager
      </h1>
      <p style={{ color: '#888', marginBottom: '2rem' }}>
        Instagram DM &amp; Comment Moderation Dashboard
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <StatusCard title="Webhook" endpoint="/api/instagram/webhook" />
        <StatusCard title="Health" endpoint="/api/health" />
      </div>

      <div style={{
        background: '#f9f9f9',
        borderRadius: '8px',
        padding: '1.5rem',
        border: '1px solid #eee',
      }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Setup Checklist</h2>
        <ul style={{ lineHeight: '2', paddingLeft: '1.2rem' }}>
          <li>☐ Create Meta Developer App</li>
          <li>☐ Configure Instagram webhook URL</li>
          <li>☐ Set environment variables in Vercel</li>
          <li>☐ Submit Meta App Review</li>
          <li>☐ Create Google Sheet for logging</li>
          <li>☐ Test with Instagram test account</li>
          <li>☐ Go live</li>
        </ul>
      </div>
    </main>
  );
}

function StatusCard({ title, endpoint }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '1rem',
      border: '1px solid #eee',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{title}</div>
      <code style={{ fontSize: '0.8rem', color: '#666' }}>{endpoint}</code>
    </div>
  );
}
