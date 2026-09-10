# Textify context

This is the compact source of truth for engineers and coding agents. Read it with `README.md`, `MEMORY.md`, and `docs/TESTING.md` before changing the product. Git, GitHub Actions, and the live `/health` response are authoritative for exact release identity; prose is never proof that a commit was published.

## Product contract

Textify is a private, single-user, citation-first RAG study workspace. A learner unlocks one shared workspace, indexes a PDF, DOCX, or TXT source, selects that source, asks a question, checks an answer against four retrieved passages, and can delete the source. It is deliberately small: no accounts, tenant isolation, OCR, background jobs, URL ingestion, quiz generation, glossary generation, or export workflow is part of the active FastAPI product.

The preferred deployment creates embeddings locally with a pinned quantized `BAAI/bge-small-en-v1.5` ONNX model. It needs no embedding API key and incurs no hosted embedding call. Claude or OpenAI generation is optional and can cost money. Without a generation key, Textify returns retrieved evidence explicitly as `evidence-only`.

## User states and CTAs

| State or control | Expected behavior |
| --- | --- |
| `Light theme` / `Dark theme` | switches theme, persists only the theme preference, and exposes `aria-pressed` |
| Access code + `Unlock workspace` | lists sources on success; shows an in-page 401/503 message on failure; stores the code in `sessionStorage`, never `localStorage` |
| `Lock workspace` | aborts pending browser work, removes the session code, hides sources and evidence, and prevents stale responses from reappearing |
| File picker + `Build evidence index` | accepts PDF/DOCX/TXT, shows busy/success/deduplicated/error states, then selects the indexed source |
| Indexed source selector | changes the active document, enables deletion, clears old evidence, and cancels an obsolete ask |
| `Remove source` | cancel leaves data intact; accept deletes the document and cascading chunks, then clears evidence |
| Question + `Find supported answer` | validates selection/question, retrieves within the selected document, renders answer/citations as text, and recovers from provider errors |

## Request and data flow

```text
browser
  -> pre-body upload gate: access-code check + raw request cap
  -> FastAPI route validation and per-client process-local budget
  -> bounded extraction: PDF / DOCX / UTF-8 TXT
  -> normalized full SHA-256 dedupe (legacy 16-hex fingerprints remain readable)
  -> sentence-aware chunks: 180 words, 36-word overlap
  -> local BGE passage vectors (384d) or optional OpenAI vectors (1536d)
  -> short PostgreSQL/pgvector transaction

question
  -> short existence check -> query embedding outside DB session
  -> selected-document cosine top four -> close DB session
  -> escaped, explicitly untrusted evidence
  -> optional grounded generation or evidence-only response
  -> textContent rendering with visible citations
```

Provider and CPU inference must never hold a database connection. Local and OpenAI embeddings use separate table pairs and must never be mixed.

## Active code map

| Path | Responsibility |
| --- | --- |
| `app/main.py` | ASGI upload gate, FastAPI lifespan/middleware/routes, parsers/bounds, ORM, provider selection, health/readiness |
| `app/guard.py` | constant-time shared-code validation and rolling upload/question budgets |
| `app/rag.py` | normalization, chunking, compatible fingerprints, prompt isolation, answer-provider schema validation |
| `app/local_embeddings.py` | pinned offline BGE load, query/passage encoding, shape checks, serialized inference |
| `app/web/index.html` | semantic one-page UI and form labels/status regions |
| `app/web/app.js` | locked/unlocked state machine, request cancellation/versioning, safe rendering, theme state |
| `app/web/app.css` + vendored Glass CSS | responsive visual layer and focus/control styles |
| `tests/` | unit, security, PostgreSQL/pgvector integration, provider failure, file-boundary, and browser contracts |
| `tools/verify-browser.mjs` | real Chromium CTA, 1280px/320px, injection, stale-response, and axe WCAG checks |
| `Dockerfile*`, `fly*.toml` | fail-closed provider and preferred local-BGE production images/Fly shape |
| `.github/workflows/ci.yml` | lint/format/audit, disposable pgvector, browser, exact-image, and local-BGE container gates |
| `.github/workflows/fly-deploy.yml` | manual verify-before-deploy workflow and exact live SHA check |

`app/service.py`, `app/templates/`, older `app/static/`, `run.py`, and `config.py` are retained historical Flask/TextRank artifacts. They are outside `app.main:app` and the production images. Do not infer current features from them.

## Enforced limits

