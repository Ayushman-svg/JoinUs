import { api } from './client.js';

export async function fetchServerConfig({ signal } = {}) {
  return api.get('/api/config', { signal });
}
