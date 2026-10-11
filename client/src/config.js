// Base URL of the API server. It is used for REST calls and for the Socket.io signaling
// connection, so one variable (VITE_API_URL) points the whole client at the server.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
