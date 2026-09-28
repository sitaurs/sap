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
  headers.set("origin", incoming.origin);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(120000),
    });
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    for (const name of ["content-type", "x-contract-version", "retry-after", "etag"]) {
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
export const DELETE = proxy;
