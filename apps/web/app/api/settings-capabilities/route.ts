/** Public UI capability only. Provider credentials and encryption keys stay server-side. */
export async function GET() {
  const mfaAvailable = ["1", "true", "yes", "on"].includes((process.env.MFA_TOTP_ENABLED ?? "false").trim().toLowerCase());
  return Response.json({ mfaAvailable }, { headers: { "cache-control": "no-store" } });
}
