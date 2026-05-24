#!/usr/bin/env python3
"""Generate or run safe EXPLAIN plans for the Pipeline Board query.

Safe defaults:
- dry-run by default: lists target volumes and writes SQL/report JSON only;
- never runs on production-looking environments, hosts, or database names;
- EXPLAIN ANALYZE requires both --analyze and --yes;
- no DDL is available in this script;
- no application service, endpoint, schema, frontend, or Alembic migration is changed.

Typical staging flow:

    .venv/bin/python scripts/explain_pipeline_board_queries.py
    .venv/bin/python scripts/explain_pipeline_board_queries.py --analyze --yes
    .venv/bin/python scripts/explain_pipeline_board_queries.py \\
        --job-id 00000000-0000-0000-0000-000000000000 --analyze --yes
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

BACKEND_ROOT = Path(__file__).resolve().parents[1]
VENV_PYTHON = BACKEND_ROOT / ".venv" / "bin" / "python"
if (
    VENV_PYTHON.exists()
    and Path(sys.executable).resolve() != VENV_PYTHON.resolve()
    and os.getenv("PIPELINE_BOARD_EXPLAIN_NO_VENV_REEXEC") != "1"
):
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *sys.argv])

import sqlalchemy as sa  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

TABLES_TO_COUNT = (
    "candidate_job_pipeline",
    "candidates",
    "analyses",
    "analysis_results",
    "candidate_job_scores",
    "behavioral_assessment_assignments",
    "behavioral_assessment_ai_evaluations",
    "interview_schedules",
    "interview_scorecards",
)

PROD_ENV_VALUES = {"prod", "production"}
PROD_HOST_TOKENS = ("prod", "production")
SMALL_LOCAL_BOARD_THRESHOLD = 100

PIPELINE_BOARD_SQL = """
SELECT
  p.candidate_id,
  c.full_name AS candidate_name,
  p.job_id,
  p.pipeline_stage AS stage,
  p.link_status AS status,
  p.entered_at,
  p.updated_at,
  ar.keywords AS top_skills,
  a.status AS ai_status,
  s.final_score AS job_fit_score,
  j.requires_behavioral_assessment,
  j.requires_behavioral_ai_evaluation,
  j.requires_interview,
  j.requires_scorecard,
  (
    SELECT baa.status
    FROM behavioral_assessment_assignments baa
    WHERE baa.id = (
      SELECT baa2.id
      FROM behavioral_assessment_assignments baa2
      WHERE baa2.candidate_id = p.candidate_id
        AND baa2.job_id = p.job_id
      ORDER BY baa2.created_at DESC, baa2.id DESC
      LIMIT 1
    )
    LIMIT 1
  ) AS behavioral_assessment_status,
  (
    SELECT baa.submitted_at
    FROM behavioral_assessment_assignments baa
    WHERE baa.id = (
      SELECT baa2.id
      FROM behavioral_assessment_assignments baa2
      WHERE baa2.candidate_id = p.candidate_id
        AND baa2.job_id = p.job_id
      ORDER BY baa2.created_at DESC, baa2.id DESC
      LIMIT 1
    )
    LIMIT 1
  ) AS behavioral_submitted_at,
  (
    SELECT bae.status
    FROM behavioral_assessment_ai_evaluations bae
    WHERE bae.assignment_id = (
      SELECT baa2.id
      FROM behavioral_assessment_assignments baa2
      WHERE baa2.candidate_id = p.candidate_id
        AND baa2.job_id = p.job_id
      ORDER BY baa2.created_at DESC, baa2.id DESC
      LIMIT 1
    )
    ORDER BY bae.completed_at DESC NULLS LAST, bae.created_at DESC
    LIMIT 1
  ) AS behavioral_ai_evaluation_status,
  (
    SELECT i.status
    FROM interview_schedules i
    WHERE i.candidate_id = p.candidate_id
      AND i.job_id = p.job_id
    ORDER BY i.scheduled_start DESC NULLS LAST, i.updated_at DESC
    LIMIT 1
  ) AS interview_status,
  (
    SELECT i.scheduled_start
    FROM interview_schedules i
    WHERE i.candidate_id = p.candidate_id
      AND i.job_id = p.job_id
      AND i.status IN ('scheduled', 'rescheduled')
    ORDER BY i.scheduled_start ASC, i.updated_at DESC
    LIMIT 1
  ) AS interview_scheduled_start,
  (
    SELECT sc.status
    FROM interview_scorecards sc
    WHERE sc.candidate_id = p.candidate_id
      AND sc.job_id = p.job_id
    ORDER BY sc.submitted_at DESC NULLS LAST, sc.updated_at DESC, sc.created_at DESC
    LIMIT 1
  ) AS interview_scorecard_status
