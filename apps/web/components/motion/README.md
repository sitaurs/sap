# SAP motion layer

Adds motion to existing screens without changing their layout, data, routing, form state or API calls. Inspired by the user's dashboard video and the micro-interaction, page-transition, accessibility and performance guidance in https://github.com/iart-ai/web-animation-skills.

## Integration

- `MotionEnhancer` mounts once in the root layout and renders no DOM wrapper.
- `data-motion-scope` opts a page into one-time, viewport-triggered section/article entrances. Leaf surfaces animate independently; nested panels are not animated twice.
- `data-motion="heading"` / `"card"` opt other existing elements into the same entrance. `data-motion="chart"` reveals a bar through horizontal scale, preserving its real width/data.
- `data-motion-view` replays an entrance when a dashboard view or auth stage changes. Ordinary input, polling and data refreshes do not replay it. It never remounts a component or delays navigation.
- `data-motion="dialog"`, `"drawer"`, `"backdrop"`, `"overlay"`, `"feedback"` opt into short CSS entrances. Dialog footers and form cards keep their geometry during interaction.
- `data-motion="off"` or `data-motion-ignore` excludes a subtree. Maps, fixed overlays and existing rotated artwork retain their own transforms.
- `AnimatedNumber` takes only the actual value already rendered by the caller. A visually hidden final value is available to assistive technology immediately; a reserved final-value cell prevents width shifts during count-up. Placeholders, zero and nonnumeric labels remain unchanged.

## Timing and constraints

Panel entrances: 340 ms, 35 ms stagger capped at 175 ms, 12 px individual translate plus opacity. Form-containing surfaces use opacity only. Chart reveal: 480 ms. Count-up: 650 ms. Dialog: 180 ms fade with 220 ms icon emphasis. Drawer: 240 ms. Feedback/backdrop: 180 ms. Button press: 0.98 individual scale.

The layer uses native Web Animations and CSS; it adds no dependency, scroll hijacking, infinite animation, private Next.js API, permanent inline transform or `will-change`. Completed animations cancel their own effects, restoring the original CSS. Observers and listeners clean up on route changes; removed elements release animations. Backgrounding the tab stops active entries/counters.

`prefers-reduced-motion` disables new entrance movement and count-up, including preference changes while the page is open. Server-rendered content stays visible when JavaScript or animation APIs are unavailable.

## Verification

`tests/motion.spec.ts` covers public/auth/dashboard/admin route entrances at desktop/mobile widths, real accessible counts, preserved focus/input, no replay on search, live reduced-motion changes, no-JavaScript visibility and no action requests from browsing. Existing moderation, publication and volunteer tests exercise decision validation, consent, revisions and focus restoration with isolated API fixtures.