| Boundary | Value |
| --- | ---: |
| raw multipart request | 3 MiB file plus 64 KiB framing allowance |
| file content | 3 MiB |
| PDF | 200 pages |
| expanded DOCX members | 12 MiB |
| extracted text | 120,000 characters |
| chunks / passage bytes | 120 / 4,096 |
| OpenAI embedding batch | 32 |
| question | 6–500 characters |
| retrieved evidence | top 4 passages |
| generated answer | 350 tokens |
| process-local budgets | 3 uploads/hour and 12 asks/hour per client |

Production images set `TEXTIFY_REQUIRE_ACCESS_CODE=1`. Upload authentication runs before multipart parsing, so an anonymous body is rejected without being spooled. Oversized `Content-Length` and chunked bodies are bounded before an `UploadFile` exists. Public readiness also requires a lowercase 40-character Git SHA. Responses are `no-store` and include CSP, framing, MIME, referrer, and browser-permission restrictions. Source text and filenames are rendered as text.

## Engineering and interview concepts

- **Python/FastAPI:** ASGI receive/send middleware, dependency-free guards, Pydantic request contracts, thread-pool execution for synchronous routes, typed ORM models, exception-to-HTTP mapping.
- **RAG/NLP:** normalization, overlapping chunk windows, query-versus-passage embeddings, cosine distance, retrieval scope, grounded prompting, abstaining with evidence-only output.
- **DSA:** linear chunking and hashing; deque-based amortized O(1) rolling windows; top-k vector ordering over a bounded per-document set; uniqueness for idempotency and race recovery.
- **JavaScript:** DOM state machine, `AbortController`, stale-result version tokens, safe `textContent`, `FormData`, async error recovery, session/local storage boundaries.
- **TypeScript:** N/A in the shipped frontend; it is plain browser JavaScript. A TS migration is optional and should be justified by growing state/contracts, not claimed as current work.
- **Framework state libraries:** N/A; the page is small enough for explicit DOM state. React/Redux would add cost without solving a measured problem.

## Verification and release

Install Python and Node dependencies, run `npm run precommit`, then run pytest with a disposable PostgreSQL 17 + pgvector database and `TEXTIFY_RUN_BROWSER_TESTS=1`. CI independently repeats lint, format, dependency audits, full host/browser tests, exact image builds, non-root/read-only assertions, real local BGE inference, and a container upload → ask → delete flow using synthetic data and no hosted provider.

Fly deployment is manual and defaults to `fly.local-embeddings.toml`. A release is complete only when the source SHA, successful CI SHA, image revision, Fly release, `/health.release`, and `/ready.release` agree. Preserve the previous verified image/config for rollback. Never use production data for tests or print the private access code.

## Accessibility and performance boundary

The automated browser gate checks semantic structure, labels/names, duplicate IDs, state semantics, keyboard focus reachability, 24 CSS-pixel target minimums, 320px reflow, and axe WCAG 2 A/AA through 2.2 AA in desktop cited-answer and mobile locked states. This is automated conformance evidence, not WCAG certification or a screen-reader audit. Cross-browser and manual assistive-technology checks remain open.

The static UI has no framework runtime, and requests are bounded. Historical Lighthouse and Fly timing samples are documented as point measurements only. Field Core Web Vitals, sustained load, scroll-jank distributions, database capacity, cold-start percentiles, and an SLO are not established.

## Known limits

- Shared-code access is not user identity, tenancy, recovery, revocation, or row ownership.
- Budgets live in one process, reset on restart, and are not provider billing caps.
- Startup uses `create_all`; there is no schema-migration or restore drill yet.
- Scanned PDFs need OCR. Citations identify chunks, not page coordinates.
- Word-bounded chunks can still exceed BGE's effective tokenizer window and truncate token-dense text.
- Prompt isolation and visible evidence reduce risk; they do not prove answer correctness or citation entailment.
- No labeled retrieval benchmark, multilingual matrix, sustained concurrency/load test, independent security audit, field telemetry, or hosted error dashboard is claimed.

## Rules for the next coding agent

1. Preserve the active product boundary and distinguish historical Flask files from shipped code.
2. Keep access-before-body parsing, bounded inputs, short DB sessions, atomic writes, embedding-space isolation, provider-schema checks, request cancellation, and text-only rendering.
3. Use synthetic data and disposable pgvector. Never read, log, copy, or commit the private access-code file.
4. Do not convert automated axe/Lighthouse checks into a WCAG certification claim.
5. Measure retrieval quality or capacity before claiming accuracy, scale, or latency percentiles.
6. Update `MEMORY.md`, tests, usage docs, and exact release evidence when behavior or release state changes.
