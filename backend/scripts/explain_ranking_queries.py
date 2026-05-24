#!/usr/bin/env python
"""Generate or run EXPLAIN plans for the current ranking queries.

Safe defaults:
- dry-run by default: lists target volumes and writes SQL/report JSON only;
- never runs on production-looking environments or hosts;
- EXPLAIN ANALYZE requires --execute-analyze --yes;
- CREATE/DROP INDEX CONCURRENTLY require explicit flags and --yes;
- no application service, endpoint, schema, or Alembic migration is changed.

Typical staging flow:

    .venv/bin/python scripts/explain_ranking_queries.py
    .venv/bin/python scripts/explain_ranking_queries.py --execute-analyze --yes
    .venv/bin/python scripts/explain_ranking_queries.py \\
        --create-hypothetical-index --execute-analyze --yes
    .venv/bin/python scripts/explain_ranking_queries.py \\
        --drop-hypothetical-index --yes
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

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.infrastructure.database.models.candidate_model import CandidateModel  # noqa: E402
from src.infrastructure.database.models.candidate_job_pipeline_model import (  # noqa: E402
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import JobModel  # noqa: E402
from src.infrastructure.database.models.profile_analysis_model import (  # noqa: E402
    CandidateJobMatchModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel  # noqa: E402

TABLES_TO_COUNT = (
    "candidate_job_scores",
    "candidate_job_match",
    "candidate_job_pipeline",
    "candidates",
    "analyses",
)

HYPOTHETICAL_INDEX_NAME = "idx_candidate_job_scores_job_version_rank"
CREATE_HYPOTHETICAL_INDEX_SQL = f"""
CREATE INDEX CONCURRENTLY {HYPOTHETICAL_INDEX_NAME}
ON candidate_job_scores (
  job_id,
  version_id,
  final_score DESC,
  computed_at DESC,
  candidate_id
)
WHERE final_score IS NOT NULL
""".strip()
DROP_HYPOTHETICAL_INDEX_SQL = (
    f"DROP INDEX CONCURRENTLY IF EXISTS {HYPOTHETICAL_INDEX_NAME}"
)

PROD_ENV_VALUES = {"prod", "production"}
PROD_HOST_TOKENS = ("prod", "production")
OFFSETS = (0, 1000, 10000)


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
            "for ranking queries in staging/disposable PostgreSQL."
        )
    )
    parser.add_argument(
        "--database-url",
        default=default_database_url(),
        help="Database URL. Defaults to DATABASE_URL from environment/.env.",
    )
    parser.add_argument(
        "--execute-analyze",
        action="store_true",
        help="Run EXPLAIN ANALYZE. Dry-run only when omitted.",
    )
    parser.add_argument(
        "--create-hypothetical-index",
        action="store_true",
        help="Create the ranking index candidate before measuring.",
    )
    parser.add_argument(
        "--drop-hypothetical-index",
        action="store_true",
        help="Drop the ranking index candidate.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required for EXPLAIN ANALYZE or any DDL action.",
    )
    parser.add_argument(
        "--job-id",
        type=UUID,
        help="Optional job_id override. Defaults to largest job/version by scores.",
    )
    parser.add_argument(
        "--version-id",
        type=UUID,
        help="Optional score model version_id override. Requires --job-id.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(BACKEND_ROOT / "reports"),
        help="Directory for explain_ranking_YYYYMMDD_HHMMSS.json.",
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
    raw = os.getenv("RANKING_EXPLAIN_PRODUCTION_HOSTS", "")
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
            "RANKING_EXPLAIN_PRODUCTION_HOSTS."
        )
    if any(token in host for token in PROD_HOST_TOKENS) or any(
        token in database for token in PROD_HOST_TOKENS
    ):
        raise SystemExit(
            "Refusing to run: DATABASE_URL host/database looks production-like "
            f"({safe_url(database_url)})."
        )


def assert_confirmed(args: argparse.Namespace) -> None:
    mutating_or_expensive = (
        args.execute_analyze
        or args.create_hypothetical_index
        or args.drop_hypothetical_index
    )
    if mutating_or_expensive and not args.yes:
        raise SystemExit(
            "Refusing to run: --yes is required for EXPLAIN ANALYZE or DDL."
        )
    if args.version_id and not args.job_id:
        raise SystemExit("Refusing to run: --version-id requires --job-id.")


def make_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(database_url, poolclass=NullPool, pool_pre_ping=True)


def json_shape_filter(column: Any, expected_type: str) -> Any:
    return sa.and_(column.isnot(None), sa.func.jsonb_typeof(column) == expected_type)


def json_key_exists_filter(column: Any, key: str) -> Any:
    return sa.and_(
        column.op("?")(key),
        sa.func.nullif(column.op("->>")(key), "").isnot(None),
    )


def compile_sql(statement: sa.Select) -> str:
    return str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def latest_match_subquery(job_id: UUID) -> sa.Subquery:
    return (
        sa.select(
            CandidateJobMatchModel.candidate_id,
            CandidateJobMatchModel.job_id,
            CandidateJobMatchModel.freshness_status.label("match_freshness_status"),
            sa.func.coalesce(
                CandidateJobMatchModel.updated_at,
                CandidateJobMatchModel.created_at,
            ).label("match_updated_at"),
            sa.func.row_number()
            .over(
                partition_by=(
                    CandidateJobMatchModel.candidate_id,
                    CandidateJobMatchModel.job_id,
                ),
                order_by=(
                    sa.case(
                        (CandidateJobMatchModel.candidate_job_pipeline_id.isnot(None), 0),
                        else_=1,
                    ),
                    sa.func.coalesce(
                        CandidateJobMatchModel.updated_at,
                        CandidateJobMatchModel.created_at,
                    ).desc(),
                    CandidateJobMatchModel.id.desc(),
                ),
            )
            .label("rn"),
        )
        .select_from(CandidateJobMatchModel)
        .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
        .join(
            JobProfileAnalysisModel,
            JobProfileAnalysisModel.id
            == CandidateJobMatchModel.job_profile_analysis_id,
        )
        .where(
            CandidateJobMatchModel.job_id == job_id,
            CandidateJobMatchModel.freshness_status == "fresh",
            CandidateJobMatchModel.job_signature_hash == JobModel.job_profile_hash,
            JobProfileAnalysisModel.is_active.is_(True),
            json_shape_filter(
                CandidateJobMatchModel.skill_evidence_breakdown,
                "object",
            ),
            json_key_exists_filter(
                CandidateJobMatchModel.skill_evidence_breakdown,
                "priority_score_weighted",
            ),
        )
        .subquery("latest_match")
    )


def latest_match_statement(job_id: UUID) -> sa.Select:
    latest_match = latest_match_subquery(job_id)
    return sa.select(latest_match).where(latest_match.c.rn == 1)


def persisted_scores_query(job_id: UUID, version_id: UUID) -> sa.Select:
    latest_match = latest_match_subquery(job_id)
    return (
        sa.select(
            CandidateJobScoreModel.candidate_id,
            CandidateJobScoreModel.final_score,
            CandidateJobScoreModel.decision_suggestion,
            CandidateJobScoreModel.breakdown,
            CandidateJobScoreModel.reason_codes,
            CandidateJobScoreModel.explanation_text,
            CandidateJobScoreModel.factor_summary_json,
            CandidateJobScoreModel.computed_at,
            CandidateJobScoreModel.updated_at.label("ranking_updated_at"),
            CandidateJobScoreModel.source_analysis_id,
            CandidateJobScoreModel.source_analysis_created_at,
            CandidateJobScoreModel.score_model_version,
            CandidateJobScoreModel.freshness_status,
            CandidateJobScoreModel.job_signature_hash,
            CandidateJobScoreModel.job_updated_at,
            CandidateModel.full_name.label("candidate_name"),
            CandidateModel.data_quality_status,
            CandidateJobPipelineModel.pipeline_stage.label("stage"),
            CandidateJobPipelineModel.pipeline_status,
            CandidateJobPipelineModel.entered_at,
            CandidateJobPipelineModel.current_analysis_id.label("current_analysis_id"),
            JobModel.job_profile_hash,
            latest_match.c.match_updated_at,
            latest_match.c.match_freshness_status,
        )
        .select_from(CandidateJobScoreModel)
        .join(CandidateModel, CandidateModel.id == CandidateJobScoreModel.candidate_id)
        .join(JobModel, JobModel.id == CandidateJobScoreModel.job_id)
        .join(
            CandidateJobPipelineModel,
            sa.and_(
                CandidateJobPipelineModel.candidate_id
                == CandidateJobScoreModel.candidate_id,
                CandidateJobPipelineModel.job_id == CandidateJobScoreModel.job_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            ),
        )
        .join(
            latest_match,
            sa.and_(
                latest_match.c.candidate_id == CandidateJobScoreModel.candidate_id,
                latest_match.c.job_id == CandidateJobScoreModel.job_id,
                latest_match.c.rn == 1,
            ),
        )
        .where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.version_id == version_id,
            CandidateJobScoreModel.source_analysis_id
            == CandidateJobPipelineModel.current_analysis_id,
            CandidateJobScoreModel.final_score.isnot(None),
            json_shape_filter(CandidateJobScoreModel.breakdown, "object"),
            json_shape_filter(CandidateJobScoreModel.reason_codes, "array"),
            CandidateModel.deleted_at.is_(None),
            CandidateModel.data_quality_status.in_(["valid", "unknown"]),
        )
        .order_by(
            CandidateJobScoreModel.final_score.desc(),
            CandidateJobScoreModel.computed_at.desc(),
            CandidateJobScoreModel.candidate_id.asc(),
        )
    )


def ranking_statements(job_id: UUID, version_id: UUID, score_rows: int) -> list[dict[str, Any]]:
    statements: list[dict[str, Any]] = []

    for offset in OFFSETS:
        entry: dict[str, Any] = {
            "name": f"fetch_persisted_scores_limit20_offset{offset}",
            "kind": "fetch",
            "limit": 20,
            "offset": offset,
        }
        if offset and score_rows <= offset:
            entry["skipped"] = True
            entry["skip_reason"] = f"score_rows={score_rows} <= offset={offset}"
        else:
            stmt = (
                persisted_scores_query(job_id, version_id)
                .offset(offset)
                .limit(20)
            )
            entry["sql"] = compile_sql(stmt)
        statements.append(entry)

    count_stmt = sa.select(sa.func.count()).select_from(
        persisted_scores_query(job_id, version_id)
        .order_by(None)
        .subquery("ranked_scores")
    )
    statements.append(
        {
            "name": "count_persisted_scores",
            "kind": "count",
            "sql": compile_sql(count_stmt),
        }
    )

    stats_stmt = (
        sa.select(
            CandidateModel.data_quality_status,
            sa.func.count(CandidateJobScoreModel.candidate_id).label("count"),
        )
        .select_from(CandidateJobScoreModel)
        .join(CandidateModel, CandidateModel.id == CandidateJobScoreModel.candidate_id)
        .where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateModel.deleted_at.is_(None),
        )
        .group_by(CandidateModel.data_quality_status)
    )
    statements.append(
        {
            "name": "calculate_data_quality_stats",
            "kind": "stats",
            "sql": compile_sql(stats_stmt),
        }
    )

    statements.append(
        {
            "name": "latest_match_isolated",
            "kind": "latest_match",
            "sql": compile_sql(latest_match_statement(job_id)),
        }
    )
    return statements


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


async def select_target(
    engine: AsyncEngine,
    job_id: UUID | None,
    version_id: UUID | None,
) -> dict[str, Any] | None:
    async with engine.connect() as conn:
        if job_id and version_id:
            row = (
                await conn.execute(
                    sa.text(
                        """
                        SELECT :job_id::uuid AS job_id,
                               :version_id::uuid AS version_id,
                               count(*)::bigint AS score_rows
                        FROM candidate_job_scores
                        WHERE job_id = :job_id
                          AND version_id = :version_id
                        """
                    ),
                    {"job_id": str(job_id), "version_id": str(version_id)},
                )
            ).mappings().one()
        else:
            row = (
                await conn.execute(
                    sa.text(
                        """
                        SELECT job_id, version_id, count(*)::bigint AS score_rows
                        FROM candidate_job_scores
                        GROUP BY job_id, version_id
                        ORDER BY score_rows DESC
                        LIMIT 1
                        """
                    )
                )
            ).mappings().first()
    return dict(row) if row else None


async def run_concurrent_ddl(engine: AsyncEngine, sql: str) -> None:
    async with engine.connect() as conn:
        ddl_conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        await ddl_conn.execute(sa.text(sql))


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
    }


async def explain_statement(
    engine: AsyncEngine,
    sql: str,
    *,
    statement_timeout_ms: int,
) -> dict[str, Any]:
    async with engine.connect() as conn:
        await conn.execute(sa.text(f"SET statement_timeout = {statement_timeout_ms}"))
        row = (
            await conn.execute(
                sa.text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql)
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
    path = output_dir / f"explain_ranking_{stamp}.json"
    path.write_text(
        json.dumps(make_json_safe(report), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return path


def print_statement_summary(statements: list[dict[str, Any]]) -> None:
    print("\nStatements:")
    for item in statements:
        skipped = item.get("skipped")
        suffix = f" SKIPPED ({item['skip_reason']})" if skipped else ""
        print(f"- {item['name']} [{item['kind']}]" + suffix)
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


async def main() -> int:
    args = parse_args()
    assert_safe_environment(args.database_url)
    assert_confirmed(args)

    engine = make_engine(args.database_url)
    report: dict[str, Any] = {
        "created_at": datetime.now(UTC),
        "mode": "execute" if args.execute_analyze else "dry_run",
        "hypothetical_index": {
            "name": HYPOTHETICAL_INDEX_NAME,
            "create_sql": CREATE_HYPOTHETICAL_INDEX_SQL,
            "drop_sql": DROP_HYPOTHETICAL_INDEX_SQL,
            "created_by_this_run": False,
            "dropped_by_this_run": False,
        },
        "safety": {
            "yes": args.yes,
            "execute_analyze": args.execute_analyze,
            "create_hypothetical_index": args.create_hypothetical_index,
            "drop_hypothetical_index": args.drop_hypothetical_index,
        },
    }

    try:
        identity = await fetch_database_identity(engine)
        volumes = await fetch_volumes(engine)
        target = await select_target(engine, args.job_id, args.version_id)
        report["database"] = {
            **identity,
            "url": safe_url(args.database_url),
            "app_env": config_value("APP_ENV"),
        }
        report["volumes"] = volumes
        report["target"] = target

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
            print("\nNo candidate_job_scores rows found; no ranking target selected.")
            report["statements"] = []
        else:
            job_id = target["job_id"]
            version_id = target["version_id"]
            score_rows = int(target["score_rows"])
            print("\nTarget:")
            print(f"- job_id: {job_id}")
            print(f"- version_id: {version_id}")
            print(f"- score_rows: {score_rows}")

            if args.create_hypothetical_index:
                print(f"\nCreating hypothetical index: {HYPOTHETICAL_INDEX_NAME}")
                await run_concurrent_ddl(engine, CREATE_HYPOTHETICAL_INDEX_SQL)
                report["hypothetical_index"]["created_by_this_run"] = True

            statements = ranking_statements(job_id, version_id, score_rows)
            if args.execute_analyze:
                for item in statements:
                    if item.get("skipped"):
                        continue
                    result = await explain_statement(
                        engine,
                        item["sql"],
                        statement_timeout_ms=args.statement_timeout_ms,
                    )
                    item.update(result)
            report["statements"] = statements
            print_statement_summary(statements)

            if args.drop_hypothetical_index:
                print(f"\nDropping hypothetical index: {HYPOTHETICAL_INDEX_NAME}")
                await run_concurrent_ddl(engine, DROP_HYPOTHETICAL_INDEX_SQL)
                report["hypothetical_index"]["dropped_by_this_run"] = True

        output_path = write_report(Path(args.output_dir), report)
        print(f"\nReport written: {output_path}")
        if not args.execute_analyze:
            print("Dry-run only: no EXPLAIN ANALYZE or DDL was executed.")
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
