# Textify context

This is the compact source of truth for engineers and coding agents. Read it with `README.md` and `docs/TESTING.md` before changing the product.

## Product boundary

Textify is a private, single-user, citation-first RAG workspace for PDF, DOCX, and TXT study material. A user unlocks the workspace with one access code, uploads a source, asks a question, sees a concise answer and the four retrieved passages, and can delete the source. It is not a multi-tenant document SaaS and it does not claim automatic factual correctness.

The preferred production path uses the pinned `BAAI/bge-small-en-v1.5` ONNX model locally. Embedding calls therefore have no hosted API cost. Claude generation is optional; without a generation key, Textify returns retrieved evidence instead of fabricating an answer. The OpenAI embedding space remains an explicit alternative and uses separate tables so incompatible vectors never mix.

## Runtime flow

1. `app/web/app.js` sends the browser-session access code in `X-Textify-Access-Code`.
2. `app/guard.py` fails closed when production lacks a configured code and applies process-local upload/question budgets.
3. `app/main.py` bounds the compressed upload, expanded DOCX, PDF pages, extracted text, chunks, passage bytes, and question length before provider or database work.
4. `app/rag.py` creates overlapping sentence-aware chunks and isolates retrieved text as untrusted prompt data.
5. `app/local_embeddings.py` serializes CPU inference and loads only the model baked into the image at its immutable revision.
6. PostgreSQL with pgvector stores source metadata, chunks, and vectors. Local BGE and OpenAI vectors use distinct table pairs.
7. The ask route retrieves four chunks by cosine distance. Claude or OpenAI may synthesize a cited answer; otherwise the route returns evidence-only mode.

## Release invariants

- `requirements.txt` and `requirements-local.txt` must pass `pip-audit` and `pip check`.
- Both images run as UID/GID 10001 and keep application code read-only.
- Every image carries `org.opencontainers.image.revision`; `/health` and `/ready` report the same `TEXTIFY_RELEASE_SHA`.
- The local image build performs real BGE inference and a small semantic-ordering check.
- CI uses disposable pgvector, synthetic provider responses, a real browser, and a real local-model container upload/ask/delete flow.
- Production deploy is manual after CI and defaults to `fly.local-embeddings.toml`.

## Known limits

The access code represents one shared workspace. Budgets are per process and reset on restart. Scanned PDFs need OCR. Citations identify chunks rather than page coordinates. BGE inputs can truncate token-dense passages. Prompt isolation reduces injection risk but is not a proof of answer accuracy. There is no broad retrieval benchmark, distributed rate limiter, multi-user load test, or independent security audit.
