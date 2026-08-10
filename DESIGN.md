# ALOC UI Design Contract

## Reference boundary

- The mobile reference frame is 390 × 844 px. It defines the primary content width and visual density for page-level work.
- Existing generated color and typography tokens are the source of truth. Do not introduce new spacing, radius, elevation, z-index, or motion tokens as part of this migration.
- Existing hardcoded layout values remain valid unless a specific screen change requires otherwise.

## PageRoot

- `PageRoot` owns the sole page-level `<main>` landmark and the page background.
- Use the default `full` layout for map and edge-to-edge results. Use `contained` for ordinary mobile forms, lists, and feedback pages; it is full-width below 390 px and centered with a 390 px maximum content width above it.
- Pages rendered inside `PageRoot` use a `div` root rather than a nested `<main>`.

## Header

- Headers use the existing `back-arrow` icon when a backward action is available.
- A header title is always present. The right slot is reserved for page-specific actions without changing the header structure.
- Back controls have an accessible Korean label (`뒤로 가기`) and a 44 px touch target while retaining the existing 24 px icon.

## Feedback states

- Use `FeedbackState` for simple loading, empty, and error screens or regions.
- Each state supplies a concise title, optional explanation, and an optional action when the user can recover.
- Keep screen-specific progress indicators and recovery actions, skeletons, maps, Modal, BottomSheet, and OverlayShell interactions in their existing components. In particular, the recommendation SSE pending screen retains its dedicated progress and failure presentation.
