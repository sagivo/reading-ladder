// POST /api/auth/signup { email, password } -> 201 { parent }
// Generic error messages throughout: never leak which emails are registered.

import { json, db, logError } from '../_lib.js';
import {
  normalizeEmail,
  isValidEmail,
  validatePassword,
  hashPassword,
  issueSession,
  sessionCookie,
  checkRateLimit,
  clientIp,
  readJsonCapped,
} from './_auth.js';

// Generic message for every signup failure path (validation or conflict).
const SIGNUP_FAILED = 'could not create account';

export async function onRequestPost({ request, env }) {
  try {
    const d = db(env);

    const ipLimit = await checkRateLimit(d, `signup:ip:${clientIp(request)}`, 10, 600);
    if (!ipLimit.allowed) {
      return json({ error: 'too many requests, try again later' }, 429, {
        'Retry-After': String(ipLimit.retryAfterSec),
      });
    }

    const { ok, body } = await readJsonCapped(request);
    if (!ok || !body) return json({ error: SIGNUP_FAILED }, 400);

    const email = normalizeEmail(body.email);
    const pwCheck = validatePassword(body.password);
    if (!isValidEmail(email) || !pwCheck.ok) {
      return json({ error: SIGNUP_FAILED }, 400);
    }

    const taken = await d.prepare('SELECT 1 FROM parents WHERE email = ?').bind(email).first();
    if (taken) return json({ error: SIGNUP_FAILED }, 409);

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    try {
      await d
        .prepare('INSERT INTO parents (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, email, await hashPassword(body.password), now)
        .run();
    } catch (e) {
      // Race on UNIQUE(email) — same generic response as the pre-check above.
      logError(request, e);
      return json({ error: SIGNUP_FAILED }, 409);
    }

    const { token } = await issueSession(d, id);
    return json({ parent: { id, email, created_at: now } }, 201, {
      'Set-Cookie': sessionCookie(token, request),
    });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}
