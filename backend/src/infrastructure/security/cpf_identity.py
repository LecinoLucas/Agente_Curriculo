from __future__ import annotations

import re
from dataclasses import dataclass
from hashlib import sha256


@dataclass(frozen=True)
class CpfIdentity:
    digits: str
    cpf_hash: str
    cpf_last4: str


def normalize_cpf_digits(cpf: str | None) -> str | None:
    if cpf is None:
        return None
    digits = re.sub(r"\D", "", cpf)
    return digits if len(digits) == 11 else None


def derive_cpf_identity(cpf: str | None) -> CpfIdentity | None:
    digits = normalize_cpf_digits(cpf)
    if digits is None:
        return None
    return CpfIdentity(
        digits=digits,
        cpf_hash=sha256(digits.encode("utf-8")).hexdigest(),
        cpf_last4=digits[-4:],
    )
