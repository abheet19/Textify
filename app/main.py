"""Textify: a citation-first study RAG workspace with paid-endpoint guardrails."""

from __future__ import annotations

import io
import logging
import math
import os
import re
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import requests
from docx import Document as DocxDocument
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pgvector.sqlalchemy import Vector
from pydantic import BaseModel, Field
from pypdf import PdfReader
from sqlalchemy import ForeignKey, String, Text, create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .guard import require_access_code, require_paid_access, validate_access_code
from .rag import MAX_ANSWER_TOKENS, chunk_text, grounded_answer, legacy_source_fingerprint, source_fingerprint

logger = logging.getLogger("uvicorn.error")
RELEASE_SHA = os.getenv("TEXTIFY_RELEASE_SHA", "unknown")

MAX_UPLOAD_BYTES = 3 * 1024 * 1024
# Bound multipart framing as well as the file. The route still enforces the
# exact file limit after parsing.
MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024
MAX_EXTRACTED_CHARS = 120_000
MAX_PDF_PAGES = 200
MAX_DOCX_UNCOMPRESSED_BYTES = 12 * 1024 * 1024
MAX_CHUNKS = 120
MAX_CHUNK_BYTES = 4096
EMBED_BATCH_SIZE = 32
# Changing embedding spaces is an explicit deployment choice. Never mix vectors.
EMBEDDING_PROVIDER = os.getenv("TEXTIFY_EMBEDDING_PROVIDER", "openai")
if EMBEDDING_PROVIDER not in {"openai", "local"}:
    raise RuntimeError("TEXTIFY_EMBEDDING_PROVIDER must be openai or local")
EMBEDDING_DIMENSIONS = 384 if EMBEDDING_PROVIDER == "local" else 1536
DOCUMENT_TABLE = "bge_v1_documents" if EMBEDDING_PROVIDER == "local" else "study_documents"
CHUNK_TABLE = "bge_v1_chunks" if EMBEDDING_PROVIDER == "local" else "study_chunks"

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://textify:textify@localhost:5432/textify")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class StudyDocument(Base):
    __tablename__ = DOCUMENT_TABLE
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    chunks: Mapped[list[StudyChunk]] = relationship(back_populates="document", cascade="all, delete-orphan")


class StudyChunk(Base):
    __tablename__ = CHUNK_TABLE
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey(f"{DOCUMENT_TABLE}.id"), index=True)
    position: Mapped[int]
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    document: Mapped[StudyDocument] = relationship(back_populates="chunks")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Route tests must not need a live PostgreSQL instance. This is intentionally
    # opt-in so normal local and Fly startup always initializes the schema.
    if os.getenv("TEXTIFY_SKIP_DB_INIT") != "1":
        with engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        Base.metadata.create_all(engine)
        if EMBEDDING_PROVIDER == "local":
            from .local_embeddings import warm_model

            warm_model()
    yield


allowed_origins = [value.strip() for value in os.getenv("CORS_ORIGINS", "").split(",") if value.strip()]
app = FastAPI(title="Textify", version="2.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["content-type", "x-textify-access-code"],
)
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "web"), name="static")


class UploadGateMiddleware:
    """Authenticate and cap upload bodies before multipart parsing can spool them."""

    def __init__(self, application, max_body_bytes: int) -> None:
        self.application = application
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] != "/api/documents":
            await self.application(scope, receive, send)
            return

        headers = {name.lower(): value for name, value in scope.get("headers", [])}
        try:
            validate_access_code(headers.get(b"x-textify-access-code", b"").decode("utf-8", errors="ignore"))
        except HTTPException as error:
            await JSONResponse({"detail": error.detail}, status_code=error.status_code, headers=error.headers)(
                scope, receive, send
            )
            return

        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > self.max_body_bytes:
                    await JSONResponse(
                        {"detail": "Upload request exceeds the safe processing limit."}, status_code=413
                    )(scope, receive, send)
                    return
            except ValueError:
                await JSONResponse({"detail": "Invalid Content-Length header."}, status_code=400)(scope, receive, send)
                return

        consumed = 0
        exceeded = False

        async def limited_receive():
            nonlocal consumed, exceeded
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > self.max_body_bytes:
                    exceeded = True
                    raise UploadBodyTooLarge
            return message

        async def limited_send(message):
            if not exceeded:
                await send(message)

        try:
            await self.application(scope, limited_receive, limited_send)
        except UploadBodyTooLarge:
            pass
        if exceeded:
            logger.warning("upload_body_limit_exceeded path=/api/documents")
            await JSONResponse({"detail": "Upload request exceeds the safe processing limit."}, status_code=413)(
                scope, receive, send
            )


