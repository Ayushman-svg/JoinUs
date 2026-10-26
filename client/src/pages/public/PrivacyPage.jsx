import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <div className="public-page">
      <section className="public-page__hero public-page__hero--compact">
        <div className="public-page__hero-container">
          <span className="public-page__badge">Privacy</span>
          <h1 className="public-page__title">Privacy Policy</h1>
          <p className="public-page__lead">
            Plain-English privacy practices: no tracking pixels, no advertising cookies, no sold data.
          </p>
        </div>
      </section>

      <section className="public-page__section">
        <div className="landing-section-container landing-section-container--narrow">
          <div className="legal-content">
            <p className="legal-meta">Last updated: October 2026</p>

            <h2>1. Information We Collect</h2>
            <p>We collect only the minimum information required to operate meeting rooms:</p>
            <ul>
              <li>
                <strong>Account Information:</strong> When you register, we store your display name and email address.
                Your password is salted and hashed using bcrypt; we never see or store your plaintext password.
              </li>
              <li>
                <strong>Meeting Metadata:</strong> We store meeting codes, titles, host user IDs, scheduled dates, and
                duration to display upcoming and past meetings on your dashboard.
              </li>
              <li>
                <strong>Chat Messages:</strong> In-meeting messages are stored in MongoDB so participants can read room
                transcripts after a call concludes.
              </li>
            </ul>

            <h2>2. Audio and Video Media Streams</h2>
            <p>
              Media streams (your webcam video, microphone audio, and screen shares) are transmitted directly
              between meeting participants using browser-native <strong>WebRTC peer-to-peer connections</strong>.
            </p>
            <p>
              Audio and video streams are <strong>never recorded, monitored, transcribed, or stored on our servers</strong>.
              If a participant is behind a restrictive corporate firewall, encrypted traffic may temporarily route
              through a TURN relay (Metered.ca) solely to facilitate NAT traversal.
            </p>

            <h2>3. Cookies and Local Storage</h2>
            <p>
              JoinUs does not use third-party advertising or cross-site tracking cookies. We use browser
              <code>localStorage</code> strictly for:
            </p>
            <ul>
              <li>Storing your authentication session token (JWT).</li>
              <li>Preserving your UI preferences (dark/light theme and sidebar toggle state).</li>
            </ul>

            <h2>4. Third-Party Services</h2>
            <p>To provide infrastructure, JoinUs connects to the following third-party services:</p>
            <ul>
              <li><strong>MongoDB Atlas:</strong> Managed cloud database for user records and meeting metadata.</li>
              <li><strong>Render:</strong> Cloud web service host for our Express and Socket.io signaling server.</li>
              <li><strong>Vercel:</strong> Static frontend hosting for the React single-page application.</li>
              <li><strong>Google STUN & Metered.ca:</strong> Public STUN/TURN relays used for establishing WebRTC peer connectivity.</li>
            </ul>

            <h2>5. Data Retention & Deletion</h2>
            <p>
              You can view all past meetings you hosted or attended from the Meeting History dashboard. If you wish to
              have your account or meeting records deleted, please open an issue or reach out via our GitHub repository.
            </p>

            <div className="legal-footer-nav">
              <p>Have privacy questions?</p>
              <a
                href="https://github.com/Ayushman-svg/JoinUs"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-footer-link"
              >
                Reach out via our GitHub repository
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
