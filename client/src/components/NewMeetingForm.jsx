import { useState } from 'react';

import { createMeeting } from '../api/meetings.js';
import { nextFullHour, toLocalInputValue } from '../lib/datetime.js';
import FormField from './FormField.jsx';

export default function NewMeetingForm({ onCreated }) {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('instant'); // instant | scheduled
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInputValue(nextFullHour()));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const payload = {};
    if (title.trim()) payload.title = title.trim();

    if (mode === 'scheduled') {
      const date = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(date.getTime())) {
        setFieldErrors({ scheduledAt: 'Choose a date and time' });
        return;
      }
      if (date.getTime() <= Date.now()) {
        setFieldErrors({ scheduledAt: 'Choose a time in the future' });
        return;
      }
      payload.scheduledAt = date.toISOString();
    }

    setSubmitting(true);
    try {
      const meeting = await createMeeting(payload);
      setTitle('');
      onCreated(meeting);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR' && err.details.length > 0) {
        const map = {};
        for (const d of err.details) {
          if (!map[d.field]) map[d.field] = d.message;
        }
        setFieldErrors(map);
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="new-meeting-title">
      <h2 id="new-meeting-title" className="panel-title">
        New meeting
      </h2>

      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}

        <div className="segmented" role="group" aria-label="Meeting type">
          <button type="button" aria-pressed={mode === 'instant'} onClick={() => setMode('instant')}>
            Start now
          </button>
          <button
            type="button"
            aria-pressed={mode === 'scheduled'}
            onClick={() => setMode('scheduled')}
          >
            Schedule
          </button>
        </div>

        <div className="form-gap" />

        <FormField
          id="title"
          label="Title (optional)"
          type="text"
          maxLength={100}
          placeholder="Team sync"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={fieldErrors.title}
        />

        {mode === 'scheduled' && (
          <FormField
            id="scheduledAt"
            label="Date and time"
            type="datetime-local"
            min={toLocalInputValue(new Date())}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            error={fieldErrors.scheduledAt}
            required
          />
        )}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : mode === 'instant' ? 'Start meeting' : 'Schedule meeting'}
        </button>
      </form>
    </section>
  );
}
