# Report decision dialog

Source: approved moderation mockup, converted with 12ui conversion
`5a8dbba5-dca9-4272-ad31-05c4a5c5fade` and responsive export
`3028e328-14d8-4df8-bd5e-99f0970364c0`.

## Asset and component breakdown

| Source layer | Implementation | Content source |
| --- | --- | --- |
| White dialog, scrim, dividers | `decision-dialog-shell.tsx`, scoped CSS | Native dialog top layer, CSS surfaces |
| Shield, lock, eye, expand, information, check | Lucide SVG icons | Existing icon library |
| Photograph | `report-evidence-card.tsx` | Private signed report photo URL from the API |
| Rendition and channel permissions | Evidence card | Existing rendition and approval API |
| Decision fields and validation | `decision-modal.tsx` | Existing status transitions and decision API |
| Header metadata, status | Shell and `report-status.ts` | Current report and lifecycle revision |
| Footer actions | Shell | Existing validation blockers and pending state |

The extracted photograph, backdrop, and raster icon cutouts remain local design
references. They are not bundled as report evidence or a screenshot of the UI.
Interactive controls are real HTML elements; the approved visual geometry and
palette are represented in CSS rather than baked into an image.

## Layout

The reference dialog is 1015 × 877 px on a 1586 × 992 px canvas. The implementation
uses a 1016 px maximum width, 18 px radius, 42 px mint shield circle, navy text,
mint permissions panel, blue information panel, and green actions. At narrow
widths the columns stack. Header and footer stay visible while the body scrolls.

Native modal behavior isolates focus from the dashboard, supports Escape, restores
focus and body scrolling on close, and avoids transformed-parent positioning.
Photo enlargement opens a separate native dialog without publishing the image.

## Behavior retained

- Verification does not require photo consent or publish photos automatically.
- Web and Instagram approvals remain separate explicit API actions.
- The API validates owner consent and remains the source of truth.
- Saving uses the latest lifecycle revision, reason, canonical duplicate, public
  summary, and resolution media as required by the selected status.
- Preview preparation, empty/error states, multiple photos, duplicate decisions,
  resolution upload, and conflict errors remain available.

Automated tests use synthetic API fixtures; production verification is read only.

Post-implementation alignment used the unchanged approved LayerDoc against the
rendered production build. Its plan informed the 15 px field labels, tighter
column spacing, photo ratio, and compact permissions hints. The project fonts,
live backdrop, real report images, explicit approval buttons, and validation
messages are retained to support the existing product and moderation behavior.
