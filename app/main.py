"""Textify: a citation-first study RAG workspace with paid-endpoint guardrails."""
from __future__ import annotations

import io
import math
import os
import uuid
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path

import requests
from docx import Document as DocxDocument
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pypdf import PdfReader
from sqlalchemy import ForeignKey, String, Text, create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, relationship, mapped_column, sessionmaker
from pgvector.sqlalchemy import Vector

from .guard import require_access_code, require_paid_access
from .rag import MAX_ANSWER_TOKENS, chunk_text, grounded_answer, source_fingerprint

MAX_UPLOAD_BYTES = 3 * 1024 * 1024
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
    chunks: Mapped[list["StudyChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


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
app = FastAPI(title="Textify", version="2.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["content-type", "x-textify-access-code"],
)
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "web"), name="static")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
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
            if any(len(vector) != 1536 or any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector) for vector in batch_vectors):
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
        "storage": "postgresql-pgvector",
        "retrieval": "semantic",
        "embedding_provider": EMBEDDING_PROVIDER,
        "embedding_dimensions": EMBEDDING_DIMENSIONS,
        "answer_token_cap": MAX_ANSWER_TOKENS,
        "public_paid_access": bool(os.getenv("TEXTIFY_ACCESS_CODE")),
    }


@app.get("/ready")
def ready():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        if EMBEDDING_PROVIDER == "local":
            from .local_embeddings import warm_model
            warm_model()
    except Exception as error:
        raise HTTPException(503, "Workspace dependencies are not ready.") from error
    return {"status": "ready"}


@app.get("/api/documents")
def list_documents(request: Request):
    require_access_code(request)
    with SessionLocal() as session:
        docs = session.query(StudyDocument).order_by(StudyDocument.name).all()
        return [{"id": doc.id, "name": doc.name, "chunks": len(doc.chunks)} for doc in docs]


@app.post("/api/documents", status_code=201)
def ingest_document(request: Request, file: UploadFile = File(...)):
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
        raise HTTPException(400, "This file could not be read. Upload a valid, unencrypted PDF, DOCX, or UTF-8 TXT file.") from error
    chunks = chunk_text(content)
    if not chunks:
        raise HTTPException(400, "No usable text was found in this document.")
    if len(chunks) > MAX_CHUNKS:
        raise HTTPException(400, f"Document creates more than {MAX_CHUNKS} chunks.")
    if any(len(chunk.text.encode("utf-8")) > MAX_CHUNK_BYTES for chunk in chunks):
        raise HTTPException(400, "A passage exceeds the safe indexing size. Use shorter words or smaller source sections.")
    fingerprint = source_fingerprint(content)
    with SessionLocal() as session:
        existing = session.query(StudyDocument).filter_by(fingerprint=fingerprint).first()
        if existing:
            return {"id": existing.id, "name": existing.name, "chunks": len(existing.chunks), "deduplicated": True}
        vectors = embed([chunk.text for chunk in chunks])
        doc = StudyDocument(id=str(uuid.uuid4()), name=Path((file.filename or "document").replace("\\", "/")).name[:255], fingerprint=fingerprint)
        session.add(doc)
        session.add_all(
            StudyChunk(id=str(uuid.uuid4()), document=doc, position=chunk.position, content=chunk.text, embedding=vector)
            for chunk, vector in zip(chunks, vectors)
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


@app.get("/")
def home():
    return FileResponse(Path(__file__).parent / "web" / "index.html")
