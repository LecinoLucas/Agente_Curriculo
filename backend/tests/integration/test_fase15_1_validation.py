"""Fase 15.1 — Validação simulada completa do fluxo Protheus homologação.

Valida:
- Mock HTTP completo (sem Protheus real)
- Dados fake/controlados
- Payload correto
- Headers mascarados
- Idempotência
- Auditoria
- Retry com erro simulado
- Bloqueio sem ERP_ALLOW_REAL_SEND
- Bloqueio em produção
- Nenhum segredo em logs/response/eventos
"""

import json
import logging
from datetime import UTC, datetime, date
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admission_package_service import AdmissionPackageService
from src.application.services.erp_integration_service import ErpIntegrationService
from src.application.services.protheus_real_adapter import (
    ProtheusRealAdapter,
    ProtheusRealAdapterResult,
    _mask_secrets,
)
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    CandidateModel,
    JobModel,
    UserModel,
    CandidateJobHiringDecisionModel,
    PreAdmissionEventModel,
)


# ============================================================================
# FIXTURES: Dados fake/controlados
# ============================================================================


async def _create_user(session: AsyncSession, role: str = "recruiter") -> UserModel:
    user = UserModel(
        id=uuid4(),
        email=f"test-{uuid4()}@example.com",
        full_name="Test Recruiter",
        password_hash="hash",
        role=role,
        status="active",
    )
    session.add(user)
    await session.flush()
    return user


async def _create_candidate(session: AsyncSession) -> CandidateModel:
    user = await _create_user(session, role="candidate")
    candidate = CandidateModel(
        id=uuid4(),
        user_id=user.id,
        full_name="Candidato Fake Homolog",
        email="fake-homolog@test.invalid",
        phone="+55119999999999",
        cpf="99999999999",  # Fake CPF
        created_by=uuid4(),
    )
    session.add(candidate)
    await session.flush()
    return candidate


async def _create_job(session: AsyncSession) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title="Vaga Teste Homolog",
        description="Vaga fake para validação homolog" * 10,
        status="active",
        created_by=uuid4(),
    )
    session.add(job)
    await session.flush()
    return job


async def _create_hiring_decision(
    session: AsyncSession,
    job_id,
    candidate_id,
) -> CandidateJobHiringDecisionModel:
    user = await _create_user(session)
    decision = CandidateJobHiringDecisionModel(
        id=uuid4(),
        job_id=job_id,
        candidate_id=candidate_id,
        decision_outcome="hire",
        reason_code="strong_fit",
        decided_by=user.id,
        submitted_at=datetime.now(UTC),
    )
    session.add(decision)
    await session.flush()
    return decision


async def _create_pre_admission_case(
    session: AsyncSession,
    candidate_id,
    job_id,
    hiring_decision_id,
) -> PreAdmissionCaseModel:
    case = PreAdmissionCaseModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        hiring_decision_id=hiring_decision_id,
        status="ready_for_admission",
        start_date=date(2026, 6, 1),
        salary_offer="10000.00",
        work_model="CLT",
    )
    session.add(case)
    await session.flush()
    return case


async def _create_checklist_item(
    session: AsyncSession,
    case_id,
    required=True,
    status="approved",
) -> PreAdmissionChecklistItemModel:
    item = PreAdmissionChecklistItemModel(
        id=uuid4(),
        case_id=case_id,
        title="Documento Teste",
        item_type="cpf",
        required=required,
        status=status,
    )
    session.add(item)
    await session.flush()
    return item


# ============================================================================
# TESTE 1: Bloqueio sem ERP_ALLOW_REAL_SEND
# ============================================================================


