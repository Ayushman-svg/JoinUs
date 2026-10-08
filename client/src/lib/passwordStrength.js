// A rough hint for the register form, not a security guarantee.
// The real rule (8 to 72 characters) is enforced by the server.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export function getPasswordStrength(password) {
  if (!password) return { level: 0, label: '' };
  if (password.length < PASSWORD_MIN_LENGTH) return { level: 1, label: 'Too short' };

  let level = 1;
  if (password.length >= 12) level += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) level += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) level += 1;

  return { level, label: LABELS[level] };
}
