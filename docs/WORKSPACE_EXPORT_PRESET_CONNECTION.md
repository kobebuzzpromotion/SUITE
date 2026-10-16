# Workspace Export Preset connection — 2026-10-09

## Code boundary

Existing Node Workspace routes, live membership checks, immutable preset revisions and optimistic updates are reused. No public/Trial principal is converted to a Node principal, and no JWT, tenant or storage resource is invented.

The Editor accepts optional `workspaceExportContext` only with `trialSession.mode === 'NODE_WORKSPACE'`. The context contains `workspaceId`, `expectedSubject`, `expectedTenantId` and a live `tokenProvider`. Those expected identities must match the host principal, and a real same-origin `GET /v1/workspaces/:workspaceId/session` must verify identity and membership before mounting. Every client action obtains a fresh bearer and membership; applying/readback also rechecks membership and Editor lifetime. Tokens are not saved locally.

The actual existing four-setting Editor adapter is reused: format, size, resolution and output sharpening. It validates all fields, writes controls, checks readback and rolls back failure. This changes neither image recipes nor originals. A user must separately execute Final export. Saving, selecting or applying a preset is not evidence of an exported image, nor automatically naming evidence.

## Backward-compatible JSON addition

Existing fields and modes remain valid. No SQLite migration or rewrite of saved versions is needed: settings remain validated JSON in immutable version rows.

- Size adds `{kind:'exact-dimensions', width, height, strategy:'crop'|'stretch'}` and pad with `strategy:'pad', background:[255,255,255]|[128,128,128]|[0,0,0]`. Width and height remain positive integers at most 16384. Non-pad background is rejected. Previous `dimensions`/`fit` semantics are unchanged.
- Sharpening adds `{kind:'screen'|'print', strength:'low'|'standard'|'high'}`. These use SUITE's existing output kernel, not external vendor parity. `none` and manual values remain unchanged.
- Older clients that do not support additions must reject unknown values; do not silently downgrade print/crop/sharpening settings.

## Still not connected in public preview

Current bootstrap has no Node Workspace authenticated mode and preview has no same-origin Node API/OIDC deployment. Without real host configuration the panel remains unavailable, while local settings continue to work. No D1/R2/identity provider was provisioned. Runtime and real image tests have not been performed.
