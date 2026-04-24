from __future__ import annotations

import re
from dataclasses import dataclass, field


_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_URL_RE = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)
_PHONE_RE = re.compile(r"(?:(?:\+?\d{1,3})?[\s().-]*)?(?:\d[\s().-]*){10,14}")
_LOCATION_RE = re.compile(
    r"\b([A-ZÀ-Ý][A-Za-zÀ-ÿ' -]{1,60})\s*[-,\/]\s*([A-Z]{2})\b"
)

_COMMON_HEADINGS = {
    "resumo",
    "summary",
    "experience",
    "experiencia",
    "formacao",
    "education",
    "skills",
    "habilidades",
    "contato",
    "contact",
    "projetos",
    "projects",
}

_SKILL_KEYWORDS = [
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
    "aws",
    "docker",
    "kubernetes",
    "fastapi",
    "django",
    "flask",
    "java spring",
    "spring boot",
    "golang",
    "c#",
    ".net",
    "php",
    "laravel",
    "git",
    "linux",
    "terraform",
    "azure",
    "gcp",
]


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


def extract_candidate_prefill(text: str) -> CandidateResumePrefill:
    lines = [_clean_line(line) for line in text.splitlines()]
    non_empty_lines = [line for line in lines if line]
    lowered_text = text.lower()

    email = _first_match(_EMAIL_RE, text)
    phone = _extract_phone(text)
    urls = _URL_RE.findall(text)
    linkedin_url = _first_url_containing(urls, "linkedin.com")
    github_url = _first_url_containing(urls, "github.com")
    portfolio_url = _extract_portfolio_url(urls, linkedin_url, github_url)
    full_name = _extract_name(non_empty_lines)
    headline = _extract_headline(non_empty_lines, full_name)
    location_city, location_state = _extract_location(text)
    tags = sorted({skill for skill in _SKILL_KEYWORDS if skill in lowered_text})[:12]

    return CandidateResumePrefill(
        full_name=full_name,
        email=email.lower() if email else None,
        phone=phone,
        location_city=location_city,
        location_state=location_state,
        location_country="BR" if location_city or location_state else None,
        linkedin_url=linkedin_url,
        github_url=github_url,
        portfolio_url=portfolio_url,
        headline=headline,
        tags=tags,
    )


def _clean_line(line: str) -> str:
    return " ".join(line.strip().split())


def _first_match(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    return match.group(0).strip() if match else None


def _extract_phone(text: str) -> str | None:
    for match in _PHONE_RE.finditer(text):
        candidate = match.group(0).strip()
        digits = re.sub(r"\D", "", candidate)
        if 10 <= len(digits) <= 13:
            return candidate
    return None


def _first_url_containing(urls: list[str], fragment: str) -> str | None:
    for url in urls:
        if fragment in url.lower():
            return url.rstrip(".,;")
    return None


def _extract_portfolio_url(
    urls: list[str],
    linkedin_url: str | None,
    github_url: str | None,
) -> str | None:
    ignored = {linkedin_url, github_url, None}
    for url in urls:
        clean_url = url.rstrip(".,;")
        if clean_url not in ignored:
            return clean_url
    return None


def _extract_name(lines: list[str]) -> str | None:
    for line in lines[:8]:
        normalized = line.lower()
        if any(token in normalized for token in ("@", "http://", "https://", "linkedin", "github")):
            continue
        if normalized in _COMMON_HEADINGS:
            continue
        if any(char.isdigit() for char in line):
            continue
        words = [word for word in re.split(r"\s+", line) if word]
        if not 2 <= len(words) <= 5:
            continue
        if len(line) > 70:
            continue
        return line.title()
    return None


def _extract_headline(lines: list[str], full_name: str | None) -> str | None:
    for line in lines[:12]:
        if not line or line == full_name:
            continue
        lower = line.lower()
        if any(token in lower for token in ("@", "http://", "https://", "linkedin", "github")):
            continue
        if lower in _COMMON_HEADINGS:
            continue
        if len(line) > 90:
            continue
        return line
    return None


def _extract_location(text: str) -> tuple[str | None, str | None]:
    match = _LOCATION_RE.search(text)
    if not match:
        return None, None
    city = match.group(1).strip()
    state = match.group(2).strip().upper()
    return city, state
