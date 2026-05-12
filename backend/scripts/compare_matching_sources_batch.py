#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any
from uuid import UUID

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.application.services.matching_source_comparison_service import (  # noqa: E402
    MatchingComparisonContext,
    build_batch_report,
)
from src.application.services.matching_source_comparison_service import (  # noqa: E402
    MatchingSourceComparisonService,
)
from src.infrastructure.database.connection import AsyncSessionFactory  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run batch comparison between json and database skill catalogs. "
            "Warning: this script is not read-only pure; depending on cache state, "
            "it may trigger job profiling and ranking recomputation while collecting comparisons."
        )
    )
    parser.add_argument("--limit", type=int, default=15)
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Optional JSON file with explicit contexts.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("reports/matching_source_batch_report.json"),
    )
    parser.add_argument(
        "--format",
        choices=("json", "pretty"),
        default="pretty",
    )
    return parser.parse_args()


async def _load_contexts(
    service: MatchingSourceComparisonService,
    args: argparse.Namespace,
) -> list[MatchingComparisonContext]:
    if args.input is None:
        return await service.discover_contexts(limit=args.limit)

    raw = json.loads(args.input.read_text(encoding="utf-8"))
    items = raw.get("cases") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        raise ValueError("Input file must contain a JSON array or an object with 'cases'.")

    contexts: list[MatchingComparisonContext] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        context = await service.resolve_context(
            job_id=UUID(str(item["job_id"])),
            analysis_id=UUID(str(item["analysis_id"])) if item.get("analysis_id") else None,
            candidate_id=UUID(str(item["candidate_id"])) if item.get("candidate_id") else None,
            resume_version_id=(
                UUID(str(item["resume_version_id"])) if item.get("resume_version_id") else None
            ),
        )
        contexts.append(context)
        if len(contexts) >= args.limit:
            break
    return contexts


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    service = MatchingSourceComparisonService(AsyncSessionFactory)
    contexts = await _load_contexts(service, args)
    report = await service.compare_batch(contexts)
    return {
        "summary": asdict(report.summary),
        "cases": [asdict(case) for case in report.cases],
    }


def _render_pretty(payload: dict[str, Any]) -> str:
    summary = payload["summary"]
    lines = [
        "Comparação em lote de matching por fonte de catálogo:",
        f"- total_cases: {summary['total_cases']}",
        f"- acceptable_cases: {summary['acceptable_cases']}",
        f"- review_cases: {summary['review_cases']}",
        f"- blocked_cases: {summary['blocked_cases']}",
        f"- max_delta: {summary['max_delta']}",
        f"- avg_delta: {summary['avg_delta']}",
        f"- changed_recommendations_count: {summary['changed_recommendations_count']}",
        f"- fallback_count: {summary['fallback_count']}",
        f"- missing_required_skill_cases: {summary['missing_required_skill_cases']}",
        "",
    ]
    for case in payload["cases"]:
        lines.extend(
            [
                f"* {case['job_title']} | {case['candidate_name']}",
                f"  - classification: {case['classification']}",
                f"  - delta_score: {case['delta_score']}",
                f"  - recommendation: {case['recommendation_json']} -> {case['recommendation_database']}",
                f"  - required_missing_json: {case['required_skills_missing_json']}",
                f"  - required_missing_database: {case['required_skills_missing_database']}",
                f"  - fallback_occurred: {case['fallback_occurred']}",
                f"  - notes: {case['notes']}",
            ]
        )
    return "\n".join(lines)


def main() -> int:
    args = _parse_args()
    print(
        "Aviso: compare_matching_sources_batch.py nao e read-only puro e pode acionar "
        "job_profiler/recompute de ranking se a vaga nao estiver com cache quente.",
        file=sys.stderr,
    )
    payload = asyncio.run(_run(args))
    rendered = (
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
        if args.format == "json"
        else _render_pretty(payload)
    )
    print(rendered)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
