// GET  /api/profiles       -> list profiles (id, name, avatar, track, level, updated_at)
// POST /api/profiles       -> create profile { id?, name, avatar } (idempotent on id)

import { json, db, readJson, UPSERT_PROFILE_SQL, profileParams } from './_lib.js';

export async function onRequestGet({ env }) {
  try {
    const { results } = await db(env)
      .prepare('SELECT id, name, avatar, track, level, updated_at FROM profiles ORDER BY updated_at DESC')
      .all();
    return json({ profiles: results || [] });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    if (!body || !body.name) return json({ error: 'name is required' }, 400);
    const now = new Date().toISOString();
    const profile = {
      id: body.id || `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
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
    await db(env).prepare(UPSERT_PROFILE_SQL).bind(...profileParams(profile)).run();
    const row = await db(env).prepare('SELECT * FROM profiles WHERE id = ?').bind(profile.id).first();
    return json({ profile: row }, 201);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}
