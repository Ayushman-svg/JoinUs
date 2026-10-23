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
export const getMeetingMessages = (code, limit = 100, options) =>
  api
    .get(`/api/meetings/${encodeURIComponent(code)}/messages?limit=${limit}`, options)
    .then((res) => res.messages);

// History list (host or attendee, started meetings only)
export const listHistory = (options) =>
  api.get('/api/history', options).then((res) => res.meetings);

// History details for a meeting
export const getHistoryDetail = (code, options) =>
  api.get(`/api/history/${encodeURIComponent(code)}`, options).then((res) => res.meeting);
