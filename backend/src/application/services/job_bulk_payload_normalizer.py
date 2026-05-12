from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Any

from pydantic import ValidationError

from src.interface.api.schemas.job_schemas import (
    BulkImportJobItemRequest,
    BulkImportJobSkillRequest,
    BulkImportJobsRequest,
    BulkImportOptionsRequest,
    BulkUpdateJobDataRequest,
    BulkUpdateJobItemRequest,
    BulkUpdateJobsRequest,
    BulkUpdateMatchKeyRequest,
)


class BulkJobPayloadNormalizationError(ValueError):
    pass


_PRIORITY_MAP = {
    "low": "low",
    "baixa": "low",
    "baixo": "low",
    "normal": "normal",
    "media": "normal",
    "medio": "normal",
    "padrao": "normal",
    "high": "high",
    "alta": "high",
    "alto": "high",
    "urgent": "urgent",
    "urgente": "urgent",
}

_STATUS_MAP = {
    "draft": "draft",
    "rascunho": "draft",
    "published": "published",
    "publicado": "published",
    "publicada": "published",
    "aberta": "published",
    "open": "published",
    "paused": "paused",
    "pausada": "paused",
    "closed": "closed",
    "fechada": "closed",
    "encerrada": "closed",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "cancelada": "cancelled",
}

_SENIORITY_MAP = {
    "intern": "intern",
    "estagio": "intern",
    "estagiario": "intern",
    "junior": "junior",
    "jr": "junior",
    "mid": "mid",
    "pleno": "mid",
    "pl": "mid",
    "senior": "senior",
    "sr": "senior",
    "lead": "lead",
    "lider": "lead",
    "coordenador": "lead",
    "principal": "principal",
    "especialista": "principal",
    "director": "director",
    "diretor": "director",
}

_EDUCATION_MAP = {
    "none": "none",
    "nenhuma": "none",
    "high school": "high_school",
    "ensino medio": "high_school",
    "medio": "high_school",
    "technical": "technical",
    "tecnico": "technical",
    "bachelor": "bachelor",
    "graduacao": "bachelor",
    "superior": "bachelor",
    "postgraduate": "postgraduate",
    "pos": "postgraduate",
    "pos graduacao": "postgraduate",
    "master": "master",
    "mestrado": "master",
    "phd": "phd",
    "doutorado": "phd",
}

_WORK_MODEL_MAP = {
    "remote": "remote",
    "remoto": "remote",
    "home office": "remote",
    "hybrid": "hybrid",
    "hibrido": "hybrid",
    "onsite": "onsite",
    "presencial": "onsite",
}


