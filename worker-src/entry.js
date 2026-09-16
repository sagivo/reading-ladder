// The Reading Ladder — _worker.js entry (Pages Advanced Mode).
//
// Why this exists: the Cloudflare Pages project is deployed via Direct Upload
// (no Git integration, no wrangler in this environment), and Direct Upload
// cannot compile a `functions/` directory — but it does support a single
// `_worker.js` file. So this module re-exports the existing Pages Functions
// route handlers behind a tiny router, bundled with esbuild:
//
//   npm run build:worker   -> dist/_worker.js (bundled, module format)
//
// The bundled file is a build artifact: it is produced by `npm run build`
// (which runs the worker build after vite) and uploaded with the deployment.
// `functions/` remains the source of truth — edit route handlers there, never
// in dist/.

import { onRequestPost as signupPost } from '../functions/api/auth/signup.js';
import { onRequestPost as loginPost } from '../functions/api/auth/login.js';
import { onRequestPost as logoutPost } from '../functions/api/auth/logout.js';
import { onRequestGet as meGet } from '../functions/api/auth/me.js';
import { onRequestPost as adoptPost } from '../functions/api/auth/adopt.js';
import {
  onRequestGet as profilesGet,
  onRequestPost as profilesPost,
} from '../functions/api/profiles.js';
import {
  onRequestGet as profileGet,
  onRequestPut as profilePut,
} from '../functions/api/profiles/[id].js';
import {
  onRequestGet as eventsGet,
  onRequestPost as eventsPost,
} from '../functions/api/profiles/[id]/events.js';

// Mirrors functions/_middleware.js (ignored in Advanced Mode).
function withSecurityHeaders(res) {
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-Request-Id', crypto.randomUUID());
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function json(data, status = 200) {
  return withSecurityHeaders(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const ctx = (params) => ({ request, env, params: params || {} });

    try {
      let res = null;
      if (path === '/api/auth/signup' && method === 'POST') res = await signupPost(ctx());
      else if (path === '/api/auth/login' && method === 'POST') res = await loginPost(ctx());
      else if (path === '/api/auth/logout' && method === 'POST') res = await logoutPost(ctx());
      else if (path === '/api/auth/me' && method === 'GET') res = await meGet(ctx());
      else if (path === '/api/auth/adopt' && method === 'POST') res = await adoptPost(ctx());
      else if (path === '/api/profiles' && method === 'GET') res = await profilesGet(ctx());
      else if (path === '/api/profiles' && method === 'POST') res = await profilesPost(ctx());
      else {
        const m = path.match(/^\/api\/profiles\/([^/]+)(?:\/(events))?$/);
        if (m) {
          const params = { id: decodeURIComponent(m[1]) };
          if (m[2] === 'events' && method === 'GET') res = await eventsGet(ctx(params));
          else if (m[2] === 'events' && method === 'POST') res = await eventsPost(ctx(params));
          else if (!m[2] && method === 'GET') res = await profileGet(ctx(params));
          else if (!m[2] && method === 'PUT') res = await profilePut(ctx(params));
        }
      }
      if (res) return withSecurityHeaders(res);
      if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);
      // Not an API route: serve the static frontend.
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          path,
          error: String((e && e.message) || e),
        })
      );
      return json({ error: 'internal error' }, 500);
    }
  },
};
