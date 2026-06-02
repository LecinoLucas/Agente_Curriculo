from __future__ import annotations

import sqlalchemy as sa

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.security.cpf_identity import derive_cpf_identity


def sync_candidate_cpf_identity(
    _mapper: object,
    _connection: object,
    target: CandidateModel,
) -> None:
    identity = derive_cpf_identity(target.cpf)
    target.cpf_hash = identity.cpf_hash if identity is not None else None
    target.cpf_last4 = identity.cpf_last4 if identity is not None else None


sa.event.listen(CandidateModel, "before_insert", sync_candidate_cpf_identity)
sa.event.listen(CandidateModel, "before_update", sync_candidate_cpf_identity)