class UploadBodyTooLarge(Exception):
    """Internal signal used before request parsing creates an UploadFile."""


app.add_middleware(UploadGateMiddleware, max_body_bytes=MAX_UPLOAD_REQUEST_BYTES)


@app.middleware("http")
async def observe_and_secure(request: Request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        route = getattr(request.scope.get("route"), "path", "<unmatched>")
        logger.exception("request_failed method=%s route=%s", request.method, route)
        raise
    route = getattr(request.scope.get("route"), "path", "<unmatched>")
    logger.info(
        "request_complete method=%s route=%s status=%d duration_ms=%.1f",
        request.method,
        route,
        response.status_code,
        (time.perf_counter() - started) * 1000,
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; "
        "form-action 'self'; img-src 'self' data:; object-src 'none'"
    )
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


def extract(upload: UploadFile, data: bytes) -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in {".txt", ".pdf", ".docx"}:
        raise HTTPException(415, "Textify supports PDF, DOCX, and TXT.")
    if suffix == ".txt":
        result = data.decode("utf-8", errors="replace")
    elif suffix == ".pdf":
        reader = PdfReader(io.BytesIO(data))
        if len(reader.pages) > MAX_PDF_PAGES:
            raise HTTPException(400, f"PDFs are limited to {MAX_PDF_PAGES} pages.")
        result = "\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(entry.file_size for entry in archive.infolist()) > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise HTTPException(400, "DOCX expands beyond the safe processing limit.")
        document = DocxDocument(io.BytesIO(data))
        result = "\n".join(paragraph.text for paragraph in document.paragraphs)
    if len(result) > MAX_EXTRACTED_CHARS:
        raise HTTPException(400, f"Extracted text exceeds the {MAX_EXTRACTED_CHARS:,}-character limit.")
    return result


def embed(texts: list[str], *, query: bool = False) -> list[list[float]]:
    if EMBEDDING_PROVIDER == "local":
        from .local_embeddings import local_embed

        return local_embed(texts, query=query)
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, "Semantic indexing is not configured. No document data was stored.")
    vectors: list[list[float]] = []
    for offset in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[offset : offset + EMBED_BATCH_SIZE]
        try:
            response = requests.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": "text-embedding-3-small", "dimensions": 1536, "input": batch},
                timeout=20,
            )
            response.raise_for_status()
            data = response.json()["data"]
            # Preserve the input/vector association and reject partial batches.
            ordered = sorted(data, key=lambda item: item["index"])
            if [item["index"] for item in ordered] != list(range(len(batch))):
                raise ValueError("Embedding indices do not match the input batch.")
            batch_vectors = [item["embedding"] for item in ordered]
            if any(
                len(vector) != 1536
                or any(
                    isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
                    for value in vector
                )
                for vector in batch_vectors
            ):
                raise ValueError("Invalid embedding shape or values.")
        except requests.Timeout as error:
            raise HTTPException(504, "The embedding provider timed out. Try again later.") from error
        except requests.RequestException as error:
            raise HTTPException(502, "The embedding provider is unavailable or rejected this request.") from error
        except (ValueError, KeyError, TypeError) as error:
            raise HTTPException(502, "The embedding provider returned an invalid response.") from error
        vectors.extend(batch_vectors)
    return vectors


class AskRequest(BaseModel):
    question: str = Field(min_length=6, max_length=500)
    document_id: str = Field(min_length=36, max_length=36)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "textify",
        "release": RELEASE_SHA,
        "storage": "postgresql-pgvector",
        "retrieval": "semantic",
        "embedding_provider": EMBEDDING_PROVIDER,
        "embedding_dimensions": EMBEDDING_DIMENSIONS,
        "answer_token_cap": MAX_ANSWER_TOKENS,
        "public_paid_access": bool(os.getenv("TEXTIFY_ACCESS_CODE")),
    }


def valid_release_sha(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-f]{40}", value))


@app.get("/ready")
def ready():
    public_runtime = os.getenv("TEXTIFY_REQUIRE_ACCESS_CODE", "").lower() in {"1", "true"} or bool(
        os.getenv("FLY_APP_NAME")
    )
    if public_runtime and not valid_release_sha(RELEASE_SHA):
        raise HTTPException(503, "Release identity is not configured.")
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        if EMBEDDING_PROVIDER == "local":
            from .local_embeddings import warm_model

            warm_model()
    except Exception as error:
        raise HTTPException(503, "Workspace dependencies are not ready.") from error
    return {"status": "ready", "release": RELEASE_SHA}


