import { Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import AuthCard from '../components/AuthCard.jsx';
import FormField from '../components/FormField.jsx';
import PasswordStrength from '../components/PasswordStrength.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import useSlowRequest from '../hooks/useSlowRequest.js';
import { fieldErrorsFromApi, focusField } from '../lib/formErrors.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../lib/passwordStrength.js';

function validate({ name, email, password, confirm }) {
  const errors = {};
  if (name.trim().length < 2) errors.name = 'Enter your name (at least 2 characters)';
  if (!email.trim()) errors.email = 'Enter your email address';
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Use at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (!confirm) errors.confirm = 'Confirm your password';
  else if (confirm !== password) errors.confirm = 'Passwords do not match';
  return errors;
}

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const slow = useSlowRequest(submitting);

  const passwordsMatch = form.confirm.length > 0 && form.confirm === form.password;

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');

    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusField(Object.keys(next)[0]);
      return;
    }

    setSubmitting(true);
    try {
      // On success GuestRoute redirects automatically
      await register(form.name.trim(), form.email.trim(), form.password);
    } catch (err) {
      const fields = fieldErrorsFromApi(err);
      if (fields) {
        setErrors(fields);
        focusField(Object.keys(fields)[0]);
      } else {
        setFormError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="It takes a few seconds."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}
        <FormField
          id="name"
          label="Name"
          leftIcon={User}
          type="text"
          autoComplete="name"
          placeholder="Your name"
          value={form.name}
          onChange={onChange}
          error={errors.name}
        />
        <FormField
          id="email"
          label="Email"
          leftIcon={Mail}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={onChange}
          error={errors.email}
        />
        <FormField
          id="password"
          label="Password"
          leftIcon={Lock}
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.password}
          onChange={onChange}
          error={errors.password}
          helper={form.password ? undefined : `Use ${PASSWORD_MIN_LENGTH} or more characters`}
        />
        <PasswordStrength password={form.password} />
        <FormField
          id="confirm"
          label="Confirm password"
          leftIcon={ShieldCheck}
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={form.confirm}
          onChange={onChange}
          error={errors.confirm}
          success={passwordsMatch ? 'Passwords match' : undefined}
        />
        <Button className="auth__submit" type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        {slow && (
          <p className="auth__hint" role="status">
            The server is waking up. This can take up to a minute.
          </p>
        )}
      </form>
    </AuthCard>
  );
}
