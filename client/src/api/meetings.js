import { api } from './client.js';

export const createMeeting = (payload) =>
  api.post('/api/meetings', payload).then((res) => res.meeting);

// filter: 'upcoming' | 'past' | 'all'
export const listMeetings = (filter, options) =>
  api.get(`/api/meetings?filter=${filter}`, options).then((res) => res.meetings);

// Public endpoint: minimal info for the invite page
export const getMeeting = (code, options) =>
  api.get(`/api/meetings/${encodeURIComponent(code)}`, options).then((res) => res.meeting);
