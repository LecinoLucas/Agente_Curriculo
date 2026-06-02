from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admin_assistant_failure_service import (
    AdminAssistantFailureService,
    FailureListQuery,
)
from src.application.services.admin_assistant_service import (
    AdminAssistantService,
    SessionListQuery,
)
from src.application.services.admin_assistant_settings_service import (
    AdminAssistantSettingsService,
    AssistantContentNotEditableError,
    QuickReplyQuery,
    StateContentQuery,
)
from src.interface.api.dependencies import AdminOnly, HrRecruiterOrAdmin, get_db
from src.interface.api.schemas.admin_assistant_schemas import (
    AdminAssistantFailureDetail,
    AdminAssistantFailureListItem,
    AdminAssistantFailurePatch,
    AdminAssistantQuickReplyItem,
    AdminAssistantQuickReplyPatch,
    AdminAssistantSettingItem,
    AdminAssistantSettingPatch,
    AdminAssistantStateContentItem,
    AdminAssistantStateContentPatch,
    AdminAssistantStateItem,
    AdminMessageItem,
    AdminSessionDetail,
    AdminSessionListItem,
)
from src.interface.api.schemas.common import PaginatedResponse

router = APIRouter(prefix="/admin/assistant", tags=["admin-assistant"])


def _svc(db: AsyncSession = Depends(get_db)) -> AdminAssistantService:
    return AdminAssistantService(db)


def _failure_svc(db: AsyncSession = Depends(get_db)) -> AdminAssistantFailureService:
    return AdminAssistantFailureService(db)


def _settings_svc(db: AsyncSession = Depends(get_db)) -> AdminAssistantSettingsService:
    return AdminAssistantSettingsService(db)


@router.get("/failures", response_model=PaginatedResponse[AdminAssistantFailureListItem])
async def list_failures(
    _current_user: HrRecruiterOrAdmin,
    status: str | None = Query(default=None),
    reason: str | None = Query(default=None),
    classification: str | None = Query(default=None),
    state: str | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    session_id: UUID | None = Query(default=None),
    has_candidate: bool | None = Query(default=None),
    has_application: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    svc: AdminAssistantFailureService = Depends(_failure_svc),
) -> PaginatedResponse[AdminAssistantFailureListItem]:
    return await svc.list_failures(
        FailureListQuery(
            page=page,
            page_size=page_size,
            status=status,
            reason=reason,
            classification=classification,
            state=state,
            from_date=from_date,
            to_date=to_date,
            session_id=session_id,
            has_candidate=has_candidate,
            has_application=has_application,
        )
    )


