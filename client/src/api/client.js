import { API_URL as BASE_URL } from '../config.js';

const TOKEN_KEY = 'joinus_token';
const AUTH_ERROR_CODES = ['UNAUTHORIZED', 'INVALID_TOKEN', 'TOKEN_EXPIRED'];

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details || [];
  }
}

// Storage access can throw (private mode, blocked storage), so it is wrapped
export const tokenStorage = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

// Called when the server rejects the stored token, so the app can log the user out
let unauthorizedHandler = null;
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = tokenStorage.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  let data = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const e = data?.error;
    let message = e?.message || 'Something went wrong. Please try again.';
    if (res.status === 429 || e?.code === 'RATE_LIMITED') {
      message = 'Too many attempts, try again in a few minutes';
    }
    const error = new ApiError(
      res.status,
      e?.code || (res.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN_ERROR'),
      message,
      e?.details
    );
    if (res.status === 401 && token && AUTH_ERROR_CODES.includes(error.code)) {
      try {
        sessionStorage.setItem('joinus_session_expired', '1');
      } catch {
        /* ignore */
      }
      if (unauthorizedHandler) {
        unauthorizedHandler({ expired: true });
      }
    }
    throw error;
  }

  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
