// Shared helpers for the Reading Ladder Pages Functions.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

// Columns written by profile upserts (client sends snake_case via toServer()).
export const PROFILE_COLS = [
  'id', 'name', 'avatar', 'track', 'placement_json', 'level',
  'mastery_json', 'misses_json', 'companion_json', 'sessions_json',
  'exposure', 'last_mission', 'created_at', 'updated_at',
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
    updated_at=excluded.updated_at
`;
