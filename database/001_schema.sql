-- =============================================================================
-- SISTEMA DE ANÁLISE INTELIGENTE DE CURRÍCULOS
-- Schema PostgreSQL 16 — Versão 1.0
-- =============================================================================
-- Convenções:
--   · Todas as PKs são UUID (uuid_generate_v4)
--   · Timestamps sempre em UTC (TIMESTAMPTZ)
--   · Soft delete via deleted_at (nunca DELETE físico)
--   · Tabelas de audit são append-only (sem deleted_at, sem updated_at)
--   · Prefixos de ENUM: snake_case do domínio
-- =============================================================================


-- =============================================================================
-- SEÇÃO 0 — EXTENSÕES
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_bytes(), crypt()
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- normalização de texto para busca
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- similaridade de strings (busca de skills)


-- =============================================================================
-- SEÇÃO 1 — TIPOS ENUMERADOS
-- =============================================================================

-- Papéis de usuário no sistema
CREATE TYPE user_role AS ENUM (
    'admin',        -- acesso total ao sistema
    'recruiter',    -- cria vagas, analisa candidatos
    'candidate',    -- envia currículos, visualiza análises próprias
    'viewer'        -- apenas leitura (gestores, stakeholders)
);

-- Ciclo de vida do usuário
CREATE TYPE user_status AS ENUM (
    'pending_verification',  -- cadastrado, aguardando confirmação de email
    'active',
    'suspended',             -- bloqueio administrativo temporário
    'inactive'               -- desativação permanente (sem exclusão física)
);

-- Ciclo de vida da análise de IA
CREATE TYPE analysis_status AS ENUM (
    'pending',      -- na fila aguardando processamento
    'processing',   -- worker em execução
    'completed',    -- análise finalizada com sucesso
    'failed',       -- esgotou retries sem sucesso
    'cancelled'     -- cancelado antes do processamento
);

-- Ciclo de vida do currículo
CREATE TYPE resume_status AS ENUM (
    'active',    -- versão corrente usada ativamente
    'archived',  -- mantido para histórico, não aparece em buscas
    'deleted'    -- soft deleted pelo usuário (dado permanece para auditoria)
);

-- Ciclo de vida da vaga
CREATE TYPE job_status AS ENUM (
    'draft',      -- rascunho, não visível para candidatos
    'published',  -- ativa, aceita candidaturas
    'paused',     -- temporariamente inativa
    'closed',     -- encerrada normalmente
    'cancelled'   -- cancelada antes do encerramento
);

-- Nível de senioridade (usado em vagas e análises)
CREATE TYPE seniority_level AS ENUM (
    'intern',
    'junior',
    'mid',
    'senior',
    'lead',
    'principal',
    'director'
);

-- Modelo de trabalho
CREATE TYPE work_model AS ENUM (
    'remote',
    'hybrid',
    'onsite'
);

-- Recomendação de match currículo × vaga
CREATE TYPE match_recommendation AS ENUM (
    'strong_match',      -- candidato supera os requisitos
    'good_match',        -- candidato atende aos requisitos
    'potential',         -- atende parcialmente, vale considerar
    'not_recommended'    -- não atende requisitos mínimos
);

-- Nível de proficiência em skills
CREATE TYPE proficiency_level AS ENUM (
    'basic',
    'intermediate',
    'advanced',
    'expert'
);

-- Ações auditáveis (domínio fechado — toda ação relevante do sistema)
CREATE TYPE audit_action AS ENUM (
    -- Usuários
    'user.created',
    'user.updated',
    'user.deleted',
    'user.login',
    'user.login_failed',
    'user.logout',
    'user.password_changed',
    'user.password_reset_requested',
    'user.email_verified',
    'user.suspended',
    'user.reactivated',
    -- Candidatos
    'candidate.created',
    'candidate.updated',
    'candidate.deleted',
    -- Currículos
    'resume.uploaded',
    'resume.updated',
    'resume.archived',
    'resume.deleted',
    'resume.downloaded',
    -- Análises
    'analysis.requested',
    'analysis.started',
    'analysis.completed',
    'analysis.failed',
    'analysis.cancelled',
    'analysis.retried',
    -- Vagas
    'job.created',
    'job.updated',
    'job.published',
    'job.paused',
    'job.closed',
    'job.cancelled',
    -- Matching
    'match.created',
    -- Dados
    'data.exported',
    'data.deletion_requested'  -- LGPD direito ao esquecimento
);