FROM candidate_job_pipeline p
JOIN candidates c ON c.id = p.candidate_id
JOIN jobs j ON j.id = p.job_id
LEFT JOIN analyses a
  ON a.id = p.current_analysis_id
 AND a.job_id = p.job_id
LEFT JOIN analysis_results ar
  ON ar.analysis_id = a.id
LEFT JOIN candidate_job_scores s
  ON s.candidate_id = p.candidate_id
 AND s.job_id = p.job_id
 AND s.version_id = (
   SELECT smv.id
   FROM score_model_versions smv
   WHERE smv.is_active IS true
   LIMIT 1
 )
 AND s.source_analysis_id = p.current_analysis_id
 AND s.freshness_status = 'fresh'
WHERE p.job_id = :job_id
  AND c.deleted_at IS NULL
  AND p.relationship_status = 'active'
  AND p.pipeline_status = 'active'
  AND p.is_terminal IS false
  AND p.terminated_at IS NULL
ORDER BY p.updated_at DESC
""".strip()

BEHAVIORAL_ASSIGNMENT_SQL = """
SELECT p.candidate_id, latest_assignment.id, latest_assignment.status,
       latest_assignment.submitted_at
FROM candidate_job_pipeline p
LEFT JOIN LATERAL (
  SELECT baa.id, baa.status, baa.submitted_at
  FROM behavioral_assessment_assignments baa
  WHERE baa.candidate_id = p.candidate_id
    AND baa.job_id = p.job_id
  ORDER BY baa.created_at DESC, baa.id DESC
  LIMIT 1
) latest_assignment ON true
WHERE p.job_id = :job_id
  AND p.relationship_status = 'active'
  AND p.pipeline_status = 'active'
  AND p.is_terminal IS false
  AND p.terminated_at IS NULL
""".strip()

INTERVIEW_STATUS_SQL = """
SELECT p.candidate_id, latest_interview.status, latest_interview.scheduled_start
FROM candidate_job_pipeline p
LEFT JOIN LATERAL (
  SELECT i.status, i.scheduled_start
  FROM interview_schedules i
  WHERE i.candidate_id = p.candidate_id
    AND i.job_id = p.job_id
  ORDER BY i.scheduled_start DESC NULLS LAST, i.updated_at DESC
  LIMIT 1
) latest_interview ON true
WHERE p.job_id = :job_id
  AND p.relationship_status = 'active'
  AND p.pipeline_status = 'active'
  AND p.is_terminal IS false
  AND p.terminated_at IS NULL
""".strip()

INTERVIEW_NEXT_SQL = """
SELECT p.candidate_id, next_interview.scheduled_start
FROM candidate_job_pipeline p
LEFT JOIN LATERAL (
  SELECT i.scheduled_start
  FROM interview_schedules i
  WHERE i.candidate_id = p.candidate_id
    AND i.job_id = p.job_id
    AND i.status IN ('scheduled', 'rescheduled')
  ORDER BY i.scheduled_start ASC, i.updated_at DESC
  LIMIT 1
) next_interview ON true
WHERE p.job_id = :job_id
  AND p.relationship_status = 'active'
  AND p.pipeline_status = 'active'
  AND p.is_terminal IS false
  AND p.terminated_at IS NULL
""".strip()

SCORECARD_SQL = """
SELECT p.candidate_id, latest_scorecard.status
FROM candidate_job_pipeline p
LEFT JOIN LATERAL (
  SELECT sc.status
  FROM interview_scorecards sc
  WHERE sc.candidate_id = p.candidate_id
    AND sc.job_id = p.job_id
  ORDER BY sc.submitted_at DESC NULLS LAST, sc.updated_at DESC, sc.created_at DESC
  LIMIT 1
) latest_scorecard ON true
WHERE p.job_id = :job_id
  AND p.relationship_status = 'active'
  AND p.pipeline_status = 'active'
  AND p.is_terminal IS false
  AND p.terminated_at IS NULL
