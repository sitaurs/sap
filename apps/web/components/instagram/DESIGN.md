# Instagram post detail

The approved 1439 × 1093 mockup is separated into a top-layer dialog,
preview/source panel, content editor, approval card, and pinned action footer.
The source conversion and responsive export are local design evidence under
`.improve/instagram-detail-reference`; they are not production assets.

## Asset and component map

| Element | Implementation | Data / asset source |
| --- | --- | --- |
| Modal header, status, close | `post-detail-dialog.tsx` | Live post status and existing status component |
| Final poster and zoom | `post-preview-panel.tsx` | Signed URL from the existing publication-preview API |
| Source tags, dates, history | `post-preview-panel.tsx` | Live source, generation, timestamps, and history API |
| Caption, accessible description | `post-content-editor.tsx` | Existing draft inputs; 2200 / 1000 character limits |
| Approval card | `post-content-editor.tsx` | Existing approval and revision checks; unsaved edits require another review |
| Settings, cancel, retract, operations | `publication-detail.tsx` | Existing permissions, capabilities, confirmation and operation flow |
| Save / approve / publish footer | `publication-detail.tsx` | Existing API actions, revision and idempotency handling |
| Lines, icons, fields, surfaces | `post-detail.module.css`, Lucide | Semantic controls and scalable UI; existing app font |

The mockup's poster crop is retained only for local visual comparison. No sample
poster, caption, report ID, account, or timestamp is substituted for API data.
The background dashboard belongs to the existing app and is not flattened into
an image. Raster crops of native field resize handles and backdrop navigation
are reference material; production uses native fields and the existing app.

## Layout and behavior

Desktop: centered 1124px dialog, preview left and editor right, restrained navy,
teal and mint surfaces, amber pending approval. Header and footer stay visible;
the middle scrolls when content or viewport height needs it. Below 860px the
columns stack. On narrow phones the dialog fills the dynamic viewport and the
three actions wrap with safe-area padding.

The preview is contained without cropping. A nested top-layer viewer supports
zoom and Escape without dismissing the draft. The main dialog restores focus
and page scrolling, traps keyboard focus, and retains the unsaved-edit prompt.
Action confirmations and errors are in the visible footer. Approval and
publication remain separate actions; queued or uncertain publication remains
an operation to inspect, never a successful post.

Character counters use actual input length. The accessibility limit is 1000,
correcting the placeholder counter in the mockup. Approval labels use the live
state rather than always displaying the mockup's "Perlu ditinjau ulang".
