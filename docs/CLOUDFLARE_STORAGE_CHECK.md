# Cloudflare storage boundary check

2026-10-03 JST. This is a scoped read-only audit of the current Worker, D1 schema/migrations, R2 wrapper, static ASSETS route, Web Sites client, and anonymous browser store. The only product-adjacent change here is the independent test at `apps/sites/tests/cloudflare-storage.test.mjs`. No deployed Cloudflare account, bucket, database, Access policy, or real RAW was used.

## Executed evidence

`node --test apps/sites/tests/cloudflare-storage.test.mjs` on Node v24.19.0: **4 pass, 0 fail**. The test calls the actual `handleRequest` and executes all three Sites migrations in temporary in-memory SQLite. D1's interface, R2, dispatch identity, and digest fallback are test doubles. Its bytes are explicitly synthetic, not camera RAW.

| Boundary | Result in this harness | Scope |
| --- | --- | --- |
| Owner/tenant | PASS | A second bound member receives 404 for another tenant's asset/upload/recipe/original/part; no object is written. Identity headers are injected by the harness, so Cloudflare Access trust is not proven. |
| Original/part retry | PASS | Identical verified part retry does not issue another R2 PUT or replace the existing object. |
| Cloud Safe | PASS in test double | Before complete, Original read is refused; after server-side final digest it is allowed; after final R2 object removal, read refuses and D1 `cloud_safe` becomes 0. This does not certify real Cloud Safe or disaster recovery. |
| Quota | PASS in test double | 2× asset-size reservation is admitted atomically at the configured limit; another import is rejected and the first asset remains. |
| R2 failure/ENOSPC analogue | PASS for preservation | Injected write failure returns 503, leaves upload resumable and `cloud_safe=0`, and retains a conservative reservation. Actual provider ENOSPC semantics are NOT_RUN. |
| Usage accounting failure | PASS for preservation | Failed metrics write returns 503 while the committed asset remains. This does not make a potentially successful prior mutation unambiguous to the client. |

Existing `apps/web/tests/sites-worker.test.mjs` and `apps/web/tests/multipart-client.test.mjs` cover further mock cases including repaired parts, interrupted completion, retry, expiry, quota and transient reads. These remain synthetic tests and are not counted as live D1/R2 results here.

## Contract and connection findings

- D1 `assets` retains `tenant_id`, unique `original_key`, SHA-256, size and `cloud_safe`; `site_uploads` ties one upload to one asset and author; `site_parts` keeps distinct physical keys. The three migrations match these storage tables. Routes resolve the asset by `tenant_id` before touching upload or Original. R2 keys include the tenant prefix. `cloudflare-entry.mjs` strips inbound identity headers and supplies claims from a signed application session; actual Access JWT and deployment policy remain unverified.
- `ASSETS` serves a fixed public static path set before D1/R2. Private Original is only `/v1/assets/{id}/original` and requires a recognized processing purpose plus fresh object checksum. Public static assets do not identify an Original owner.
- `SitesClient.putOriginal` hashes a full `ArrayBuffer`, validates upload binding, skips only server-verified matching parts, and checks the final `cloudSafe` response. The 128 MiB input cap and 8 MiB parts are current trial limits, not evidence for larger RAW, background upload, mobile restart, 50 GB–1 TB projects, or cross-device sync.
- The anonymous `BrowserLocalAPI` uses one default IndexedDB name per browser origin (`suite-browser-local-v1`). It has no account or owner identifier, advertises `BROWSER_LOCAL_ONLY` and `cloudSafe:false`, and does not sync or evict. Anyone using the same browser profile and origin can encounter that local library. It must not be represented as private per signed-in user or attached to a later account without an explicit ownership/consent migration.
- R2 PUT failures leave reserved object rows; after a successful R2 PUT but failed D1 part-row write, the object may exist with only reservation metadata. This is conservative for preserving data but consumes capacity indefinitely without a separate reconciliation process. No delete/eviction path was observed. A lost completion acknowledgment may mean server success despite a client-visible 503 if metering fails; the client must retry/query the same asset, and the UI should say status is unconfirmed.
- A READY asset list reads the D1 flag without rechecking R2. Actual integrity is checked on Original read and READY completion retry. Thus the list's `cloudSafe:true` can be stale after external object loss until an integrity-checking operation runs. Do not use that flag alone as a deletion authorization for a local Original.

## Minimal integration actions for main

1. Keep anonymous browser storage labeled local-only. If account ownership or shared-device privacy is required, scope the database to an authenticated stable subject and implement an explicit, checksum-verified claim flow for existing anonymous data. Never infer ownership from browser origin or asset ID alone.
2. For the trial Worker, add a bounded reconciliation path for `RESERVED` rows and orphaned R2 objects, with D1/R2 comparison and audit. It must retain data on uncertainty and never auto-delete an Original because quota, trial expiry, or billing changed.
3. Expose the distinction between D1's `cloud_safe` flag and a freshly verified R2 object to any UI action that could remove a local copy. A list flag alone is insufficient.
4. Before calling Cloud Safe or scaling complete, run the same contract against a dedicated real D1/R2/ASSETS deployment and Cloudflare Access policy, including signed-in and anonymous routes, real browser restart, network interruption, multipart retry, checksum corruption, 5xx, quota exhaustion, and recovery. Record provider IDs and configuration without secrets. These are **NOT_RUN** here.

No Worker, schema, migration, R2 binding, deployment, or user data was changed by this check.
