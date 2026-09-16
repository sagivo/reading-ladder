// GET /api/profiles/:id -> full profile state (caller's row only)
// PUT /api/profiles/:id -> upsert full profile state (snake_case columns); accepts
//                          `archived: true|false` (sets/clears archived_at) and `birth_year`.
// Requires a session. 404 when the row is missing OR belongs to another parent.

import { json, db, readJson, logError, UPSERT_PROFILE_SQL, profileParams, PROFILE_COLS } from '../_lib.js';
import { getParent } from '../auth/_auth.js';

async function ownedProfile(env, parentId, id) {
  return db(env)
    .prepare('SELECT * FROM profiles WHERE id = ? AND parent_id = ?')
    .bind(id, parentId)
    .first();
}

export async function onRequestGet({ request, params, env }) {
  try {
    const parent = await getParent(request, env);
    if (!parent) return json({ error: 'unauthorized' }, 401);
    const row = await ownedProfile(env, parent.id, params.id);
    if (!row) return json({ error: 'profile not found' }, 404);
    return json({ profile: row });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}

export async function onRequestPut({ request, params, env }) {
  try {
    const parent = await getParent(request, env);
    if (!parent) return json({ error: 'unauthorized' }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: 'JSON body required' }, 400);

    const d = db(env);
    const existing = await ownedProfile(env, parent.id, params.id);
    if (!existing) return json({ error: 'profile not found' }, 404);

    let archivedAt = existing.archived_at ?? null;
    if (body.archived !== undefined) {
      if (body.archived !== true && body.archived !== false) {
        return json({ error: 'archived must be true or false' }, 400);
      }
      archivedAt = body.archived ? new Date().toISOString() : null;
    }

    let birthYear = existing.birth_year ?? null;
    if (body.birth_year !== undefined) {
      if (body.birth_year === null) {
        birthYear = null;
      } else {
        const n = Number(body.birth_year);
        if (!Number.isInteger(n) || n < 2010 || n > 2030) {
          return json({ error: 'birth_year must be an integer between 2010 and 2030' }, 400);
        }
        birthYear = n;
      }
    }

    const now = new Date().toISOString();
    const profile = { updated_at: now, created_at: existing.created_at };
    for (const c of PROFILE_COLS) {
      if (c === 'id') continue;
      // Merge with the stored row: the caller may send full state (sync) or a
      // partial update ({ archived } from the archive flow). Never null out
      // columns the caller didn't send.
      profile[c] = body[c] !== undefined ? body[c] : existing[c];
    }
    profile.id = params.id;
    await d.prepare(UPSERT_PROFILE_SQL).bind(...profileParams(profile)).run();
    await d.prepare('UPDATE profiles SET archived_at = ?, birth_year = ? WHERE id = ? AND parent_id = ?')
      .bind(archivedAt, birthYear, params.id, parent.id).run();
    const row = await ownedProfile(env, parent.id, params.id);
    return json({ profile: row });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}
