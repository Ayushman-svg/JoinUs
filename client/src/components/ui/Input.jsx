import { Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

// Text input with a border that follows focus, error and success states.
// type="password" gets a show/hide toggle automatically.
// className is applied to the wrapper; every other prop goes to the <input>.
export default function Input({ type = 'text', invalid = false, success = false, className = '', ...props }) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  const classes = ['ui-input', invalid && 'is-invalid', success && 'is-success', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <input
        className="ui-input__control"
        type={isPassword && revealed ? 'text' : type}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          className="ui-input__toggle"
          onClick={() => setRevealed((value) => !value)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
        >
          {revealed ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      )}
      {success && !isPassword && (
        <span className="ui-input__status" aria-hidden="true">
          <Check size={18} />
        </span>
      )}
    </div>
  );
}
