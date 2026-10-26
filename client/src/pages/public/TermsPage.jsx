import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <div className="public-page">
      <section className="public-page__hero public-page__hero--compact">
        <div className="public-page__hero-container">
          <span className="public-page__badge">Legal</span>
          <h1 className="public-page__title">Terms of Service</h1>
          <p className="public-page__lead">
            Transparent, plain-English terms for the JoinUs open-source educational project.
          </p>
        </div>
      </section>

      <section className="public-page__section">
        <div className="landing-section-container landing-section-container--narrow">
          <div className="legal-content">
            <p className="legal-meta">Last updated: October 2026</p>

            <h2>1. Project Overview</h2>
            <p>
              JoinUs is an open-source educational software project built to explore real-time WebRTC
              communication, host-moderated admission systems, and peer-to-peer media topologies. It is
              developed as a portfolio and student showcase application.
            </p>

            <h2>2. Educational & "As-Is" Service Provision</h2>
            <p>
              The application is hosted on free cloud tiers (Render and Vercel) and is provided strictly
              on an "as-is" and "as-available" basis without representations, warranties, or uptime Service
              Level Agreements (SLAs) of any kind. Instances may sleep when idle or undergo maintenance
              without prior notice.
            </p>

            <h2>3. Acceptable Use</h2>
            <p>By accessing or using JoinUs, you agree not to:</p>
            <ul>
              <li>Use the service to transmit malicious software, spam, or unlawful content.</li>
              <li>Attempt to circumvent server rate limits, authorization checks, or waiting room boundaries.</li>
              <li>Conduct automated stress testing or denial-of-service attacks against active meeting rooms.</li>
              <li>Disrupt, harass, or impersonate other meeting hosts or participants.</li>
            </ul>

            <h2>4. Accounts and Passwords</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials. Because
              this is an open-source student deployment, we strongly encourage using a unique password not
              shared with critical financial, primary email, or personal accounts.
            </p>

            <h2>5. Intellectual Property & Independence</h2>
            <p>
              JoinUs is an independent open-source project released under the MIT license. JoinUs is not
              affiliated with, sponsored by, or endorsed by Zoom Video Communications, Inc., or any other
              commercial teleconferencing provider.
            </p>

            <h2>6. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by applicable law, the project authors and contributors shall
              not be held liable for any direct, indirect, incidental, or consequential damages resulting from
              the use of, or inability to use, this application.
            </p>

            <div className="legal-footer-nav">
              <p>Questions about the project?</p>
              <a
                href="https://github.com/Ayushman-svg/JoinUs"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-footer-link"
              >
                View our repository and open an issue on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
