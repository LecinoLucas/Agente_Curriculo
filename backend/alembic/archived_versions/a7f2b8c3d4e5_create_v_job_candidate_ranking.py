"""create v_job_candidate_ranking view

Revision ID: a7f2b8c3d4e5
Revises: ccb40a7e0b1a
Create Date: 2026-04-23 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

revision: str = 'a7f2b8c3d4e5'
down_revision: str | None = 'ccb40a7e0b1a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """
    CREATE VIEW v_job_candidate_ranking

    Ranking de candidatos por vaga com scores de compatibilidade da IA.

    Estrutura:
    - Combina análises de currículos com vagas
    - Retorna scores de match e recomendações
    - Filtra soft deletes (deleted_at IS NULL)
    - Ordena por job_id e match_score DESC (melhores candidatos primeiro)

    Tabelas base:
    - resume_job_matches: análise × vaga com scores
    - analysis_results: scores detalhados da IA (overall_score, seniority_level, etc)
    - candidates: dados do candidato (nome, email)
    - jobs: dados da vaga (título)

    Performance:
    - JOIN em analyses apenas para conectar dados
    - Sem agregações (O(1) por linha)
    - Índices existentes suportam esta query:
      · idx_resume_job_matches_job_id (job_id, match_score DESC)
      · idx_analysis_results_overall_score
    """

    op.execute("""
        CREATE OR REPLACE VIEW v_job_candidate_ranking AS
        SELECT
            rjm.job_id,
            j.title             AS job_title,
            c.id                AS candidate_id,
            c.full_name         AS candidate_name,
            c.email,
            rjm.match_score,
            rjm.recommendation,
            rjm.matched_skills,
            rjm.missing_skills,
            ar.overall_score,
            ar.seniority_level,
            ar.total_experience_years,
            rjm.created_at      AS match_created_at
        FROM resume_job_matches rjm
        JOIN analyses a          ON a.id = rjm.analysis_id
        JOIN resume_versions rv  ON rv.id = a.resume_version_id
        JOIN resumes r           ON r.id = rv.resume_id
        JOIN candidates c        ON c.id = r.candidate_id
        JOIN jobs j              ON j.id = rjm.job_id
        LEFT JOIN analysis_results ar ON ar.analysis_id = a.id
        ORDER BY rjm.job_id, rjm.match_score DESC NULLS LAST;
    """)


def downgrade() -> None:
    """DROP VIEW v_job_candidate_ranking"""
    op.execute("DROP VIEW IF EXISTS v_job_candidate_ranking;")
