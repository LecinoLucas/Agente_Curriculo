-- Script de limpeza de análises e matching para DEV ONLY
-- Remove dados de análises antigas, matches obsoletos, e scores intermediários
-- Preserva: users, candidates, resumes, jobs, skills, score_model_versions, prompt_templates
-- Guard: Recusa executar em produção (nome de banco contém 'prod')

-- ─────────────────────────────────────────────────────────────────────────────
-- SAFETY GUARD: Prevent execution on production
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF current_database() LIKE '%prod%' OR current_database() LIKE '%production%' THEN
    RAISE EXCEPTION 'ABORT: This script cannot run on production databases. Database name: %', current_database();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Clean up: Analysis data with failed/not_found status
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM analysis_results
  USING analyses
  WHERE analysis_results.analysis_id = analyses.id
    AND analyses.status IN ('failed', 'not_found');

DELETE FROM analyses
  WHERE status IN ('failed', 'not_found');

-- ─────────────────────────────────────────────────────────────────────────────
-- Clean up: Match data (candidate_job_match, candidate_job_scores)
-- ─────────────────────────────────────────────────────────────────────────────

TRUNCATE TABLE candidate_job_match CASCADE;
TRUNCATE TABLE candidate_job_scores CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Clean up: Pipeline match scores (reset to NULL, preserve pipeline records)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE candidate_pipeline_scores
  SET match_score = NULL,
      updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup complete
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  NOW() as executed_at,
  'cleanup_analysis_matching_completed' as status,
  'All legacy analyses, matches, and scores have been removed from DEV database.' as message;
