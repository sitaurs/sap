import { serializeCookie } from '../platform/http/cookies.js';

export const DELETION_COOKIE = 'sap_deletion';
const DELETION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Cookie carrying the opaque deletion receipt so the client can poll status. */
export function deletionCookie(token: string): string {
  return serializeCookie(DELETION_COOKIE, token, { maxAgeSeconds: DELETION_TTL_SECONDS, httpOnly: true });
}
