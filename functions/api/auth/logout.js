// POST /api/auth/logout -> 200 { ok: true }; revokes the session, clears the cookie.

import { json, db, logError } from '../_lib.js';
import { getSessionToken, revokeSession, sha256Hex, clearSessionCookie } from './_auth.js';

export async function onRequestPost({ request, env }) {
  try {
    const token = getSessionToken(request);
    if (token) {
      await revokeSession(db(env), await sha256Hex(token));
    }
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}
