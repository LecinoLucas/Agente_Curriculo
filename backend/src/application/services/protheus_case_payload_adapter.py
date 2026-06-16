from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.application.services.document_ai_service import extract_structured_data
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobUnitModel
from src.infrastructure.database.models.operational_master_model import OperationalUnitModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
)
from src.infrastructure.storage.pre_admission_documents import resolve_pre_admission_document_path

PROTHEUS_FIELD_SOURCE_MAP: dict[str, str] = {
    "RA_NOME": "candidate.full_name",
    "RA_CIC": "candidate.cpf",
    "RA_NASC": "documento RG aprovado ou fallback STUB",
    "RA_ADMISSA": "pre_admission_cases.start_date",
    "RA_SALARIO": "pre_admission_cases.salary_offer ou candidates.salary_expectation",
    "RA_CODFUNC": "jobs.title -> código STUB seguro 000001",
    "RA_CC": "bridge.mapping.default_cost_center",
    "RA_TNOTRAB": "bridge.mapping.default_work_shift",
    "RA_SINDICA": "bridge.mapping.default_union_code",
    "RA_PIS": "checklist item 'pis' aprovado",
    "RA_RG": "checklist item 'rg' aprovado",
    "RA_CTPS": "checklist item 'carteira_trabalho' aprovado",
    "RA_SERCTPS": "checklist item 'carteira_trabalho' aprovado",
    "RA_ESTCIVI": "fallback STUB seguro",
    "RA_SEXO": "fallback STUB seguro",
    "RA_MAT": "bridge STUB",
}

_PENDING_LABELS = {
    "candidate_name": "Nome do candidato ausente",
    "candidate_cpf": "CPF ausente",
    "candidate_birth_date": "Data de nascimento ausente",
    "case_start_date": "Data de admissão ausente",
    "case_salary": "Salário ausente",
    "job_function": "Cargo Protheus não mapeado",
    "unit_code": "Unidade operacional não mapeada",
    "doc_pis": "PIS ausente",
    "doc_rg": "Documento RG ausente",
    "doc_ctps": "CTPS ausente",
}

_DOCUMENT_PLACEHOLDERS = {
    "pis": "DOC_PIS_OK",
    "rg": "DOC_RG_OK",
    "ctps": "DOC_CTPS_OK",
    "ctps_serie": "DOC_CTPS_SERIE_OK",
}

_STUB_FUNCTION_CODE = "000001"
_STUB_COST_CENTER = "990001"
_STUB_UNION_CODE = "000099"
_STUB_SHIFT_CODE = "001"
_STUB_EMPLOYEE_LEVEL = "1"


class ProtheusCasePayloadAdapterNotFoundError(Exception):
    pass


@dataclass
class ProtheusCasePayloadAdapterResult:
    admission_case: dict[str, Any]
    pending_requirements: list[str]
    redacted_preview: dict[str, Any]
    field_source_map: dict[str, str]


