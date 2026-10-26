import { api } from './client.js';

export async function updateProfile(data) {
  const res = await api.patch('/api/auth/me', data);
  return res.user;
}

export async function changePassword({ currentPassword, newPassword }) {
  return api.post('/api/auth/change-password', { currentPassword, newPassword });
}

export async function getMe() {
  const res = await api.get('/api/auth/me');
  return res.user;
}
