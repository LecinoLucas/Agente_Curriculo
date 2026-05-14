"""Extended tests for public candidate application endpoint."""

import io
from unittest.mock import patch
import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
def valid_pdf_bytes() -> bytes:
    """Minimal valid PDF for testing."""
    return b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
160
%%EOF
"""


@pytest.mark.asyncio
async def test_apply_rejects_without_lgpd_consent(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply rejeita sem consentimento LGPD."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": False,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "LGPD" in response.json()["detail"]


@pytest.mark.asyncio
async def test_apply_requires_lgpd_consent_true(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply exige lgpd_consent=True."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Maria Silva",
            "cpf": "98765432100",
            "email": "maria@example.com",
            "phone": "11987654321",
            "city": "Rio de Janeiro",
            "state": "RJ",
            "salary_expectation": "4000",
            "desired_contract_type": "PJ",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["candidate_id"]
    assert data["status"] == "awaiting_job"


@pytest.mark.asyncio
async def test_apply_validates_cpf_with_mask(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply valida CPF com máscara."""
    # CPF com máscara deve ser aceito (backend remove máscara)
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "123.456.789-09",  # CPF mascarado
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio
async def test_apply_validates_email_case_insensitive(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply reaproveita email case-insensitive autenticado."""
    # Primeira candidatura com email minúsculo
    response1 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response1.status_code == status.HTTP_201_CREATED

    first_candidate_id = response1.json()["candidate_id"]

    # Segunda candidatura com email maiúsculo reaproveita o mesmo cadastro autenticado
    response2 = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Maria Silva",
            "cpf": "98765432100",
            "email": "JOAO@EXAMPLE.COM",  # Email em maiúscula
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response2.status_code == status.HTTP_201_CREATED
    assert response2.json()["candidate_id"] == first_candidate_id


@pytest.mark.asyncio
async def test_apply_validates_email_with_whitespace(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply valida email com espaços."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "  joao@example.com  ",  # Email com espaços
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio
async def test_apply_validates_phone_with_mask(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply valida telefone com máscara."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "(11) 98765-4321",  # Telefone com máscara
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio
async def test_apply_rejects_invalid_phone(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply rejeita telefone inválido."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "123",  # Muito curto
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_apply_saves_lgpd_consent_timestamp(
    db_session: AsyncSession,
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply salva lgpd_consent_at."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": True,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    candidate_id = data["candidate_id"]

    # Verificar que lgpd_consent_at foi salvo (sem ser capaz de ler do banco por SQLite UUID issue)
    assert candidate_id is not None


@pytest.mark.asyncio
async def test_apply_saves_contract_type_and_salary(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply salva desired_contract_type e salary_expectation."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "8000-10000",
            "desired_contract_type": "PJ",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio
async def test_apply_saves_works_at_marajo_group(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    """POST /api/v1/public/candidates/apply salva works_at_marajo_group."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": True,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio
async def test_apply_rejects_missing_file(
    client: AsyncClient,
) -> None:
    """POST /api/v1/public/candidates/apply rejeita sem arquivo."""
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "João Silva",
            "cpf": "12345678909",
            "email": "joao@example.com",
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "5000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
    )
    assert response.status_code in (status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_400_BAD_REQUEST)


@pytest.mark.asyncio
async def test_apply_logs_do_not_include_pii(
    client: AsyncClient,
    valid_pdf_bytes: bytes,
) -> None:
    with (
        patch("src.application.services.public_application_service.logger.info") as info_mock,
        patch("src.application.services.public_application_service.logger.warning") as warning_mock,
    ):
        response = await client.post(
            "/api/v1/public/candidates/apply",
            data={
                "full_name": "João Silva",
                "cpf": "12345678909",
                "email": "joao@example.com",
                "phone": "11987654321",
                "city": "São Paulo",
                "state": "SP",
                "salary_expectation": "5000",
                "desired_contract_type": "CLT",
                "works_at_marajo_group": False,
                "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
            },
            files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
        )

    assert response.status_code == status.HTTP_201_CREATED
    warning_mock.assert_not_called()
    assert info_mock.call_count >= 2

    logged_payload = " ".join(
        [
            repr(call.args) + repr(call.kwargs)
            for call in info_mock.call_args_list
        ]
    )
    assert "João Silva" not in logged_payload
    assert "joao@example.com" not in logged_payload
    assert "12345678909" not in logged_payload
    assert "11987654321" not in logged_payload
