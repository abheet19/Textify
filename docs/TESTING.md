# Textify testing and release guide

## Host gates

Use a disposable PostgreSQL database with pgvector and never point tests at production:

```powershell
$env:TEXTIFY_TEST_DATABASE_URL = "postgresql://textify_test:synthetic-password@127.0.0.1:5432/textify_test"
$env:TEXTIFY_RUN_BROWSER_TESTS = "1"
$env:TEXTIFY_EVIDENCE_DIR = ".\browser-results"
python -m pip install -r requirements-dev.txt
python -m pytest -q --tb=short
python -m compileall -q app tests
pip-audit -r requirements.txt
pip-audit -r requirements-local.txt
```

Tests block real paid-provider calls. The integration fixture creates and drops a unique database schema. Browser evidence covers locked and unlocked states, real upload/deduplication, selection, question/evidence rendering, injection-safe text handling, recoverable errors, deletion, theme switching, session-only credential storage, and the 390 px layout.

## Image gates

Build both provider variants with the exact Git commit:

```powershell
$sha = git rev-parse HEAD
docker build --build-arg "VCS_REF=$sha" -t textify-openai .
docker build --build-arg "VCS_REF=$sha" -f Dockerfile.local -t textify-local .
```

Verify the revision label and non-root user on both. Run the local image against disposable pgvector, then require `/ready`, `/health`, a real TXT upload, local vector retrieval, an evidence-only answer, deletion, `pip check`, UID/GID 10001, and read-only application files. `.github/workflows/ci.yml` is the executable reference.

## Live gate

Deploy `fly.local-embeddings.toml` unless an OpenAI embedding space is explicitly chosen. Record the Git SHA, workflow URL, Fly release ID, image digest, `/health`, `/ready`, and UTC timestamp. `/health.release` must equal the deployed Git SHA. A protected upload/ask/delete smoke requires the workspace access code; do not claim that live gate from public health checks alone.
