// POST /api/auth/adopt { profiles: [...toServer shapes] } -> 200 { adopted: [ids] }
// Claims locally-created (unclaimed, parent_id IS NULL) profiles for the signed-in
// parent after signup/login. Each profile is upserted ONLY when it is unclaimed or
// already belongs to the caller; rows owned by another parent are skipped.
// Capped at 20 profiles per call.

import { json, db, logError, UPSERT_PROFILE_PARENT_SQL, profileParams, PROFILE_COLS } from '../_lib.js';
import { getParent, readJsonCapped } from './_auth.js';

const ADOPT_CAP = 20;

export async function onRequestPost({ request, env }) {
  try {
    const parent = await getParent(request, env);
    if (!parent) return json({ error: 'unauthorized' }, 401);

    const { ok, body } = await readJsonCapped(request);
    if (!ok || !body || !Array.isArray(body.profiles)) {
      return json({ error: 'body.profiles array is required' }, 400);
    }

    const d = db(env);
    const adopted = [];
    for (const p of body.profiles.slice(0, ADOPT_CAP)) {
      if (!p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name) continue;
      const existing = await d
        .prepare('SELECT id, parent_id FROM profiles WHERE id = ?')
        .bind(p.id)
        .first();
      // Never touch another parent's row.
      if (existing && existing.parent_id && existing.parent_id !== parent.id) continue;

      const now = new Date().toISOString();
      const row = { updated_at: now };
      if (!existing) row.created_at = now;
      for (const c of PROFILE_COLS) {
        if (c === 'id' || c === 'created_at' || c === 'updated_at') continue;
        row[c] = p[c] ?? null;
      }
      row.id = p.id;
      row.name = String(p.name).slice(0, 40);
      row.avatar = String(p.avatar || '🦊').slice(0, 8);
      await d.prepare(UPSERT_PROFILE_PARENT_SQL).bind(...profileParams(row), parent.id).run();
      adopted.push(p.id);
    }
    return json({ adopted });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}
