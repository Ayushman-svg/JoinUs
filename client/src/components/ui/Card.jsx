// padding: sm | md | lg | none
export default function Card({
  as: Component = 'div',
  padding = 'md',
  elevated = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'ui-card',
    padding !== 'none' && `ui-card--pad-${padding}`,
    elevated && 'ui-card--elevated',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
