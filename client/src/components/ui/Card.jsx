// padding: sm | md | lg | none
// interactive: lifts and highlights on hover (use it for cards that are clickable)
export default function Card({
  as: Component = 'div',
  padding = 'md',
  elevated = false,
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'ui-card',
    padding !== 'none' && `ui-card--pad-${padding}`,
    elevated && 'ui-card--elevated',
    interactive && 'ui-card--interactive',
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
