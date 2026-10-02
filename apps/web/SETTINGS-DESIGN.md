# Settings design

The settings page follows the approved SAP mockup: profile and account security,
then report privacy and SAPA, with a full-width account card containing separate
stacked logout and account-deletion rows. Mobile collapses to one column.

## Assets

`public/images/settings/` contains independent WebP illustrations:

- `profile-botanical.webp`: botanical default avatar; the camera is a real icon button.
- `security-shield.webp`: shield, padlock and leaves for the authenticator section.
- `privacy-report.webp`: document, map pin, clouds and leaves for the privacy note.
- `sapa-welcome.webp`: optimized existing SAPA welcome sticker.

The first three were created using the built-in imagegen tool, referencing the
approved mockup. Prompt specifications: isolate the circular mint leaf avatar;
isolate the emerald shield with a white padlock and pastel leaves; isolate the
paper document with mint landscape, green map pin, leaves and blue clouds.
All prompts required transparent backgrounds, clean edges, no text, no UI, and
the same botanical style as the mockup. WebP conversion preserves transparency.
The SAPA character is reused from the existing project asset.

## Functional boundaries

- Name: `PATCH /api/v1/users/me`; email remains read-only.
- Avatar: upload with purpose `avatar`, then `PATCH /api/v1/users/me/avatar`.
  MIME allowlist is JPEG/PNG/WebP and the input limit matches the API's 10 MiB.
  Removal sends `mediaId: null`. Signed display URLs refresh before expiry.
- Password: `PATCH /api/v1/users/me/password`; all password fields exist only
  inside the change dialog. Password values are cleared on dismissal/success.
- MFA: existing `/api/v1/auth/mfa` endpoints and password reauthentication.
  QR generation is local and dynamically loaded; provisioning data is never
  sent to a third-party QR service, logged, or persisted in browser storage.
  Recovery codes are displayed only after creation, may be downloaded explicitly,
  and are cleared before returning to login because factor changes revoke sessions.
- Privacy is informational; no unsupported visibility settings are introduced.
- SAPA preference retains the existing account API and rollback behavior.
- Deletion requires password reauthentication plus typed confirmation; submission
  reports queued deletion, never claims immediate removal.

## MFA availability

The current API status contract returns disabled/pending/active but does not
distinguish disabled enrollment from a global feature kill switch. The Next.js
`GET /api/settings-capabilities` route therefore exposes only the boolean
`MFA_TOTP_ENABLED` deployment setting. Set it to the same value as on the API.
The encryption key must remain exclusively in the backend environment.
When the flag is false, the page displays “Belum tersedia” and hides enrollment.
Active/pending account status from the API takes precedence over the neutral label.
No backend contract or database changes are part of this design work.

Dialogs use native dialog focus trapping and restore focus on close. Interactive
controls have keyboard focus indicators; pending requests disable duplicate
actions. Motion respects `prefers-reduced-motion`.
