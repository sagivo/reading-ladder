// POST /api/auth/login { email, password } -> 200 { parent }
// Rotates the session: any existing session cookie is revoked and a new one issued.

import { json, db, logError } from '../_lib.js';
import {
  normalizeEmail,
  isValidEmail,
  verifyPassword,
  issueSession,
  revokeSession,
  sha256Hex,
  getSessionToken,
  sessionCookie,
  checkRateLimit,
  clientIp,
  readJsonCapped,
} from './_auth.js';

export async function onRequestPost({ request, env }) {
  try {
    const d = db(env);

    const ipLimit = await checkRateLimit(d, `login:ip:${clientIp(request)}`, 10, 600);
    if (!ipLimit.allowed) {
      return json({ error: 'too many requests, try again later' }, 429, {
        'Retry-After': String(ipLimit.retryAfterSec),
      });
    }

    const { ok, body } = await readJsonCapped(request);
    if (!ok || !body) return json({ error: 'invalid credentials' }, 401);

    const email = normalizeEmail(body.email);
    if (isValidEmail(email)) {
      const emailLimit = await checkRateLimit(d, `login:email:${email}`, 5, 600);
      if (!emailLimit.allowed) {
        return json({ error: 'too many requests, try again later' }, 429, {
          'Retry-After': String(emailLimit.retryAfterSec),
        });
      }
    }

    const parent = isValidEmail(email)
      ? await d.prepare('SELECT id, email, password_hash, created_at FROM parents WHERE email = ?').bind(email).first()
      : null;
    const valid =
      parent &&
      typeof body.password === 'string' &&
      (await verifyPassword(body.password, parent.password_hash));
    if (!valid) return json({ error: 'invalid credentials' }, 401);

    // Rotate: revoke the session presented in the cookie, if any.
    const oldToken = getSessionToken(request);
    if (oldToken) await revokeSession(d, await sha256Hex(oldToken));

    const { token } = await issueSession(d, parent.id);
    return json(
      { parent: { id: parent.id, email: parent.email, created_at: parent.created_at } },
      200,
      { 'Set-Cookie': sessionCookie(token, request) }
    );
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}
