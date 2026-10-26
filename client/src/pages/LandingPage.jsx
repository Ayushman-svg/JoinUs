import {
  Activity,
  ArrowRight,
  Calendar,
  ChevronDown,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Share2,
  ShieldCheck,
  Users,
  Video,
  Wifi,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { extractMeetingCode } from '../lib/meetingLink.js';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';

const FEATURES = [
  {
    icon: Video,
    title: 'Instant & Scheduled Meetings',
    description:
      'Generate shareable 10-character meeting codes (e.g. abc-defg-hij) in seconds or schedule for later with date and time pickers.',
  },
  {
    icon: Users,
    title: 'Host Waiting Room',
    description:
      'Guests are held in a waiting queue by default. Hosts review and admit participants individually or all at once.',
  },
  {
    icon: MonitorUp,
    title: 'One-at-a-Time Screen Sharing',
    description:
      'Server-enforced presenter slots prevent accidental presentation overlaps, switching dynamically between speaker and filmstrip layouts.',
  },
  {
    icon: MessageSquare,
    title: 'Persistent In-Call Chat',
    description:
      'Exchange messages in real-time. Chat transcripts are securely persisted to MongoDB and reloaded automatically upon reconnecting.',
  },
];

const STEPS = [
  {
    step: '1',
    icon: Calendar,
    title: 'Create or schedule',
    description: 'Start an instant room right away, or schedule a session with a title and date.',
  },
  {
    step: '2',
    icon: Share2,
    title: 'Share the link',
    description: 'Send the meeting link to up to 3 teammates. Guests join directly from any modern browser.',
  },
  {
    step: '3',
    icon: Users,
    title: 'Admit & collaborate',
    description: 'Admit guests from the waiting room. Enjoy high-quality WebRTC audio, video, screen sharing, and chat.',
  },
];

const SECURITY_ITEMS = [
  {
    icon: Lock,
    title: 'Hashed Passwords',
    description: 'User passwords are encrypted with bcrypt (12 rounds in production) and never saved in plain text.',
  },
  {
    icon: ShieldCheck,
    title: 'Server-Enforced Host Controls',
    description: 'Admission, removal, and meeting termination are validated server-side on the Room Registry.',
  },
  {
    icon: Activity,
    title: 'Dual-Layer Rate Limiting',
    description: 'Authentication endpoints and real-time Socket.io signaling events are protected against abuse.',
  },
  {
    icon: Wifi,
    title: 'Direct P2P & TURN Fallback',
    description: 'Media flows directly between browser peers, falling back to TURN relays only when strict firewalls require it.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'How many people can join a meeting?',
    a: 'JoinUs uses a full-mesh WebRTC mesh topology where every browser communicates directly with every other participant. To maintain peak performance and avoid high CPU usage, meetings are optimized for up to 4 participants (and capped at 6).',
  },
  {
    q: 'Do participants need to download or install an application?',
    a: 'No. JoinUs runs entirely inside standard web browsers on desktop and mobile. No native software, desktop client, or browser extension is required.',
  },
  {
    q: 'Why does the initial connection sometimes take 30 to 60 seconds?',
    a: 'The JoinUs backend is hosted on a free Render cloud tier that enters a sleep state during periods of inactivity. When waking up from cold-start, the first HTTP request or socket connection may take up to a minute to spin up.',
  },
  {
    q: 'Are chat messages saved between sessions?',
    a: 'Yes. In-meeting messages are validated and saved to MongoDB. Participants can review complete timestamped chat transcripts on their Meeting History dashboard after the call ends.',
  },
  {
    q: 'Is JoinUs affiliated with Zoom Video Communications?',
    a: 'No. JoinUs is an open-source student portfolio project inspired by the UX of professional conferencing tools. It is completely independent and not associated with Zoom Video Communications, Inc.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [meetingInput, setMeetingInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [expandedFaq, setExpandedFaq] = useState(null);

  useDocumentMeta({
    title: 'Video Meetings for Teams & Classes',
    description:
      'JoinUs is a simple, secure video meeting platform with host moderation, waiting room, screen sharing, and persistent chat transcripts.',
  });

  function handleJoinSubmit(e) {
    e.preventDefault();
    setInputError('');

    const code = extractMeetingCode(meetingInput);
    if (!code) {
      setInputError('Please enter a valid meeting code or link (e.g. abc-defg-hij)');
      return;
    }

    navigate(`/m/${code}`);
  }

  function toggleFaq(index) {
    setExpandedFaq((prev) => (prev === index ? null : index));
  }

  return (
    <div className="landing">
      {/* 1. Hero Section (Deep Navy - only gradient on the site) */}
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="landing-hero__container">
          <div className="landing-hero__content">
            <span className="landing-hero__badge">Browser-Native WebRTC Meetings</span>
            <h1 id="hero-title" className="landing-hero__title">
              Simple, secure video meetings with host moderation.
            </h1>
            <p className="landing-hero__lead">
              JoinUs brings small teams and study groups together with direct peer-to-peer video,
              waiting room admissions, and persistent chat transcripts.
            </p>

            <div className="landing-hero__actions">
              <Link to="/register" className="landing-hero__btn-primary">
                Start a meeting
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#join-input" className="landing-hero__btn-secondary">
                Join a meeting
              </a>
            </div>

            {/* Quick Join-by-Code Form */}
            <form
              id="join-input"
              className="landing-hero__join-form"
              onSubmit={handleJoinSubmit}
              noValidate
            >
              <div className="landing-hero__input-wrap">
                <input
                  type="text"
                  className="landing-hero__input"
                  placeholder="Enter meeting code (e.g. abc-defg-hij)"
                  value={meetingInput}
                  onChange={(e) => {
                    setMeetingInput(e.target.value);
                    if (inputError) setInputError('');
                  }}
                  aria-label="Meeting code or invite link"
                  aria-invalid={Boolean(inputError)}
                />
                <button type="submit" className="landing-hero__btn-join">
                  Join
                </button>
              </div>
              {inputError && (
                <p className="landing-hero__error" role="alert">
                  {inputError}
                </p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* 2. Product Preview Section */}
      <section className="landing-preview" id="features" aria-labelledby="preview-title">
        <div className="landing-section-container">
          <div className="landing-section-header">
            <h2 id="preview-title" className="landing-section-title">
              Built for focused, moderatable conversations
            </h2>
            <p className="landing-section-subtitle">
              Real browser-based video calls with clean host controls and zero plugin requirements.
            </p>
          </div>

          {/* Framed Call Preview Window */}
          <div className="landing-frame">
            <div className="landing-frame__header">
              <div className="landing-frame__dots" aria-hidden="true">
                <span className="landing-frame__dot landing-frame__dot--red" />
                <span className="landing-frame__dot landing-frame__dot--yellow" />
                <span className="landing-frame__dot landing-frame__dot--green" />
              </div>
              <div className="landing-frame__address">
                <span className="landing-frame__lock" aria-hidden="true">🔒</span>
                joinus-flame.vercel.app/m/ngh-okji-hni/call
              </div>
              <div className="landing-frame__placeholder" aria-hidden="true" />
            </div>
            <div className="landing-frame__body">
              <div className="landing-preview-stage" aria-label="JoinUs active video meeting demonstration">
                <div className="landing-preview-grid">
                  <div className="landing-preview-tile landing-preview-tile--speaking">
                    <div className="landing-preview-tile__avatar">
                      <span>AY</span>
                    </div>
                    <div className="landing-preview-tile__name">
                      <span>Ayushman (Host)</span>
                      <Mic size={14} className="landing-preview-tile__mic" aria-hidden="true" />
                    </div>
                    <span className="landing-preview-tile__badge">Speaking</span>
                  </div>
                  <div className="landing-preview-tile">
                    <div className="landing-preview-tile__avatar">
                      <span>SJ</span>
                    </div>
                    <div className="landing-preview-tile__name">
                      <span>Sarah Jenkins</span>
                      <Mic size={14} className="landing-preview-tile__mic" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="landing-preview-tile">
                    <div className="landing-preview-tile__avatar">
                      <span>DC</span>
                    </div>
                    <div className="landing-preview-tile__name">
                      <span>David Chen</span>
                      <MicOff size={14} className="landing-preview-tile__mic landing-preview-tile__mic--muted" aria-hidden="true" />
                    </div>
                  </div>
                </div>

                <div className="landing-preview-controls" aria-hidden="true">
                  <div className="landing-preview-controls__group">
                    <div className="landing-preview-btn">
                      <Mic size={16} />
                      <span>Mute</span>
                    </div>
                    <div className="landing-preview-btn">
                      <Video size={16} />
                      <span>Stop Video</span>
                    </div>
                  </div>
                  <div className="landing-preview-controls__group">
                    <div className="landing-preview-btn">
                      <ShieldCheck size={16} />
                      <span>Security</span>
                    </div>
                    <div className="landing-preview-btn">
                      <Users size={16} />
                      <span>3</span>
                    </div>
                    <div className="landing-preview-btn">
                      <MessageSquare size={16} />
                      <span>Chat</span>
                    </div>
                    <div className="landing-preview-btn">
                      <MonitorUp size={16} />
                      <span>Share</span>
                    </div>
                  </div>
                  <div className="landing-preview-controls__group">
                    <div className="landing-preview-btn landing-preview-btn--leave">
                      <PhoneOff size={16} />
                      <span>End</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Existing Real Features Grid */}
          <div className="landing-features-grid">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="landing-feature-card">
                <div className="landing-feature-card__icon-wrap">
                  <Icon size={22} className="landing-feature-card__icon" aria-hidden="true" />
                </div>
                <h3 className="landing-feature-card__title">{title}</h3>
                <p className="landing-feature-card__desc">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. How It Works Section */}
      <section className="landing-how" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-section-container">
          <div className="landing-section-header">
            <h2 id="how-title" className="landing-section-title">
              How it works in 3 simple steps
            </h2>
            <p className="landing-section-subtitle">
              Get your team into a private meeting in less than a minute.
            </p>
          </div>

          <div className="landing-steps-grid">
            {STEPS.map(({ step, icon: Icon, title, description }) => (
              <div key={step} className="landing-step-card">
                <div className="landing-step-card__header">
                  <span className="landing-step-card__num">{step}</span>
                  <div className="landing-step-card__icon-wrap">
                    <Icon size={20} aria-hidden="true" />
                  </div>
                </div>
                <h3 className="landing-step-card__title">{title}</h3>
                <p className="landing-step-card__desc">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Security Section */}
      <section className="landing-security" id="security" aria-labelledby="security-title">
        <div className="landing-section-container">
          <div className="landing-section-header">
            <h2 id="security-title" className="landing-section-title">
              Transparent security & privacy
            </h2>
            <p className="landing-section-subtitle">
              No tracking pixels, no advertising cookies, and honest architectural guarantees.
            </p>
          </div>

          <div className="landing-security-grid">
            {SECURITY_ITEMS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="landing-security-card">
                <div className="landing-security-card__icon-wrap">
                  <Icon size={20} className="landing-security-card__icon" aria-hidden="true" />
                </div>
                <h3 className="landing-security-card__title">{title}</h3>
                <p className="landing-security-card__desc">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. FAQ Accordion Section */}
      <section className="landing-faq" id="faq" aria-labelledby="faq-title">
        <div className="landing-section-container landing-section-container--narrow">
          <div className="landing-section-header">
            <h2 id="faq-title" className="landing-section-title">
              Frequently asked questions
            </h2>
            <p className="landing-section-subtitle">
              Clear, realistic answers about capacity, network traversal, and hosting constraints.
            </p>
          </div>

          <div className="landing-faq-accordion" role="region" aria-label="FAQ Accordion">
            {FAQ_ITEMS.map(({ q, a }, index) => {
              const isOpen = expandedFaq === index;
              return (
                <div key={q} className={`landing-faq-item ${isOpen ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="landing-faq-question"
                    onClick={() => toggleFaq(index)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${index}`}
                  >
                    <span>{q}</span>
                    <ChevronDown
                      size={18}
                      className={`landing-faq-chevron ${isOpen ? 'is-rotated' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <div id={`faq-answer-${index}`} className="landing-faq-answer">
                      <p>{a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. Closing Call-To-Action Band */}
      <section className="landing-cta" aria-labelledby="cta-title">
        <div className="landing-section-container">
          <div className="landing-cta__card">
            <h2 id="cta-title" className="landing-cta__title">
              Start your next meeting in seconds
            </h2>
            <p className="landing-cta__desc">
              No downloads, no credit card, and no complex setup. Free for teams and students.
            </p>
            <div className="landing-cta__buttons">
              <Link to="/register" className="landing-cta__btn-primary">
                Get started free
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/login" className="landing-cta__btn-secondary">
                Sign in to account
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
