import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.skill_catalog_model import SkillCatalogModel, SkillAliasModel
from tests.integration.helpers import _create_active_user, _auth_headers

pytestmark = pytest.mark.asyncio

async def _get_admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(
        db_session,
        "admin-skill@test.com",
        "password123",
        UserRole.ADMIN,
    )
    return await _auth_headers(client, "admin-skill@test.com", "password123")


async def _get_headers_for_role(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    email: str,
    role: UserRole,
) -> dict[str, str]:
    await _create_active_user(
        db_session,
        email,
        "password123",
        role,
    )
    return await _auth_headers(client, email, "password123")

async def test_create_skill_success(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    response = await client.post(
        "/api/v1/skills",
        json={
            "name": "Python",
            "category": "language",
            "description": "Programming language",
            "aliases": ["Py", "Python 3"]
        },
        headers=headers
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Python"
    assert data["normalized_name"] == "python"
    assert data["category"] == "language"
    assert len(data["aliases"]) == 2
    aliases = [a["normalized_alias"] for a in data["aliases"]]
    assert "py" in aliases
    assert "python 3" in aliases

async def test_create_skill_without_aliases(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    response = await client.post(
        "/api/v1/skills",
        json={"name": "Scrum", "category": "framework"},
        headers=headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Scrum"
    assert data["aliases"] == []

async def test_create_skill_duplicate_name(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "admin-skill-2@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-skill-2@test.com", "password123")
    
    # Create first
    await client.post(
        "/api/v1/skills",
        json={"name": "Java"},
        headers=headers
    )
    
    # Try creating again with spaces/case difference
    response = await client.post(
        "/api/v1/skills",
        json={"name": " JAVA "},
        headers=headers
    )
    assert response.status_code == 409
    assert "Já existe uma skill com o nome" in response.json()["error"]["message"]

async def test_create_skill_duplicate_name_by_accent_normalization(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    await client.post(
        "/api/v1/skills",
        json={"name": "Análise de Sistemas"},
        headers=headers,
    )

    response = await client.post(
        "/api/v1/skills",
        json={"name": "analise   de sistemas"},
        headers=headers,
    )

    assert response.status_code == 409
    assert "Já existe uma skill com o nome" in response.json()["error"]["message"]

async def test_create_skill_duplicate_alias_in_db(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "admin-skill-3@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-skill-3@test.com", "password123")
    
    # Create first with alias
    await client.post(
        "/api/v1/skills",
        json={"name": "JavaScript", "aliases": ["JS"]},
        headers=headers
    )
    
    # Try creating another skill using the same alias
    response = await client.post(
        "/api/v1/skills",
        json={"name": "TypeScript", "aliases": ["JS"]},
        headers=headers
    )
    assert response.status_code == 409
    assert "já existe como alias de outra skill" in response.json()["error"]["message"]

async def test_create_skill_name_exists_as_alias(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "admin-skill-4@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-skill-4@test.com", "password123")
    
    # Create first with alias
    await client.post(
        "/api/v1/skills",
        json={"name": "React", "aliases": ["ReactJS"]},
        headers=headers
    )
    
    # Try creating a skill whose name is already an alias
    response = await client.post(
        "/api/v1/skills",
        json={"name": "ReactJS"},
        headers=headers
    )
    assert response.status_code == 409
    assert "já existe como alias de outra skill" in response.json()["error"]["message"]

async def test_create_alias_exists_as_skill(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "admin-skill-5@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-skill-5@test.com", "password123")
    
    # Create a skill
    await client.post(
        "/api/v1/skills",
        json={"name": "NodeJS"},
        headers=headers
    )
    
    # Try creating another skill with an alias that is already a skill
    response = await client.post(
        "/api/v1/skills",
        json={"name": "Express", "aliases": ["NodeJS"]},
        headers=headers
    )
    assert response.status_code == 409
    assert "já existe como nome de outra skill" in response.json()["error"]["message"]

async def test_create_skill_alias_equals_name(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "admin-skill-6@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-skill-6@test.com", "password123")
    
    response = await client.post(
        "/api/v1/skills",
        json={"name": "Go", "aliases": ["GO"]},
        headers=headers
    )
    assert response.status_code in (400, 422)
    assert "não pode ser igual ao nome da skill" in response.json()["error"]["message"]

async def test_create_skill_rejects_empty_alias(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/skills",
        json={"name": "Kanban", "aliases": ["  "]},
        headers=headers,
    )

    assert response.status_code in (400, 422)
    assert "Alias vazio não é permitido." == response.json()["error"]["message"]

async def test_list_skills_and_search(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "admin-skill-7@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-skill-7@test.com", "password123")
    
    # Create some skills
    await client.post(
        "/api/v1/skills",
        json={"name": "Docker", "aliases": ["container"]},
        headers=headers
    )
    await client.post(
        "/api/v1/skills",
        json={"name": "Kubernetes", "aliases": ["k8s"]},
        headers=headers
    )
    
    # List all
    response = await client.get(
        "/api/v1/skills",
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 2
    
    # Search by name
    response = await client.get(
        "/api/v1/skills?search=docker",
        headers=headers
    )
    data = response.json()
    assert data["total"] >= 1
    assert data["data"][0]["name"] == "Docker"
    
    # Search by alias
    response = await client.get(
        "/api/v1/skills?search=k8s",
        headers=headers
    )
    data = response.json()
    assert data["total"] >= 1
    assert data["data"][0]["name"] == "Kubernetes"

async def test_list_skills_filters_by_category_and_catalog_type(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "admin-skill-filter@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "admin-skill-filter@test.com", "password123")

    db_session.add_all(
        [
            SkillCatalogModel(
                name="React Testing Library Filter",
                normalized_name="react testing library filter",
                category="frontend",
                catalog_type="tool",
            ),
            SkillCatalogModel(
                name="React Architecture Filter",
                normalized_name="react architecture filter",
                category="frontend",
                catalog_type="skill",
            ),
            SkillCatalogModel(
                name="PostgreSQL Filter",
                normalized_name="postgresql filter",
                category="database",
                catalog_type="tool",
            ),
        ],
    )
    await db_session.flush()

    response = await client.get(
        "/api/v1/skills?category=frontend&catalog_type=tool&is_active=true",
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    names = {item["name"] for item in data["data"]}
    assert "React Testing Library Filter" in names
    assert "React Architecture Filter" not in names
    assert "PostgreSQL Filter" not in names
    assert data["data"][0]["catalog_type"] == "tool"

async def test_update_skill_success(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    created = await client.post(
        "/api/v1/skills",
        json={"name": "Power BI", "aliases": ["PBI"]},
        headers=headers,
    )
    skill_id = created.json()["id"]

    response = await client.patch(
        f"/api/v1/skills/{skill_id}",
        json={
            "name": "Power BI Avançado",
            "category": "tool",
            "description": "BI corporativo",
            "aliases": ["PBI", "PowerBI"],
        },
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Power BI Avançado"
    assert data["category"] == "tool"
    assert data["description"] == "BI corporativo"
    assert sorted(alias["normalized_alias"] for alias in data["aliases"]) == ["pbi", "powerbi"]

async def test_get_skill_detail_returns_aliases(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    created = await client.post(
        "/api/v1/skills",
        json={"name": "Excel", "aliases": ["Microsoft Excel"]},
        headers=headers,
    )
    skill_id = created.json()["id"]

    response = await client.get(f"/api/v1/skills/{skill_id}", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == skill_id
    assert data["aliases"] == [
        {
            "id": data["aliases"][0]["id"],
            "alias": "Microsoft Excel",
            "normalized_alias": "microsoft excel",
        }
    ]

async def test_update_skill_rejects_alias_conflict_with_other_alias_using_normalization(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_admin_headers(client, db_session)
    await client.post(
        "/api/v1/skills",
        json={"name": "Análise de Sistemas", "aliases": ["ADS"]},
        headers=headers,
    )
    created = await client.post(
        "/api/v1/skills",
        json={"name": "Arquitetura de Software"},
        headers=headers,
    )
    skill_id = created.json()["id"]

    response = await client.patch(
        f"/api/v1/skills/{skill_id}",
        json={"aliases": ["analise de sistemas"]},
        headers=headers,
    )

    assert response.status_code == 409
    assert "já existe como nome de outra skill" in response.json()["error"]["message"]

async def test_deactivate_archive_restore_and_activate_skill(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    created = await client.post(
        "/api/v1/skills",
        json={"name": "Cobol"},
        headers=headers,
    )
    skill_id = created.json()["id"]

    deactivate_response = await client.patch(
        f"/api/v1/skills/{skill_id}/deactivate",
        headers=headers,
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["is_active"] is False

    archive_response = await client.patch(
        f"/api/v1/skills/{skill_id}/archive",
        json={"reason": "obsolete", "note": "Legado fora do fluxo atual"},
        headers=headers,
    )
    assert archive_response.status_code == 200
    archived = archive_response.json()
    assert archived["is_active"] is False
    assert archived["archived_at"] is not None
    assert archived["archive_reason"] == "obsolete"

    main_list = await client.get("/api/v1/skills", headers=headers)
    main_items = {item["id"] for item in main_list.json()["data"]}
    assert skill_id not in main_items

    archived_list = await client.get("/api/v1/skills?archived=true", headers=headers)
    archived_items = {item["id"] for item in archived_list.json()["data"]}
    assert skill_id in archived_items

    restore_response = await client.patch(
        f"/api/v1/skills/{skill_id}/restore",
        headers=headers,
    )
    assert restore_response.status_code == 200
    restored = restore_response.json()
    assert restored["archived_at"] is None
    assert restored["is_active"] is False

    inactive_list = await client.get("/api/v1/skills?is_active=false", headers=headers)
    inactive_items = {item["id"] for item in inactive_list.json()["data"]}
    assert skill_id in inactive_items

    activate_response = await client.patch(
        f"/api/v1/skills/{skill_id}/activate",
        headers=headers,
    )
    assert activate_response.status_code == 200
    assert activate_response.json()["is_active"] is True

async def test_archive_active_skill_returns_conflict(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    created = await client.post(
        "/api/v1/skills",
        json={"name": "Oracle"},
        headers=headers,
    )
    skill_id = created.json()["id"]

    response = await client.patch(
        f"/api/v1/skills/{skill_id}/archive",
        json={"reason": "cleanup"},
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "Inative a skill antes de arquivar."

async def test_list_skills_defaults_to_non_archived_and_can_filter_inactive(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    active = await client.post("/api/v1/skills", json={"name": "Git"}, headers=headers)
    inactive = await client.post("/api/v1/skills", json={"name": "SVN"}, headers=headers)

    inactive_id = inactive.json()["id"]
    active_id = active.json()["id"]

    await client.patch(f"/api/v1/skills/{inactive_id}/deactivate", headers=headers)

    default_list = await client.get("/api/v1/skills", headers=headers)
    default_ids = {item["id"] for item in default_list.json()["data"]}
    assert active_id in default_ids
    assert inactive_id in default_ids

    active_list = await client.get("/api/v1/skills?is_active=true", headers=headers)
    active_ids = {item["id"] for item in active_list.json()["data"]}
    assert active_id in active_ids
    assert inactive_id not in active_ids

    inactive_list = await client.get("/api/v1/skills?is_active=false", headers=headers)
    inactive_ids = {item["id"] for item in inactive_list.json()["data"]}
    assert inactive_id in inactive_ids
    assert active_id not in inactive_ids


async def test_validate_skill_suggestion_allowed_returns_normalized_payload(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/skills/validate-suggestion",
        json={
            "name": "Análise_de-Dados",
            "aliases": ["Business-Analysis"],
            "category": "technical",
            "description": "Leitura de indicadores",
            "source": "ai_suggestion",
        },
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["allowed"] is True
    assert payload["conflicts"] == []
    assert payload["normalized_canonical"] == "analise de dados"
    assert payload["normalized_aliases"] == ["business analysis"]
    assert payload["source"] == "ai_suggestion"


async def test_validate_skill_suggestion_blocks_duplicate_canonical_and_alias_conflicts(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_admin_headers(client, db_session)
    await client.post(
        "/api/v1/skills",
        json={"name": "Python", "aliases": ["Py"]},
        headers=headers,
    )

    response = await client.post(
        "/api/v1/skills/validate-suggestion",
        json={"name": "Py", "aliases": ["Python"], "source": "ai_suggestion"},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["allowed"] is False
    assert {item["type"] for item in payload["conflicts"]} == {
        "canonical_matches_existing_alias",
        "alias_matches_existing_canonical",
    }


async def test_validate_skill_suggestion_returns_macro_warning(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/skills/validate-suggestion",
        json={"name": "Backend", "aliases": ["APIs internas"], "source": "ai_suggestion"},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["allowed"] is True
    assert any(item["type"] == "ambiguous_macro_skill" for item in payload["warnings"])


async def test_validate_skill_suggestion_requires_authorization(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(db_session, "noauth@test.com", "password123", UserRole.ADMIN)
    response = await client.post(
        "/api/v1/skills/validate-suggestion",
        json={"name": "FastAPI", "aliases": [], "source": "ai_suggestion"},
    )

    assert response.status_code == 401


async def test_validate_skill_suggestion_rejects_viewer_role(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_headers_for_role(
        client,
        db_session,
        email="viewer-skill@test.com",
        role=UserRole.VIEWER,
    )

    response = await client.post(
        "/api/v1/skills/validate-suggestion",
        json={"name": "FastAPI", "aliases": [], "source": "ai_suggestion"},
        headers=headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permissão insuficiente para este recurso"


async def test_approve_suggestion_does_not_create_skill_when_guardrail_blocks(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_admin_headers(client, db_session)
    await client.post(
        "/api/v1/skills",
        json={"name": "JavaScript", "aliases": ["JS"]},
        headers=headers,
    )

    before = await client.get("/api/v1/skills?search=typescript", headers=headers)

    response = await client.post(
        "/api/v1/skills/approve-suggestion",
        json={
            "name": "JS",
            "aliases": ["JavaScript"],
            "category": "tool",
            "description": "Sugestão da IA",
            "source": "ai_suggestion",
            "confirm_warnings": True,
        },
        headers=headers,
    )

    after = await client.get("/api/v1/skills?search=typescript", headers=headers)

    assert response.status_code == 409
    payload = response.json()
    assert payload["error"]["code"] == "SKILL_CATALOG_GUARDRAIL_BLOCKED"
    assert "stack" not in response.text.lower()
    assert {item["type"] for item in payload["error"]["conflicts"]} == {
        "canonical_matches_existing_alias",
        "alias_matches_existing_canonical",
    }
    assert before.json()["total"] == after.json()["total"] == 0


async def test_approve_suggestion_requires_warning_confirmation(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/skills/approve-suggestion",
        json={
            "name": "Backend",
            "aliases": ["APIs internas"],
            "category": "technical",
            "source": "ai_suggestion",
            "confirm_warnings": False,
        },
        headers=headers,
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["error"]["code"] == "SKILL_CATALOG_WARNING_CONFIRMATION_REQUIRED"
    assert any(item["type"] == "ambiguous_macro_skill" for item in payload["error"]["warnings"])


async def test_approve_suggestion_creates_skill_when_allowed(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/skills/approve-suggestion",
        json={
            "name": "FastAPI",
            "aliases": ["Starlette Framework"],
            "category": "tool",
            "description": "Framework Python",
            "source": "ai_suggestion",
            "confirm_warnings": True,
        },
        headers=headers,
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["skill"]["name"] == "FastAPI"
    assert payload["skill"]["normalized_name"] == "fastapi"
    assert payload["warnings"] == []
    assert payload["validation"]["allowed"] is True

    persisted = await client.get("/api/v1/skills?search=fastapi", headers=headers)
    assert persisted.json()["total"] >= 1


async def test_approve_suggestion_does_not_create_duplicate_on_second_attempt(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _get_admin_headers(client, db_session)

    first = await client.post(
        "/api/v1/skills/approve-suggestion",
        json={
            "name": "Observabilidade Aplicada",
            "aliases": ["Telemetry Ops"],
            "category": "tool",
            "source": "ai_suggestion",
            "confirm_warnings": True,
        },
        headers=headers,
    )
    second = await client.post(
        "/api/v1/skills/approve-suggestion",
        json={
            "name": "observabilidade aplicada",
            "aliases": ["Telemetry Ops"],
            "category": "tool",
            "source": "ai_suggestion",
            "confirm_warnings": True,
        },
        headers=headers,
    )

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "SKILL_CATALOG_GUARDRAIL_BLOCKED"
