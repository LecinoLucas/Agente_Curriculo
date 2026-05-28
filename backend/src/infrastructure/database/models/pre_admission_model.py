from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

PRE_ADMISSION_STATUSES = (
    "'draft', 'offer_preparing', 'offer_sent', 'offer_accepted', 'offer_declined', "
    "'documents_pending', 'documents_received', 'ready_for_admission', 'admitted', 'dismissed', 'cancelled'"
)
PRE_ADMISSION_ITEM_TYPES = (
    "'cpf', 'rg', 'comprovante_endereco', 'carteira_trabalho', 'pis', "
    "'titulo_eleitor', 'certificado_reservista', 'exame_admissional', 'dados_bancarios', 'other'"
)
PRE_ADMISSION_ITEM_STATUSES = "'pending', 'received', 'approved', 'rejected', 'waived'"
PRE_ADMISSION_DOCUMENT_STATUSES = "'uploaded', 'approved', 'rejected', 'replaced'"


class PreAdmissionChecklistTemplateModel(Base):
    __tablename__ = "pre_admission_checklist_templates"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(sa.String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text)
    admission_type: Mapped[str | None] = mapped_column(sa.String(80))
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
    )
    is_default: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=False,
        server_default=sa.text("false"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    items: Mapped[list["PreAdmissionChecklistTemplateItemModel"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="PreAdmissionChecklistTemplateItemModel.display_order",
    )

    __table_args__ = (
        sa.Index("idx_pre_admission_checklist_templates_active", "is_active"),
        sa.Index(
            "uq_pre_admission_checklist_templates_default_active",
            "is_default",
            unique=True,
            postgresql_where=sa.text("is_default = true AND is_active = true"),
            sqlite_where=sa.text("is_default = 1 AND is_active = 1"),
        ),
    )


class PreAdmissionChecklistTemplateItemModel(Base):
    __tablename__ = "pre_admission_checklist_template_items"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    template_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("pre_admission_checklist_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    document_key: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    title: Mapped[str] = mapped_column(sa.String(180), nullable=False)
    candidate_description: Mapped[str | None] = mapped_column(sa.Text)
    is_required: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
    )
    accepted_file_types: Mapped[list[str]] = mapped_column(
        JSONB_COMPAT,
        nullable=False,
        default=list,
    )
    max_file_size_mb: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        default=10,
        server_default="10",
    )
    display_order: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    template: Mapped[PreAdmissionChecklistTemplateModel] = relationship(back_populates="items")

    __table_args__ = (
        sa.Index("idx_pre_admission_checklist_template_items_template", "template_id"),
        sa.Index(
            "idx_pre_admission_checklist_template_items_template_order",
            "template_id",
            "display_order",
        ),
    )


class PreAdmissionCaseModel(Base):
    __tablename__ = "pre_admission_cases"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    hiring_decision_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidate_job_hiring_decisions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    checklist_template_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("pre_admission_checklist_templates.id", ondelete="SET NULL"),
    )
    checklist_template_name: Mapped[str | None] = mapped_column(sa.String(180))
    status: Mapped[str] = mapped_column(sa.String(40), nullable=False, server_default="draft")
    salary_offer: Mapped[Decimal | None] = mapped_column(sa.Numeric(12, 2))
    start_date: Mapped[date | None] = mapped_column(sa.Date)
    work_model: Mapped[str | None] = mapped_column(sa.String(80))
    notes: Mapped[str | None] = mapped_column(sa.Text)
    created_by: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"))
    ready_for_export: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=False,
        server_default=sa.text("false"),
    )
    ready_for_export_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    ready_for_export_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    closed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    dismissed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    dismissal_reason: Mapped[str | None] = mapped_column(sa.Text)

    checklist_items: Mapped[list["PreAdmissionChecklistItemModel"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="PreAdmissionChecklistItemModel.created_at",
    )

    __table_args__ = (
        sa.CheckConstraint(f"status IN ({PRE_ADMISSION_STATUSES})", name="ck_pre_admission_cases_status"),
        sa.UniqueConstraint("candidate_id", "job_id", "hiring_decision_id", name="uq_pre_admission_case_decision"),
        sa.Index(
            "uq_pre_admission_active_candidate_job",
            "candidate_id",
            "job_id",
            unique=True,
            postgresql_where=sa.text("status NOT IN ('admitted', 'dismissed', 'cancelled', 'offer_declined')"),
            sqlite_where=sa.text("status NOT IN ('admitted', 'dismissed', 'cancelled', 'offer_declined')"),
        ),
        sa.Index("idx_pre_admission_cases_job_candidate", "job_id", "candidate_id"),
        sa.Index("idx_pre_admission_cases_status", "status"),
        sa.Index("idx_pre_admission_cases_ready_for_export", "ready_for_export"),
    )


class PreAdmissionChecklistItemModel(Base):
    __tablename__ = "pre_admission_checklist_items"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    case_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("pre_admission_cases.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_item_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("pre_admission_checklist_template_items.id", ondelete="SET NULL"),
    )
    document_key: Mapped[str] = mapped_column(sa.String(120), nullable=False, server_default="other")
    item_type: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    title: Mapped[str] = mapped_column(sa.String(180), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="pending")
    required: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.text("true"))
    notes: Mapped[str | None] = mapped_column(sa.Text)
    candidate_description: Mapped[str | None] = mapped_column(sa.Text)
    accepted_file_types: Mapped[list[str]] = mapped_column(
        JSONB_COMPAT,
        nullable=False,
        default=list,
    )
    max_file_size_mb: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        default=10,
        server_default="10",
    )
    display_order: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    case: Mapped[PreAdmissionCaseModel] = relationship(back_populates="checklist_items")
    documents: Mapped[list["PreAdmissionDocumentModel"]] = relationship(
        back_populates="checklist_item",
        cascade="all, delete-orphan",
        order_by="PreAdmissionDocumentModel.uploaded_at.desc()",
    )

    __table_args__ = (
        sa.CheckConstraint(f"item_type IN ({PRE_ADMISSION_ITEM_TYPES})", name="ck_pre_admission_items_type"),
        sa.CheckConstraint(f"status IN ({PRE_ADMISSION_ITEM_STATUSES})", name="ck_pre_admission_items_status"),
        sa.Index("idx_pre_admission_items_case", "case_id"),
        sa.Index("idx_pre_admission_items_case_order", "case_id", "display_order"),
    )


