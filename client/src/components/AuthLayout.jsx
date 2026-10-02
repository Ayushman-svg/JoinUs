export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main className="center-screen">
      <div className="card">
        <h1 className="brand">JoinUs</h1>
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
        {footer && <p className="card-footer">{footer}</p>}
      </div>
    </main>
  );
}
