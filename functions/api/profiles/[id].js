// GET /api/profiles/:id -> full profile state
// PUT /api/profiles/:id -> upsert full profile state (snake_case columns)

import { json, db, readJson, UPSERT_PROFILE_SQL, profileParams, PROFILE_COLS } from '../_lib.js';

export async function onRequestGet({ params, env }) {
  try {
    const row = await db(env).prepare('SELECT * FROM profiles WHERE id = ?').bind(params.id).first();
    if (!row) return json({ error: 'profile not found' }, 404);
    return json({ profile: row });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestPut({ request, params, env }) {
  try {
    const body = await readJson(request);
    if (!body) return json({ error: 'JSON body required' }, 400);
    const now = new Date().toISOString();
    const profile = { updated_at: now, created_at: now };
    for (const c of PROFILE_COLS) {
      if (c === 'id') continue;
      profile[c] = body[c] ?? null;
    }
    profile.id = params.id;
    await db(env).prepare(UPSERT_PROFILE_SQL).bind(...profileParams(profile)).run();
    const row = await db(env).prepare('SELECT * FROM profiles WHERE id = ?').bind(params.id).first();
    return json({ profile: row });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}
