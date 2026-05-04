from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


_EMAIL_RE = re.compile(
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    re.IGNORECASE,
)

_URL_RE = re.compile(
    r"https?://[^\s)>\]]+|(?:www\.)[^\s)>\]]+",
    re.IGNORECASE,
)

_PHONE_RE = re.compile(
    r"(?:\+?55[\s().-]*)?(?:\(?\d{2}\)?[\s().-]*)?(?:9?\d{4}[\s.-]?\d{4})"
)

_LOCATION_RE = re.compile(
    r"\b([A-ZÀ-Ý][A-Za-zÀ-ÿ' -]{2,60})\s*(?:[-,\/]|\s)\s*([A-Z]{2})\b"
)

_COMMON_HEADINGS = {
    "resumo",
    "summary",
    "experience",
    "experiencia",
    "experiência",
    "formacao",
    "formação",
    "education",
    "skills",
    "habilidades",
    "competencias",
    "competências",
    "contato",
    "contact",
    "projetos",
    "projects",
    "objetivo",
    "objective",
    "certificacoes",
    "certificações",
    "cursos",
}

_NON_NAME_HINTS = {
    "curriculo",
    "currículo",
    "resume",
    "cv",
    "telefone",
    "phone",
    "email",
    "contato",
    "endereco",
    "endereço",
    "linkedin",
    "github",
    "portfolio",
    "portfólio",
}

_SKILL_KEYWORDS = {
    "python",
    "java",
    "javascript",
    "typescript",
    "react",
    "node",
    "node.js",
    "sql",
    "postgresql",
    "mysql",
    "sql server",
    "oracle",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "fastapi",
    "django",
    "flask",
    "spring boot",
    "golang",
    "go",
    "c#",
    ".net",
    "php",
    "laravel",
    "git",
    "linux",
    "terraform",
    "excel",
    "power bi",
    "tableau",
    "protheus",
    "totvs",
    "sap",
    "erp",
    "atendimento",
    "suporte",
    "vendas",
    "financeiro",
    "contabilidade",
    "fiscal",
    "rh",
    "recrutamento",
    "departamento pessoal",
}

_BRAZILIAN_STATES = {
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
}


@dataclass(frozen=True)
class CandidateResumePrefill:
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_country: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    headline: str | None = None
    tags: list[str] = field(default_factory=list)
    confidence: str = "low"


def extract_candidate_prefill(text: str) -> CandidateResumePrefill:
    if not text or not text.strip():
        return CandidateResumePrefill()

    clean_text = _normalize_spaces(text)
    lines = [_clean_line(line) for line in clean_text.splitlines()]
    non_empty_lines = [line for line in lines if line]

    email = _extract_email(clean_text)
    phone = _extract_phone(clean_text)

    urls = [_normalize_url(url) for url in _URL_RE.findall(clean_text)]
    urls = [url for url in urls if url]

    linkedin_url = _first_url_containing(urls, "linkedin.com")
    github_url = _first_url_containing(urls, "github.com")
    portfolio_url = _extract_portfolio_url(urls, linkedin_url, github_url)

    full_name = _extract_name(non_empty_lines)
    headline = _extract_headline(non_empty_lines, full_name)

    location_city, location_state = _extract_location(clean_text)
    tags = _extract_tags(clean_text)
    confidence = _calculate_confidence(
        full_name=full_name,
        email=email,
        phone=phone,
        headline=headline,
    )

    return CandidateResumePrefill(
        full_name=full_name,
        email=email,
        phone=phone,
        location_city=location_city,
        location_state=location_state,
        location_country="BR" if location_city or location_state else None,
        linkedin_url=linkedin_url,
        github_url=github_url,
        portfolio_url=portfolio_url,
        headline=headline,
        tags=tags,
        confidence=confidence,
    )


def _normalize_spaces(text: str) -> str:
    text = text.replace("\u00a0", " ")
    return re.sub(r"[ \t]+", " ", text)


def _clean_line(line: str) -> str:
    return " ".join(line.strip().split())


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def _normalize_for_compare(value: str) -> str:
    return _strip_accents(value).lower().strip()


def _extract_email(text: str) -> str | None:
    match = _EMAIL_RE.search(text)
    return match.group(0).strip().lower() if match else None


def _extract_phone(text: str) -> str | None:
    for match in _PHONE_RE.finditer(text):
        raw = match.group(0).strip()
        digits = re.sub(r"\D", "", raw)

        if digits.startswith("55") and len(digits) > 11:
            national = digits[2:]
        else:
            national = digits

        if len(national) not in {10, 11}:
            continue

        ddd = national[:2]
        number = national[2:]

        if not (10 <= int(ddd) <= 99):
            continue

        if len(number) == 9:
            return f"+55 ({ddd}) {number[:5]}-{number[5:]}"
        return f"+55 ({ddd}) {number[:4]}-{number[4:]}"

    return None


