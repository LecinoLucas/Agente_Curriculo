/*
  LIMPEZA SEGURA - DEV/LOCAL
  Preserva usuários e tabelas de autenticação.

  IMPORTANTE:
  - Não rode em produção.
  - Não desabilita triggers.
  - Usa TRUNCATE com CASCADE de forma explícita.
  - Mantém skills, prompt_templates e score_model_versions por padrão.
*/

DO $$
DECLARE
    current_db text := current_database();
BEGIN
    IF current_db ILIKE '%prod%' OR current_db ILIKE '%production%' THEN
        RAISE EXCEPTION 'Abortado: este script não pode rodar em banco de produção: %', current_db;
    END IF;
END $$;

BEGIN;

TRUNCATE TABLE
    pipeline_events,
    pipeline_stage_transitions,
    audit_logs,
    document_ai_analyses,
    analysis_results,
    resume_job_matches,
    analyses,
    candidate_job_scores,
    job_required_skills,
    candidate_pipeline,
    resume_versions,
    resumes,
    candidates,
    jobs
RESTART IDENTITY CASCADE;

-- Opcional: descomente somente se quiser resetar catálogos/base do sistema.
-- TRUNCATE TABLE
--     skills,
--     prompt_templates,
--     score_model_versions
-- RESTART IDENTITY CASCADE;

COMMIT;

SELECT 'Limpeza concluída com segurança.' AS resultado;

SELECT 'users' AS tabela, COUNT(*) AS registros FROM users
UNION ALL
SELECT 'candidates', COUNT(*) FROM candidates
UNION ALL
SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL
SELECT 'resumes', COUNT(*) FROM resumes
UNION ALL
SELECT 'analyses', COUNT(*) FROM analyses
UNION ALL
SELECT 'skills', COUNT(*) FROM skills
UNION ALL
SELECT 'prompt_templates', COUNT(*) FROM prompt_templates
UNION ALL
SELECT 'score_model_versions', COUNT(*) FROM score_model_versions;