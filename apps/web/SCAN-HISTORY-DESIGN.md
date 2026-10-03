# Scan history design

The approved overview and detail mockups are implemented as HTML/React components,
not flattened screenshots. Existing dashboard navigation, user data, SAPA, and
report creation are retained.

## Assets

Generated with the built-in imagegen tool, inspected, trimmed, resized and encoded
as WebP using Sharp. Transparency is preserved.

| Asset in `public/images/history/` | Use |
| --- | --- |
| `battery.webp` | Original mockup illustration, no longer used as a scan thumbnail |
| `camera-botanical.webp` | About-history card and empty state |
| `guide.webp` | Guidance card and guidance tab |

Existing `public/images/settings/profile-botanical.webp` is reused as a subtle
decorative botanical accent. Scan and report thumbnails display actual private
uploaded photos through the shared `media-thumbnail.tsx` component.

### Generation prompts

Common instruction: "Background extraction. Asset for SAP scan history web UI.
Genuine transparent background, crisp clean alpha edges, attractive small-scale
readability, no logos or watermarks." Each call used the relevant approved mockup.

- Battery: Extract and recreate only the two green batteries illustration inside
  the category thumbnail: one upright green-and-charcoal battery, one diagonal
  battery beside it. Clean shape, elegant product rendering, emerald/lime palette,
  soft grounding shadow. No mint square tile, interface, ornament, labels or text.
- Camera: Extract and recreate only the pale mint camera with dark emerald lens
  and botanical foliage in the about-history card. Soft semi-realistic 3D style,
  sage leaves, pale mint cloud shapes, landscape composition, complete foliage.
  No interface, cards or text.
- Guide: Extract and recreate only the little white document with green abstract
  lines and sage leaves from the guidance card. Soft semi-realistic illustration,
  complete leaves and document. No card, interface or text.

## Data and interactions

- Overview uses all actual scans provided by the dashboard's paginated
  `GET /api/v1/scans` collector. No demo rows or fabricated metadata.
- Count Dikenali: `status=succeeded` and `outcome=classified`.
- Count Belum dikenali: succeeded with unknown/no_waste. Queued, processing and
  failed scans remain visible under Semua, with distinct status badges.
- Client filters: result, rolling 7/30/90 day period, category/ID/status search.
  Search is limited to the already-loaded account history. Render 20 entries at a
  time, with a load-more button. Group and sort by actual creation timestamps.
- Dates/times are explicitly rendered in Asia/Jakarta with WIB labels.
- Detail calls the existing authenticated `GET /api/v1/scans/:scanId` endpoint.
  Pending scans refresh every four seconds while the drawer is open. Requests and
  timers are aborted/cleared when the drawer is closed. A failure keeps the last
  available record visible with a retry control.
- Scan now exposes optional `mediaId` from the existing `scans.media_id` column.
  This additive field is also described in OpenAPI and the generated web types;
  no database migration is needed. Existing account ownership checks are retained.
- Thumbnails in history, its detail drawer, and report rows use the uploaded file
  via `GET /api/v1/media/:mediaId/url`. URLs are short-lived, refreshed before
  expiration, kept only in component memory, and never persisted to localStorage.
  Missing/deleted/unavailable photos show an explicit fallback, never a stock
  illustration pretending to be the uploaded photo. No invented condition,
  battery chemistry, or confidence values are displayed.
- Guidance explains scan interpretation and reporting. It does not claim there
  is a category-specific handling API. Buttons switch tabs, start a new scan,
  or open the existing report wizard without inventing a photo attachment.

## Accessibility and layout

Native modal dialog traps focus and makes background controls inert, supports
Escape/backdrop/close button, locks body scrolling, restores focus on close.
The drawer header/actions remain visible while its contents scroll. Tabs support
Left/Right/Home/End. Filters expose pressed state, form controls have labels,
result counts use a live status region. Reduced-motion disables decorative
animations. Mobile layout stacks cards and uses a full-width drawer.

Backend scan serialization was extended to include its existing media reference.
Authentication, environment configuration and secrets are unchanged.