""".strip()


def load_dotenv_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


DOTENV = load_dotenv_values(BACKEND_ROOT / ".env")


def config_value(name: str, default: str | None = None) -> str | None:
    return os.getenv(name) or DOTENV.get(name) or default


def default_database_url() -> str:
    database_url = config_value("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required in environment or backend/.env.")
    return database_url


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Safely generate or execute EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "
            "for Pipeline Board queries in staging/disposable PostgreSQL."
        )
    )
    parser.add_argument(
        "--database-url",
        default=default_database_url(),
        help="Database URL. Defaults to DATABASE_URL from environment/.env.",
    )
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Run EXPLAIN ANALYZE. Dry-run only when omitted.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required with --analyze.",
    )
    parser.add_argument(
        "--job-id",
        type=UUID,
        help="Optional job_id override. Defaults to largest canonical active board.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(BACKEND_ROOT / "reports"),
        help="Directory for explain_pipeline_board_YYYYMMDD_HHMMSS.json.",
    )
    parser.add_argument(
        "--statement-timeout-ms",
        type=int,
        default=120_000,
        help="Statement timeout applied during EXPLAIN runs.",
    )
    return parser.parse_args()


def safe_url(url: str) -> str:
    return make_url(url).render_as_string(hide_password=True)


def production_hosts_from_env() -> set[str]:
    raw = os.getenv("PIPELINE_BOARD_EXPLAIN_PRODUCTION_HOSTS", "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def assert_safe_environment(database_url: str) -> None:
    env_values = {
        "APP_ENV": config_value("APP_ENV"),
        "ENVIRONMENT": config_value("ENVIRONMENT"),
        "ENV": config_value("ENV"),
        "NODE_ENV": config_value("NODE_ENV"),
    }
    production_envs = {
        name: value
        for name, value in env_values.items()
        if value and value.strip().lower() in PROD_ENV_VALUES
    }
    if production_envs:
        raise SystemExit(
            "Refusing to run: production environment detected "
            f"({production_envs})."
        )

    parsed = make_url(database_url)
    host = (parsed.host or "").lower()
    database = (parsed.database or "").lower()
    known_prod_hosts = production_hosts_from_env()
    if host in known_prod_hosts:
        raise SystemExit(
            "Refusing to run: DATABASE_URL host matches "
            "PIPELINE_BOARD_EXPLAIN_PRODUCTION_HOSTS."
        )
    if any(token in host for token in PROD_HOST_TOKENS) or any(
        token in database for token in PROD_HOST_TOKENS
    ):
        raise SystemExit(
            "Refusing to run: DATABASE_URL host/database looks production-like "
            f"({safe_url(database_url)})."
        )


def assert_confirmed(args: argparse.Namespace) -> None:
    if args.analyze and not args.yes:
        raise SystemExit("Refusing to run: --yes is required with --analyze.")


def make_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(database_url, poolclass=NullPool, pool_pre_ping=True)


def statement_items(job_id: UUID) -> list[dict[str, Any]]:
    params = {"job_id": str(job_id)}
    return [
        {
            "name": "pipeline_board_list_job_matches",
            "kind": "board",
            "sql": PIPELINE_BOARD_SQL,
            "params": params,
        },
        {
            "name": "behavioral_assignment_isolated",
            "kind": "behavioral_assignment",
            "sql": BEHAVIORAL_ASSIGNMENT_SQL,
            "params": params,
        },
        {
            "name": "interview_status_isolated",
            "kind": "interview_status",
            "sql": INTERVIEW_STATUS_SQL,
            "params": params,
        },
        {
            "name": "interview_next_scheduled_isolated",
            "kind": "interview_next",
            "sql": INTERVIEW_NEXT_SQL,
            "params": params,
        },
        {
            "name": "scorecard_isolated",
            "kind": "scorecard",
            "sql": SCORECARD_SQL,
            "params": params,
        },
    ]


async def fetch_database_identity(engine: AsyncEngine) -> dict[str, Any]:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                sa.text(
                    """
                    SELECT current_database() AS database,
                           current_user AS user,
                           inet_server_addr()::text AS host,
                           inet_server_port() AS port,
                           version() AS version
                    """
                )
            )
        ).mappings().one()
    return dict(row)


async def fetch_volumes(engine: AsyncEngine) -> dict[str, int]:
    union_sql = "\nUNION ALL\n".join(
        f"SELECT '{table}' AS table_name, count(*)::bigint AS rows FROM {table}"
        for table in TABLES_TO_COUNT
    )
    async with engine.connect() as conn:
        rows = (await conn.execute(sa.text(union_sql))).mappings().all()
    return {row["table_name"]: int(row["rows"]) for row in rows}


async def select_target(engine: AsyncEngine, job_id: UUID | None) -> dict[str, Any] | None:
    async with engine.connect() as conn:
        if job_id:
            row = (
                await conn.execute(
                    sa.text(
                        """
                        SELECT :job_id::uuid AS job_id,
                               count(*)::bigint AS active_pipeline_rows
                        FROM candidate_job_pipeline
                        WHERE job_id = :job_id
                          AND relationship_status = 'active'
                          AND pipeline_status = 'active'
                          AND is_terminal = false
                          AND terminated_at IS NULL
                        """
                    ),
                    {"job_id": str(job_id)},
                )
            ).mappings().one()
        else:
            row = (
                await conn.execute(
                    sa.text(
                        """
                        SELECT job_id, count(*)::bigint AS active_pipeline_rows
                        FROM candidate_job_pipeline
                        WHERE relationship_status = 'active'
                          AND pipeline_status = 'active'
                          AND is_terminal = false
                          AND terminated_at IS NULL
                        GROUP BY job_id
                        ORDER BY active_pipeline_rows DESC
                        LIMIT 1
                        """
                    )
                )
            ).mappings().first()
    return dict(row) if row else None


async def fetch_top_jobs(engine: AsyncEngine, limit: int = 10) -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                sa.text(
                    """
                    SELECT job_id, count(*)::bigint AS active_pipeline_rows
                    FROM candidate_job_pipeline
                    WHERE relationship_status = 'active'
                      AND pipeline_status = 'active'
                      AND is_terminal = false
                      AND terminated_at IS NULL
                    GROUP BY job_id
                    ORDER BY active_pipeline_rows DESC
                    LIMIT :limit
                    """
                ),
                {"limit": limit},
            )
        ).mappings().all()
    return [dict(row) for row in rows]


def summarize_plan(explain_json: Any) -> dict[str, Any]:
    payload = explain_json[0] if isinstance(explain_json, list) else explain_json
    plan = payload.get("Plan", {})

    def walk(node: dict[str, Any]) -> list[dict[str, Any]]:
        children = []
        for child in node.get("Plans", []) or []:
            children.extend(walk(child))
        return [node, *children]

    nodes = walk(plan) if isinstance(plan, dict) else []
    node_types = [node.get("Node Type") for node in nodes if node.get("Node Type")]
    relations = sorted(
        {
            node.get("Relation Name")
            for node in nodes
            if node.get("Relation Name") is not None
        }
    )
    indexes = sorted(
        {
            node.get("Index Name")
            for node in nodes
            if node.get("Index Name") is not None
        }
    )
    sort_nodes = [
        {
            "sort_key": node.get("Sort Key"),
            "actual_rows": node.get("Actual Rows"),
            "actual_loops": node.get("Actual Loops"),
        }
        for node in nodes
        if node.get("Node Type") == "Sort"
    ]
    loop_hotspots = [
        {
            "node_type": node.get("Node Type"),
            "relation": node.get("Relation Name"),
            "index": node.get("Index Name"),
            "actual_rows": node.get("Actual Rows"),
            "actual_loops": node.get("Actual Loops"),
            "sort_key": node.get("Sort Key"),
        }
        for node in nodes
        if (node.get("Actual Loops") or 0) > 1
    ]
    return {
        "planning_time_ms": payload.get("Planning Time"),
        "execution_time_ms": payload.get("Execution Time"),
        "top_node": plan.get("Node Type") if isinstance(plan, dict) else None,
        "plan_rows_estimate": plan.get("Plan Rows") if isinstance(plan, dict) else None,
        "actual_rows": plan.get("Actual Rows") if isinstance(plan, dict) else None,
        "shared_hit_blocks": plan.get("Shared Hit Blocks") if isinstance(plan, dict) else None,
        "shared_read_blocks": plan.get("Shared Read Blocks") if isinstance(plan, dict) else None,
        "uses_sort": "Sort" in node_types,
        "uses_seq_scan": "Seq Scan" in node_types,
        "uses_index_scan": any(
            node_type in {"Index Scan", "Index Only Scan", "Bitmap Index Scan"}
            for node_type in node_types
        ),
        "node_types": node_types,
        "relations": relations,
        "indexes": indexes,
        "sort_nodes": sort_nodes,
        "loop_hotspots": loop_hotspots,
    }


async def explain_statement(
    engine: AsyncEngine,
    sql: str,
    params: dict[str, Any],
    *,
    statement_timeout_ms: int,
) -> dict[str, Any]:
    async with engine.connect() as conn:
        await conn.execute(sa.text(f"SET statement_timeout = {statement_timeout_ms}"))
        row = (
            await conn.execute(
                sa.text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql),
                params,
            )
        ).first()
    if row is None:
        raise RuntimeError("EXPLAIN returned no rows")
    explain_json = row[0]
    return {
        "explain": explain_json,
        "summary": summarize_plan(explain_json),
    }


def make_json_safe(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): make_json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [make_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [make_json_safe(item) for item in value]
    return value


def write_report(output_dir: Path, report: dict[str, Any]) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    path = output_dir / f"explain_pipeline_board_{stamp}.json"
    path.write_text(
        json.dumps(make_json_safe(report), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return path


def print_statement_summary(statements: list[dict[str, Any]]) -> None:
    print("\nStatements:")
    for item in statements:
        print(f"- {item['name']} [{item['kind']}]")
        if "summary" in item:
            summary = item["summary"]
            print(
                "  "
                f"execution={summary.get('execution_time_ms')}ms "
                f"hit={summary.get('shared_hit_blocks')} "
                f"read={summary.get('shared_read_blocks')} "
                f"sort={summary.get('uses_sort')} "
                f"seq_scan={summary.get('uses_seq_scan')} "
                f"index={summary.get('uses_index_scan')}"
            )


def local_volume_warning(target: dict[str, Any] | None) -> str | None:
    if target is None:
        return "No canonical active pipeline rows found; no board target selected."
    active_rows = int(target.get("active_pipeline_rows") or 0)
    if active_rows < SMALL_LOCAL_BOARD_THRESHOLD:
        return (
            "Target board has fewer than "
            f"{SMALL_LOCAL_BOARD_THRESHOLD} active pipeline rows. "
            "Use this as a smoke check only, not production performance evidence."
        )
    return None


async def main() -> int:
    args = parse_args()
    assert_safe_environment(args.database_url)
    assert_confirmed(args)

    engine = make_engine(args.database_url)
    report: dict[str, Any] = {
        "created_at": datetime.now(UTC),
        "mode": "analyze" if args.analyze else "dry_run",
        "safety": {
            "yes": args.yes,
            "analyze": args.analyze,
            "ddl_available": False,
            "production_hosts_env": "PIPELINE_BOARD_EXPLAIN_PRODUCTION_HOSTS",
        },
    }

    try:
        identity = await fetch_database_identity(engine)
        volumes = await fetch_volumes(engine)
        top_jobs = await fetch_top_jobs(engine)
        target = await select_target(engine, args.job_id)
        report["database"] = {
            **identity,
            "url": safe_url(args.database_url),
            "app_env": config_value("APP_ENV"),
            "environment": config_value("ENVIRONMENT"),
            "env": config_value("ENV"),
        }
        report["volumes"] = volumes
        report["top_jobs_by_active_pipeline_rows"] = top_jobs
        report["target"] = target
        report["representativeness_warning"] = local_volume_warning(target)

        print("Database:")
        print(f"- url: {safe_url(args.database_url)}")
        print(f"- database: {identity['database']}")
        print(f"- user: {identity['user']}")
        print(f"- host: {identity['host']}:{identity['port']}")
        print(f"- app_env: {config_value('APP_ENV')}")
        print("\nVolumes:")
        for table, count in volumes.items():
            print(f"- {table}: {count}")

        if target is None:
            print("\nNo canonical active pipeline rows found; no board target selected.")
            report["statements"] = []
        else:
            job_id = target["job_id"]
            active_rows = int(target["active_pipeline_rows"])
            print("\nTarget:")
            print(f"- job_id: {job_id}")
            print(f"- active_pipeline_rows: {active_rows}")
            if report["representativeness_warning"]:
                print(f"- warning: {report['representativeness_warning']}")

            statements = statement_items(job_id)
            if args.analyze:
                for item in statements:
                    result = await explain_statement(
                        engine,
                        item["sql"],
                        item["params"],
                        statement_timeout_ms=args.statement_timeout_ms,
                    )
                    item.update(result)
            report["statements"] = statements
            print_statement_summary(statements)

        output_path = write_report(Path(args.output_dir), report)
        print(f"\nReport written: {output_path}")
        if not args.analyze:
            print("Dry-run only: no EXPLAIN ANALYZE or DDL was executed.")
        else:
            print("EXPLAIN ANALYZE executed. No DDL was executed.")
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
