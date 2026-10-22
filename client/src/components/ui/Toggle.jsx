import { useId } from 'react';

// Accessible switch component.
// role="switch", aria-checked, keyboard operable (Space/Enter), label plus helper text.
export default function Toggle({
  id: customId,
  checked = false,
  onChange,
  label,
  helper,
  disabled = false,
  className = '',
}) {
  const generatedId = useId();
  const id = customId || generatedId;
  const helperId = `${id}-helper`;

  function handleKeyDown(e) {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange?.(!checked);
    }
  }

  return (
    <div className={`ui-toggle-field ${className}`.trim()}>
      <div className="ui-toggle-field__row">
        <button
          type="button"
          id={id}
          role="switch"
          aria-checked={checked}
          aria-describedby={helper ? helperId : undefined}
          disabled={disabled}
          className={`ui-toggle ${checked ? 'is-checked' : ''}`}
          onClick={() => !disabled && onChange?.(!checked)}
          onKeyDown={handleKeyDown}
        >
          <span className="ui-toggle__thumb" aria-hidden="true" />
        </button>
        {label && (
          <label htmlFor={id} className="ui-toggle-field__label" onClick={() => !disabled && onChange?.(!checked)}>
            {label}
          </label>
        )}
      </div>
      {helper && (
        <p id={helperId} className="ui-toggle-field__helper">
          {helper}
        </p>
      )}
    </div>
  );
}
