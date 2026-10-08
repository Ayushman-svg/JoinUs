import { getPasswordStrength } from '../lib/passwordStrength.js';

// Four-segment hint under the password field. The label carries the meaning, not the color.
export default function PasswordStrength({ password }) {
  const { level, label } = getPasswordStrength(password);
  if (!password) return null;

  return (
    <div className={`ui-strength ui-strength--${level}`}>
      <div className="ui-strength__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span key={segment} className={`ui-strength__bar ${segment <= level ? 'is-filled' : ''}`} />
        ))}
      </div>
      <p className="ui-strength__label" aria-live="polite">
        Password strength: {label}
      </p>
    </div>
  );
}
