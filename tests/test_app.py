from fastapi.testclient import TestClient


def test_health_reports_the_retrieval_architecture(monkeypatch):
    monkeypatch.setenv("TEXTIFY_SKIP_DB_INIT", "1")
    from app.main import app

    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["storage"] == "postgresql-pgvector"
