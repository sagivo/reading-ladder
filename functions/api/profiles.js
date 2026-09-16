// GET  /api/profiles       -> list the caller's non-archived profiles (id, name, avatar, track, level, updated_at)
// POST /api/profiles       -> create profile { id?, name, avatar, birth_year? } (idempotent on id, scoped to caller)
// Requires a session; all rows are scoped to the parent (parent_id).

import { json, db, readJson, logError, UPSERT_PROFILE_SQL, profileParams } from './_lib.js';
import { getParent } from './auth/_auth.js';

function validBirthYear(value) {
  if (value === undefined || value === null) return { ok: true, birthYear: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2010 || n > 2030) {
    return { ok: false, error: 'birth_year must be an integer between 2010 and 2030' };
  }
  return { ok: true, birthYear: n };
}

export async function onRequestGet({ request, env }) {
  try {
    const parent = await getParent(request, env);
    if (!parent) return json({ error: 'unauthorized' }, 401);
    const { results } = await db(env)
      .prepare(
        'SELECT id, name, avatar, track, level, updated_at FROM profiles WHERE parent_id = ? AND archived_at IS NULL ORDER BY updated_at DESC'
      )
      .bind(parent.id)
      .all();
    return json({ profiles: results || [] });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const parent = await getParent(request, env);
    if (!parent) return json({ error: 'unauthorized' }, 401);
    const body = await readJson(request);
    if (!body || typeof body.name !== 'string' || !body.name.trim()) {
      return json({ error: 'name is required' }, 400);
    }
    const by = validBirthYear(body.birth_year);
    if (!by.ok) return json({ error: by.error }, 400);

    const d = db(env);
    const id = body.id
      ? String(body.id)
      : `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    if (body.id) {
      const existing = await d.prepare('SELECT id, parent_id FROM profiles WHERE id = ?').bind(id).first();
      if (existing && existing.parent_id !== parent.id) {
        return json({ error: 'profile id already in use' }, 409);
      }
    }

    const now = new Date().toISOString();
    const profile = {
      id,
      name: String(body.name).slice(0, 40),
      avatar: String(body.avatar || '🦊').slice(0, 8),
      track: body.track || null,
      placement_json: JSON.stringify(body.placement || null),
      level: 0,
      mastery_json: '{}',
      misses_json: '[]',
      companion_json: JSON.stringify({ animal: 'fox', color: 'purple', accessory: 'none', unlocked: ['none'] }),
      sessions_json: '[]',
      exposure: 0,
      last_mission: null,
      created_at: now,
      updated_at: now,
    };
    await d.prepare(UPSERT_PROFILE_SQL).bind(...profileParams(profile)).run();
    await d.prepare('UPDATE profiles SET parent_id = ?, birth_year = ? WHERE id = ?')
      .bind(parent.id, by.birthYear, id).run();
    const row = await d.prepare('SELECT * FROM profiles WHERE id = ? AND parent_id = ?').bind(id, parent.id).first();
    return json({ profile: row }, 201);
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}
