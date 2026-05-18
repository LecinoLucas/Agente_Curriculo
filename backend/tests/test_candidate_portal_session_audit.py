from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path


ROUTERS_DIR = Path(__file__).resolve().parents[1] / "src" / "interface" / "api" / "routers"


@dataclass(frozen=True, slots=True)
class CandidatePortalRoute:
    file: str
    function: str
    method: str
    path: str
    annotation_names: frozenset[str]


# Endpoints intentionally allowed to work with an incomplete candidate session.
# Any new candidate-portal route added here must include a reason in this map.
ALLOWED_INCOMPLETE_SESSION_ENDPOINTS: dict[tuple[str, str, str, str], str] = {
    (
        "public.py",
        "get_candidate_portal_overview",
        "GET",
        "/public/candidate-portal/overview",
    ): "overview already enforces candidate_profile_incomplete through CandidatePortalService",
    (
        "public.py",
        "update_candidate_portal_profile",
        "PATCH",
        "/public/candidate-portal/profile",
    ): "candidate may need to update profile fields before completion",
    (
        "public.py",
        "upload_candidate_portal_resume",
        "POST",
        "/public/candidate-portal/resume",
    ): "candidate may need to upload the initial resume before completion",
    (
        "candidate_behavioral_assessments.py",
        "list_behavioral_assessments",
        "GET",
        "/candidate-portal/behavioral-assessments",
    ): "candidate must access pending behavioral assessments even with incomplete profile",
    (
        "candidate_behavioral_assessments.py",
        "get_behavioral_assessment",
        "GET",
        "/candidate-portal/behavioral-assessments/{assignment_id}",
    ): "candidate must access own behavioral assessment detail during onboarding",
    (
        "candidate_behavioral_assessments.py",
        "start_behavioral_assessment",
        "POST",
        "/candidate-portal/behavioral-assessments/{assignment_id}/start",
    ): "candidate must be able to start mandatory behavioral assessment before full profile completion",
    (
        "candidate_behavioral_assessments.py",
        "save_behavioral_answers",
        "PUT",
        "/candidate-portal/behavioral-assessments/{assignment_id}/answers",
    ): "candidate must save own behavioral answers before full profile completion",
    (
        "candidate_behavioral_assessments.py",
        "submit_behavioral_assessment",
        "POST",
        "/candidate-portal/behavioral-assessments/{assignment_id}/submit",
    ): "candidate must submit own behavioral assessment before full profile completion",
}


def _literal_string(node: ast.AST | None) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return ""


def _decorator_route(decorator: ast.AST) -> tuple[str, str] | None:
    if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
        return None
    method = decorator.func.attr.upper()
    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        return None
    path = _literal_string(decorator.args[0]) if decorator.args else ""
    return method, path


def _router_prefix(tree: ast.Module) -> str:
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "router" for target in node.targets):
            continue
        if not isinstance(node.value, ast.Call):
            continue
        for keyword in node.value.keywords:
            if keyword.arg == "prefix":
                return _literal_string(keyword.value)
    return ""


def _annotation_names(function: ast.AsyncFunctionDef | ast.FunctionDef) -> frozenset[str]:
    names: set[str] = set()
    for arg in function.args.args + function.args.kwonlyargs:
        if arg.annotation is not None:
            names.add(ast.unparse(arg.annotation))
    return frozenset(names)


def _candidate_portal_routes() -> list[CandidatePortalRoute]:
    routes: list[CandidatePortalRoute] = []
    for path in sorted(ROUTERS_DIR.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        prefix = _router_prefix(tree)
        for node in tree.body:
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            for decorator in node.decorator_list:
                route = _decorator_route(decorator)
                if route is None:
                    continue
                method, route_path = route
                full_path = f"{prefix}{route_path}"
                if "candidate-portal" not in full_path:
                    continue
                routes.append(
                    CandidatePortalRoute(
                        file=path.name,
                        function=node.name,
                        method=method,
                        path=full_path,
                        annotation_names=_annotation_names(node),
                    )
                )
    return routes


def test_candidate_portal_complete_routes_require_complete_candidate_session() -> None:
    violations: list[str] = []
    for route in _candidate_portal_routes():
        route_key = (route.file, route.function, route.method, route.path)
        if route_key in ALLOWED_INCOMPLETE_SESSION_ENDPOINTS:
            continue

        uses_incomplete_session = "CurrentCandidateSession" in route.annotation_names
        uses_complete_session = "CurrentCompleteCandidateSession" in route.annotation_names
        if uses_incomplete_session or not uses_complete_session:
            violations.append(
                f"{route.file}::{route.function} {route.method} {route.path} "
                "deve usar CurrentCompleteCandidateSession ou ser adicionado explicitamente "
                "em ALLOWED_INCOMPLETE_SESSION_ENDPOINTS com justificativa."
            )

    assert not violations, (
        "Endpoints do portal completo do candidato devem bloquear perfis incompletos.\n"
        + "\n".join(violations)
    )


def test_candidate_portal_incomplete_session_allowlist_still_matches_existing_routes() -> None:
    existing = {(route.file, route.function, route.method, route.path) for route in _candidate_portal_routes()}
    stale_allowlist = sorted(set(ALLOWED_INCOMPLETE_SESSION_ENDPOINTS) - existing)

    assert not stale_allowlist, (
        "Allowlist de CurrentCandidateSession contém endpoints inexistentes; "
        "remova ou atualize as exceções:\n"
        + "\n".join(f"{item[0]}::{item[1]} {item[2]} {item[3]}" for item in stale_allowlist)
    )
