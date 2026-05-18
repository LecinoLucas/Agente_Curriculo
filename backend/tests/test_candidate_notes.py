from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_note_model import CandidateNoteModel
from tests.integration.helpers import _auth_headers, _create_active_user


MAX_NOTE_LENGTH = 2000


async def _create_candidate(
    db_session: AsyncSession,
    *,
    created_by: UUID,
    full_name: str = "Candidato Observacao",
    email: str = "observacao.candidato@example.com",
) -> CandidateModel:
    candidate = CandidateModel(
        id=uuid4(),
        full_name=full_name,
        email=email,
        created_by=created_by,
        location_country="BR",
    )
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


@pytest.mark.asyncio
async def test_recruiter_creates_candidate_note(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "recruiter.notes@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id)

    response = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers,
        json={"note_text": "Boa comunicação na triagem."},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["candidate_id"] == str(candidate.id)
    assert payload["note_text"] == "Boa comunicação na triagem."
    assert payload["visibility"] == "internal"
    assert payload["is_pinned"] is False
    assert payload["author"]["id"] == str(recruiter.id)
    assert payload["author"]["name"] == recruiter.full_name


@pytest.mark.asyncio
async def test_admin_creates_candidate_note(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(db_session, "admin.notes@example.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, admin.email, "password123")
    candidate = await _create_candidate(db_session, created_by=admin.id, email="admin.candidate@example.com")

    response = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers,
        json={"note_text": "Perfil compatível com a vaga."},
    )

    assert response.status_code == 201
    assert response.json()["author"]["id"] == str(admin.id)


@pytest.mark.asyncio
async def test_list_candidate_notes_orders_pinned_then_recent_then_id_desc(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "list.notes@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="list.candidate@example.com")

    same_time = datetime(2026, 5, 17, 10, 0, tzinfo=UTC)
    pinned_old = CandidateNoteModel(
        candidate_id=candidate.id,
        author_user_id=recruiter.id,
        note_text="Fixada antiga",
        visibility="internal",
        is_pinned=True,
        created_at=datetime(2026, 5, 16, 10, 0, tzinfo=UTC),
        updated_at=datetime(2026, 5, 16, 10, 0, tzinfo=UTC),
    )
    not_pinned_a = CandidateNoteModel(
        candidate_id=candidate.id,
        author_user_id=recruiter.id,
        note_text="Nao fixada A",
        visibility="internal",
        is_pinned=False,
        created_at=same_time,
        updated_at=same_time,
    )
    not_pinned_b = CandidateNoteModel(
        candidate_id=candidate.id,
        author_user_id=recruiter.id,
        note_text="Nao fixada B",
        visibility="internal",
        is_pinned=False,
        created_at=same_time,
        updated_at=same_time,
    )
    db_session.add_all([pinned_old, not_pinned_a, not_pinned_b])
    await db_session.commit()

    response = await client.get(f"/api/v1/candidates/{candidate.id}/notes", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["note_text"] == "Fixada antiga"
    assert payload[0]["is_pinned"] is True
    assert payload[1]["created_at"] == payload[2]["created_at"]
    assert UUID(payload[1]["id"]).int > UUID(payload[2]["id"]).int


@pytest.mark.asyncio
async def test_list_candidate_notes_ignores_deleted_at(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "deleted.notes@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="deleted.candidate@example.com")

    active_note = CandidateNoteModel(
        candidate_id=candidate.id,
        author_user_id=recruiter.id,
        note_text="Nota ativa",
        visibility="internal",
    )
    deleted_note = CandidateNoteModel(
        candidate_id=candidate.id,
        author_user_id=recruiter.id,
        note_text="Nota removida",
        visibility="internal",
        deleted_at=datetime.now(UTC),
    )
    db_session.add_all([active_note, deleted_note])
    await db_session.commit()

    response = await client.get(f"/api/v1/candidates/{candidate.id}/notes", headers=headers)
    assert response.status_code == 200
    assert [item["note_text"] for item in response.json()] == ["Nota ativa"]


@pytest.mark.asyncio
async def test_create_candidate_note_rejects_blank_text(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "blank.notes@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="blank.candidate@example.com")

    response = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers,
        json={"note_text": "   "},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_candidate_note_rejects_text_above_limit(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "length.notes@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="length.candidate@example.com")

    response = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers,
        json={"note_text": "A" * (MAX_NOTE_LENGTH + 1)},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_candidate_note_rejects_blank_text(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "edit.blank@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="edit.blank.candidate@example.com")

    created = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers,
        json={"note_text": "Texto inicial"},
    )

    response = await client.patch(
        f"/api/v1/candidates/{candidate.id}/notes/{created.json()['id']}",
        headers=headers,
        json={"note_text": "   "},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_candidate_note_returns_404_for_missing_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "missing.notes@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")

    response = await client.post(
        f"/api/v1/candidates/{uuid4()}/notes",
        headers=headers,
        json={"note_text": "Tentativa em candidato inexistente"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_viewer_receives_403_for_candidate_notes(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "creator.notes@example.com", "password123", UserRole.RECRUITER)
    viewer = await _create_active_user(db_session, "viewer.notes@example.com", "password123", UserRole.VIEWER)
    viewer_headers = await _auth_headers(client, viewer.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="viewer.candidate@example.com")

    response = await client.get(f"/api/v1/candidates/{candidate.id}/notes", headers=viewer_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_candidate_role_cannot_access_candidate_notes(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "owner.notes@example.com", "password123", UserRole.RECRUITER)
    candidate_user = await _create_active_user(db_session, "candidate.notes@example.com", "password123", UserRole.CANDIDATE)
    candidate_headers = await _auth_headers(client, candidate_user.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="role.candidate@example.com")

    response = await client.get(f"/api/v1/candidates/{candidate.id}/notes", headers=candidate_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_author_can_edit_note_and_mark_as_edited(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "edit.author@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="edit.author.candidate@example.com")

    created = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers,
        json={"note_text": "Texto inicial"},
    )
    note_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/candidates/{candidate.id}/notes/{note_id}",
        headers=headers,
        json={"note_text": "Texto atualizado"},
    )

    assert updated.status_code == 200
    assert updated.json()["note_text"] == "Texto atualizado"
    assert updated.json()["is_edited"] is True


@pytest.mark.asyncio
async def test_recruiter_cannot_edit_other_recruiter_note(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_one = await _create_active_user(db_session, "edit.one@example.com", "password123", UserRole.RECRUITER)
    recruiter_two = await _create_active_user(db_session, "edit.two@example.com", "password123", UserRole.RECRUITER)
    headers_one = await _auth_headers(client, recruiter_one.email, "password123")
    headers_two = await _auth_headers(client, recruiter_two.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter_one.id, email="edit.diff.candidate@example.com")

    created = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers_one,
        json={"note_text": "Nota do recrutador 1"},
    )

    response = await client.patch(
        f"/api/v1/candidates/{candidate.id}/notes/{created.json()['id']}",
        headers=headers_two,
        json={"note_text": "Tentativa indevida"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_edit_any_note(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "edit.admin.owner@example.com", "password123", UserRole.RECRUITER)
    admin = await _create_active_user(db_session, "edit.admin@example.com", "password123", UserRole.ADMIN)
    recruiter_headers = await _auth_headers(client, recruiter.email, "password123")
    admin_headers = await _auth_headers(client, admin.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="edit.admin.candidate@example.com")

    created = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=recruiter_headers,
        json={"note_text": "Nota do recrutador"},
    )

    response = await client.patch(
        f"/api/v1/candidates/{candidate.id}/notes/{created.json()['id']}",
        headers=admin_headers,
        json={"note_text": "Ajuste feito pelo admin"},
    )

    assert response.status_code == 200
    assert response.json()["note_text"] == "Ajuste feito pelo admin"


@pytest.mark.asyncio
async def test_patch_returns_404_for_note_belonging_to_another_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "cross.patch@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate_a = await _create_candidate(db_session, created_by=recruiter.id, email="cross.patch.a@example.com")
    candidate_b = await _create_candidate(db_session, created_by=recruiter.id, email="cross.patch.b@example.com")

    created = await client.post(
        f"/api/v1/candidates/{candidate_a.id}/notes",
        headers=headers,
        json={"note_text": "Nota A"},
    )

    response = await client.patch(
        f"/api/v1/candidates/{candidate_b.id}/notes/{created.json()['id']}",
        headers=headers,
        json={"note_text": "Tentativa cruzada"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_soft_delete_candidate_note(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "delete.notes@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="delete.candidate@example.com")

    created = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers,
        json={"note_text": "Nota para remover"},
    )
    note_id = UUID(created.json()["id"])

    deleted = await client.delete(
        f"/api/v1/candidates/{candidate.id}/notes/{note_id}",
        headers=headers,
    )
    assert deleted.status_code == 204

    db_note = await db_session.scalar(
        sa.select(CandidateNoteModel).where(CandidateNoteModel.id == note_id)
    )
    assert db_note is not None
    assert db_note.deleted_at is not None

    listed = await client.get(f"/api/v1/candidates/{candidate.id}/notes", headers=headers)
    assert listed.status_code == 200
    assert listed.json() == []


@pytest.mark.asyncio
async def test_delete_returns_404_for_note_belonging_to_another_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(db_session, "cross.delete@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate_a = await _create_candidate(db_session, created_by=recruiter.id, email="cross.delete.a@example.com")
    candidate_b = await _create_candidate(db_session, created_by=recruiter.id, email="cross.delete.b@example.com")

    created = await client.post(
        f"/api/v1/candidates/{candidate_a.id}/notes",
        headers=headers,
        json={"note_text": "Nota A"},
    )

    response = await client.delete(
        f"/api/v1/candidates/{candidate_b.id}/notes/{created.json()['id']}",
        headers=headers,
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_note_logs_do_not_include_note_text_for_create_update_delete(
    client: AsyncClient,
    db_session: AsyncSession,
    caplog: pytest.LogCaptureFixture,
) -> None:
    recruiter = await _create_active_user(db_session, "logs.notes@example.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = await _create_candidate(db_session, created_by=recruiter.id, email="logs.candidate@example.com")
    secret_text = "SEGREDO_INTERNO_NAO_LOGAR"
    secret_update_text = "SEGREDO_ATUALIZADO_NAO_LOGAR"

    caplog.set_level("INFO")

    created = await client.post(
        f"/api/v1/candidates/{candidate.id}/notes",
        headers=headers,
        json={"note_text": secret_text},
    )
    assert created.status_code == 201

    note_id = created.json()["id"]
    updated = await client.patch(
        f"/api/v1/candidates/{candidate.id}/notes/{note_id}",
        headers=headers,
        json={"note_text": secret_update_text},
    )
    assert updated.status_code == 200

    deleted = await client.delete(
        f"/api/v1/candidates/{candidate.id}/notes/{note_id}",
        headers=headers,
    )
    assert deleted.status_code == 204

    assert "candidate_note.created" in caplog.text
    assert "candidate_note.updated" in caplog.text
    assert "candidate_note.deleted" in caplog.text
    assert "changed_fields" in caplog.text
    assert "soft_delete" in caplog.text
    assert secret_text not in caplog.text
    assert secret_update_text not in caplog.text
