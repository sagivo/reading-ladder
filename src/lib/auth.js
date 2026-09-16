// Parent auth + parent-scoped profile API.
// Same-origin Pages Functions; the server sets an httpOnly `rl_session`
// cookie and the browser sends it automatically. A 401 on an authenticated
// endpoint means the session is gone (logged out / expired) — callers treat
// AuthError as "go to login", never as a generic network failure.
// The auth endpoints (/api/auth/login, /api/auth/signup) also return 401
// for plain credential failures, so they opt out of the AuthError mapping
// (sessionError: false) and surface the server's message instead.

export class AuthError extends Error {
  constructor(message = 'Signed out — please sign in again.') {
    super(message);
    this.name = 'AuthError';
  }
}

export function isAuthError(e) {
  return e instanceof AuthError;
}

/** fetch wrapper: 401 -> AuthError (unless sessionError: false),
    other failures -> Error with server message.
    `timeout` (ms) aborts a hung request so the UI can never stick on
    "Syncing…" forever; callers map AbortError to 'request_timeout'. */
export async function api(path, { method = 'GET', body, sessionError = true, timeout = 25000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      const err = new Error('request_timeout');
      throw err;
    }
    // Network unreachable / DNS / CORS-level failure.
    const err = new Error('network_unreachable');
    err.cause = e;
    throw err;
  }
  clearTimeout(timer);
  if (res.status === 401 && sessionError) throw new AuthError();
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string' && data.error) msg = data.error;
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Friendly one-liner for UI banners. Never returns raw JSON. */
export function friendlyError(e) {
  if (!e) return 'Something went wrong — please try again.';
  if (isAuthError(e)) return 'Your session expired — please sign in again.';
  if (e.message === 'network_unreachable')
    return "Couldn't reach the server — check your connection and try again.";
  if (e.message === 'request_timeout')
    return 'The request timed out — please try again.';
  if (e.message) return e.message;
  return 'Something went wrong — please try again.';
}

// ---- auth endpoints ----
// login/signup opt out of the 401 -> AuthError mapping: a 401 here is a
// plain credential failure ("invalid credentials"), not an expired session.
export const getMe = () => api('/api/auth/me'); // -> { parent: { id, email, created_at } }
export const login = (email, password) =>
  api('/api/auth/login', { method: 'POST', body: { email, password }, sessionError: false });
export const signup = (email, password) =>
  api('/api/auth/signup', { method: 'POST', body: { email, password }, sessionError: false });
export const logout = () => api('/api/auth/logout', { method: 'POST' });
export const adopt = (profiles) =>
  api('/api/auth/adopt', { method: 'POST', body: { profiles } }); // -> { adopted: [ids] }

// ---- parent-scoped kid profiles ----
export const listProfiles = () => api('/api/profiles'); // -> { profiles: [...] }
export const createKid = ({ name, avatar, birth_year }) =>
  api('/api/profiles', {
    method: 'POST',
    body: { name, avatar, ...(birth_year ? { birth_year } : {}) },
  }); // -> 201 { profile }
export const updateKid = (id, patch) =>
  api(`/api/profiles/${id}`, { method: 'PUT', body: patch }); // -> { profile }
