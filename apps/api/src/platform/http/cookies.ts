export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      // Malformed cookie values are ignored and consequently fail authentication/CSRF.
    }
    return cookies;
  }, {});
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAgeSeconds: number; httpOnly?: boolean },
): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${options.maxAgeSeconds}`,
    'SameSite=Lax',
    'Secure',
  ];
  if (options.httpOnly) attributes.push('HttpOnly');
  return attributes.join('; ');
}
