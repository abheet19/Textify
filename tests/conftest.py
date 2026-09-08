"""Synthetic fixtures. Real PostgreSQL tests use a unique disposable schema."""
import json
import os
import uuid
from types import SimpleNamespace

import pytest
import requests
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


@pytest.fixture(autouse=True)
def forbid_real_provider_calls(monkeypatch):
    monkeypatch.setenv("TEXTIFY_SKIP_DB_INIT", "1")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("FLY_APP_NAME", raising=False)
    monkeypatch.delenv("TEXTIFY_REQUIRE_ACCESS_CODE", raising=False)
    monkeypatch.delenv("TEXTIFY_ACCESS_CODE", raising=False)
    def blocked(*args, **kwargs):
        raise AssertionError("Tests must never call a paid provider")
    monkeypatch.setattr(requests.sessions.Session, "request", blocked)
    import app.guard as guard
    monkeypatch.setattr(guard, "budget", guard.RequestBudget())


def synthetic_vector(value):
    """A deterministic test vector, not a semantic embedding implementation."""
    first = 1.0 if "privacy" in value.lower() else 0.0
    return [first, 1.0 - first] + [0.0] * 1534


@pytest.fixture
def workspace(monkeypatch, request):
    url = os.getenv("TEXTIFY_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEXTIFY_TEST_DATABASE_URL for isolated PostgreSQL/pgvector integration")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    schema = "textify_verify_" + uuid.uuid4().hex
    admin = create_engine(url, connect_args={"connect_timeout": 5})
    with admin.begin() as connection:
        if not connection.execute(text("SELECT 1 FROM pg_extension WHERE extname='vector'")).scalar():
            pytest.skip("Integration requires existing pgvector; tests do not install extensions")
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    db = create_engine(url, connect_args={"options": f"-csearch_path={schema},public", "connect_timeout": 5})
    def cleanup():
        db.dispose()
        assert schema.startswith("textify_verify_") and len(schema) == 47
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
    request.addfinalizer(cleanup)
    from app import main
    main.Base.metadata.create_all(db, checkfirst=False)
    monkeypatch.setattr(main, "SessionLocal", sessionmaker(db, expire_on_commit=False))
    monkeypatch.setenv("TEXTIFY_ACCESS_CODE", "synthetic-test-code")
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-not-a-real-key")
    calls = []
    def provider(url, **kwargs):
        calls.append((url, kwargs["json"]))
        if url.endswith("/embeddings"):
            vectors = [{"index": index, "embedding": synthetic_vector(value)} for index, value in enumerate(kwargs["json"]["input"])]
            payload = {"data": list(reversed(vectors))}
        else:
            payload = {"choices": [{"message": {"content": "Privacy keeps the private key with the learner. [S1]"}}]}
        response = requests.Response()
        response.status_code = 200
        response._content = json.dumps(payload).encode()
        return response
    monkeypatch.setattr(main.requests, "post", provider)
    with TestClient(main.app) as client:
        yield SimpleNamespace(client=client, db=db, calls=calls, headers={"X-Textify-Access-Code": "synthetic-test-code"}, main=main)
