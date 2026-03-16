export const metadata = {
  title: 'Privacy Policy | Silver Mirror Social Media Manager',
  description: 'Privacy Policy for the Silver Mirror Social Media Manager web application.',
};

const sectionStyle = {
  marginTop: '1.5rem',
  lineHeight: 1.7,
};

export default function PrivacyPage() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '760px', margin: '0 auto' }}>
      <h1>Privacy Policy</h1>
      <p>Effective date: March 16, 2026</p>
      <p style={sectionStyle}>
        Silver Mirror Social Media Manager is an internal business tool used by Silver Mirror Facial Bar
        to review social-media messages, moderate comments, and support customer service workflows across
        supported channels.
      </p>

      <section style={sectionStyle}>
        <h2>Information We Process</h2>
        <p>
          The application may process direct messages, comments, usernames, timestamps, moderation outcomes,
          and related operational metadata from connected social-media accounts.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>How We Use Information</h2>
        <p>
          We use this information to help respond to customer inquiries, moderate public comments, route
          issues to human staff, maintain internal logs, and improve Silver Mirror&apos;s customer support
          operations.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Storage and Access</h2>
        <p>
          Operational data may be stored in connected infrastructure used by Silver Mirror, including Vercel,
          Google Sheets, and other approved internal systems. Access is limited to authorized Silver Mirror
          staff and service providers supporting the application.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Data Sharing</h2>
        <p>
          We do not sell personal information collected through this tool. Data may be shared only with
          service providers and platform partners as needed to operate the application and fulfill customer
          support functions.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Retention</h2>
        <p>
          Data is retained only as long as reasonably necessary for customer service, moderation, compliance,
          security, and internal operational purposes.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Contact</h2>
        <p>
          For privacy questions, contact Silver Mirror Facial Bar at{' '}
          <a href="mailto:hello@silvermirror.com">hello@silvermirror.com</a>.
        </p>
      </section>
    </main>
  );
}
