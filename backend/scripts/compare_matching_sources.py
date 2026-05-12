#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any
from uuid import UUID

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.application.services.matching_source_comparison_service import (  # noqa: E402
    MatchingSourceComparisonService,
    comparison_to_json_ready,
)
from src.infrastructure.database.connection import AsyncSessionFactory  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare matching results using SKILL_CATALOG_SOURCE=json and "
            "SKILL_CATALOG_SOURCE=database for the same completed analysis/job context."
        )
    )
    parser.add_argument("--job-id", required=True, type=UUID)
    parser.add_argument("--analysis-id", type=UUID)
    parser.add_argument("--candidate-id", type=UUID)
    parser.add_argument("--resume-version-id", type=UUID)
    parser.add_argument("--label", default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument(
        "--format",
        choices=("json", "pretty"),
        default="pretty",
    )
    args = parser.parse_args()
    provided = [
        args.analysis_id is not None,
        args.candidate_id is not None,
        args.resume_version_id is not None,
    ]
    if sum(provided) != 1:
        parser.error("Provide exactly one of --analysis-id, --candidate-id, or --resume-version-id.")
    return args


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    service = MatchingSourceComparisonService(AsyncSessionFactory)
    context = await service.resolve_context(
        job_id=args.job_id,
        analysis_id=args.analysis_id,
        candidate_id=args.candidate_id,
        resume_version_id=args.resume_version_id,
    )
    result = await service.compare_context_detailed(context)
    payload = comparison_to_json_ready(
        result.comparison,
        json_run=result.json_run,
        database_run=result.database_run,
    )
    if args.label:
        payload["label"] = args.label
    return payload


def _render_pretty(payload: dict[str, Any]) -> str:
    lines = [
        "Comparação de matching por fonte de catálogo:",
        f"- label: {payload.get('label') or 'n/a'}",
        f"- job_id: {payload['job_id']}",
        f"- job_title: {payload['job_title']}",
        f"- candidate_id: {payload['candidate_id']}",
        f"- candidate_name: {payload['candidate_name']}",
        f"- analysis_id: {payload['analysis_id']}",
        f"- resume_version_id: {payload['resume_version_id']}",
        f"- score_json: {payload['score_json']}",
        f"- score_database: {payload['score_database']}",
        f"- delta_score: {payload['delta_score']}",
        f"- delta_status: {payload['delta_status']}",
        f"- recommendation_json: {payload['recommendation_json']}",
        f"- recommendation_database: {payload['recommendation_database']}",
        f"- source_used_json: {payload['source_used_json']}",
        f"- source_used_database: {payload['source_used_database']}",
        f"- fallback_occurred: {payload['fallback_occurred']}",
        f"- ranking_refresh_status_json: {payload['ranking_refresh_status_json']}",
        f"- ranking_refresh_status_database: {payload['ranking_refresh_status_database']}",
        f"- skills_only_json: {payload['skills_only_json']}",
        f"- skills_only_database: {payload['skills_only_database']}",
        f"- reason_codes_diff: {payload['reason_codes_diff']}",
        f"- aliases_used_json: {len(payload['aliases_used_json'])}",
        f"- aliases_used_database: {len(payload['aliases_used_database'])}",
        f"- relations_used_json: {len(payload['relations_used_json'])}",
        f"- relations_used_database: {len(payload['relations_used_database'])}",
    ]
    return "\n".join(lines)


def main() -> int:
    args = _parse_args()
    payload = asyncio.run(_run(args))
    rendered = (
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
        if args.format == "json"
        else _render_pretty(payload)
    )
    print(rendered)

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
