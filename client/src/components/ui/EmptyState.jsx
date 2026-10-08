export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="ui-state">
      {Icon && (
        <span className="ui-state__icon">
          <Icon size={26} aria-hidden="true" />
        </span>
      )}
      <h3 className="ui-state__title">{title}</h3>
      {description && <p className="ui-state__text">{description}</p>}
      {action && <div className="ui-state__actions">{action}</div>}
    </div>
  );
}
