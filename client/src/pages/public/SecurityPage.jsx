import {
  Activity,
  ArrowRight,
  Database,
  KeyRound,
  Lock,
  Radio,
  Server,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';

const SECURITY_MEASURES = [
  {
    icon: Lock,
    title: 'Bcrypt Password Hashing',
    badge: 'Authentication',
    description:
      'Passwords are salted and hashed using bcryptjs with 12 salt rounds in production. Plaintext passwords never touch logs, storage, or external APIs. Constant-time dummy hashes protect against email enumeration timing attacks.',
  },
  {
    icon: KeyRound,
    title: 'Cryptographic JWT Sessions',
    badge: 'Tokens',
    description:
      'Sessions use JSON Web Tokens signed with cryptographic secrets (32+ characters strictly enforced in production). Sockets and REST endpoints independently verify token expiration and user existence on every handshake.',
  },
  {
    icon: Server,
    title: 'Server-Enforced Host Moderation',
    badge: 'Authorization',
    description:
      'Client permissions are never taken on faith. The server-side Room Registry verifies that the requesting user ID matches the meeting host before executing admit, deny, remove, end, or stop-presentation actions.',
  },
  {
    icon: Activity,
    title: 'Dual-Layer Rate Limiting',
    badge: 'Rate Limits',
    description:
      'REST endpoints enforce IP and account limits via express-rate-limit (10 logins/15m, 5 registrations/hr). Sockets enforce sliding-window limits for join requests (10/10s), signal routing (300/10s), and chat messages (5/5s).',
  },
  {
    icon: Radio,
    title: 'Direct Peer-to-Peer Media Streams',
    badge: 'Media Privacy',
    description:
      'Audio, video, and screen sharing packets travel directly between peer browsers via WebRTC RTCPeerConnection encryption (SRTP/DTLS). Meeting audio and video streams are never processed, recorded, or stored on our servers.',
  },
  {
    icon: ShieldCheck,
    title: 'Sanitized Crash Isolation',
    badge: 'Logging Safety',
    description:
      'Application error handlers and process-level uncaughtException listeners strip database connection strings, JWTs, Bearer tokens, and passwords before logging. Stack traces are masked from client responses in production.',
  },
];

export default function SecurityPage() {
  useDocumentMeta({
    title: 'Security & Privacy',
    description:
      'Review JoinUs security architecture: bcrypt password hashing, server-verified room registry, rate limiting, and peer-to-peer WebRTC encryption.',
  });

  return (
    <div className="public-page">
      {/* Header */}
      <section className="public-page__hero">
        <div className="public-page__hero-container">
          <span className="public-page__badge">Security & Privacy</span>
          <h1 className="public-page__title">
            Honest, verifiable security architecture.
          </h1>
          <p className="public-page__lead">
            JoinUs is built around defense-in-depth principles: strict server validation, cryptographic
            credential protection, and zero advertising trackers.
          </p>
        </div>
      </section>

      {/* Security Principles Breakdown */}
      <section className="public-page__section">
        <div className="landing-section-container">
          <div className="security-detail-grid">
            {SECURITY_MEASURES.map(({ icon: Icon, title, badge, description }) => (
              <div key={title} className="security-detail-card">
                <div className="security-detail-card__header">
                  <div className="security-detail-card__icon-wrap">
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <span className="security-detail-card__badge">{badge}</span>
                </div>
                <h2 className="security-detail-card__title">{title}</h2>
                <p className="security-detail-card__desc">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verification & Integrity Section */}
      <section className="public-page__section public-page__section--alt">
        <div className="landing-section-container landing-section-container--narrow">
          <div className="landing-section-header">
            <h2 className="landing-section-title">Automated Security Testing</h2>
            <p className="landing-section-subtitle">
              Every pull request and commit to main is tested against an extensive test suite verifying
              error masking, rate limiting, token expiration, and secret sanitization.
            </p>
          </div>
          <div className="security-audit-card">
            <div className="security-audit-card__icon-wrap">
              <ShieldAlert size={28} className="security-audit-card__icon" aria-hidden="true" />
            </div>
            <div>
              <h3 className="security-audit-card__title">Continuous Verification (CI)</h3>
              <p className="security-audit-card__desc">
                Over 120 server tests and 30 client unit tests run on GitHub Actions using in-memory database
                isolation. The automated test pipeline enforces 100% pass rates on authentication, waiting room
                boundaries, and private message delivery before deployment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="public-page__cta-section">
        <div className="landing-section-container">
          <div className="landing-cta__card">
            <h2 className="landing-cta__title">Start a private, host-moderated meeting</h2>
            <p className="landing-cta__desc">
              Experience video conferencing without invasive trackers or complex enterprise contracts.
            </p>
            <div className="landing-cta__buttons">
              <Link to="/register" className="landing-cta__btn-primary">
                Get started free
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/login" className="landing-cta__btn-secondary">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
