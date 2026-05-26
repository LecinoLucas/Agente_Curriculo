"""Security regression tests for public candidate application endpoints."""

from fastapi import status
from httpx import AsyncClient

from src.core.settings import settings
from src.interface.api.rate_limiting import reset_rate_limit_storage


async def test_public_check_exists_does_not_enumerate_candidate_identifiers(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/public/candidates/check-exists",
        params={"email": "candidate@example.com", "cpf": "12345678909"},
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload == {
        "status": "ok",
        "message": "Os dados serão validados ao enviar a candidatura.",
    }
    assert "email_exists" not in payload
    assert "cpf_exists" not in payload
    assert "candidate@example.com" not in response.text
    assert "12345678909" not in response.text


async def test_public_check_exists_has_specific_rate_limit(client: AsyncClient, monkeypatch) -> None:
    await reset_rate_limit_storage()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)

    for _ in range(5):
        response = await client.get("/api/v1/public/candidates/check-exists")
        assert response.status_code == status.HTTP_200_OK

    response = await client.get("/api/v1/public/candidates/check-exists")
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.json()["detail"] == "Muitas validações enviadas. Aguarde 1 minuto e tente novamente."
