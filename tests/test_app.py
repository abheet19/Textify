from fastapi.testclient import TestClient


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
