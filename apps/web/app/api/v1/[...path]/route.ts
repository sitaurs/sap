/** Same-origin transport for the SAP v1 API. Credentials stay on the server. */
// API_INTERNAL_URL is the canonical name shared with the backend config; SAPA_API_BASE_URL
// is kept as a legacy alias so existing deployments keep working.
const backendOrigin = process.env.API_INTERNAL_URL || process.env.SAPA_API_BASE_URL || "http://localhost:3001";

async function proxy(request: Request) {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith("/api/v1/")) {
    return Response.json({ error: { code: "INVALID_PATH", message: "Path API tidak valid." } }, { status: 400 });
  }
  const upstreamUrl = new URL(`${incoming.pathname}${incoming.search}`, backendOrigin);
  const headers = new Headers();
  for (const name of ["cookie", "content-type", "accept", "x-csrf-token", "idempotency-key", "if-match"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Next may build request.url from its listening address (e.g. 0.0.0.0).
  // CSRF must validate the browser's actual Origin, never that internal address.
  // Do not synthesize an allowed Origin: cross-site requests must still fail.
  const browserOrigin = request.headers.get("origin");
  if (browserOrigin) headers.set("origin", browserOrigin);
  else if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return Response.json({ error: { code: "CSRF_INVALID", message: "Asal permintaan tidak tersedia. Muat ulang halaman lalu coba lagi." } }, { status: 403 });
  }

  // The OAuth callback responds with a same-origin dashboard redirect. If the
  // server-side fetch follows that relative Location itself, it resolves against
  // the API origin and requests /dashboard from Nest instead of the web app.
  const oauthCallback = incoming.pathname === "/api/v1/admin/instagram/account/callback";

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: oauthCallback ? "manual" : "follow",
      signal: AbortSignal.timeout(120000),
    });
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    for (const name of ["content-type", "x-contract-version", "retry-after", "etag", ...(oauthCallback ? ["location"] : [])]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: { code: "BACKEND_UNAVAILABLE", message: "Layanan SAP belum dapat dihubungi." } }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