@app.get("/api/documents")
def list_documents(request: Request):
    require_access_code(request)
    with SessionLocal() as session:
        docs = session.query(StudyDocument).order_by(StudyDocument.name).all()
        return [{"id": doc.id, "name": doc.name, "chunks": len(doc.chunks)} for doc in docs]


@app.post("/api/documents", status_code=201)
def ingest_document(request: Request, file: Annotated[UploadFile, File()]):
    require_paid_access(request, "upload")
    # Synchronous parser/DB/provider work belongs in FastAPI's thread pool.
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "Upload a non-empty file up to 3 MB.")
    try:
        content = extract(file, data)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            400, "This file could not be read. Upload a valid, unencrypted PDF, DOCX, or UTF-8 TXT file."
        ) from error
    chunks = chunk_text(content)
    if not chunks:
        raise HTTPException(400, "No usable text was found in this document.")
    if len(chunks) > MAX_CHUNKS:
        raise HTTPException(400, f"Document creates more than {MAX_CHUNKS} chunks.")
    if any(len(chunk.text.encode("utf-8")) > MAX_CHUNK_BYTES for chunk in chunks):
        raise HTTPException(
            400, "A passage exceeds the safe indexing size. Use shorter words or smaller source sections."
        )
    fingerprint = source_fingerprint(content)
    compatible_fingerprints = (fingerprint, legacy_source_fingerprint(content))
    with SessionLocal() as session:
        existing = session.query(StudyDocument).filter(StudyDocument.fingerprint.in_(compatible_fingerprints)).first()
        if existing:
            return {"id": existing.id, "name": existing.name, "chunks": len(existing.chunks), "deduplicated": True}

    # Provider inference can take seconds. Never hold a pooled database
    # connection while waiting for it.
    vectors = embed([chunk.text for chunk in chunks])
    raw_name = Path((file.filename or "document").replace("\\", "/")).name
    safe_name = "".join(character for character in raw_name if character.isprintable()).strip()[:255] or "document"
    with SessionLocal() as session:
        doc = StudyDocument(id=str(uuid.uuid4()), name=safe_name, fingerprint=fingerprint)
        session.add(doc)
        session.add_all(
            StudyChunk(
                id=str(uuid.uuid4()), document=doc, position=chunk.position, content=chunk.text, embedding=vector
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        )
        try:
            session.commit()
        except IntegrityError:
            # A concurrent duplicate may pass the initial lookup; the unique
            # fingerprint remains authoritative even across processes.
            session.rollback()
            existing = session.query(StudyDocument).filter_by(fingerprint=fingerprint).first()
            if existing is None:
                raise
            return {"id": existing.id, "name": existing.name, "chunks": len(existing.chunks), "deduplicated": True}
        return {"id": doc.id, "name": doc.name, "chunks": len(chunks), "deduplicated": False}


@app.post("/api/ask")
def ask_question(request: Request, payload: AskRequest):
    require_access_code(request)
    with SessionLocal() as session:
        if session.get(StudyDocument, payload.document_id) is None:
            raise HTTPException(404, "Document not found.")

    require_paid_access(request, "ask")
    query = embed([payload.question], query=True)[0]
    with SessionLocal() as session:
        rows = (
            session.query(StudyChunk)
            .filter_by(document_id=payload.document_id)
            .order_by(StudyChunk.embedding.cosine_distance(query))
            .limit(4)
            .all()
        )
    if not rows:
        raise HTTPException(404, "Document not found.")
    citations = [{"source": f"S{i + 1}", "chunk": row.position + 1, "text": row.content} for i, row in enumerate(rows)]
    try:
        answer, mode = grounded_answer(payload.question, [row.content for row in rows])
    except requests.Timeout as error:
        raise HTTPException(504, "The answer provider timed out. Try again later.") from error
    except requests.RequestException as error:
        raise HTTPException(502, "The answer provider is unavailable or rejected this request.") from error
    except (ValueError, KeyError, TypeError, IndexError, RuntimeError) as error:
        raise HTTPException(502, "The answer provider returned an invalid response.") from error
    return {"answer": answer, "generation_mode": mode, "citations": citations}


@app.delete("/api/documents/{document_id}", status_code=204)
def delete_document(document_id: str, request: Request):
    require_access_code(request)
    with SessionLocal() as session:
        document = session.get(StudyDocument, document_id)
        if document is None:
            raise HTTPException(404, "Document not found.")
        session.delete(document)
        session.commit()
    return Response(status_code=204)


@app.get("/")
def home():
    return FileResponse(Path(__file__).parent / "web" / "index.html")
