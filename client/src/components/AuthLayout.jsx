import { CalendarClock, Link2, MonitorSmartphone } from 'lucide-react';

import BrandMark from './BrandMark.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import Card from './ui/Card.jsx';

const POINTS = [
  {
    icon: Link2,
    title: 'One link to join',
    text: 'Share a meeting link. Guests join from the browser with nothing to install.',
  },
  {
    icon: CalendarClock,
    title: 'Start now or schedule',
    text: 'Spin up an instant meeting, or plan one for later and share the invite.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Desktop and mobile',
    text: 'Works in any modern browser on your laptop or your phone.',
  },
];

// Two columns on desktop (product introduction + form), one column on mobile
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth__intro">
        <BrandMark inverse />
        <div>
          <p className="auth__headline">Meetings that start with a link.</p>
          <p className="auth__lead">
            JoinUs is a simple video meeting app. Create a meeting, share the link and talk face to
            face.
          </p>
          <ul className="auth__points">
            {POINTS.map(({ icon: Icon, title: pointTitle, text }) => (
              <li key={pointTitle} className="auth__point">
                <span className="auth__point-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <div>
                  <p className="auth__point-title">{pointTitle}</p>
                  <p className="auth__point-text">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="auth__intro-footer">Built with raw WebRTC. No third-party video SDKs.</p>
      </aside>

      <main className="auth__main">
        <div className="auth__toolbar">
          <div className="auth__mobile-brand">
            <BrandMark />
          </div>
          <ThemeToggle />
        </div>
        <div className="auth__content">
          <Card className="auth__card" padding="lg" elevated>
            <h1 className="auth__title">{title}</h1>
            {subtitle && <p className="auth__subtitle">{subtitle}</p>}
            {children}
            {footer && <p className="auth__footer">{footer}</p>}
          </Card>
        </div>
      </main>
    </div>
  );
}
