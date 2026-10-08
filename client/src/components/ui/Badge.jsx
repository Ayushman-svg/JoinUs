// variant: neutral | primary | success | warning | danger
// The meaning is always in the text, never in the color alone.
export default function Badge({ variant = 'neutral', icon: Icon, className = '', children }) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`.trim()}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}
