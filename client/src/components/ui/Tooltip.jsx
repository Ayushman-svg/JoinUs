import { useEffect, useState } from 'react';

// Visual hint for a control. The child must have its own accessible name (an aria-label or
// visible text), so the bubble is hidden from screen readers to avoid reading it twice.
// Shows on hover and keyboard focus, and Escape dismisses it. side: top | bottom | left | right
export default function Tooltip({ label, side = 'top', disabled = false, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <span
      className="ui-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        className={`ui-tooltip__bubble ui-tooltip__bubble--${side} ${open && !disabled ? 'is-open' : ''}`}
        aria-hidden="true"
      >
        {label}
      </span>
    </span>
  );
}
