// GET /api/auth/me -> 200 { parent: { id, email } } | 401
// Sliding expiry: the session is extended when < 15 days remain.

import { json, db, logError } from '../_lib.js';
import { getSession, refreshSession } from './_auth.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = await getSession(request, env);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    await refreshSession(db(env), auth.session);
    return json({ parent: { id: auth.parent.id, email: auth.parent.email } });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}
