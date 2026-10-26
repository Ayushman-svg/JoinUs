import {
  ArrowRight,
  Eye,
  MessageSquare,
  Mic,
  MonitorUp,
  Palette,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';

const CORE_FEATURES = [
  {
    icon: Video,
    title: 'Instant & Scheduled Video Meetings',
    lead: 'Spin up a quick room or plan ahead with date pickers.',
    details:
      'Generate human-readable 10-character meeting codes (such as abc-defg-hij) with one click. Scheduled meetings display upcoming and past states automatically based on meeting activity.',
  },
  {
    icon: Users,
    title: 'Host Waiting Room & Admission',
    lead: 'Control entry to prevent unexpected disruptions.',
    details:
      'Waiting rooms are enabled by default. Guests enter a private waiting screen while the host receives live badge notifications with one-click individual or bulk admission.',
  },
  {
    icon: MonitorUp,
    title: 'One-at-a-Time Screen Sharing',
    lead: 'Clean, server-coordinated presentation stage.',
    details:
      'The server enforces a single active presenter to avoid conflicting shares. When someone presents, the interface seamlessly transitions into a prominent stage with a participant filmstrip.',
  },
  {
    icon: MessageSquare,
    title: 'Persistent In-Call Chat & Transcripts',
    lead: 'Never lose important notes or links shared during a call.',
    details:
      'Chat messages are validated, rate-limited, and stored in MongoDB. If a participant refreshes or reconnects, messages reload immediately and remain accessible in meeting history transcripts.',
  },
  {
    icon: Mic,
    title: 'Active Speaker Highlighting',
    lead: 'Visual cues showing who has the floor in real-time.',
    details:
      'Built using the browser Web Audio API to detect voice activity frequency. The active speaker is outlined with a glowing border and animated audio equalizer indicators.',
  },
  {
    icon: Palette,
    title: 'Accessible Dark & Light Modes',
    lead: 'Tailored contrast and consistent typography.',
    details:
      'Designed with custom CSS variables, automatic system theme synchronization, and smooth color transitions. Fully readable across mobile and desktop viewports.',
  },
];

export default function FeaturesPage() {
  useDocumentMeta({
    title: 'Features',
    description:
      'Explore JoinUs features: peer-to-peer WebRTC video, host waiting rooms, one-at-a-time screen sharing, persistent chat transcripts, and active speaker highlighting.',
  });

  return (
    <div className="public-page">
      {/* Page Header */}
      <section className="public-page__hero">
        <div className="public-page__hero-container">
          <span className="public-page__badge">Features</span>
          <h1 className="public-page__title">
            Built for focused, moderatable conversations.
          </h1>
          <p className="public-page__lead">
            JoinUs provides the essential building blocks for virtual collaboration: browser-native
            video, host moderation, presentation sharing, and persistent transcripts without third-party SDK bloat.
          </p>
        </div>
      </section>

      {/* Feature Deep Dive Grid */}
      <section className="public-page__section">
        <div className="landing-section-container">
          <div className="features-detail-grid">
            {CORE_FEATURES.map(({ icon: Icon, title, lead, details }) => (
              <div key={title} className="features-detail-card">
                <div className="features-detail-card__icon-wrap">
                  <Icon size={24} aria-hidden="true" />
                </div>
                <h2 className="features-detail-card__title">{title}</h2>
                <p className="features-detail-card__lead">{lead}</p>
                <p className="features-detail-card__desc">{details}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="public-page__cta-section">
        <div className="landing-section-container">
          <div className="landing-cta__card">
            <h2 className="landing-cta__title">Experience simple, controlled meetings</h2>
            <p className="landing-cta__desc">
              Create an account in 30 seconds and start your first browser-based video session.
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
