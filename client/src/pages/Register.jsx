import { useState } from 'react';
import { Link } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout.jsx';
import FormField from '../components/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      // On success GuestRoute redirects automatically
      await register(form.name, form.email, form.password);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR' && err.details.length > 0) {
        const map = {};
        for (const d of err.details) {
          if (!map[d.field]) map[d.field] = d.message;
        }
        setFieldErrors(map);
      } else if (err.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: err.message });
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes a few seconds."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <FormField
          id="name"
          label="Name"
          type="text"
          autoComplete="name"
          value={form.name}
          onChange={onChange}
          error={fieldErrors.name}
          required
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={onChange}
          error={fieldErrors.email}
          required
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
          required
        />
        <p className="hint">At least 8 characters.</p>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
