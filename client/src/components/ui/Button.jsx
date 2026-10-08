import Spinner from './Spinner.jsx';

// variant: primary | secondary | outline | ghost | danger | success
// size: sm | md | lg
// Use `as={Link} to="..."` to render a router link that looks like a button.
// Icon-only buttons (iconOnly) need an aria-label.
export default function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  iconOnly = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className = '',
  children,
  disabled = false,
  type,
  ...rest
}) {
  const isNativeButton = Component === 'button';
  const inactive = disabled || loading;

  const classes = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    iconOnly && 'ui-btn--icon',
    fullWidth && 'ui-btn--block',
    loading && 'is-loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  let content;
  if (iconOnly) {
    content = loading ? <Spinner size="sm" /> : children;
  } else {
    content = (
      <>
        {loading ? <Spinner size="sm" /> : LeftIcon && <LeftIcon size={18} aria-hidden="true" />}
        {children != null && <span className="ui-btn__label">{children}</span>}
        {!loading && RightIcon && <RightIcon size={18} aria-hidden="true" />}
      </>
    );
  }

  return (
    <Component
      className={classes}
      type={isNativeButton ? (type ?? 'button') : type}
      disabled={isNativeButton ? inactive : undefined}
      aria-disabled={!isNativeButton && inactive ? true : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </Component>
  );
}
