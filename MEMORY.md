# Textify project memory

This file is a durable handoff for people and coding agents. It records decisions and evidence without credentials. Exact Git history, CI logs, and live endpoints remain authoritative.

## Product decision record

- The active product is the FastAPI citation-first study workspace, not the retained Flask/TextRank/BERT experiment.
- Preferred production embeddings are the pinned local BGE ONNX model (`BAAI/bge-small-en-v1.5`, 384 dimensions). This resolves the embedding-key requirement for the deployed path: no hosted embedding API key is needed.
- Claude/OpenAI answer generation is optional. Evidence-only mode is a supported honest fallback and the CI/container path deliberately uses it to avoid paid calls.
- The database is PostgreSQL with pgvector. BGE and OpenAI embeddings use separate tables because vector dimensions and semantic spaces are incompatible.
- The product remains a private single-user workspace protected by one shared code. Multi-user auth/ownership is future work.
- The Glass visual language is preserved while content surfaces remain readable and responsive.

## Release-readiness work on 10 September 2026

Baseline before this pass: local branch `codex/textify-rag-release` at `2fa48a79d215efa76c0adc577407f928c26d007b`; public `origin/master` and Fly v11 at `629511776ff5ba71b35974991f78ebefa71dc3b3`.

Verified defects fixed in this pass:

1. Added a pre-parser ASGI upload gate. It authenticates before multipart spooling and bounds both declared and chunked request bodies.
2. Closed database sessions before local/hosted embedding work to prevent slow inference from exhausting the connection pool.
3. Changed new document identity to normalized full SHA-256 while retaining lookup compatibility with legacy 16-hex fingerprints.
4. Validated malformed Claude response structure and map failures through the existing bounded provider error contract.
5. Made both production images fail closed by default and made public readiness reject missing/malformed release identity.
6. Repaired the legacy Cloud Build definition so it uses an immutable commit tag, fail-closed access configuration, and secret references rather than an unprotected mutable `latest` deployment.
7. Added request cancellation/version guards so Lock, source changes, and new workspace sessions cannot reveal stale private answers or statuses.
8. Added a meaningful theme toggle state, 320px reflow/target/focus checks, and axe WCAG A/AA checks for desktop answer and mobile locked states.
9. Added pinned Ruff, ESLint, Prettier, Husky, Playwright, axe-core, and pip-audit tooling. `npm run precommit` is the local source gate and GitHub CI repeats it.

Local verified result before publication: 21 tests passed and 14 PostgreSQL/browser tests skipped because no safe disposable local pgvector credentials were available. Ruff, ESLint, Prettier, compileall, and the Husky command passed. The skipped matrix must pass in GitHub Actions before release sign-off.

## CTA and failure-state inventory

Theme, unlock, wrong-code handling, lock, upload, duplicate upload, source selection, missing selection, ask, citations, unsupported file, rate limit, delete cancel/accept, and stale request cancellation are all explicit browser cases. Unit/integration tests also cover TXT/PDF/DOCX, malformed/empty/oversized inputs, provider timeout/rejection/invalid vectors, prompt-boundary injection, evidence-only mode, cascade deletion, unknown documents, access-before-budget, raw upload gates, and release identity.

## Release handoff

1. Run the full GitHub `Verify Textify` workflow for the exact pushed SHA; it supplies disposable pgvector and real Chromium.
2. Require every job green and retain the browser artifact.
3. Deploy that exact SHA with `fly.local-embeddings.toml`.
4. Verify public `/health` and `/ready` return 200 and the exact SHA, local provider, and 384 dimensions.
5. Do not make a paid live generation call for verification. CI proves upload/retrieval/evidence-only/delete with a real local model. If a live write smoke is later authorized, use synthetic data and guarantee cleanup without exposing the code.
6. Record CI URL, Fly release/image identity, endpoint output, UTC time, and limitations in the external verification artifact and Study Pack.

## Open work and claim limits

- Database migration/versioning and a tested restore path remain absent.
- Auth guessing has no separate shared brute-force limiter; the private code must be high entropy and upstream controls remain important.
- Rate-limit buckets are process-local and not globally pruned/distributed.
- Retrieval recall, citation entailment, multilingual behavior, OCR, concurrent capacity, cold-start percentiles, field Web Vitals, screen-reader behavior, and multi-browser behavior are unmeasured.
- Automated axe/Lighthouse results are not third-party WCAG certification.
- The deployment workflow rebuilds remotely; CI verifies equivalent Dockerfiles and exact revision labels, but a build-once/promote-by-digest supply chain remains future hardening.

## Sensitive-data rule

The canonical Study Pack contains no reusable access code. Document only the `TEXTIFY_ACCESS_CODE` secret name and its setup and rotation procedure; never print, summarize, hash, copy, or commit a secret value.