def _normalize_url(url: str) -> str | None:
    clean_url = url.strip().rstrip(".,;)]}>")
    if not clean_url:
        return None

    if clean_url.lower().startswith("www."):
        clean_url = f"https://{clean_url}"

    return clean_url


def _first_url_containing(urls: list[str], fragment: str) -> str | None:
    fragment = fragment.lower()

    for url in urls:
        if fragment in url.lower():
            return url

    return None


def _extract_portfolio_url(
    urls: list[str],
    linkedin_url: str | None,
    github_url: str | None,
) -> str | None:
    ignored = {linkedin_url, github_url, None}

    for url in urls:
        lower = url.lower()

        if url in ignored:
            continue

        if any(
            blocked in lower
            for blocked in (
                "linkedin.com",
                "github.com",
                "mailto:",
                "wa.me",
                "api.whatsapp.com",
            )
        ):
            continue

        return url

    return None


def _extract_name(lines: list[str]) -> str | None:
    for line in lines[:10]:
        if not _looks_like_name_candidate(line):
            continue

        return _normalize_name(line)

    return None


def _looks_like_name_candidate(line: str) -> bool:
    normalized = _normalize_for_compare(line)

    if not normalized:
        return False

    if normalized in _COMMON_HEADINGS:
        return False

    if any(hint in normalized for hint in _NON_NAME_HINTS):
        return False

    if any(token in normalized for token in ("@", "http://", "https://", "www.", "linkedin", "github")):
        return False

    if any(char.isdigit() for char in line):
        return False

    if len(line) > 70:
        return False

    words = [word for word in re.split(r"\s+", line) if word]

    if not 2 <= len(words) <= 5:
        return False

    small_connectors = {"de", "da", "das", "do", "dos", "e"}

    valid_words = 0
    for word in words:
        cleaned = re.sub(r"[^A-Za-zÀ-ÿ'-]", "", word)

        if not cleaned:
            continue

        lowered = _normalize_for_compare(cleaned)

        if lowered in small_connectors:
            continue

        if len(cleaned) < 2:
            return False

        if not cleaned[0].isalpha():
            return False

        valid_words += 1

    return valid_words >= 2


def _normalize_name(name: str) -> str:
    connectors = {"de", "da", "das", "do", "dos", "e"}

    normalized_words: list[str] = []

    for word in name.split():
        clean_word = word.strip()

        if not clean_word:
            continue

        lower = clean_word.lower()

        if lower in connectors:
            normalized_words.append(lower)
            continue

        if clean_word.isupper() and len(clean_word) <= 3:
            normalized_words.append(clean_word)
            continue

        normalized_words.append(clean_word[:1].upper() + clean_word[1:].lower())

    return " ".join(normalized_words)


def _extract_headline(lines: list[str], full_name: str | None) -> str | None:
    normalized_name = _normalize_for_compare(full_name or "")

    for line in lines[:15]:
        normalized = _normalize_for_compare(line)

        if not normalized:
            continue

        if normalized_name and normalized == normalized_name:
            continue

        if normalized in _COMMON_HEADINGS:
            continue

        if any(token in normalized for token in ("@", "http://", "https://", "www.", "linkedin", "github")):
            continue

        if _PHONE_RE.search(line):
            continue

        if len(line) > 100:
            continue

        if _looks_like_name_candidate(line):
            continue

        return line

    return None


def _extract_location(text: str) -> tuple[str | None, str | None]:
    for match in _LOCATION_RE.finditer(text):
        city = match.group(1).strip(" ,-/")
        state = match.group(2).strip().upper()

        if state not in _BRAZILIAN_STATES:
            continue

        normalized_city = _normalize_for_compare(city)

        if normalized_city in _COMMON_HEADINGS:
            continue

        if any(char.isdigit() for char in city):
            continue

        return _normalize_city(city), state

    return None, None


def _normalize_city(city: str) -> str:
    return " ".join(part.capitalize() if part.lower() not in {"de", "da", "das", "do", "dos"} else part.lower() for part in city.split())


def _extract_tags(text: str) -> list[str]:
    normalized_text = _normalize_for_compare(text)
    found: list[str] = []

    for skill in sorted(_SKILL_KEYWORDS):
        normalized_skill = _normalize_for_compare(skill)
        pattern = r"(?<![a-z0-9+#.])" + re.escape(normalized_skill) + r"(?![a-z0-9+#.])"

        if re.search(pattern, normalized_text):
            found.append(skill)

    return found[:12]


def _calculate_confidence(
    *,
    full_name: str | None,
    email: str | None,
    phone: str | None,
    headline: str | None,
) -> str:
    score = 0

    if full_name:
        score += 2

    if email:
        score += 2

    if phone:
        score += 1

    if headline:
        score += 1

    if score >= 5:
        return "high"

    if score >= 3:
        return "medium"

    return "low"