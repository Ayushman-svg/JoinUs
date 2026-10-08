import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

const ICONS = { error: CircleAlert, success: CircleCheck, warning: TriangleAlert, info: Info };

// Inline message. variant: error | success | warning | info
export default function Alert({ variant = 'error', title, children, className = '' }) {
  const Icon = ICONS[variant];

  return (
    <div
      className={`ui-alert ui-alert--${variant} ${className}`.trim()}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <Icon size={18} className="ui-alert__icon" aria-hidden="true" />
      <div>
        {title && <p className="ui-alert__title">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