@router.get("/failures/{failure_id}", response_model=AdminAssistantFailureDetail)
async def get_failure(
    failure_id: UUID,
    current_user: HrRecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdminAssistantFailureDetail:
    svc = AdminAssistantFailureService(db)
    detail = await svc.get_failure(failure_id, actor_id=current_user.id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Falha não encontrada.")
    await db.commit()
    return detail


@router.patch("/failures/{failure_id}", response_model=AdminAssistantFailureDetail)
async def update_failure(
    failure_id: UUID,
    body: AdminAssistantFailurePatch,
    current_user: HrRecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdminAssistantFailureDetail:
    svc = AdminAssistantFailureService(db)
    detail = await svc.update_failure(failure_id, body, actor_id=current_user.id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Falha não encontrada.")
    await db.commit()
    return detail


@router.get("/states", response_model=list[AdminAssistantStateItem])
async def list_assistant_states(
    _current_user: HrRecruiterOrAdmin,
    svc: AdminAssistantSettingsService = Depends(_settings_svc),
) -> list[AdminAssistantStateItem]:
    return await svc.list_states()


@router.get("/state-contents", response_model=list[AdminAssistantStateContentItem])
async def list_assistant_state_contents(
    _current_user: HrRecruiterOrAdmin,
    state: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    is_editable: bool | None = Query(default=None),
    svc: AdminAssistantSettingsService = Depends(_settings_svc),
) -> list[AdminAssistantStateContentItem]:
    return await svc.list_state_contents(
        StateContentQuery(
            state=state,
            is_active=is_active,
            is_editable=is_editable,
        )
    )


@router.get(
    "/state-contents/{state}",
    response_model=AdminAssistantStateContentItem,
)
async def get_assistant_state_content(
    state: str,
    _current_user: HrRecruiterOrAdmin,
    svc: AdminAssistantSettingsService = Depends(_settings_svc),
) -> AdminAssistantStateContentItem:
    detail = await svc.get_state_content(state)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conteúdo do estado não encontrado.",
        )
    return detail


@router.get("/quick-replies", response_model=list[AdminAssistantQuickReplyItem])
async def list_assistant_quick_replies(
    _current_user: HrRecruiterOrAdmin,
    state: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    svc: AdminAssistantSettingsService = Depends(_settings_svc),
) -> list[AdminAssistantQuickReplyItem]:
    return await svc.list_quick_replies(
        QuickReplyQuery(
            state=state,
            is_active=is_active,
        )
    )


@router.get("/settings", response_model=list[AdminAssistantSettingItem])
async def list_assistant_settings(
    _current_user: HrRecruiterOrAdmin,
    svc: AdminAssistantSettingsService = Depends(_settings_svc),
) -> list[AdminAssistantSettingItem]:
    return await svc.list_settings()


@router.patch(
    "/state-contents/{state}",
    response_model=AdminAssistantStateContentItem,
)
async def patch_assistant_state_content(
    state: str,
    body: AdminAssistantStateContentPatch,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AdminAssistantStateContentItem:
    svc = AdminAssistantSettingsService(db)
    try:
        item = await svc.update_state_content(state, body, actor_id=current_user.id)
    except AssistantContentNotEditableError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conteúdo do estado não encontrado.",
        )
    await db.commit()
    return item


@router.patch(
    "/quick-replies/{quick_reply_id}",
    response_model=AdminAssistantQuickReplyItem,
)
async def patch_assistant_quick_reply(
    quick_reply_id: UUID,
    body: AdminAssistantQuickReplyPatch,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AdminAssistantQuickReplyItem:
    svc = AdminAssistantSettingsService(db)
    try:
        item = await svc.update_quick_reply(quick_reply_id, body, actor_id=current_user.id)
    except AssistantContentNotEditableError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quick reply não encontrada.",
        )
    await db.commit()
    return item


@router.patch("/settings/{key}", response_model=AdminAssistantSettingItem)
async def patch_assistant_setting(
    key: str,
    body: AdminAssistantSettingPatch,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AdminAssistantSettingItem:
    svc = AdminAssistantSettingsService(db)
    try:
        item = await svc.update_setting(key, body.value_json, actor_id=current_user.id)
    except AssistantContentNotEditableError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Configuração não encontrada.",
        )
    await db.commit()
    return item


@router.get("/sessions", response_model=PaginatedResponse[AdminSessionListItem])
async def list_sessions(
    _current_user: HrRecruiterOrAdmin,
    status: str | None = Query(default=None),
    current_state: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    has_application: bool | None = Query(default=None),
    has_pipeline: bool | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    svc: AdminAssistantService = Depends(_svc),
) -> PaginatedResponse[AdminSessionListItem]:
    return await svc.list_sessions(
        SessionListQuery(
            page=page,
            page_size=page_size,
            status=status,
            current_state=current_state,
            channel=channel,
            has_application=has_application,
            has_pipeline=has_pipeline,
            from_date=from_date,
            to_date=to_date,
        )
    )


@router.get("/sessions/{session_id}", response_model=AdminSessionDetail)
async def get_session(
    session_id: UUID,
    current_user: HrRecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdminSessionDetail:
    svc = AdminAssistantService(db)
    detail = await svc.get_session(session_id, actor_id=current_user.id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada.")
    await db.commit()
    return detail


@router.get(
    "/sessions/{session_id}/messages",
    response_model=list[AdminMessageItem],
)
async def list_session_messages(
    session_id: UUID,
    _current_user: HrRecruiterOrAdmin,
    svc: AdminAssistantService = Depends(_svc),
) -> list[AdminMessageItem]:
    return await svc.list_messages(session_id)
