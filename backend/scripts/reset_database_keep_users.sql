/**
 * SCRIPT DE LIMPEZA NUCLEAR - Preserva usuários, remove tudo o mais
 *
 * ⚠️ CUIDADO: Este script remove TODOS os dados operacionais do sistema
 * ⚠️ Preserva APENAS usuários cadastrados
 *
 * Uso:
 * psql -U postgres -d resume_ai -f reset_database_keep_users.sql
 */

-- Desabilitar constraints para evitar cascata
ALTER TABLE candidate_pipeline DISABLE TRIGGER ALL;
ALTER TABLE resume DISABLE TRIGGER ALL;
ALTER TABLE candidate_job_score DISABLE TRIGGER ALL;
ALTER TABLE analysis DISABLE TRIGGER ALL;
ALTER TABLE document_ai_analysis DISABLE TRIGGER ALL;
ALTER TABLE job DISABLE TRIGGER ALL;
ALTER TABLE candidate DISABLE TRIGGER ALL;
ALTER TABLE pipeline_event DISABLE TRIGGER ALL;
ALTER TABLE audit_log DISABLE TRIGGER ALL;
ALTER TABLE score_model_version DISABLE TRIGGER ALL;
ALTER TABLE ai_model DISABLE TRIGGER ALL;
ALTER TABLE prompt_template DISABLE TRIGGER ALL;
ALTER TABLE skill DISABLE TRIGGER ALL;
ALTER TABLE job_skill DISABLE TRIGGER ALL;

-- Limpar todas as tabelas (exceto usuários)
TRUNCATE TABLE pipeline_event CASCADE;
TRUNCATE TABLE audit_log CASCADE;
TRUNCATE TABLE document_ai_analysis CASCADE;
TRUNCATE TABLE analysis CASCADE;
TRUNCATE TABLE candidate_job_score CASCADE;
TRUNCATE TABLE score_model_version CASCADE;
TRUNCATE TABLE job_skill CASCADE;
TRUNCATE TABLE job CASCADE;
TRUNCATE TABLE candidate_pipeline CASCADE;
TRUNCATE TABLE resume CASCADE;
TRUNCATE TABLE candidate CASCADE;
TRUNCATE TABLE skill CASCADE;
TRUNCATE TABLE job_skill CASCADE;
TRUNCATE TABLE prompt_template CASCADE;
TRUNCATE TABLE ai_model CASCADE;

-- Reabilitar triggers
ALTER TABLE candidate_pipeline ENABLE TRIGGER ALL;
ALTER TABLE resume ENABLE TRIGGER ALL;
ALTER TABLE candidate_job_score ENABLE TRIGGER ALL;
ALTER TABLE analysis ENABLE TRIGGER ALL;
ALTER TABLE document_ai_analysis ENABLE TRIGGER ALL;
ALTER TABLE job ENABLE TRIGGER ALL;
ALTER TABLE candidate ENABLE TRIGGER ALL;
ALTER TABLE pipeline_event ENABLE TRIGGER ALL;
ALTER TABLE audit_log ENABLE TRIGGER ALL;
ALTER TABLE score_model_version ENABLE TRIGGER ALL;
ALTER TABLE ai_model ENABLE TRIGGER ALL;
ALTER TABLE prompt_template ENABLE TRIGGER ALL;
ALTER TABLE skill ENABLE TRIGGER ALL;
ALTER TABLE job_skill ENABLE TRIGGER ALL;

-- Resetar sequences para começar do 1 (se houver)
ALTER SEQUENCE IF EXISTS pipeline_event_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS audit_log_id_seq RESTART WITH 1;

-- Confirmação final
SELECT 'Database cleanup complete. Users preserved.' AS status;

-- Verificação: listar usuários preservados
SELECT 'Usuários preservados:' as info;
SELECT id, email, full_name, role FROM "user" ORDER BY created_at;