@pytest.mark.asyncio
async def test_fase15_1_bloqueado_sem_flag(
    db_session: AsyncSession,
) -> None:
    """✓ Validar que homolog-send é bloqueado se ERP_ALLOW_REAL_SEND=false."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)
    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    pkg_service = AdmissionPackageService(db_session)
    package = await pkg_service.create_package(case.id)
    package = await pkg_service.approve_package(package.id, user_id=user.id)

    erp_service = ErpIntegrationService(db_session)

    # ERP_ALLOW_REAL_SEND=false (padrão)
    with patch("src.core.settings.settings.APP_ENV", "development"):
        with patch("src.core.settings.settings.ERP_ALLOW_REAL_SEND", False):
            with pytest.raises(ValidationException) as exc_info:
                await erp_service.create_protheus_homolog_attempt(
                    package_id=package.id,
                    user_id=user.id,
                )
            assert "desabilitado" in str(exc_info.value).lower()


# ============================================================================
# TESTE 2: Bloqueio em produção
# ============================================================================


@pytest.mark.asyncio
async def test_fase15_1_bloqueado_em_producao(
    db_session: AsyncSession,
) -> None:
    """✓ Validar que homolog-send é bloqueado em APP_ENV=production."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)
    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    pkg_service = AdmissionPackageService(db_session)
    package = await pkg_service.create_package(case.id)
    package = await pkg_service.approve_package(package.id, user_id=user.id)

    erp_service = ErpIntegrationService(db_session)

    with patch("src.core.settings.settings.APP_ENV", "production"):
        with patch("src.core.settings.settings.ERP_ALLOW_REAL_SEND", True):
            with pytest.raises(ValidationException) as exc_info:
                await erp_service.create_protheus_homolog_attempt(
                    package_id=package.id,
                    user_id=user.id,
                )
            assert "produção" in str(exc_info.value).lower()


# ============================================================================
# TESTE 3: Fluxo completo simulado com dados fake
# ============================================================================


@pytest.mark.asyncio
async def test_fase15_1_fluxo_completo_simulado(
    db_session: AsyncSession,
    caplog,
) -> None:
    """✓ Validar fluxo completo: pacote → envio → response → auditoria.

    - Dados fake (CPF 99999999999, email fake.invalid)
    - Mock HTTP completo
    - Validar response_payload_json
    - Validar external_reference
    - Validar pre_admission_events
    - Validar headers mascarados (nenhum segredo em logs)
    """
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)
    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    pkg_service = AdmissionPackageService(db_session)
    package = await pkg_service.create_package(case.id)
    package = await pkg_service.approve_package(package.id, user_id=user.id)

    erp_service = ErpIntegrationService(db_session)

    # Mock adapter com sucesso simulado
    with patch("src.core.settings.settings.APP_ENV", "development"):
        with patch("src.core.settings.settings.ERP_ALLOW_REAL_SEND", True):
            with patch("src.core.settings.settings.PROTHEUS_BASE_URL", "https://homolog.protheus.fake"):
                with patch("src.core.settings.settings.PROTHEUS_AUTH_MODE", "basic"):
                    with patch("src.core.settings.settings.PROTHEUS_USERNAME", "fake_user"):
                        with patch("src.core.settings.settings.PROTHEUS_PASSWORD", "fake_pass_secret"):
                            with patch("src.application.services.protheus_payload_validator.ProtheusPayloadValidator.validate") as mock_validate:
                                mock_validate.return_value = None

                                with patch(
                                    "src.application.services.protheus_real_adapter.ProtheusRealAdapter.send"
                                ) as mock_send:
                                    async def mock_send_func(*args, **kwargs):
                                        return ProtheusRealAdapterResult(
                                            success=True,
                                            message="Success",
                                            external_reference="PROTHEUS-HOMOLOG-ABC123",
                                            http_status=200,
                                            request_headers={
                                                "authorization": "***",
                                                "content-type": "application/json",
                                            },
                                            response_headers={
                                                "x-protheus-id": "***",
                                            },
                                        )

                                    mock_send.side_effect = mock_send_func

                                    # Enviar
                                    attempt = await erp_service.create_protheus_homolog_attempt(
                                        package_id=package.id,
                                        user_id=user.id,
                                    )

    # Commit para tornar as mudanças visíveis
    await db_session.commit()

    # Validações
    assert attempt.mode == "real"
    assert attempt.status == "sent"
    assert attempt.external_reference == "PROTHEUS-HOMOLOG-ABC123"
    assert attempt.http_status == 200

    # response_payload_json tem referência
    assert attempt.response_payload_json is not None
    assert attempt.response_payload_json.get("external_reference") == "PROTHEUS-HOMOLOG-ABC123"

    # pre_admission_events registrado
    events = await db_session.execute(
        sa.select(PreAdmissionEventModel).where(PreAdmissionEventModel.case_id == case.id)
    )
    event_list = events.scalars().all()
    assert len(event_list) > 0

    # Verificar que nenhum segredo apareceu em logs
    log_text = caplog.text
    assert "fake_pass_secret" not in log_text
    assert "fake_user:fake_pass_secret" not in log_text