class JobBulkPayloadNormalizer:
    @classmethod
    def normalize_import_request(cls, raw: Any) -> BulkImportJobsRequest:
        jobs_raw, options_raw = cls._extract_import_root(raw)
        jobs = [cls._normalize_import_job(job, index) for index, job in enumerate(jobs_raw)]
        options = cls._normalize_options(options_raw)
        try:
            return BulkImportJobsRequest(jobs=jobs, options=options)
        except ValidationError as exc:
            raise BulkJobPayloadNormalizationError(str(exc)) from exc

    @classmethod
    def normalize_update_request(cls, raw: Any) -> BulkUpdateJobsRequest:
        jobs_raw, _options_raw = cls._extract_update_root(raw)
        jobs = [cls._normalize_update_job(job, index) for index, job in enumerate(jobs_raw)]
        try:
            return BulkUpdateJobsRequest(jobs=jobs)
        except ValidationError as exc:
            raise BulkJobPayloadNormalizationError(str(exc)) from exc

    @classmethod
    def _extract_import_root(cls, raw: Any) -> tuple[list[Any], Any]:
        if isinstance(raw, list):
            if not raw:
                raise BulkJobPayloadNormalizationError("Envie pelo menos uma vaga no JSON.")
            return raw, {}

        root = cls._as_object(raw)
        if root is None:
            raise BulkJobPayloadNormalizationError("Formato inválido. Use um array de vagas ou um objeto com a chave jobs.")

        jobs_raw = cls._pick_first(root, ["jobs", "vagas", "items", "data"])
        if not isinstance(jobs_raw, list) or not jobs_raw:
            raise BulkJobPayloadNormalizationError("A chave jobs/vagas deve conter pelo menos uma vaga.")

        options_raw = cls._pick_first(root, ["options", "opcoes", "opções", "config"]) or {}
        return jobs_raw, options_raw

    @classmethod
    def _extract_update_root(cls, raw: Any) -> tuple[list[Any], Any]:
        if isinstance(raw, list):
            if not raw:
                raise BulkJobPayloadNormalizationError("Envie pelo menos uma atualização de vaga no JSON.")
            return raw, {}

        root = cls._as_object(raw)
        if root is None:
            raise BulkJobPayloadNormalizationError("Formato inválido. Use um array de atualizações ou um objeto com a chave jobs.")

        jobs_raw = cls._pick_first(root, ["jobs", "vagas", "items", "data"])
        if not isinstance(jobs_raw, list) or not jobs_raw:
            raise BulkJobPayloadNormalizationError("A chave jobs/vagas deve conter pelo menos uma atualização.")
        options_raw = cls._pick_first(root, ["options", "opcoes", "opções", "config"]) or {}
        return jobs_raw, options_raw

    @classmethod
    def _normalize_import_job(cls, raw_job: Any, index: int) -> BulkImportJobItemRequest:
        source = cls._as_object(raw_job)
        if source is None:
            raise BulkJobPayloadNormalizationError(f"Item {index + 1}: vaga inválida.")

        responsibilities = cls._to_string_or_none(
            cls._pick_first(source, ["responsibilities", "responsabilidades", "atividades", "principais_atividades"])
        )
        requirements = cls._to_string_or_none(cls._pick_first(source, ["requirements", "requisitos", "requirement"]))
        experience_context = cls._to_string_or_none(
            cls._pick_first(source, ["experience_context", "experienceContext", "contexto_experiencia", "contexto de experiencia", "contexto"])
        )
        description_source = cls._pick_first(source, ["description", "descricao", "descrição", "resumo"])
        description = cls._to_string_or_none(description_source) or cls._infer_description(
            [responsibilities, requirements, experience_context]
        )

        salary = cls._as_object(cls._pick_first(source, ["salary", "salario", "salário"])) or {}

        payload = {
            "title": cls._to_string_or_none(
                cls._pick_first(source, ["title", "titulo", "título", "cargo", "nome", "job_title", "vaga"])
            ),
            "description": description,
            "requirements": requirements,
            "status": cls._normalize_status(cls._pick_first(source, ["status", "situacao", "situação"])),
            "seniority_level": cls._normalize_seniority(
                cls._pick_first(source, ["seniority_level", "seniority", "senioridade", "nivel_senioridade", "nível_senioridade"])
            ),
            "minimum_education_level": cls._normalize_education_level(
                cls._pick_first(source, ["minimum_education_level", "educacao_minima", "educação_mínima", "education_level", "formacao_minima"])
            ),
            "minimum_years_experience": cls._first_non_none(
                cls._coerce_number(
                    cls._pick_first(
                        source,
                        [
                            "minimum_years_experience",
                            "anos_experiencia",
                            "anos_experiencia_minima",
                            "experiencia_minima",
                            "experiência_mínima",
                        ],
                    )
                )
            ),
            "deal_breakers": cls._normalize_deal_breakers(
                cls._pick_first(source, ["deal_breakers", "criterios_eliminatorios", "critérios_eliminatórios", "eliminatorios"])
            ),
            "work_model": cls._normalize_work_model(cls._pick_first(source, ["work_model", "modelo_trabalho", "modelo_de_trabalho"])),
            "location": cls._to_string_or_none(cls._pick_first(source, ["location", "localizacao", "localização", "local", "cidade"])),
            "salary_min": cls._first_non_none(
                cls._coerce_number(cls._pick_first(source, ["salary_min", "salario_min", "salário_min"])),
                cls._coerce_number(salary.get("min")),
            ),
            "salary_max": cls._first_non_none(
                cls._coerce_number(cls._pick_first(source, ["salary_max", "salario_max", "salário_max"])),
                cls._coerce_number(salary.get("max")),
            ),
            "salary_currency": (
                cls._to_string_or_none(cls._pick_first(source, ["salary_currency", "salaryCurrency", "moeda"]))
                or cls._to_string_or_none(salary.get("currency"))
                or "BRL"
            ).upper(),
            "job_area": cls._normalize_job_area(cls._pick_first(source, ["job_area", "area", "área", "department", "departamento"])),
            "responsibilities": responsibilities,
            "experience_context": experience_context,
            "behavioral_requirements": cls._normalize_string_list(
                cls._pick_first(
                    source,
                    [
                        "behavioral_requirements",
                        "soft_skills",
                        "competencias_comportamentais",
                        "competências_comportamentais",
                        "requisitos_comportamentais",
                    ],
                )
            ),
            "priority": cls._normalize_priority(cls._pick_first(source, ["priority", "prioridade", "urgencia", "urgência"])),
            "skills": cls._merge_skills(
                cls._normalize_skills(
                    cls._pick_first(source, ["mandatory_skills", "required_skills", "skills_obrigatorias", "habilidades_obrigatorias"]),
                    mandatory_default=True,
                ),
                cls._normalize_skills(
                    cls._pick_first(source, ["optional_skills", "desired_skills", "skills_desejaveis", "habilidades_desejaveis"]),
                    mandatory_default=False,
                ),
                cls._normalize_skills(
                    cls._pick_first(source, ["skills", "habilidades", "competencias", "competências", "tecnologias"]),
                    mandatory_default=False,
                ),
            ),
        }

        try:
            return BulkImportJobItemRequest.model_validate(payload)
        except ValidationError as exc:
            raise BulkJobPayloadNormalizationError(f"Item {index + 1}: {exc}") from exc

    @classmethod
    def _normalize_update_job(cls, raw_job: Any, index: int) -> BulkUpdateJobItemRequest:
        source = cls._as_object(raw_job)
        if source is None:
            raise BulkJobPayloadNormalizationError(f"Item {index + 1}: atualização inválida.")

        job_id = cls._pick_first(source, ["job_id", "id", "vaga_id"])
        match_key_raw = cls._as_object(cls._pick_first(source, ["match_key", "chave", "identidade"]))

        if match_key_raw is None and job_id is None:
            top_title = cls._to_string_or_none(
                cls._pick_first(source, ["title", "titulo", "título", "cargo", "nome", "job_title", "vaga"])
            )
            top_job_area = cls._normalize_job_area(cls._pick_first(source, ["job_area", "area", "área", "department", "departamento"]))
            top_location = cls._to_string_or_none(cls._pick_first(source, ["location", "localizacao", "localização", "local", "cidade"]))
            if top_title:
                match_key_raw = {
                    "title": top_title,
                    "job_area": top_job_area,
                    "location": top_location,
                }

        data_source = cls._as_object(cls._pick_first(source, ["data", "dados", "payload"]))
        if data_source is None:
            data_source = dict(source)
            for key in ["job_id", "id", "vaga_id", "match_key", "chave", "identidade"]:
                data_source.pop(key, None)

        payload: dict[str, Any] = {
            "job_id": job_id,
            "data": cls._normalize_update_data(data_source),
        }

        if match_key_raw is not None:
            payload["match_key"] = {
                "title": cls._to_string_or_none(
                    cls._pick_first(match_key_raw, ["title", "titulo", "título", "cargo", "nome", "job_title", "vaga"])
                ),
                "job_area": cls._normalize_job_area(
                    cls._pick_first(match_key_raw, ["job_area", "area", "área", "department", "departamento"])
                ),
                "location": cls._to_string_or_none(
                    cls._pick_first(match_key_raw, ["location", "localizacao", "localização", "local", "cidade"])
                ),
            }

        try:
            return BulkUpdateJobItemRequest.model_validate(payload)
        except ValidationError as exc:
            raise BulkJobPayloadNormalizationError(f"Item {index + 1}: {exc}") from exc

    @classmethod
    def _normalize_update_data(cls, source: dict[str, Any]) -> BulkUpdateJobDataRequest:
        responsibilities = cls._to_string_or_none(
            cls._pick_first(source, ["responsibilities", "responsabilidades", "atividades", "principais_atividades"])
        )
        requirements = cls._to_string_or_none(cls._pick_first(source, ["requirements", "requisitos", "requirement"]))
        experience_context = cls._to_string_or_none(
            cls._pick_first(source, ["experience_context", "experienceContext", "contexto_experiencia", "contexto de experiencia", "contexto"])
        )
        salary = cls._as_object(cls._pick_first(source, ["salary", "salario", "salário"])) or {}

        payload = {
            "title": cls._to_string_or_none(
                cls._pick_first(source, ["title", "titulo", "título", "cargo", "nome", "job_title", "vaga"])
            ),
            "description": cls._to_string_or_none(cls._pick_first(source, ["description", "descricao", "descrição", "resumo"])),
            "requirements": requirements,
            "status": cls._normalize_optional_status(cls._pick_first(source, ["status", "situacao", "situação"])),
            "seniority_level": cls._normalize_seniority(
                cls._pick_first(source, ["seniority_level", "seniority", "senioridade", "nivel_senioridade", "nível_senioridade"])
            ),
            "minimum_education_level": cls._normalize_education_level(
                cls._pick_first(source, ["minimum_education_level", "educacao_minima", "educação_mínima", "education_level", "formacao_minima"])
            ),
            "minimum_years_experience": cls._first_non_none(
                cls._coerce_number(
                    cls._pick_first(
                        source,
                        [
                            "minimum_years_experience",
                            "anos_experiencia",
                            "anos_experiencia_minima",
                            "experiencia_minima",
                            "experiência_mínima",
                        ],
                    )
                )
            ),
            "deal_breakers": cls._normalize_optional_deal_breakers(
                cls._pick_first(source, ["deal_breakers", "criterios_eliminatorios", "critérios_eliminatórios", "eliminatorios"])
            ),
            "work_model": cls._normalize_work_model(cls._pick_first(source, ["work_model", "modelo_trabalho", "modelo_de_trabalho"])),
            "location": cls._to_string_or_none(cls._pick_first(source, ["location", "localizacao", "localização", "local", "cidade"])),
            "salary_min": cls._first_non_none(
                cls._coerce_number(cls._pick_first(source, ["salary_min", "salario_min", "salário_min"])),
                cls._coerce_number(salary.get("min")),
            ),
            "salary_max": cls._first_non_none(
                cls._coerce_number(cls._pick_first(source, ["salary_max", "salario_max", "salário_max"])),
                cls._coerce_number(salary.get("max")),
            ),
            "salary_currency": cls._normalize_optional_currency(
                cls._pick_first(source, ["salary_currency", "salaryCurrency", "moeda"]) or salary.get("currency")
            ),
            "job_area": cls._normalize_job_area(cls._pick_first(source, ["job_area", "area", "área", "department", "departamento"])),
            "responsibilities": responsibilities,
            "experience_context": experience_context,
            "behavioral_requirements": cls._normalize_optional_string_list(
                cls._pick_first(
                    source,
                    [
                        "behavioral_requirements",
                        "soft_skills",
                        "competencias_comportamentais",
                        "competências_comportamentais",
                        "requisitos_comportamentais",
                    ],
                )
            ),
            "priority": cls._normalize_optional_priority(cls._pick_first(source, ["priority", "prioridade", "urgencia", "urgência"])),
            "skills": cls._normalize_optional_skills(source),
        }

        cleaned = {key: value for key, value in payload.items() if value is not None}
        return BulkUpdateJobDataRequest.model_validate(cleaned)

    @classmethod
    def _normalize_optional_skills(cls, source: dict[str, Any]) -> list[BulkImportJobSkillRequest] | None:
        has_skill_key = any(
            key in source
            for key in [
                "skills",
                "habilidades",
                "competencias",
                "competências",
                "tecnologias",
                "mandatory_skills",
                "required_skills",
                "skills_obrigatorias",
                "habilidades_obrigatorias",
                "optional_skills",
                "desired_skills",
                "skills_desejaveis",
                "habilidades_desejaveis",
            ]
        )
        if not has_skill_key:
            return None
        return cls._merge_skills(
            cls._normalize_skills(
                cls._pick_first(source, ["mandatory_skills", "required_skills", "skills_obrigatorias", "habilidades_obrigatorias"]),
                mandatory_default=True,
            ),
            cls._normalize_skills(
                cls._pick_first(source, ["optional_skills", "desired_skills", "skills_desejaveis", "habilidades_desejaveis"]),
                mandatory_default=False,
            ),
            cls._normalize_skills(
                cls._pick_first(source, ["skills", "habilidades", "competencias", "competências", "tecnologias"]),
                mandatory_default=False,
            ),
        )

    @classmethod
    def _normalize_options(cls, value: Any) -> BulkImportOptionsRequest:
        source = cls._as_object(value) or {}
        return BulkImportOptionsRequest.model_validate(
            {
                "dry_run": cls._coerce_boolean(cls._pick_first(source, ["dry_run", "dryRun"]), False),
                "skip_duplicates": cls._coerce_boolean(cls._pick_first(source, ["skip_duplicates", "skipDuplicates"]), True),
                "default_status": cls._normalize_status(cls._pick_first(source, ["default_status", "status_padrao", "defaultStatus"])),
            }
        )

    @classmethod
    def _normalize_skills(cls, value: Any, mandatory_default: bool) -> list[BulkImportJobSkillRequest]:
        result: list[BulkImportJobSkillRequest] = []
        for entry in cls._to_array(value):
            if isinstance(entry, str):
                name = entry.strip()
                if not name:
                    continue
                result.append(
                    BulkImportJobSkillRequest(
                        name=name,
                        priority_level="priority" if mandatory_default else "complementary",
                        weight=Decimal("8") if mandatory_default else Decimal("5"),
                    )
                )
                continue

            obj = cls._as_object(entry)
            if obj is None:
                continue

            name = cls._to_string_or_none(
                cls._pick_first(obj, ["name", "nome", "skill", "habilidade", "competencia", "competência"])
            )
            if not name:
                continue

            result.append(
                BulkImportJobSkillRequest.model_validate(
                    {
                        "name": name,
                        "priority_level": cls._normalize_priority_level(
                            cls._pick_first(
                                obj,
                                [
                                    "priority_level",
                                    "priorityLevel",
                                    "nivel_prioridade",
                                    "mandatory",
                                    "obrigatoria",
                                    "obrigatório",
                                    "required",
                                ],
                            ),
                            default="priority" if mandatory_default else "complementary",
                        ),
                        "weight": cls._first_non_none(
                            cls._coerce_number(cls._pick_first(obj, ["weight", "peso", "importancia", "importância"])),
                            Decimal("8") if mandatory_default else Decimal("5"),
                        ),
                        "minimum_level": cls._normalize_seniority(
                            cls._pick_first(obj, ["minimum_level", "nivel_minimo", "nível_mínimo", "nivel"])
                        ),
                        "minimum_years": cls._coerce_number(
                            cls._pick_first(obj, ["minimum_years", "anos_minimos", "anos_mínimos", "experiencia", "experiência"])
                        ),
                    }
                )
            )
        return result

    @classmethod
    def _merge_skills(cls, *groups: list[BulkImportJobSkillRequest]) -> list[BulkImportJobSkillRequest]:
        merged: dict[str, BulkImportJobSkillRequest] = {}
        for group in groups:
            for skill in group:
                key = cls._normalize_text(skill.name)
                if not key:
                    continue
                existing = merged.get(key)
                if existing is None:
                    merged[key] = skill
                    continue
                merged[key] = BulkImportJobSkillRequest.model_validate(
                    {
                        "name": existing.name or skill.name,
                        "priority_level": cls._merge_priority_levels(existing.priority_level, skill.priority_level),
                        "weight": max(existing.weight, skill.weight),
                        "minimum_level": existing.minimum_level or skill.minimum_level,
                        "minimum_years": max(existing.minimum_years or Decimal("0"), skill.minimum_years or Decimal("0")) or None,
                    }
                )
        return list(merged.values())

    @staticmethod
    def _normalize_priority_level(value: Any, *, default: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized in {"priority", "essencial"}:
            return "priority"
        if normalized in {"complementary", "diferencial", "optional", "desired"}:
            return "complementary"
        if normalized in {"eliminatory", "eliminatorio", "eliminatório"}:
            return "eliminatory"
        if normalized in {"true", "1", "yes", "sim"}:
            return "priority"
        if normalized in {"false", "0", "no", "nao", "não"}:
            return "complementary"
        return default

    @staticmethod
    def _merge_priority_levels(existing: str, incoming: str) -> str:
        order = {"eliminatory": 0, "priority": 1, "complementary": 2}
        return existing if order.get(existing, 9) <= order.get(incoming, 9) else incoming


    @staticmethod
    def _first_non_none(*values: Any) -> Any:
        for value in values:
            if value is not None:
                return value
        return None

    @staticmethod
    def _as_object(value: Any) -> dict[str, Any] | None:
        return value if isinstance(value, dict) else None

    @staticmethod
    def _pick_first(source: dict[str, Any], keys: list[str]) -> Any:
        for key in keys:
            if key in source and source[key] is not None:
                return source[key]
        return None

    @staticmethod
    def _to_string_or_none(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @classmethod
    def _normalize_text(cls, value: Any) -> str:
        text = str(value or "").strip().lower()
        text = unicodedata.normalize("NFD", text)
        text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
        return re.sub(r"\s+", " ", text)

    @classmethod
    def _to_array(cls, value: Any) -> list[Any]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return [item.strip() for item in re.split(r"\r?\n|,", value) if item.strip()]
        return []

    @classmethod
    def _coerce_boolean(cls, value: Any, default_value: bool) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value > 0
        normalized = cls._normalize_text(value)
        if normalized in {"true", "1", "sim", "yes", "y", "obrigatoria", "obrigatorio", "mandatory", "required"}:
            return True
        if normalized in {"false", "0", "nao", "no", "n", "opcional", "optional"}:
            return False
        return default_value

    @classmethod
    def _coerce_number(cls, value: Any) -> Decimal | None:
        if value is None or value == "":
            return None
        if isinstance(value, Decimal):
            return value
        if isinstance(value, (int, float)):
            return Decimal(str(value))
        raw = str(value).strip()
        if not raw:
            return None
        cleaned = re.sub(r"[Rr]\$\s?", "", raw)
        cleaned = re.sub(r"anos?", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"[^0-9,.-]", "", cleaned).strip()
        if not cleaned:
            return None
        if "," in cleaned and "." in cleaned:
            normalized = cleaned.replace(".", "").replace(",", ".")
        elif "," in cleaned:
            normalized = cleaned.replace(",", ".")
        else:
            normalized = cleaned
        try:
            return Decimal(normalized)
        except InvalidOperation:
            return None

    @classmethod
    def _normalize_job_area(cls, value: Any) -> str | None:
        if value is None:
            return None
        return cls._to_string_or_none(value)

    @classmethod
    def _normalize_priority(cls, value: Any) -> str:
        return _PRIORITY_MAP.get(cls._normalize_text(value), "normal")

    @classmethod
    def _normalize_optional_priority(cls, value: Any) -> str | None:
        return None if value is None else cls._normalize_priority(value)

    @classmethod
    def _normalize_status(cls, value: Any) -> str:
        return _STATUS_MAP.get(cls._normalize_text(value), "draft")

    @classmethod
    def _normalize_optional_status(cls, value: Any) -> str | None:
        return None if value is None else cls._normalize_status(value)

    @classmethod
    def _normalize_seniority(cls, value: Any) -> str | None:
        if value is None:
            return None
        normalized = cls._normalize_text(value)
        return _SENIORITY_MAP.get(normalized, cls._to_string_or_none(value))

    @classmethod
    def _normalize_education_level(cls, value: Any) -> str | None:
        if value is None:
            return None
        normalized = cls._normalize_text(value)
        return _EDUCATION_MAP.get(normalized, cls._to_string_or_none(value))

    @classmethod
    def _normalize_work_model(cls, value: Any) -> str | None:
        if value is None:
            return None
        normalized = cls._normalize_text(value)
        return _WORK_MODEL_MAP.get(normalized, cls._to_string_or_none(value))

    @classmethod
    def _normalize_string_list(cls, value: Any) -> list[str]:
        seen: set[str] = set()
        normalized: list[str] = []
        for item in cls._to_array(value):
            text = cls._to_string_or_none(item)
            if not text:
                continue
            key = cls._normalize_text(text)
            if not key or key in seen:
                continue
            seen.add(key)
            normalized.append(text)
        return normalized

    @classmethod
    def _normalize_optional_string_list(cls, value: Any) -> list[str] | None:
        return None if value is None else cls._normalize_string_list(value)

    @staticmethod
    def _normalize_deal_breakers(value: Any) -> list[Any]:
        return value if isinstance(value, list) else []

    @staticmethod
    def _normalize_optional_deal_breakers(value: Any) -> list[Any] | None:
        if value is None:
            return None
        return value if isinstance(value, list) else []

    @classmethod
    def _infer_description(cls, parts: list[Any]) -> str | None:
        lines = [cls._to_string_or_none(part) for part in parts]
        filtered = [line for line in lines if line]
        return " ".join(filtered) if filtered else None

    @classmethod
    def _normalize_optional_currency(cls, value: Any) -> str | None:
        if value is None:
            return None
        currency = cls._to_string_or_none(value)
        return currency.upper() if currency else None
