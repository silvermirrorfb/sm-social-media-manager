export const metadata = {
  title: 'Terms of Service | Silver Mirror Social Media Manager',
  description: 'Terms of Service for the Silver Mirror Social Media Manager web application.',
};

const sectionStyle = {
  marginTop: '1.5rem',
  lineHeight: 1.7,
};

export default function TermsPage() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '760px', margin: '0 auto' }}>
      <h1>Terms of Service</h1>
      <p>Effective date: March 16, 2026</p>
      <p style={sectionStyle}>
        Silver Mirror Social Media Manager is provided for the internal business use of Silver Mirror Facial Bar
        and its authorized personnel to manage supported social-media workflows.
      </p>

      <section style={sectionStyle}>
        <h2>Permitted Use</h2>
        <p>
          The application may be used only for lawful customer support, moderation, analytics, and internal
          operational purposes related to Silver Mirror&apos;s business.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Accounts and Access</h2>
        <p>
          Access is restricted to authorized users. Users are responsible for maintaining the confidentiality
          of credentials and for all actions taken through authorized sessions.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Third-Party Platforms</h2>
        <p>
          This application depends on third-party services and social-media platforms. Availability, features,
          and data access may change based on those platforms&apos; rules, permissions, and technical limitations.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>No Warranty</h2>
        <p>
          The service is provided on an as-available basis for internal business use. Silver Mirror does not
          guarantee uninterrupted availability or error-free performance.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to{' '}
          <a href="mailto:hello@silvermirror.com">hello@silvermirror.com</a>.
        </p>
      </section>
    </main>
  );
}