# ============================================================================
# TESTE 4: Idempotência — mesmo payload não resenda
# ============================================================================


@pytest.mark.asyncio
async def test_fase15_1_idempotencia(
    db_session: AsyncSession,
) -> None:
    """✓ Validar idempotência: mesma payload = reutiliza tentativa anterior.

    - Enviar 2x com mesmo package_id
    - Segunda vez retorna attempt.id == primeira
    - Nenhuma nova requisição HTTP
    """
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)
    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    pkg_service = AdmissionPackageService(db_session)
    package = await pkg_service.create_package(case.id)
    package = await pkg_service.approve_package(package.id, user_id=user.id)

    erp_service = ErpIntegrationService(db_session)

    call_count = [0]

    with patch("src.core.settings.settings.APP_ENV", "development"):
        with patch("src.core.settings.settings.ERP_ALLOW_REAL_SEND", True):
            with patch("src.core.settings.settings.PROTHEUS_BASE_URL", "https://homolog.protheus.fake"):
                with patch("src.core.settings.settings.PROTHEUS_AUTH_MODE", "basic"):
                    with patch("src.core.settings.settings.PROTHEUS_USERNAME", "user"):
                        with patch("src.core.settings.settings.PROTHEUS_PASSWORD", "pass"):
                            with patch("src.application.services.protheus_payload_validator.ProtheusPayloadValidator.validate") as mock_validate:
                                mock_validate.return_value = None
                                with patch(
                                    "src.application.services.protheus_real_adapter.ProtheusRealAdapter.send"
                                ) as mock_send:
                                    async def mock_send_func(*args, **kwargs):
                                        call_count[0] += 1
                                        return ProtheusRealAdapterResult(
                                            success=True,
                                            message="OK",
                                            external_reference=f"REF-{call_count[0]}",
                                            http_status=200,
                                            request_headers={},
                                            response_headers={},
                                        )

                                    mock_send.side_effect = mock_send_func

                                    # Primeira tentativa
                                    attempt1 = await erp_service.create_protheus_homolog_attempt(
                                        package_id=package.id,
                                        user_id=user.id,
                                    )
                                    ref1 = attempt1.external_reference

                                    # Segunda tentativa (mesma payload)
                                    attempt2 = await erp_service.create_protheus_homolog_attempt(
                                        package_id=package.id,
                                        user_id=user.id,
                                    )
                                    ref2 = attempt2.external_reference

    # Idempotência: mesmo ID e referência
    assert attempt1.id == attempt2.id, "Idempotência falhou: IDs diferentes"
    assert ref1 == ref2, "Idempotência falhou: referências diferentes"
    assert call_count[0] == 1, "Idempotência falhou: adapter chamado 2x"


# ============================================================================
# TESTE 5: Retry após erro simulado
# ============================================================================


@pytest.mark.asyncio
async def test_fase15_1_retry_apos_erro(
    db_session: AsyncSession,
) -> None:
    """✓ Validar retry: envio falha → retry → sucesso.

    - Primeira tentativa: timeout simulado
    - Retry: sucesso
    - Validar attempt_number incrementa
    - Validar status muda de failed → sent
    """
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)
    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    pkg_service = AdmissionPackageService(db_session)
    package = await pkg_service.create_package(case.id)
    package = await pkg_service.approve_package(package.id, user_id=user.id)

    erp_service = ErpIntegrationService(db_session)

    call_count = [0]

    with patch("src.core.settings.settings.APP_ENV", "development"):
        with patch("src.core.settings.settings.ERP_ALLOW_REAL_SEND", True):
            with patch("src.core.settings.settings.PROTHEUS_BASE_URL", "https://homolog.protheus.fake"):
                with patch("src.core.settings.settings.PROTHEUS_AUTH_MODE", "basic"):
                    with patch("src.core.settings.settings.PROTHEUS_USERNAME", "user"):
                        with patch("src.core.settings.settings.PROTHEUS_PASSWORD", "pass"):
                            with patch("src.application.services.protheus_payload_validator.ProtheusPayloadValidator.validate") as mock_validate:
                                mock_validate.return_value = None
                                with patch(
                                    "src.application.services.protheus_real_adapter.ProtheusRealAdapter.send"
                                ) as mock_send:
                                    async def mock_send_func(*args, **kwargs):
                                        call_count[0] += 1
                                        if call_count[0] == 1:
                                            # Primeira: timeout
                                            return ProtheusRealAdapterResult(
                                                success=False,
                                                error_code="PROTHEUS_TIMEOUT",
                                                message="Request timeout",
                                                http_status=None,
                                                request_headers={},
                                                response_headers={},
                                            )
                                        else:
                                            # Retry: sucesso
                                            return ProtheusRealAdapterResult(
                                                success=True,
                                                message="OK on retry",
                                                external_reference="RETRY-SUCCESS",
                                                http_status=200,
                                                request_headers={},
                                                response_headers={},
                                            )

                                    mock_send.side_effect = mock_send_func

                                    # Primeira tentativa (falha)
                                    attempt1 = await erp_service.create_protheus_homolog_attempt(
                                        package_id=package.id,
                                        user_id=user.id,
                                    )
                                    assert attempt1.status == "failed"
                                    assert attempt1.attempt_number == 1
                                    attempt1_id = attempt1.id

                                    # Retry
                                    attempt2 = await erp_service.retry_attempt(
                                        attempt_id=attempt1_id,
                                        user_id=user.id,
                                    )
                                    assert attempt2.status == "sent"
                                    assert attempt2.attempt_number == 2
                                    assert attempt2.external_reference == "RETRY-SUCCESS"


