// GET  /api/profiles/:id/events[?since=iso] -> progress events (append-only log)
// POST /api/profiles/:id/events            -> batch append { events: [...] , state?: fullProfile }
//   Events dedupe on client-generated id. If `state` is included, the
//   profile row is upserted in the same call (keeps one round-trip).
// Requires a session; the profile must belong to the caller (404 otherwise).
//
// Poison-event isolation: every event is inserted independently. One bad
// event (unserializable payload, constraint violation) is reported in
// `failed` and NEVER blocks the rest of the batch, and the state snapshot
// is validated + applied separately so a bad snapshot can't block the
// event log either. The client acks `acked` and dead-letters `failed`
// instead of retrying a poisoned batch forever.

import { json, db, readJson, logError, UPSERT_PROFILE_SQL, profileParams } from '../../_lib.js';
import { getParent } from '../../auth/_auth.js';

async function checkOwnership(env, parentId, profileId) {
  return db(env)
    .prepare('SELECT 1 AS ok FROM profiles WHERE id = ? AND parent_id = ?')
    .bind(profileId, parentId)
    .first();
}

/** Short, safe error string for the client (no stack traces / internals). */
function shortDbError(e) {
  return String((e && e.message) || e || 'database error').slice(0, 200);
}

/**
 * Validate a profile state snapshot before upsert: the profiles table has
 * NOT NULL columns, and a single null there used to 500 the entire batch
 * (events included), stalling the client's queue forever.
 */
function validateState(state) {
  if (typeof state.name !== 'string' || !state.name.trim()) {
    return { ok: false, error: 'state.name is required' };
  }
  if (state.level !== undefined && !Number.isInteger(state.level)) {
    return { ok: false, error: 'state.level must be an integer' };
  }
  for (const k of ['placement_json', 'mastery_json', 'misses_json', 'companion_json', 'sessions_json']) {
    if (state[k] !== undefined && state[k] !== null && typeof state[k] !== 'string') {
      return { ok: false, error: `state.${k} must be a JSON string` };
    }
  }
  return { ok: true };
}

export async function onRequestGet({ request, params, env }) {
  try {
    const parent = await getParent(request, env);
    if (!parent) return json({ error: 'unauthorized' }, 401);
    if (!(await checkOwnership(env, parent.id, params.id))) {
      return json({ error: 'profile not found' }, 404);
    }
    const url = new URL(request.url);
    const since = url.searchParams.get('since');
    let q = 'SELECT * FROM progress_events WHERE profile_id = ?';
    const binds = [params.id];
    if (since) {
      q += ' AND created_at > ?';
      binds.push(since);
    }
    q += ' ORDER BY created_at ASC LIMIT 1000';
    const { results } = await db(env).prepare(q).bind(...binds).all();
    return json({ events: results || [] });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}

export async function onRequestPost({ request, params, env }) {
  try {
    const parent = await getParent(request, env);
    if (!parent) return json({ error: 'unauthorized' }, 401);
    if (!(await checkOwnership(env, parent.id, params.id))) {
      return json({ error: 'profile not found' }, 404);
    }
    const body = await readJson(request);
    if (!body || !Array.isArray(body.events)) {
      return json({ error: 'body.events array is required' }, 400);
    }
    const d = db(env);
    const acked = [];
    const failed = [];
    // Individual inserts: a poison event fails alone and is reported;
    // the rest of the batch still lands. (Batches are small — the client
    // caps the queue at 500 and posts per profile.)
    for (const ev of body.events.slice(0, 200)) {
      if (!ev || !ev.id || !ev.type) {
        failed.push({
          id: ev && ev.id != null ? String(ev.id) : null,
          error: 'event id and type are required',
        });
        continue;
      }
      let payloadJson;
      try {
        payloadJson = JSON.stringify(ev.payload ?? {});
      } catch {
        failed.push({ id: String(ev.id), error: 'payload is not JSON-serializable' });
        continue;
      }
      try {
        await d
          .prepare(
            `INSERT OR IGNORE INTO progress_events (id, profile_id, type, payload_json, created_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(
            String(ev.id),
            params.id,
            String(ev.type).slice(0, 64),
            payloadJson,
            ev.created_at || new Date().toISOString()
          )
          .run();
        acked.push(String(ev.id));
      } catch (e) {
        logError(request, e);
        failed.push({ id: String(ev.id), error: shortDbError(e) });
      }
    }
    // State snapshot: validated and applied separately so it can never
    // take the event log down with it.
    let stateError = null;
    if (body.state && typeof body.state === 'object') {
      const v = validateState(body.state);
      if (!v.ok) {
        stateError = v.error;
      } else {
        try {
          // Row is already verified owned, so the plain upsert cannot leak ownership.
          await d
            .prepare(UPSERT_PROFILE_SQL)
            .bind(...profileParams({ id: params.id, ...body.state }))
            .run();
        } catch (e) {
          logError(request, e);
          stateError = shortDbError(e);
        }
      }
    }
    return json({ acked, failed, stateError });
  } catch (e) {
    logError(request, e);
    return json({ error: 'internal error' }, 500);
  }
}
