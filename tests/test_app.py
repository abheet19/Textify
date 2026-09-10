import asyncio

from fastapi.testclient import TestClient
from starlette.responses import Response


def test_upload_auth_and_raw_body_limit_run_before_multipart_parsing(monkeypatch):
    monkeypatch.setenv("TEXTIFY_ACCESS_CODE", "required")
    from app.main import MAX_UPLOAD_REQUEST_BYTES, app

    body = b"x" * (MAX_UPLOAD_REQUEST_BYTES + 1)
    with TestClient(app) as client:
        unauthorized = client.post("/api/documents", content=body, headers={"content-type": "multipart/form-data"})
        authorized_length = client.post(
            "/api/documents",
            content=body,
            headers={"content-type": "multipart/form-data", "x-textify-access-code": "required"},
        )
    assert unauthorized.status_code == 401
    assert authorized_length.status_code == 413
    assert unauthorized.headers["X-Content-Type-Options"] == "nosniff"
    assert authorized_length.headers["X-Content-Type-Options"] == "nosniff"


def test_chunked_upload_stops_receiving_at_the_raw_body_limit(monkeypatch):
    monkeypatch.setenv("TEXTIFY_ACCESS_CODE", "required")
    from app.main import UploadGateMiddleware

    receive_calls = 0
    messages = [
        {"type": "http.request", "body": b"a" * 60, "more_body": True},
        {"type": "http.request", "body": b"b" * 60, "more_body": True},
        {"type": "http.request", "body": b"c" * 60, "more_body": False},
    ]
    sent = []

    async def receive():
        nonlocal receive_calls
        message = messages[receive_calls]
        receive_calls += 1
        return message

    async def send(message):
        sent.append(message)

    async def consume_body(scope, inner_receive, inner_send):
        while True:
            message = await inner_receive()
            if not message.get("more_body"):
                break
        await Response(status_code=204)(scope, inner_receive, inner_send)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/documents",
        "raw_path": b"/api/documents",
        "query_string": b"",
        "headers": [(b"x-textify-access-code", b"required"), (b"transfer-encoding", b"chunked")],
        "client": ("127.0.0.1", 1234),
        "server": ("127.0.0.1", 80),
    }
    asyncio.run(UploadGateMiddleware(consume_body, max_body_bytes=100)(scope, receive, send))

    assert receive_calls == 2
    assert next(message for message in sent if message["type"] == "http.response.start")["status"] == 413


def test_health_reports_architecture_release_and_security_headers(monkeypatch):
    monkeypatch.setenv("TEXTIFY_SKIP_DB_INIT", "1")
    from app.main import app

    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["storage"] == "postgresql-pgvector"
    assert response.json()["release"]
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Content-Security-Policy"].startswith("default-src 'self'")
    assert "Access-Control-Allow-Origin" not in response.headers


def test_home_uses_external_assets_only(monkeypatch):
    monkeypatch.setenv("TEXTIFY_SKIP_DB_INIT", "1")
    from app.main import app

    with TestClient(app) as client:
        response = client.get("/")
    assert response.status_code == 200
    assert b'<script src="/static/app.js"></script>' in response.content
    assert b"TEXTIFY <span>2.2</span>" in response.content
    assert b"<script>" not in response.content


def test_release_identity_requires_an_exact_lowercase_git_sha():
    from app.main import valid_release_sha

    assert valid_release_sha("a" * 40)
    assert not valid_release_sha("unknown")
    assert not valid_release_sha("A" * 40)
    assert not valid_release_sha("a" * 39)


def test_public_readiness_fails_before_database_work_without_release_identity(monkeypatch):
    import app.main as main

    monkeypatch.setenv("TEXTIFY_REQUIRE_ACCESS_CODE", "1")
    monkeypatch.setattr(main, "RELEASE_SHA", "unknown")
    with TestClient(main.app) as client:
        response = client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "Release identity is not configured."}
