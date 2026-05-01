/**
 * LIMPEZA RÁPIDA - Remove tudo exceto usuários
 * Usa nomes reais das tabelas do banco
 */

BEGIN;

-- Desabilitar constraints
ALTER TABLE candidate_pipeline DISABLE TRIGGER ALL;
ALTER TABLE resumes DISABLE TRIGGER ALL;
ALTER TABLE candidate_job_scores DISABLE TRIGGER ALL;
ALTER TABLE analyses DISABLE TRIGGER ALL;
ALTER TABLE document_ai_analyses DISABLE TRIGGER ALL;
ALTER TABLE jobs DISABLE TRIGGER ALL;
ALTER TABLE candidates DISABLE TRIGGER ALL;
ALTER TABLE pipeline_events DISABLE TRIGGER ALL;
ALTER TABLE audit_logs DISABLE TRIGGER ALL;
ALTER TABLE score_model_versions DISABLE TRIGGER ALL;
ALTER TABLE prompt_templates DISABLE TRIGGER ALL;
ALTER TABLE skills DISABLE TRIGGER ALL;

-- Limpar tabelas (ordem importante para respeitar foreign keys)
TRUNCATE TABLE pipeline_events CASCADE;
TRUNCATE TABLE pipeline_stage_transitions CASCADE;
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE document_ai_analyses CASCADE;
TRUNCATE TABLE analyses CASCADE;
TRUNCATE TABLE analysis_results CASCADE;
TRUNCATE TABLE resume_job_matches CASCADE;
TRUNCATE TABLE candidate_job_scores CASCADE;
TRUNCATE TABLE score_model_versions CASCADE;
TRUNCATE TABLE job_required_skills CASCADE;
TRUNCATE TABLE jobs CASCADE;
TRUNCATE TABLE candidate_pipeline CASCADE;
TRUNCATE TABLE resume_versions CASCADE;
TRUNCATE TABLE resumes CASCADE;
TRUNCATE TABLE candidates CASCADE;
TRUNCATE TABLE skills CASCADE;
TRUNCATE TABLE prompt_templates CASCADE;

-- Reabilitar triggers
ALTER TABLE candidate_pipeline ENABLE TRIGGER ALL;
ALTER TABLE resumes ENABLE TRIGGER ALL;
ALTER TABLE candidate_job_scores ENABLE TRIGGER ALL;
ALTER TABLE analyses ENABLE TRIGGER ALL;
ALTER TABLE document_ai_analyses ENABLE TRIGGER ALL;
ALTER TABLE jobs ENABLE TRIGGER ALL;
ALTER TABLE candidates ENABLE TRIGGER ALL;
ALTER TABLE pipeline_events ENABLE TRIGGER ALL;
ALTER TABLE audit_logs ENABLE TRIGGER ALL;
ALTER TABLE score_model_versions ENABLE TRIGGER ALL;
ALTER TABLE prompt_templates ENABLE TRIGGER ALL;
ALTER TABLE skills ENABLE TRIGGER ALL;

-- Confirmar
COMMIT;

-- Resultado final
SELECT 'Limpeza concluída!' AS resultado;
SELECT COUNT(*) as usuarios_preservados FROM users;
SELECT COUNT(*) as candidatos_removidos FROM candidates;