class ProtheusCasePayloadAdapter:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def build(
        self,
        case_id: UUID,
        *,
        requested_by: str,
        fallback_unit_code: str | None = None,
    ) -> ProtheusCasePayloadAdapterResult:
        case = await self._load_case(case_id)
        if case is None:
            raise ProtheusCasePayloadAdapterNotFoundError("Caso de pré-admissão não encontrado.")

        checklist_items = await self._load_checklist_items(case_id)

        candidate = await self._session.get(CandidateModel, case.candidate_id)
        job = await self._session.get(JobModel, case.job_id)
        if candidate is None or job is None:
            raise ProtheusCasePayloadAdapterNotFoundError("Dados do caso de pré-admissão não encontrados.")

        docs = self._index_approved_documents(checklist_items)
        doc_flags = self._checklist_presence(checklist_items)
        rg_structured = self._extract_structured_rg(docs.get("rg"))
        unit_code = await self._resolve_unit_code(job.id, fallback_unit_code)

        pending = self._collect_pending(case=case, candidate=candidate, job=job, doc_flags=doc_flags, unit_code=unit_code, rg_structured=rg_structured)

        salary = self._resolve_salary(case.salary_offer, candidate.salary_expectation)
        admission_case = {
            "admission_case_id": str(case.id),
            "idempotency_key": f"case:{case.id}",
            "requested_by": requested_by,
            "requested_at": datetime.now(UTC).isoformat(),
            "unit_code": unit_code or (fallback_unit_code or "").strip(),
            "dry_run": True,
            "personal": {
                "nome": (candidate.full_name or "").strip(),
                "cpf": self._digits_only(candidate.cpf),
                "data_nascimento": self._normalize_date(rg_structured.get("data_nascimento")) or "19000101",
                "sexo": self._normalize_gender(rg_structured.get("sexo")) or "M",
                "estado_civil": self._normalize_marital_status(rg_structured.get("estado_civil")) or "S",
                "zona_eleitoral": rg_structured.get("zona_eleitoral") or "0000",
                "pis": _DOCUMENT_PLACEHOLDERS["pis"] if doc_flags.get("pis") else None,
                "rg": rg_structured.get("documento_numero") or (_DOCUMENT_PLACEHOLDERS["rg"] if doc_flags.get("rg") else None),
                "ctps": _DOCUMENT_PLACEHOLDERS["ctps"] if doc_flags.get("carteira_trabalho") else None,
                "ctps_serie": _DOCUMENT_PLACEHOLDERS["ctps_serie"] if doc_flags.get("carteira_trabalho") else None,
                "email": candidate.email,
                "telefone": candidate.phone,
            },
            "contract": {
                "data_admissao": case.start_date.isoformat() if case.start_date else "",
                "funcao": _STUB_FUNCTION_CODE if (job.title or "").strip() else "",
                "salario": salary,
                "centro_custo": _STUB_COST_CENTER,
                "sindicato": _STUB_UNION_CODE,
                "turno": _STUB_SHIFT_CODE,
                "nivel_funcionario": _STUB_EMPLOYEE_LEVEL,
            },
        }

        return ProtheusCasePayloadAdapterResult(
            admission_case=admission_case,
            pending_requirements=pending,
            redacted_preview=self.sanitize_for_logs(admission_case),
            field_source_map=dict(PROTHEUS_FIELD_SOURCE_MAP),
        )

    def sanitize_for_logs(self, payload: dict[str, Any]) -> dict[str, Any]:
        redacted = dict(payload)
        personal = dict(payload.get("personal") or {})
        for field in ("cpf", "pis", "rg", "ctps", "ctps_serie"):
            if personal.get(field):
                personal[field] = "***masked***"
        if personal.get("email"):
            personal["email"] = "***masked***"
        if personal.get("telefone"):
            personal["telefone"] = "***masked***"
        redacted["personal"] = personal
        return redacted

    async def _load_case(self, case_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .where(PreAdmissionCaseModel.id == case_id)
            .execution_options(populate_existing=True)
        )
        return await self._session.scalar(stmt)

    async def _load_checklist_items(self, case_id: UUID) -> list[PreAdmissionChecklistItemModel]:
        stmt = (
            sa.select(PreAdmissionChecklistItemModel)
            .options(selectinload(PreAdmissionChecklistItemModel.documents))
            .where(PreAdmissionChecklistItemModel.case_id == case_id)
            .execution_options(populate_existing=True)
            .order_by(PreAdmissionChecklistItemModel.created_at.asc())
        )
        return list(await self._session.scalars(stmt))

    async def _resolve_unit_code(self, job_id: UUID, fallback_unit_code: str | None) -> str | None:
        stmt = (
            sa.select(OperationalUnitModel.code)
            .join(JobUnitModel, JobUnitModel.operational_unit_id == OperationalUnitModel.id)
            .where(
                JobUnitModel.job_id == job_id,
                JobUnitModel.is_active.is_(True),
                OperationalUnitModel.is_active.is_(True),
            )
            .order_by(JobUnitModel.priority.asc().nullslast(), JobUnitModel.created_at.asc())
            .limit(1)
        )
        unit_code = await self._session.scalar(stmt)
        normalized = (unit_code or "").strip()
        if normalized:
            return normalized

        fallback = (fallback_unit_code or "").strip()
        return fallback or None

    def _index_approved_documents(
        self,
        checklist_items: list[PreAdmissionChecklistItemModel],
    ) -> dict[str, PreAdmissionDocumentModel]:
        result: dict[str, PreAdmissionDocumentModel] = {}
        for item in checklist_items:
            if item.status != "approved":
                continue
            current = self._current_document(item)
            if current is None or current.status != "approved":
                continue
            result[item.item_type] = current
        return result

    def _collect_pending(
        self,
        *,
        case: PreAdmissionCaseModel,
        candidate: CandidateModel,
        job: JobModel,
        doc_flags: dict[str, bool],
        unit_code: str | None,
        rg_structured: dict[str, Any],
    ) -> list[str]:
        pending: list[str] = []
        if not (candidate.full_name or "").strip():
            pending.append(_PENDING_LABELS["candidate_name"])
        if not self._digits_only(candidate.cpf):
            pending.append(_PENDING_LABELS["candidate_cpf"])
        if case.start_date is None:
            pending.append(_PENDING_LABELS["case_start_date"])
        if self._resolve_salary(case.salary_offer, candidate.salary_expectation) <= 0:
            pending.append(_PENDING_LABELS["case_salary"])
        if not (job.title or "").strip():
            pending.append(_PENDING_LABELS["job_function"])
        if not unit_code:
            pending.append(_PENDING_LABELS["unit_code"])
        if not doc_flags.get("pis"):
            pending.append(_PENDING_LABELS["doc_pis"])
        if not doc_flags.get("rg"):
            pending.append(_PENDING_LABELS["doc_rg"])
        if not doc_flags.get("carteira_trabalho"):
            pending.append(_PENDING_LABELS["doc_ctps"])
        return self._dedupe(pending)

    def _checklist_presence(
        self,
        checklist_items: list[PreAdmissionChecklistItemModel],
    ) -> dict[str, bool]:
        flags: dict[str, bool] = {}
        for item in checklist_items:
            flags[item.item_type] = True
        return flags

    def _extract_structured_rg(self, document: PreAdmissionDocumentModel | None) -> dict[str, Any]:
        if document is None:
            return {}
        try:
            raw = resolve_pre_admission_document_path(document.storage_key).read_bytes()
        except OSError:
            return {}

        text = raw.decode("utf-8", errors="ignore")
        if not text.strip():
            text = raw.decode("latin-1", errors="ignore")
        structured = extract_structured_data(text)
        zone_match = re.search(r"(?i)zona\s*(?:eleitoral)?\s*[:#-]?\s*(\d{1,4})", text)
        sexo_match = re.search(r"(?i)sexo\s*[:#-]?\s*([MF])\b", text)
        estado_match = re.search(r"(?i)estado\s+civil\s*[:#-]?\s*([A-Za-zÇÃÕÉÍÓÚ ]{1,20})", text)
        if zone_match:
            structured["zona_eleitoral"] = zone_match.group(1).zfill(4)
        if sexo_match:
            structured["sexo"] = sexo_match.group(1).upper()
        if estado_match:
            structured["estado_civil"] = estado_match.group(1).strip()
        return structured

    @staticmethod
    def _current_document(item: PreAdmissionChecklistItemModel) -> PreAdmissionDocumentModel | None:
        eligible = [
            document
            for document in item.documents
            if document.deleted_at is None and document.status != "replaced"
        ]
        if not eligible:
            return None
        return max(
            eligible,
            key=lambda document: (
                document.uploaded_at.isoformat() if document.uploaded_at else "",
                document.created_at.isoformat() if document.created_at else "",
                str(document.id),
            ),
        )

    @staticmethod
    def _resolve_salary(case_salary: Decimal | None, salary_expectation: str | None) -> float:
        if case_salary is not None:
            return float(case_salary)
        try:
            return float((salary_expectation or "").strip() or 0)
        except ValueError:
            return 0.0

    @staticmethod
    def _normalize_date(value: Any) -> str | None:
        if not value:
            return None
        digits = re.sub(r"\D", "", str(value))
        if len(digits) == 8:
            if digits.startswith(("19", "20")):
                return digits
            return f"{digits[4:8]}{digits[2:4]}{digits[0:2]}"
        return None

    @staticmethod
    def _normalize_gender(value: Any) -> str | None:
        normalized = str(value or "").strip().upper()
        return normalized if normalized in {"M", "F"} else None

    @staticmethod
    def _normalize_marital_status(value: Any) -> str | None:
        normalized = str(value or "").strip().upper()
        if not normalized:
            return None
        aliases = {
            "SOLTEIRO": "S",
            "SOLTEIRA": "S",
            "CASADO": "C",
            "CASADA": "C",
            "DIVORCIADO": "D",
            "DIVORCIADA": "D",
            "VIUVO": "V",
            "VIUVA": "V",
            "UNIAO ESTAVEL": "U",
        }
        return aliases.get(normalized, normalized[:1])

    @staticmethod
    def _digits_only(value: str | None) -> str:
        return re.sub(r"\D", "", value or "")

    @staticmethod
    def _dedupe(items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            if not item or item in seen:
                continue
            seen.add(item)
            result.append(item)
        return result
