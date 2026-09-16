// Global Pages Functions middleware: security headers + request id.
//
// CSP is deliberately NOT set here: the Vite build uses inline scripts, so a
// strict CSP would break the app. See SECURITY.md for the full rationale.

export async function onRequest(context) {
  const res = await context.next();
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
