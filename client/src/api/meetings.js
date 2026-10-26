import { api } from './client.js';

export const createMeeting = (payload) =>
  api.post('/api/meetings', payload).then((res) => res.meeting);

// filter: 'upcoming' | 'past' | 'all'
export const listMeetings = (filter, options) =>
  api.get(`/api/meetings?filter=${filter}`, options).then((res) => res.meetings);

// Public endpoint: minimal info for the invite page
export const getMeeting = (code, options) =>
  api.get(`/api/meetings/${encodeURIComponent(code)}`, options).then((res) => res.meeting);

// Chat messages for an active or past meeting (host or admitted attendee)
export const getMeetingMessages = (code, limit = 100, options = {}) => {
  const { after, ...fetchOptions } = options;
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (after) params.set('after', String(after));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return api
    .get(`/api/meetings/${encodeURIComponent(code)}/messages${qs}`, fetchOptions)
    .then((res) => res.messages);
};

// History list (host or attendee, started meetings only)
export const listHistory = (options) =>
  api.get('/api/history', options).then((res) => res.meetings);

// History details for a meeting
export const getHistoryDetail = (code, options) =>
  api.get(`/api/history/${encodeURIComponent(code)}`, options).then((res) => res.meeting);

// Polls for an active or past meeting (host or admitted attendee)
export const getMeetingPolls = (code, options = {}) =>
  api.get(`/api/meetings/${encodeURIComponent(code)}/polls`, options).then((res) => res.polls);

// Download Poll CSV (host only)
export const exportPollCsv = async (code, pollId) => {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/meetings/${encodeURIComponent(code)}/polls/${encodeURIComponent(pollId)}/export.csv`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to export CSV');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `poll-${pollId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
