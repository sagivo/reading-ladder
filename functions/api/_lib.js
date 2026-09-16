// Shared helpers for the Reading Ladder Pages Functions.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function db(env) {
  const d = env.DB;
  if (!d) throw new Error('D1 binding "DB" is not configured on this Pages project');
  return d;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Error logging: structured JSON to stderr (Cloudflare captures console output).
// Generates a fresh reqId per error line; the middleware also sets X-Request-Id
// on the response for correlation at the edge.
export function logError(request, err) {
  let path = '';
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = '';
  }
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      reqId: crypto.randomUUID(),
      path,
      error: String((err && err.message) || err),
    })
  );
}

// Columns written by profile upserts (client sends snake_case via toServer()).
export const PROFILE_COLS = [
  'id', 'name', 'avatar', 'track', 'placement_json', 'level',
  'mastery_json', 'misses_json', 'companion_json', 'sessions_json',
  'exposure', 'last_mission', 'birth_year', 'created_at', 'updated_at',
];

export function profileParams(p) {
  return PROFILE_COLS.map((c) => p[c] ?? null);
}

export const UPSERT_PROFILE_SQL = `
  INSERT INTO profiles (${PROFILE_COLS.join(', ')})
  VALUES (${PROFILE_COLS.map(() => '?').join(', ')})
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, avatar=excluded.avatar, track=excluded.track,
    placement_json=excluded.placement_json, level=excluded.level,
    mastery_json=excluded.mastery_json, misses_json=excluded.misses_json,
    companion_json=excluded.companion_json, sessions_json=excluded.sessions_json,
    exposure=excluded.exposure, last_mission=excluded.last_mission,
    birth_year=excluded.birth_year, updated_at=excluded.updated_at
`;

// Upsert variant used by POST /api/auth/adopt: claims a profile for a parent.
// Only ever used after verifying the row is unclaimed (parent_id IS NULL) or
// already owned by the caller, so overwriting parent_id here is safe.
export const UPSERT_PROFILE_PARENT_SQL = `
  INSERT INTO profiles (${PROFILE_COLS.join(', ')}, parent_id)
  VALUES (${PROFILE_COLS.map(() => '?').join(', ')}, ?)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, avatar=excluded.avatar, track=excluded.track,
    placement_json=excluded.placement_json, level=excluded.level,
    mastery_json=excluded.mastery_json, misses_json=excluded.misses_json,
    companion_json=excluded.companion_json, sessions_json=excluded.sessions_json,
    exposure=excluded.exposure, last_mission=excluded.last_mission,
    birth_year=excluded.birth_year, updated_at=excluded.updated_at, parent_id=excluded.parent_id
`;