-- =============================================================================
-- SEÇÃO 2 — FUNÇÃO AUXILIAR: updated_at automático
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- SEÇÃO 3 — DOMÍNIO: USUÁRIOS E AUTENTICAÇÃO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 users — Contas de acesso ao sistema
-- -----------------------------------------------------------------------------
-- Separado de `candidates` por design intencional:
--   · Um recruiter é user mas não é candidate
--   · Um candidate pode existir sem conta (adicionado por recruiter)
--   · Evita mistura de responsabilidades de auth com dados de RH

CREATE TABLE users (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                   VARCHAR(255)    NOT NULL,
    email_verified_at       TIMESTAMPTZ,
    password_hash           VARCHAR(255)    NOT NULL,   -- bcrypt, custo mínimo 12
    role                    user_role       NOT NULL DEFAULT 'candidate',
    status                  user_status     NOT NULL DEFAULT 'pending_verification',
    full_name               VARCHAR(255)    NOT NULL,
    avatar_url              TEXT,

    -- Controle de acesso e segurança
    last_login_at           TIMESTAMPTZ,
    login_count             INTEGER         NOT NULL DEFAULT 0,
    failed_login_count      INTEGER         NOT NULL DEFAULT 0,  -- reset no login bem-sucedido
    locked_until            TIMESTAMPTZ,                          -- bloqueio por brute force

    -- Metadados de gestão
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ                            -- soft delete
);

