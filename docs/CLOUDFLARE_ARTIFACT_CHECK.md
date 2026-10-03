# Cloudflare artifact check

2026-10-03 JST. Scope: dedicated Cloudflare build source, emitted Worker and static ASSETS, and example Wrangler configuration. No deployment or provider operation was performed. The previously completed storage tests and `CLOUDFLARE_STORAGE_CHECK.md` were left unchanged.

## Executed result

`node --test apps/sites/tests/cloudflare-artifact.test.mjs` on Node v24.19.0: **3 pass, 0 fail**. The test inspects `apps/sites/dist-cloudflare`, imports its emitted Worker, and executes two requests against it with synthetic configuration. It does not use actual Cloudflare Access, D1, R2, or static hosting.

| Check | Observed result | Limit |
| --- | --- | --- |
| Entry and bundle | PASS: build source points at `src/cloudflare-entry.mjs`; emitted `server/index.js` exposes `default.fetch`; missing Access assertion on `/auth/whoami` is rejected; caller-injected identity headers do not grant `/v1/assets` access. | This checks the built entry's behavior in Node, not a deployed Worker. |
| Public ASSETS inventory | PASS: 20 files are in `client/`, within the browser asset allowlist; no sourcemap, QA page, `qa.js`, database/migration, or private evidence file is present. Text assets have no matched credential literals, private-key block, or private D1 schema marker. | Pattern scan cannot prove that arbitrary data was never embedded in a compiled or binary asset. Build inputs and release review still matter. |
| Bindings and configuration | PASS: template declares `ASSETS`, `DB`, `BUCKET`, points to the dedicated artifact, and keeps D1 ID, D1 name, R2 name and Worker name as visible `REPLACE_*` placeholders. | Resource creation, binding, secrets, Access policy, domain and deployment are **NOT_RUN**. Placeholder template is intentionally not deployable. |

The dedicated build reports `BUILT_NOT_DEPLOYED` and `realCloudflare: NOT_RUN`. This is an artifact result only. It must not be presented as a working Cloudflare site, connected storage, or verified identity policy.

## Follow-up for main

`build-cloudflare.mjs` copies allowlisted files into a persistent `dist-cloudflare/client` directory without removing old files first. The current inventory is clean and the artifact test detects unexpected retained files, but a future build after older output could fail or, if the test were skipped, publish stale content. Before packaging or deployment, stage into a fresh dedicated output directory or remove only the verified dedicated artifact directory, then rerun this test against the exact deploy candidate. Keep the deletion target narrowly scoped to `apps/sites/dist-cloudflare`.

When real resources are selected, replace placeholders outside the committed example, provision secrets through the provider's secret mechanism, verify Access coverage for `/auth/*`, run D1 migrations in the intended dedicated database, and rerun the artifact and storage boundary tests against the exact build. Do not copy real resource IDs or secret values into this document.
