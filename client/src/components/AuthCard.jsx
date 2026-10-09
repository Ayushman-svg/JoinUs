import Card from './ui/Card.jsx';

// The card that holds one auth form. It animates in each time the route changes.
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <Card className="auth__card" padding="lg" elevated>
      <h1 className="auth__title">{title}</h1>
      {subtitle && <p className="auth__subtitle">{subtitle}</p>}
      {children}
      {footer && <p className="auth__footer">{footer}</p>}
    </Card>
  );
}