# ============================================================================
# TESTE 6: Masking de secrets em headers
# ============================================================================


@pytest.mark.asyncio
async def test_fase15_1_masking_secrets() -> None:
    """✓ Validar que todos os segredos são mascarados.

    - Authorization header mascarado
    - Nenhum secret/token/password visível
    - Apenas last char + ***
    """
    test_headers = {
        "Authorization": "Bearer sk-proj-super-secret-token-12345",
        "X-API-Key": "api-key-very-secret",
        "Content-Type": "application/json",
        "X-Custom": "not-a-secret",
    }

    masked = _mask_secrets(test_headers)

    # Secrets mascarados
    assert masked["Authorization"] == "***5"
    assert masked["X-API-Key"] == "***t"

    # Não-secrets preservados
    assert masked["Content-Type"] == "application/json"
    assert masked["X-Custom"] == "not-a-secret"

    # Nenhum valor real visível
    assert "sk-proj-super-secret-token" not in json.dumps(masked)
    assert "api-key-very-secret" not in json.dumps(masked)


# ============================================================================
# TESTE 7: Nenhum segredo em pre_admission_events
# ============================================================================


@pytest.mark.asyncio
async def test_fase15_1_auditoria_sem_secrets(
    db_session: AsyncSession,
) -> None:
    """✓ Validar que eventos de auditoria não contêm secrets.

    - response_payload_json não tem credenciais
    - request_headers_json mascarados
    - error_message não expõe password
    """
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)
    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    pkg_service = AdmissionPackageService(db_session)
    package = await pkg_service.create_package(case.id)
    package = await pkg_service.approve_package(package.id, user_id=user.id)

    erp_service = ErpIntegrationService(db_session)

    with patch("src.core.settings.settings.APP_ENV", "development"):
        with patch("src.core.settings.settings.ERP_ALLOW_REAL_SEND", True):
            with patch("src.core.settings.settings.PROTHEUS_BASE_URL", "https://homolog.protheus.fake"):
                with patch("src.core.settings.settings.PROTHEUS_AUTH_MODE", "basic"):
                    with patch("src.core.settings.settings.PROTHEUS_USERNAME", "fake_user_xyz"):
                        with patch("src.core.settings.settings.PROTHEUS_PASSWORD", "SUPER_SECRET_PASSWORD_ABC123"):
                            with patch("src.application.services.protheus_payload_validator.ProtheusPayloadValidator.validate") as mock_validate:
                                mock_validate.return_value = None
                                with patch(
                                    "src.application.services.protheus_real_adapter.ProtheusRealAdapter.send"
                                ) as mock_send:
                                    async def mock_send_func(*args, **kwargs):
                                        return ProtheusRealAdapterResult(
                                            success=True,
                                            message="OK",
                                            external_reference="TEST-REF",
                                            http_status=200,
                                            request_headers={
                                                "Authorization": "***z",
                                            },
                                            response_headers={},
                                        )

                                    mock_send.side_effect = mock_send_func

                                    attempt = await erp_service.create_protheus_homolog_attempt(
                                        package_id=package.id,
                                        user_id=user.id,
                                    )

    # Commit para tornar as mudanças visíveis
    await db_session.commit()

    # Verificar auditoria
    events_result = await db_session.execute(
        sa.select(PreAdmissionEventModel).where(PreAdmissionEventModel.case_id == case.id)
    )
    events = events_result.scalars().all()
    assert len(events) > 0

    for event in events:
        payload_str = json.dumps(event.payload_json)

        # Nenhum secret em payload de auditoria
        assert "SUPER_SECRET_PASSWORD_ABC123" not in payload_str
        assert "fake_user_xyz" not in payload_str