class PreAdmissionEventModel(Base):
    __tablename__ = "pre_admission_events"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    case_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("pre_admission_cases.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(sa.String(80), nullable=False)
    actor_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"))
    payload_json: Mapped[dict | None] = mapped_column(JSONB_COMPAT)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.Index("idx_pre_admission_events_case_created", "case_id", "created_at"),
    )


class PreAdmissionDocumentModel(Base):
    __tablename__ = "pre_admission_documents"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    case_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("pre_admission_cases.id", ondelete="CASCADE"),
        nullable=False,
    )
    checklist_item_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("pre_admission_checklist_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    original_filename: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(sa.String(600), nullable=False)
    mime_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="uploaded")
    uploaded_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    reviewed_by: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"))
    review_notes: Mapped[str | None] = mapped_column(sa.Text)
    rejection_reason_public: Mapped[str | None] = mapped_column(sa.Text)
    retention_until: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    deleted_by: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"))
    deletion_reason: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    checklist_item: Mapped[PreAdmissionChecklistItemModel] = relationship(back_populates="documents")

    __table_args__ = (
        sa.CheckConstraint(f"status IN ({PRE_ADMISSION_DOCUMENT_STATUSES})", name="ck_pre_admission_documents_status"),
        sa.Index("idx_pre_admission_documents_case", "case_id"),
        sa.Index("idx_pre_admission_documents_item", "checklist_item_id"),
        sa.Index("idx_pre_admission_documents_candidate", "candidate_id"),
    )
