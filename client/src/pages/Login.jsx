import { Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import AuthCard from '../components/AuthCard.jsx';
import FormField from '../components/FormField.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import useSlowRequest from '../hooks/useSlowRequest.js';
import { fieldErrorsFromApi, focusField } from '../lib/formErrors.js';

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const slow = useSlowRequest(submitting);

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');

    const next = {};
    if (!form.email.trim()) next.email = 'Enter your email address';
    if (!form.password) next.password = 'Enter your password';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusField(Object.keys(next)[0]);
      return;
    }

    setSubmitting(true);
    try {
      // On success GuestRoute redirects automatically
      await login(form.email.trim(), form.password);
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
      title="Welcome back"
      subtitle="Log in to start or join a meeting."
      footer={
        <>
          New to JoinUs? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={onSubmit} noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}
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
          autoComplete="current-password"
          placeholder="Your password"
          value={form.password}
          onChange={onChange}
          error={errors.password}
        />
        <Button className="auth__submit" type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
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
