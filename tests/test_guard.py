from fastapi.testclient import TestClient


def test_paid_routes_require_a_configured_access_code(monkeypatch):
    monkeypatch.setenv("TEXTIFY_ACCESS_CODE", "test-code")
    monkeypatch.setenv("TEXTIFY_SKIP_DB_INIT", "1")
    from app.main import app

    with TestClient(app) as client:
        no_code = client.post("/api/ask", json={"question": "Explain the document?", "document_id": "00000000-0000-0000-0000-000000000000"})
        wrong_code = client.post(
            "/api/ask",
            headers={"x-textify-access-code": "wrong"},
            json={"question": "Explain the document?", "document_id": "00000000-0000-0000-0000-000000000000"},
        )
    assert no_code.status_code == 401
    assert wrong_code.status_code == 401


def test_question_length_is_limited_before_provider_work(monkeypatch):
    monkeypatch.delenv("TEXTIFY_ACCESS_CODE", raising=False)
    monkeypatch.setenv("TEXTIFY_SKIP_DB_INIT", "1")
    from app.main import app

    with TestClient(app) as client:
        response = client.post("/api/ask", json={"question": "x" * 501, "document_id": "00000000-0000-0000-0000-000000000000"})
    assert response.status_code == 422



def test_request_budget_refuses_the_next_paid_operation():
    import pytest
    from fastapi import HTTPException
    from app.guard import Budget, RequestBudget

    request_budget = RequestBudget()
    request_budget.consume("learner", "ask", Budget(limit=2, window_seconds=3600))
    request_budget.consume("learner", "ask", Budget(limit=2, window_seconds=3600))

    with pytest.raises(HTTPException) as error:
        request_budget.consume("learner", "ask", Budget(limit=2, window_seconds=3600))

    assert error.value.status_code == 429
    assert error.value.headers["Retry-After"]
