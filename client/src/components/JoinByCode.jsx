import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { extractMeetingCode } from '../lib/meetingLink.js';
import FormField from './FormField.jsx';

export default function JoinByCode() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function onSubmit(e) {
    e.preventDefault();
    const code = extractMeetingCode(value);
    if (!code) {
      setError('Enter a meeting code like abc-defg-hij, or paste an invite link');
      return;
    }
    setError('');
    navigate(`/m/${code}`);
  }

  return (
    <section className="panel" aria-labelledby="join-title">
      <h2 id="join-title" className="panel-title">
        Join with a code
      </h2>
      <form onSubmit={onSubmit} noValidate>
        <FormField
          id="code"
          label="Meeting code or link"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="abc-defg-hij"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error}
        />
        <button className="btn btn-secondary btn-block" type="submit">
          Join meeting
        </button>
      </form>
    </section>
  );
}