-- Email único apenas entre usuários ativos (permite recadastro após exclusão)
CREATE UNIQUE INDEX uq_users_email_active
    ON users (email)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_users_status   ON users (status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role     ON users (role)     WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email    ON users (email);    -- para lookup mesmo em deleted

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- -----------------------------------------------------------------------------
-- 3.2 user_sessions — Refresh tokens ativos (controle de sessão)
-- -----------------------------------------------------------------------------
-- O Access Token (JWT, 15min) não é armazenado aqui.
-- Apenas o Refresh Token (opaque, 7 dias) é registrado, como hash.
-- Refresh Token Rotation: cada uso invalida o token atual e emite um novo.

CREATE TABLE user_sessions (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID        NOT NULL REFERENCES users(id),
    token_hash          VARCHAR(255) NOT NULL,   -- SHA-256 do refresh token raw
    user_agent          TEXT,
    ip_address          INET,
    device_fingerprint  VARCHAR(255),            -- hash de user_agent+accept_language+etc
    last_used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,             -- preenchido no logout ou rotação
    revoke_reason       VARCHAR(100),            -- 'logout', 'rotation', 'forced', 'expired'
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_sessions_token_hash ON user_sessions (token_hash);
CREATE INDEX idx_user_sessions_user_id    ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions (expires_at)
    WHERE revoked_at IS NULL;   -- índice parcial: apenas sessões ativas


-- -----------------------------------------------------------------------------
-- 3.3 password_reset_tokens — Tokens de recuperação de senha
-- -----------------------------------------------------------------------------

CREATE TABLE password_reset_tokens (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id),
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,            -- preenchido ao usar; token torna-se inválido
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_password_reset_token ON password_reset_tokens (token_hash);
CREATE INDEX idx_password_reset_user ON password_reset_tokens (user_id);


-- -----------------------------------------------------------------------------
-- 3.4 email_verification_tokens — Confirmação de cadastro
-- -----------------------------------------------------------------------------

CREATE TABLE email_verification_tokens (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES users(id),
    token_hash   VARCHAR(255) NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    verified_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_email_verification_token ON email_verification_tokens (token_hash);
CREATE INDEX idx_email_verification_user ON email_verification_tokens (user_id);


-- =============================================================================
-- SEÇÃO 4 — DOMÍNIO: CANDIDATOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 candidates — Perfil do candidato (dados de RH, separado de auth)
-- -----------------------------------------------------------------------------
-- Pode existir sem user_id (recruiter cadastra candidato externo sem conta).
-- Quando o candidato se cadastra, user_id é vinculado ao registro existente.

CREATE TABLE candidates (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        REFERENCES users(id),   -- nullable: vínculo opcional
    full_name       VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(50),

    -- Localização
    location_city       VARCHAR(100),
    location_state      VARCHAR(100),
    location_country    VARCHAR(10) DEFAULT 'BR',

    -- Links profissionais
    linkedin_url    TEXT,
    github_url      TEXT,
    portfolio_url   TEXT,

    -- Dados internos (visíveis apenas para recrutadores)
    internal_notes  TEXT,
    tags            JSONB NOT NULL DEFAULT '[]',    -- ex: ["senior", "disponível", "java"]

    -- Gestão
    created_by      UUID        NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_candidates_user_id
    ON candidates (user_id)
    WHERE user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_candidates_email      ON candidates (email)   WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_created_by ON candidates (created_by);
CREATE INDEX idx_candidates_tags       ON candidates USING GIN (tags);

CREATE TRIGGER trg_candidates_updated_at
    BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- SEÇÃO 5 — DOMÍNIO: SKILLS (catálogo compartilhado)
-- =============================================================================
-- Skills são normalizadas em catálogo separado para permitir:
--   · Busca de candidatos por skill
--   · Matching automático currículo × vaga
--   · Relatórios de mercado (skills mais demandadas)

CREATE TABLE skills (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(255) NOT NULL,
    normalized_name  VARCHAR(255) NOT NULL,   -- lowercase + unaccent, para deduplicação
    category         VARCHAR(100),
    -- ex: 'programming_language', 'framework', 'database', 'cloud',
    --     'soft_skill', 'methodology', 'tool', 'language'
    aliases          JSONB NOT NULL DEFAULT '[]',
    -- ex: ["JS", "JavaScript", "ECMAScript", "node.js"]
    -- permite que a IA mapeie variações ao mesmo skill canônico
    is_verified      BOOLEAN NOT NULL DEFAULT FALSE,  -- curado por admin
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_skills_normalized_name_active
    ON skills (normalized_name)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_skills_category    ON skills (category) WHERE deleted_at IS NULL;
CREATE INDEX idx_skills_name_trgm   ON skills USING GIN (name gin_trgm_ops) WHERE deleted_at IS NULL;
    -- permite busca fuzzy: SELECT * FROM skills WHERE name % 'postgress'

CREATE TRIGGER trg_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- SEÇÃO 6 — DOMÍNIO: CURRÍCULOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6.1 resumes — Entidade lógica do currículo (agrupador de versões)
-- -----------------------------------------------------------------------------
-- Um candidato pode ter múltiplos currículos (ex: foco em backend, foco em dados).
-- Cada currículo agrupa suas versões cronológicas.

CREATE TABLE resumes (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id     UUID         NOT NULL REFERENCES candidates(id),
    title            VARCHAR(255) NOT NULL,    -- ex: "Currículo Dev Backend 2026"
    status           resume_status NOT NULL DEFAULT 'active',
    current_version  INTEGER      NOT NULL DEFAULT 1,
    created_by       UUID         NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_resumes_candidate_id ON resumes (candidate_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_resumes_status       ON resumes (status)       WHERE deleted_at IS NULL;
CREATE INDEX idx_resumes_created_by   ON resumes (created_by);

CREATE TRIGGER trg_resumes_updated_at
    BEFORE UPDATE ON resumes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- -----------------------------------------------------------------------------
-- 6.2 resume_versions — Cada upload gera uma versão imutável
-- -----------------------------------------------------------------------------
-- Arquivos nunca são sobrescritos no S3. Cada upload = nova entrada aqui.
-- O texto extraído é cacheado para evitar reprocessamento.

CREATE TABLE resume_versions (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id           UUID        NOT NULL REFERENCES resumes(id),
    version_number      INTEGER     NOT NULL,       -- sequencial por resume_id

    -- Referência ao arquivo no S3
    s3_bucket           VARCHAR(255) NOT NULL,
    s3_key              VARCHAR(500) NOT NULL,      -- ex: resumes/{candidate_id}/{resume_id}/v3_original.pdf
    s3_etag             VARCHAR(100),               -- ETag do S3 para verificação de integridade
    s3_version_id       VARCHAR(200),               -- ID de versão do S3 Versioning

    -- Metadados do arquivo
    original_file_name  VARCHAR(255) NOT NULL,
    file_size_bytes     INTEGER      NOT NULL,
    file_hash_sha256    VARCHAR(64)  NOT NULL,      -- para detecção de duplicatas
    mime_type           VARCHAR(100) NOT NULL DEFAULT 'application/pdf',

    -- Extração de texto (processamento assíncrono)
    extracted_text      TEXT,
    extraction_status   VARCHAR(50)  NOT NULL DEFAULT 'pending',
    -- 'pending' | 'processing' | 'completed' | 'failed'
    extraction_error    TEXT,                       -- motivo da falha, se houver
    page_count          INTEGER,
    word_count          INTEGER,
    language_detected   VARCHAR(10),                -- 'pt', 'en', 'es'

    -- Gestão
    uploaded_by         UUID        NOT NULL REFERENCES users(id),
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_resume_version UNIQUE (resume_id, version_number)
);

CREATE INDEX idx_resume_versions_resume_id     ON resume_versions (resume_id);
CREATE INDEX idx_resume_versions_file_hash     ON resume_versions (file_hash_sha256);
    -- detecta upload de arquivo idêntico
CREATE INDEX idx_resume_versions_extraction    ON resume_versions (extraction_status)
    WHERE extraction_status IN ('pending', 'processing');


-- =============================================================================
-- SEÇÃO 7 — DOMÍNIO: IA (modelos, prompts e análises)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 ai_models — Catálogo de modelos de IA utilizados
-- -----------------------------------------------------------------------------
-- Registra qual modelo foi usado em cada análise para reprodutibilidade.
-- Essencial quando o modelo é atualizado e os resultados mudam.

CREATE TABLE ai_models (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider        VARCHAR(100) NOT NULL,      -- 'anthropic', 'openai', 'google'
    model_id        VARCHAR(255) NOT NULL,      -- ID exato da API: 'claude-sonnet-4-6'
    model_name      VARCHAR(255) NOT NULL,      -- nome legível: 'Claude Sonnet 4.6'
    context_window  INTEGER,                    -- tokens máximos de contexto
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deprecated_at   TIMESTAMPTZ,               -- quando o modelo foi retirado de uso
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ai_models_model_id UNIQUE (model_id)
);

INSERT INTO ai_models (provider, model_id, model_name, context_window)
VALUES
    ('anthropic', 'claude-sonnet-4-6',  'Claude Sonnet 4.6',  200000),
    ('anthropic', 'claude-opus-4-7',    'Claude Opus 4.7',    200000),
    ('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 200000);


-- -----------------------------------------------------------------------------
-- 7.2 prompt_templates — Versionamento de prompts do sistema
-- -----------------------------------------------------------------------------
-- Cada análise registra qual prompt foi usado.
-- Permite comparar resultados entre versões de prompt e fazer A/B testing.
-- Um prompt só pode ser ativado por vez (is_active = TRUE).

CREATE TABLE prompt_templates (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    VARCHAR(255) NOT NULL,  -- slug: 'full_analysis', 'skill_extraction'
    version                 INTEGER     NOT NULL,
    description             TEXT,
    template_type           VARCHAR(100) NOT NULL,
    -- 'full_analysis' | 'skill_extraction' | 'job_match' | 'summary'

    -- Conteúdo do prompt
    system_prompt           TEXT,                   -- instrução de sistema (cacheável na API)
    user_prompt_template    TEXT        NOT NULL,   -- template com placeholders: {{resume_text}}
    output_schema           JSONB,                  -- JSON Schema do output esperado (para validação)

    -- Parâmetros de chamada à IA
    max_tokens              INTEGER     NOT NULL DEFAULT 4096,
    temperature             NUMERIC(3,2) NOT NULL DEFAULT 0.1,

    -- Gestão de ciclo de vida
    is_active               BOOLEAN     NOT NULL DEFAULT FALSE,
    activated_at            TIMESTAMPTZ,
    deactivated_at          TIMESTAMPTZ,
    created_by              UUID        NOT NULL REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_prompt_template_version UNIQUE (name, version)
);

CREATE INDEX idx_prompt_templates_active ON prompt_templates (name, is_active)
    WHERE is_active = TRUE;


-- -----------------------------------------------------------------------------
-- 7.3 analyses — Requisição de análise (job de processamento)
-- -----------------------------------------------------------------------------
-- Uma análise é sempre sobre uma versão específica do currículo.
-- Pode ser contextualizada para uma vaga (análise de fit) ou genérica.
-- Múltiplas análises do mesmo currículo são permitidas e esperadas.

CREATE TABLE analyses (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_version_id    UUID        NOT NULL REFERENCES resume_versions(id),
    job_id               UUID,                              -- nullable: análise genérica
    ai_model_id          UUID        NOT NULL REFERENCES ai_models(id),
    prompt_template_id   UUID        NOT NULL REFERENCES prompt_templates(id),

    -- Estado do processamento
    status               analysis_status NOT NULL DEFAULT 'pending',
    priority             SMALLINT    NOT NULL DEFAULT 5,    -- 1 (alta) a 10 (baixa)
    idempotency_key      VARCHAR(255),                      -- evita duplicação em retry

    -- Rastreamento de execução
    requested_by         UUID        NOT NULL REFERENCES users(id),
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    failed_at            TIMESTAMPTZ,
    failure_reason       TEXT,
    retry_count          SMALLINT    NOT NULL DEFAULT 0,
    max_retries          SMALLINT    NOT NULL DEFAULT 3,
    next_retry_at        TIMESTAMPTZ,

    -- Rastreamento de infraestrutura
    queue_name           VARCHAR(100) NOT NULL DEFAULT 'analysis.default',
    worker_id            VARCHAR(255),    -- hostname + PID do worker que processou
    task_id              VARCHAR(255),    -- ID da task Celery (para rastrear no broker)

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_analyses_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_analyses_resume_version  ON analyses (resume_version_id);
CREATE INDEX idx_analyses_job_id          ON analyses (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_analyses_status          ON analyses (status, priority)
    WHERE status IN ('pending', 'processing');
    -- índice parcial: apenas análises pendentes (evita scan de histórico)
CREATE INDEX idx_analyses_requested_by    ON analyses (requested_by);
CREATE INDEX idx_analyses_created_at      ON analyses (created_at DESC);

CREATE TRIGGER trg_analyses_updated_at
    BEFORE UPDATE ON analyses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- -----------------------------------------------------------------------------
-- 7.4 analysis_results — Resultado estruturado da análise de IA
-- -----------------------------------------------------------------------------
-- Separado de `analyses` por design intencional (CQRS light):
--   · `analyses` é o registro de controle (status, retry, quando processou)
--   · `analysis_results` é o payload de resultado (imutável após escrita)
-- Relação 1:1 com analyses (apenas análises concluídas têm resultado).

CREATE TABLE analysis_results (
    id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id  UUID    NOT NULL UNIQUE REFERENCES analyses(id),

    -- Scores gerais (0.00 a 100.00)
    overall_score           NUMERIC(5,2),
    technical_score         NUMERIC(5,2),
    experience_score        NUMERIC(5,2),
    education_score         NUMERIC(5,2),
    communication_score     NUMERIC(5,2),
    leadership_score        NUMERIC(5,2),

    -- Dados extraídos estruturados
    candidate_summary           TEXT,           -- resumo executivo gerado pela IA
    seniority_level             seniority_level,
    total_experience_years      NUMERIC(4,1),   -- anos de experiência total detectados
    highest_education_level     VARCHAR(100),   -- 'high_school', 'bachelor', 'master', 'phd'
    highest_education_field     VARCHAR(255),   -- área: 'Ciência da Computação'

    -- Outputs qualitativos (arrays de strings)
    strengths           JSONB NOT NULL DEFAULT '[]',
    weaknesses          JSONB NOT NULL DEFAULT '[]',
    recommendations     JSONB NOT NULL DEFAULT '[]',
    keywords            JSONB NOT NULL DEFAULT '[]',

    -- Payload completo extraído (flexível para evoluções)
    extracted_data      JSONB NOT NULL DEFAULT '{}',
    -- contém: education[], experience[], certifications[], languages[], etc.

    -- Métricas de consumo da API de IA
    input_tokens         INTEGER,
    output_tokens        INTEGER,
    cache_read_tokens    INTEGER,   -- tokens servidos do cache (prompt caching)
    cache_write_tokens   INTEGER,   -- tokens gravados no cache
    processing_time_ms   INTEGER,

    -- Auditoria de IA
    raw_llm_response     TEXT,      -- resposta bruta completa (debug e auditoria)
    prompt_version_used  VARCHAR(50),  -- snapshot do nome+versão do prompt

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- sem updated_at: resultado é imutável após criação
);

CREATE INDEX idx_analysis_results_overall_score ON analysis_results (overall_score DESC);
CREATE INDEX idx_analysis_results_seniority     ON analysis_results (seniority_level);


-- -----------------------------------------------------------------------------
-- 7.5 analysis_skills — Skills extraídas e normalizadas (para busca/matching)
-- -----------------------------------------------------------------------------
-- A IA retorna skills em texto livre; este mapeamento vincula ao catálogo.
-- Permite: buscar candidatos por skill, matching com requisitos da vaga.

CREATE TABLE analysis_skills (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id         UUID            NOT NULL REFERENCES analyses(id),
    skill_id            UUID            NOT NULL REFERENCES skills(id),
    proficiency_level   proficiency_level,
    years_experience    NUMERIC(4,1),
    is_primary          BOOLEAN         NOT NULL DEFAULT FALSE, -- skill principal do candidato
    source              VARCHAR(50)     NOT NULL DEFAULT 'extracted',
    -- 'extracted': identificada diretamente no currículo
    -- 'inferred' : inferida pelo contexto (ex: usa Spring → implica Java)
    confidence_score    NUMERIC(3,2),   -- 0.00 a 1.00 (confiança da IA na extração)

    CONSTRAINT uq_analysis_skill UNIQUE (analysis_id, skill_id)
);

CREATE INDEX idx_analysis_skills_analysis_id ON analysis_skills (analysis_id);
CREATE INDEX idx_analysis_skills_skill_id    ON analysis_skills (skill_id);
    -- permite: SELECT * FROM analysis_skills WHERE skill_id = '...'
    -- para buscar todos os candidatos com determinada skill


-- =============================================================================
-- SEÇÃO 8 — DOMÍNIO: VAGAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 8.1 jobs — Posições em aberto para matching com currículos
-- -----------------------------------------------------------------------------

CREATE TABLE jobs (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255)    NOT NULL,
    description     TEXT            NOT NULL,
    requirements    TEXT,           -- requisitos em texto livre (complementa job_required_skills)
    status          job_status      NOT NULL DEFAULT 'draft',

    -- Classificação
    seniority_level seniority_level,
    work_model      work_model,
    location        VARCHAR(255),   -- cidade/estado para vagas híbridas ou presenciais

    -- Remuneração (opcional, para matching de expectativa)
    salary_min      NUMERIC(12,2),
    salary_max      NUMERIC(12,2),
    salary_currency VARCHAR(10)     NOT NULL DEFAULT 'BRL',

    -- Gestão
    created_by      UUID            NOT NULL REFERENCES users(id),
    published_at    TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_jobs_status      ON jobs (status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_created_by  ON jobs (created_by);
CREATE INDEX idx_jobs_seniority   ON jobs (seniority_level) WHERE status = 'published';

CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE analyses
    ADD CONSTRAINT fk_analyses_job_id
    FOREIGN KEY (job_id) REFERENCES jobs(id);


-- -----------------------------------------------------------------------------
-- 8.2 job_required_skills — Skills obrigatórias e desejáveis por vaga
-- -----------------------------------------------------------------------------

CREATE TABLE job_required_skills (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID        NOT NULL REFERENCES jobs(id),
    skill_id        UUID        NOT NULL REFERENCES skills(id),
    is_mandatory    BOOLEAN     NOT NULL DEFAULT FALSE,  -- FALSE = desejável
    minimum_level   proficiency_level,                   -- nível mínimo exigido
    minimum_years   NUMERIC(4,1),
    weight          NUMERIC(4,2) NOT NULL DEFAULT 1.00,  -- peso no cálculo de match score

    CONSTRAINT uq_job_skill UNIQUE (job_id, skill_id)
);

CREATE INDEX idx_job_required_skills_job_id   ON job_required_skills (job_id);
CREATE INDEX idx_job_required_skills_skill_id ON job_required_skills (skill_id);


-- -----------------------------------------------------------------------------
-- 8.3 resume_job_matches — Resultado do matching análise × vaga
-- -----------------------------------------------------------------------------
-- Gerado automaticamente quando uma análise é associada a uma vaga,
-- ou manualmente quando o recrutador solicita match de um currículo existente.

CREATE TABLE resume_job_matches (
    id                  UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id         UUID                NOT NULL REFERENCES analyses(id),
    job_id              UUID                NOT NULL REFERENCES jobs(id),

    -- Scores de match
    match_score         NUMERIC(5,2),       -- score final ponderado (0-100)
    skills_match_score  NUMERIC(5,2),       -- score apenas de skills
    experience_match_score NUMERIC(5,2),    -- score de experiência vs. requisito
    seniority_match_score  NUMERIC(5,2),

    -- Detalhamento
    matched_skills      JSONB NOT NULL DEFAULT '[]',   -- skills que o candidato tem
    missing_skills      JSONB NOT NULL DEFAULT '[]',   -- skills obrigatórias ausentes
    bonus_skills        JSONB NOT NULL DEFAULT '[]',   -- skills extras além do requisito
    match_summary       TEXT,
    recommendation      match_recommendation,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_resume_job_match UNIQUE (analysis_id, job_id)
);

CREATE INDEX idx_resume_job_matches_job_id      ON resume_job_matches (job_id, match_score DESC);
CREATE INDEX idx_resume_job_matches_analysis_id ON resume_job_matches (analysis_id);
CREATE INDEX idx_resume_job_matches_score       ON resume_job_matches (match_score DESC)
    WHERE match_score IS NOT NULL;


-- =============================================================================
-- SEÇÃO 9 — DOMÍNIO: AUDITORIA (append-only, imutável)
-- =============================================================================
-- Regras absolutas desta tabela:
--   · NENHUM UPDATE ou DELETE jamais deve ser executado aqui
--   · Sem soft delete (deleted_at), sem updated_at
--   · Particionamento por mês para performance em consultas históricas
--   · Índices otimizados para investigação e compliance

CREATE TABLE audit_logs (
    id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Quem realizou a ação
    user_id         UUID        REFERENCES users(id),    -- NULL se sistema/worker
    session_id      UUID        REFERENCES user_sessions(id),
    ip_address      INET,
    user_agent      TEXT,

    -- O que foi feito
    action          audit_action NOT NULL,
    resource_type   VARCHAR(100) NOT NULL,   -- 'user', 'resume', 'analysis', 'job'
    resource_id     UUID,                    -- ID do recurso afetado

    -- Contexto da requisição HTTP
    request_id      UUID,        -- correlation ID (rastreia toda a cadeia de chamadas)
    http_method     VARCHAR(10),
    http_path       TEXT,
    http_status_code SMALLINT,

    -- Snapshot de estado (para rollback de auditoria)
    before_state    JSONB,       -- estado antes da mudança
    after_state     JSONB,       -- estado após a mudança

    -- Contexto adicional livre
    metadata        JSONB NOT NULL DEFAULT '{}',
    -- ex: { "reason": "admin_action", "approved_by": "uuid" }

    PRIMARY KEY (id, timestamp)  -- timestamp na PK composta é requisito do particionamento
) PARTITION BY RANGE (timestamp);

-- Partições mensais (manter script de criação automática em produção)
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE audit_logs_2026_10 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE audit_logs_2026_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Índices criados na tabela pai são herdados pelas partições automaticamente
CREATE INDEX idx_audit_logs_user_id     ON audit_logs (user_id)      WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_resource    ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_logs_action      ON audit_logs (action);
CREATE INDEX idx_audit_logs_request_id  ON audit_logs (request_id)   WHERE request_id IS NOT NULL;
CREATE INDEX idx_audit_logs_timestamp   ON audit_logs (timestamp DESC);


-- =============================================================================
-- SEÇÃO 10 — VIEWS ÚTEIS
-- =============================================================================

-- Visão consolidada do candidato com seu currículo mais recente
CREATE VIEW v_candidate_latest_resume AS
SELECT
    c.id                AS candidate_id,
    c.full_name,
    c.email,
    c.user_id,
    r.id                AS resume_id,
    r.title             AS resume_title,
    r.status            AS resume_status,
    rv.id               AS resume_version_id,
    rv.version_number,
    rv.language_detected,
    rv.uploaded_at,
    rv.page_count,
    rv.word_count
FROM candidates c
LEFT JOIN resumes r
    ON r.candidate_id = c.id
    AND r.deleted_at IS NULL
    AND r.status = 'active'
LEFT JOIN resume_versions rv
    ON rv.resume_id = r.id
    AND rv.version_number = r.current_version
WHERE c.deleted_at IS NULL;


-- Visão de análises com resultado agregado (para listagens e relatórios)
CREATE VIEW v_analysis_summary AS
SELECT
    a.id                        AS analysis_id,
    a.status,
    a.priority,
    a.requested_by,
    a.created_at,
    a.completed_at,
    a.retry_count,
    rv.resume_id,
    rv.version_number,
    c.id                        AS candidate_id,
    c.full_name                 AS candidate_name,
    j.id                        AS job_id,
    j.title                     AS job_title,
    ar.overall_score,
    ar.seniority_level,
    ar.total_experience_years,
    m.model_id                  AS ai_model_used,
    pt.name || '_v' || pt.version AS prompt_used
FROM analyses a
JOIN resume_versions rv      ON rv.id = a.resume_version_id
JOIN resumes r               ON r.id = rv.resume_id
JOIN candidates c            ON c.id = r.candidate_id
JOIN ai_models m             ON m.id = a.ai_model_id
JOIN prompt_templates pt     ON pt.id = a.prompt_template_id
LEFT JOIN jobs j             ON j.id = a.job_id
LEFT JOIN analysis_results ar ON ar.analysis_id = a.id;


-- Ranking de candidatos por vaga (para tela de triagem do recrutador)
CREATE VIEW v_job_candidate_ranking AS
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
ORDER BY rjm.job_id, rjm.match_score DESC;


-- =============================================================================
-- FIM DO SCHEMA
-- =============================================================================
