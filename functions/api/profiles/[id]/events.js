// GET  /api/profiles/:id/events[?since=iso] -> progress events (append-only log)
// POST /api/profiles/:id/events            -> batch append { events: [...] , state?: fullProfile }
//   Events dedupe on client-generated id. If `state` is included, the
//   profile row is upserted in the same call (keeps one round-trip).

import { json, db, readJson, UPSERT_PROFILE_SQL, profileParams } from '../../_lib.js';

export async function onRequestGet({ request, params, env }) {
  try {
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
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestPost({ request, params, env }) {
  try {
    const body = await readJson(request);
    if (!body || !Array.isArray(body.events)) {
      return json({ error: 'body.events array is required' }, 400);
    }
    const d = db(env);
    const acked = [];
    const stmts = [];
    for (const ev of body.events.slice(0, 200)) {
      if (!ev || !ev.id || !ev.type) continue;
      stmts.push(
        d.prepare(
          `INSERT OR IGNORE INTO progress_events (id, profile_id, type, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          String(ev.id),
          params.id,
          String(ev.type).slice(0, 64),
          JSON.stringify(ev.payload ?? {}),
          ev.created_at || new Date().toISOString()
        )
      );
      acked.push(ev.id);
    }
    if (body.state && typeof body.state === 'object') {
      stmts.push(d.prepare(UPSERT_PROFILE_SQL).bind(...profileParams({ id: params.id, ...body.state })));
    }
    if (stmts.length) await d.batch(stmts);
    return json({ acked });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}
