import { api } from './client.js';

export async function getIceServers(options) {
  return api.get('/api/ice-servers', options);
}
