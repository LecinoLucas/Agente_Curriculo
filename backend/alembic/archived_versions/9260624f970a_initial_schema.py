"""initial schema

Revision ID: 9260624f970a
Revises:
Create Date: 2026-04-23 10:13:49.738057

"""
from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "9260624f970a"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "database" / "001_schema.sql"


def _split_sql_statements(sql_text: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    dollar_quote_tag: str | None = None
    i = 0
    length = len(sql_text)

    while i < length:
        ch = sql_text[i]
        nxt = sql_text[i + 1] if i + 1 < length else ""

        if in_line_comment:
            current.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            current.append(ch)
            if ch == "*" and nxt == "/":
                current.append(nxt)
                in_block_comment = False
                i += 2
            else:
                i += 1
            continue

        if dollar_quote_tag is not None:
            if sql_text.startswith(dollar_quote_tag, i):
                current.append(dollar_quote_tag)
                i += len(dollar_quote_tag)
                dollar_quote_tag = None
            else:
                current.append(ch)
                i += 1
            continue

        if not in_single_quote and not in_double_quote:
            if ch == "-" and nxt == "-":
                current.append(ch)
                current.append(nxt)
                in_line_comment = True
                i += 2
                continue
            if ch == "/" and nxt == "*":
                current.append(ch)
                current.append(nxt)
                in_block_comment = True
                i += 2
                continue
            if ch == "$":
                tag_end = sql_text.find("$", i + 1)
                if tag_end != -1:
                    tag = sql_text[i : tag_end + 1]
                    if all(c == "$" or c == "_" or c.isalnum() for c in tag):
                        current.append(tag)
                        dollar_quote_tag = tag
                        i = tag_end + 1
                        continue

        if ch == "'" and not in_double_quote:
            current.append(ch)
            if in_single_quote and nxt == "'":
                current.append(nxt)
                i += 2
                continue
            in_single_quote = not in_single_quote
            i += 1
            continue

        if ch == '"' and not in_single_quote:
            current.append(ch)
            in_double_quote = not in_double_quote
            i += 1
            continue

        if ch == ";" and not in_single_quote and not in_double_quote:
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            i += 1
            continue

        current.append(ch)
        i += 1

    trailing = "".join(current).strip()
    if trailing:
        statements.append(trailing)

    return statements


def _execute_sql_batch(sql_text: str) -> None:
    connection = op.get_bind()
    for statement in _split_sql_statements(sql_text):
        connection.exec_driver_sql(statement)


def upgrade() -> None:
    _execute_sql_batch(SCHEMA_PATH.read_text(encoding="utf-8"))


def downgrade() -> None:
    _execute_sql_batch(
        """
        DROP VIEW IF EXISTS v_job_candidate_ranking;
        DROP VIEW IF EXISTS v_analysis_summary;
        DROP VIEW IF EXISTS v_candidate_latest_resume;

        DROP TABLE IF EXISTS audit_logs CASCADE;
        DROP TABLE IF EXISTS resume_job_matches CASCADE;
        DROP TABLE IF EXISTS job_required_skills CASCADE;
        DROP TABLE IF EXISTS jobs CASCADE;
        DROP TABLE IF EXISTS analysis_skills CASCADE;
        DROP TABLE IF EXISTS analysis_results CASCADE;
        DROP TABLE IF EXISTS analyses CASCADE;
        DROP TABLE IF EXISTS prompt_templates CASCADE;
        DROP TABLE IF EXISTS ai_models CASCADE;
        DROP TABLE IF EXISTS resume_versions CASCADE;
        DROP TABLE IF EXISTS resumes CASCADE;
        DROP TABLE IF EXISTS skills CASCADE;
        DROP TABLE IF EXISTS candidates CASCADE;
        DROP TABLE IF EXISTS email_verification_tokens CASCADE;
        DROP TABLE IF EXISTS password_reset_tokens CASCADE;
        DROP TABLE IF EXISTS user_sessions CASCADE;
        DROP TABLE IF EXISTS users CASCADE;

        DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE;

        DROP TYPE IF EXISTS audit_action;
        DROP TYPE IF EXISTS proficiency_level;
        DROP TYPE IF EXISTS match_recommendation;
        DROP TYPE IF EXISTS work_model;
        DROP TYPE IF EXISTS seniority_level;
        DROP TYPE IF EXISTS job_status;
        DROP TYPE IF EXISTS resume_status;
        DROP TYPE IF EXISTS analysis_status;
        DROP TYPE IF EXISTS user_status;
        DROP TYPE IF EXISTS user_role;
        """
    )
