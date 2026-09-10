# Textify testing and release guide

All destructive/write tests use synthetic documents and a disposable PostgreSQL schema. Never point the suite at production. Provider calls are blocked or mocked unless a test explicitly uses the baked local model.

## Local source gate

```powershell
Set-Location 'D:\Code\Textify'
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:PATH = (Resolve-Path .\.venv\Scripts).Path + ';C:\Program Files\nodejs;' + $env:PATH
npm ci --ignore-scripts
npm run precommit
.\.venv\Scripts\python.exe -m pytest -q --tb=short
pip-audit -r requirements.txt
pip-audit -r requirements-local.txt
npm audit
```

Without `TEXTIFY_TEST_DATABASE_URL`, PostgreSQL, retrieval, and browser cases skip by design. Report that result as offline/unit coverage, not end-to-end.

## Full host/browser gate

Create a disposable PostgreSQL 17 database with pgvector, then set:

```powershell
$env:TEXTIFY_TEST_DATABASE_URL = 'postgresql://textify_test:synthetic-password@127.0.0.1:5432/textify_test'
$env:TEXTIFY_RUN_BROWSER_TESTS = '1'
$env:TEXTIFY_EVIDENCE_DIR = '.\browser-results'
.\.venv\Scripts\python.exe -m pytest -q --tb=short
```

The fixture creates and drops a unique schema and mocks hosted providers. The browser driver covers semantic/accessibility structure; wrong/correct access; session-only credential behavior; upload and dedupe; source selection; missing-selection error; answer and citation rendering; injected filename/source markup; stale response suppression on Lock; unsupported files; exhausted budgets; delete cancel/accept; theme semantics; keyboard reachability; 24px targets; 1280×900 and 320×720 reflow; page, console, and request failures; and axe WCAG 2 A/AA through 2.2 AA on desktop answer and mobile locked states.

## Security and boundary checks

Unit/integration tests cover pre-parser authentication, declared and chunked raw-body caps, exact file/parser bounds, prompt escaping, provider response validation, constant-time shared-code comparison, access-before-budget ordering, release identity format, vector shape/order/finite values, failed-provider atomicity, legacy/new dedupe compatibility, and cascading deletion. Dependency audits are advisory for known published vulnerabilities; they are not a penetration test.

## Image gate

CI is the executable reference. It builds both images with `VCS_REF=$GITHUB_SHA`, checks the OCI revision and UID/GID 10001, verifies application code is read-only, runs `pip check`, and starts the preferred local-BGE image against disposable pgvector. That container must pass `/health`, `/ready`, real local inference, synthetic TXT upload, semantic retrieve, evidence-only answer, and deletion.

Docker is currently unavailable on the Windows host. Do not claim a local image pass from host-only tests; use the exact GitHub CI result.

## Live gate

Deploy `fly.local-embeddings.toml` only after green CI. A release is signed off when:

1. pushed source SHA equals the green CI head;
2. deployed image was built with that SHA;
3. `/health` and `/ready` return 200 and that exact SHA;
4. `/health` reports `embedding_provider=local`, `embedding_dimensions=384`, and protected access enabled;
5. the previous verified Fly image/config is retained for rollback.

The zero-paid-call release gate does not invoke live Claude/OpenAI generation. GitHub CI covers the full workflow with a real local embedding model and evidence-only answer. Never expose the access code in logs or artifacts.

## Manual usage acceptance

At desktop and 320px, verify the labels remain readable, focus is visible, controls do not overlap, content does not scroll horizontally, status changes are announced, and both light/dark themes have usable contrast. With a synthetic document, verify unlock → upload → select → ask → inspect citations → delete → lock. Manual screen-reader, Safari/Firefox, field Core Web Vitals, sustained load, recovery/restore, and retrieval-quality evaluation remain required before making claims in those areas.