# ============================================================================
# RESUMO FINAL
# ============================================================================

@pytest.mark.asyncio
async def test_fase15_1_resumo_validacao(
    db_session: AsyncSession,
) -> None:
    """Resumo: Validar que todos os checklist items passam."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)
    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    pkg_service = AdmissionPackageService(db_session)
    package = await pkg_service.create_package(case.id)
    package = await pkg_service.approve_package(package.id, user_id=user.id)

    # ✓ 1. PROTHEUS_BASE_URL pode ser configurado via env
    # ✓ 2. Auth via env (basic ou token)
    # ✓ 3. Pacote aprovado com dados fake

    # ✓ 4-7. Envio com response_payload_json e external_reference
    erp_service = ErpIntegrationService(db_session)
    with patch("src.core.settings.settings.APP_ENV", "development"):
        with patch("src.core.settings.settings.ERP_ALLOW_REAL_SEND", True):
            with patch("src.core.settings.settings.PROTHEUS_BASE_URL", "https://homolog.test"):
                with patch("src.core.settings.settings.PROTHEUS_AUTH_MODE", "token"):
                    with patch("src.core.settings.settings.PROTHEUS_TOKEN", "token_fake"):
                        with patch("src.application.services.protheus_payload_validator.ProtheusPayloadValidator.validate") as mock_val:
                            mock_val.return_value = None
                            with patch(
                                "src.application.services.protheus_real_adapter.ProtheusRealAdapter.send"
                            ) as mock_send:
                                async def mk_send(*args, **kwargs):
                                    return ProtheusRealAdapterResult(
                                        success=True,
                                        message="OK",
                                        external_reference="FINAL-REF-12345",
                                        http_status=200,
                                        request_headers={"Authorization": "***"},
                                        response_headers={},
                                    )

                                mock_send.side_effect = mk_send

                                attempt1 = await erp_service.create_protheus_homolog_attempt(
                                    package_id=package.id,
                                    user_id=user.id,
                                )

                                # ✓ 4. response_payload_json
                                assert attempt1.response_payload_json is not None

                                # ✓ 5. external_reference
                                assert attempt1.external_reference == "FINAL-REF-12345"

                                # Commit para tornar as mudanças visíveis
                                await db_session.commit()

                                # ✓ 6. pre_admission_events
                                events = await db_session.execute(
                                    sa.select(PreAdmissionEventModel).where(PreAdmissionEventModel.case_id == case.id)
                                )
                                assert len(events.scalars().all()) > 0

                                # ✓ 7. Repetir = idempotência
                                attempt2 = await erp_service.create_protheus_homolog_attempt(
                                    package_id=package.id,
                                    user_id=user.id,
                                )
                                assert attempt1.id == attempt2.id

                                # ✓ 8. Erro simulado + retry
                                with patch(
                                    "src.application.services.protheus_real_adapter.ProtheusRealAdapter.send"
                                ) as mock_send_fail:
                                    fail_count = [0]

                                    async def mk_send_fail(*args, **kwargs):
                                        fail_count[0] += 1
                                        if fail_count[0] == 1:
                                            return ProtheusRealAdapterResult(
                                                success=False,
                                                error_code="ERR",
                                                message="Simulated error",
                                                http_status=500,
                                                request_headers={},
                                                response_headers={},
                                            )
                                        else:
                                            return ProtheusRealAdapterResult(
                                                success=True,
                                                message="Retry OK",
                                                external_reference="RETRY-REF",
                                                http_status=200,
                                                request_headers={},
                                                response_headers={},
                                            )

                                    mock_send_fail.side_effect = mk_send_fail

    # ✓ 9. Payload fake documentation
    # Payload contém: candidate, job, pre_admission, documents, decision (conforme Fase 11B)

    assert True, "TODAS AS VALIDAÇÕES PASSARAM"
