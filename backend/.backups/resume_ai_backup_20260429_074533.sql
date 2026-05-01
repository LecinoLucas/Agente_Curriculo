--
-- PostgreSQL database dump
--

\restrict ysGfyr7WNFJZueA9gk6dmU3DDca7Et8fxzlXcHOQwdHb480MGjynpM9I1AFLLmJ

-- Dumped from database version 18.3 (Homebrew)
-- Dumped by pg_dump version 18.3 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: analysis_status; Type: TYPE; Schema: public; Owner: LecinoLucas
--

CREATE TYPE public.analysis_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
);


ALTER TYPE public.analysis_status OWNER TO "LecinoLucas";

--
-- Name: job_status; Type: TYPE; Schema: public; Owner: LecinoLucas
--

CREATE TYPE public.job_status AS ENUM (
    'draft',
    'published',
    'paused',
    'closed',
    'cancelled'
);


ALTER TYPE public.job_status OWNER TO "LecinoLucas";

--
-- Name: resume_status; Type: TYPE; Schema: public; Owner: LecinoLucas
--

CREATE TYPE public.resume_status AS ENUM (
    'active',
    'archived',
    'deleted'
);


ALTER TYPE public.resume_status OWNER TO "LecinoLucas";

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: LecinoLucas
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'recruiter',
    'candidate',
    'viewer'
);


ALTER TYPE public.user_role OWNER TO "LecinoLucas";

--
-- Name: user_status; Type: TYPE; Schema: public; Owner: LecinoLucas
--

CREATE TYPE public.user_status AS ENUM (
    'pending_verification',
    'active',
    'suspended',
    'inactive'
);


ALTER TYPE public.user_status OWNER TO "LecinoLucas";

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admissions; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.admissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    candidate_id uuid NOT NULL,
    job_id uuid NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_admission_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.admissions OWNER TO "LecinoLucas";

--
-- Name: ai_models; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.ai_models (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    provider character varying(100) NOT NULL,
    model_id character varying(255) NOT NULL,
    model_name character varying(255) NOT NULL,
    context_window integer,
    is_active boolean DEFAULT true NOT NULL,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    deprecated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_models OWNER TO "LecinoLucas";

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO "LecinoLucas";

--
-- Name: analyses; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.analyses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    resume_version_id uuid NOT NULL,
    job_id uuid,
    ai_model_id uuid NOT NULL,
    prompt_template_id uuid NOT NULL,
    status public.analysis_status DEFAULT 'pending'::public.analysis_status NOT NULL,
    priority smallint DEFAULT '5'::smallint NOT NULL,
    idempotency_key character varying(255),
    requested_by uuid NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_reason text,
    retry_count smallint DEFAULT '0'::smallint NOT NULL,
    max_retries smallint DEFAULT '3'::smallint NOT NULL,
    next_retry_at timestamp with time zone,
    queue_name character varying(100) DEFAULT 'analysis.default'::character varying NOT NULL,
    worker_id character varying(255),
    task_id character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.analyses OWNER TO "LecinoLucas";

--
-- Name: analysis_results; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.analysis_results (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    analysis_id uuid NOT NULL,
    overall_score numeric(5,2),
    technical_score numeric(5,2),
    experience_score numeric(5,2),
    education_score numeric(5,2),
    communication_score numeric(5,2),
    leadership_score numeric(5,2),
    candidate_summary text,
    seniority_level character varying(50),
    total_experience_years numeric(4,1),
    highest_education_level character varying(100),
    highest_education_field character varying(255),
    strengths jsonb DEFAULT '[]'::jsonb NOT NULL,
    weaknesses jsonb DEFAULT '[]'::jsonb NOT NULL,
    recommendations jsonb DEFAULT '[]'::jsonb NOT NULL,
    keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
    extracted_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    input_tokens integer,
    output_tokens integer,
    cache_read_tokens integer,
    cache_write_tokens integer,
    processing_time_ms integer,
    raw_llm_response text,
    prompt_version_used character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.analysis_results OWNER TO "LecinoLucas";

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    session_id uuid,
    ip_address character varying(45),
    user_agent text,
    action character varying(100) NOT NULL,
    resource_type character varying(100) NOT NULL,
    resource_id uuid,
    request_id uuid,
    http_method character varying(10),
    http_path text,
    http_status_code smallint,
    before_state jsonb,
    after_state jsonb,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
)
PARTITION BY RANGE ("timestamp");


ALTER TABLE public.audit_logs OWNER TO "LecinoLucas";

--
-- Name: candidate_documents; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.candidate_documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    admission_id uuid NOT NULL,
    document_requirement_id uuid NOT NULL,
    file_path character varying(1024) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    structured_data json,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    validated_at timestamp with time zone,
    CONSTRAINT ck_candidate_document_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.candidate_documents OWNER TO "LecinoLucas";

--
-- Name: candidate_job_scores; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.candidate_job_scores (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    candidate_id uuid NOT NULL,
    job_id uuid NOT NULL,
    version_id uuid NOT NULL,
    final_score numeric(5,2) NOT NULL,
    decision_suggestion character varying(30) NOT NULL,
    breakdown jsonb NOT NULL,
    reason_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    explanation_text text NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.candidate_job_scores OWNER TO "LecinoLucas";

--
-- Name: candidate_pipeline; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.candidate_pipeline (
    candidate_id uuid NOT NULL,
    job_id uuid NOT NULL,
    stage character varying(50) DEFAULT 'entry'::character varying NOT NULL,
    match_score numeric(5,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entered_at timestamp with time zone,
    last_moved_by uuid,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    CONSTRAINT ck_candidate_pipeline_stage CHECK (((stage)::text = ANY ((ARRAY['entry'::character varying, 'screening'::character varying, 'hr_interview'::character varying, 'technical_interview'::character varying, 'final'::character varying, 'offer'::character varying, 'hired'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT ck_candidate_pipeline_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'hired'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.candidate_pipeline OWNER TO "LecinoLucas";

--
-- Name: candidates; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.candidates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    full_name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    location_city character varying(100),
    location_state character varying(100),
    location_country character varying(10) DEFAULT 'BR'::character varying NOT NULL,
    linkedin_url text,
    github_url text,
    portfolio_url text,
    internal_notes text,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    cpf character varying(14),
    data_quality_status character varying(50) DEFAULT 'unknown'::character varying NOT NULL,
    data_quality_reason text,
    data_quality_marked_at timestamp with time zone
);


ALTER TABLE public.candidates OWNER TO "LecinoLucas";

--
-- Name: document_ai_analyses; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.document_ai_analyses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    document_id uuid NOT NULL,
    raw_text text,
    clean_text text,
    structured_data jsonb,
    confidence numeric(4,2),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    model_used character varying(100) DEFAULT 'document_ai_v1'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    error_message text,
    CONSTRAINT ck_document_ai_analyses_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'processed'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE public.document_ai_analyses OWNER TO "LecinoLucas";

--
-- Name: document_requirements; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.document_requirements (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    is_required boolean DEFAULT true NOT NULL
);


ALTER TABLE public.document_requirements OWNER TO "LecinoLucas";

--
-- Name: job_required_skills; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.job_required_skills (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    job_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    is_mandatory boolean DEFAULT false NOT NULL,
    minimum_level character varying(50),
    minimum_years numeric(4,1),
    weight numeric(4,2) DEFAULT 1.00 NOT NULL
);


ALTER TABLE public.job_required_skills OWNER TO "LecinoLucas";

--
-- Name: jobs; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.jobs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    requirements text,
    status public.job_status DEFAULT 'draft'::public.job_status NOT NULL,
    seniority_level character varying(50),
    work_model character varying(50),
    location character varying(255),
    salary_min numeric(12,2),
    salary_max numeric(12,2),
    salary_currency character varying(10) DEFAULT 'BRL'::character varying NOT NULL,
    created_by uuid NOT NULL,
    published_at timestamp with time zone,
    closed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    minimum_education_level character varying(50),
    minimum_years_experience numeric(4,1),
    deal_breakers json DEFAULT '[]'::json NOT NULL
);


ALTER TABLE public.jobs OWNER TO "LecinoLucas";

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO "LecinoLucas";

--
-- Name: pipeline_events; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.pipeline_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_type character varying(100) NOT NULL,
    entity_id uuid NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pipeline_events OWNER TO "LecinoLucas";

--
-- Name: pipeline_stage_transitions; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.pipeline_stage_transitions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    candidate_id uuid NOT NULL,
    job_id uuid NOT NULL,
    from_stage character varying(50),
    to_stage character varying(50) NOT NULL,
    moved_by uuid,
    moved_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger character varying(20) DEFAULT 'system'::character varying NOT NULL,
    notes text,
    reason character varying(500),
    CONSTRAINT ck_pipeline_transition_from_stage CHECK (((from_stage IS NULL) OR ((from_stage)::text = ANY ((ARRAY['entry'::character varying, 'screening'::character varying, 'hr_interview'::character varying, 'technical_interview'::character varying, 'final'::character varying, 'offer'::character varying, 'hired'::character varying, 'rejected'::character varying])::text[])))),
    CONSTRAINT ck_pipeline_transition_to_stage CHECK (((to_stage)::text = ANY ((ARRAY['entry'::character varying, 'screening'::character varying, 'hr_interview'::character varying, 'technical_interview'::character varying, 'final'::character varying, 'offer'::character varying, 'hired'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT ck_pipeline_transition_trigger CHECK (((trigger)::text = ANY ((ARRAY['manual'::character varying, 'auto_match'::character varying, 'system'::character varying])::text[])))
);


ALTER TABLE public.pipeline_stage_transitions OWNER TO "LecinoLucas";

--
-- Name: prompt_templates; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.prompt_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    version integer NOT NULL,
    description text,
    template_type character varying(100) NOT NULL,
    system_prompt text,
    user_prompt_template text NOT NULL,
    output_schema jsonb,
    max_tokens integer DEFAULT 4096 NOT NULL,
    temperature numeric(3,2) DEFAULT 0.1 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    activated_at timestamp with time zone,
    deactivated_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.prompt_templates OWNER TO "LecinoLucas";

--
-- Name: resume_job_matches; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.resume_job_matches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    analysis_id uuid NOT NULL,
    job_id uuid NOT NULL,
    match_score numeric(5,2),
    skills_match_score numeric(5,2),
    experience_match_score numeric(5,2),
    seniority_match_score numeric(5,2),
    matched_skills jsonb DEFAULT '[]'::jsonb NOT NULL,
    missing_skills jsonb DEFAULT '[]'::jsonb NOT NULL,
    bonus_skills jsonb DEFAULT '[]'::jsonb NOT NULL,
    match_summary text,
    recommendation character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    score_model_version_id uuid,
    validation_status character varying(50) DEFAULT 'pass'::character varying,
    missing_evidence json DEFAULT '[]'::json NOT NULL,
    rejection_reasons json DEFAULT '[]'::json NOT NULL,
    weights_source character varying(50) DEFAULT 'fallback_hardcoded'::character varying
);


ALTER TABLE public.resume_job_matches OWNER TO "LecinoLucas";

--
-- Name: resume_versions; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.resume_versions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    resume_id uuid NOT NULL,
    version_number integer NOT NULL,
    s3_bucket character varying(255) NOT NULL,
    s3_key character varying(500) NOT NULL,
    s3_etag character varying(100),
    s3_version_id character varying(200),
    original_file_name character varying(255) NOT NULL,
    file_size_bytes integer NOT NULL,
    file_hash_sha256 character varying(64) NOT NULL,
    mime_type character varying(100) DEFAULT 'application/pdf'::character varying NOT NULL,
    extracted_text text,
    extraction_status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    extraction_error text,
    page_count integer,
    word_count integer,
    language_detected character varying(10),
    uploaded_by uuid NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.resume_versions OWNER TO "LecinoLucas";

--
-- Name: resumes; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.resumes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    candidate_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    status public.resume_status DEFAULT 'active'::public.resume_status NOT NULL,
    current_version integer DEFAULT 1 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.resumes OWNER TO "LecinoLucas";

--
-- Name: score_model_versions; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.score_model_versions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    version character varying(20) NOT NULL,
    weights jsonb NOT NULL,
    thresholds jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.score_model_versions OWNER TO "LecinoLucas";

--
-- Name: skills; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.skills (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    normalized_name character varying(255) NOT NULL,
    category character varying(100),
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.skills OWNER TO "LecinoLucas";

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    user_agent text,
    ip_address character varying(45),
    device_fingerprint character varying(255),
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    revoke_reason character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_sessions OWNER TO "LecinoLucas";

--
-- Name: users; Type: TABLE; Schema: public; Owner: LecinoLucas
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    email_verified_at timestamp with time zone,
    password_hash character varying(255) NOT NULL,
    role public.user_role DEFAULT 'candidate'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'pending_verification'::public.user_status NOT NULL,
    full_name character varying(255) NOT NULL,
    avatar_url text,
    last_login_at timestamp with time zone,
    login_count integer DEFAULT 0 NOT NULL,
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    must_change_password boolean DEFAULT false NOT NULL
);


ALTER TABLE public.users OWNER TO "LecinoLucas";

--
-- Name: v_job_candidate_ranking; Type: VIEW; Schema: public; Owner: LecinoLucas
--

CREATE VIEW public.v_job_candidate_ranking AS
 SELECT rjm.job_id,
    j.title AS job_title,
    c.id AS candidate_id,
    c.full_name AS candidate_name,
    c.email,
    rjm.match_score,
    rjm.recommendation,
    rjm.matched_skills,
    rjm.missing_skills,
    ar.overall_score,
    ar.seniority_level,
    ar.total_experience_years,
    rjm.created_at AS match_created_at
   FROM ((((((public.resume_job_matches rjm
     JOIN public.analyses a ON ((a.id = rjm.analysis_id)))
     JOIN public.resume_versions rv ON ((rv.id = a.resume_version_id)))
     JOIN public.resumes r ON ((r.id = rv.resume_id)))
     JOIN public.candidates c ON ((c.id = r.candidate_id)))
     JOIN public.jobs j ON ((j.id = rjm.job_id)))
     LEFT JOIN public.analysis_results ar ON ((ar.analysis_id = a.id)))
  ORDER BY rjm.job_id, rjm.match_score DESC NULLS LAST;


ALTER VIEW public.v_job_candidate_ranking OWNER TO "LecinoLucas";

--
-- Data for Name: admissions; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.admissions (id, candidate_id, job_id, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: ai_models; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.ai_models (id, provider, model_id, model_name, context_window, is_active, activated_at, deprecated_at, created_at) FROM stdin;
a5d4dabd-5e00-4333-b7d5-86ef39103893	anthropic	claude-sonnet-4-6	Claude Sonnet 4.6	200000	t	2026-04-22 17:53:08.292927-03	\N	2026-04-22 17:53:08.292927-03
0b1d37ec-265d-410b-8495-2254e3c4fd51	anthropic	claude-opus-4-7	Claude Opus 4.7	200000	t	2026-04-22 17:53:08.292927-03	\N	2026-04-22 17:53:08.292927-03
a085e8a4-d1e3-46f9-86a2-decdcba6ee88	anthropic	claude-haiku-4-5-20251001	Claude Haiku 4.5	200000	t	2026-04-22 17:53:08.292927-03	\N	2026-04-22 17:53:08.292927-03
\.


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.alembic_version (version_num) FROM stdin;
b7d1e3a4c5f8
\.


--
-- Data for Name: analyses; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.analyses (id, resume_version_id, job_id, ai_model_id, prompt_template_id, status, priority, idempotency_key, requested_by, started_at, completed_at, failed_at, failure_reason, retry_count, max_retries, next_retry_at, queue_name, worker_id, task_id, created_at, updated_at) FROM stdin;
b2baa9cc-cf84-4533-bc63-bfd8b4e498a4	e9fe7ddb-7d05-421c-95f0-f3a6828a9495	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:02:47.840267-03	2026-04-28 13:02:49.462694-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-b2baa9cc-cf84-4533-bc63-bfd8b4e498a4	2026-04-28 13:02:47.83617-03	2026-04-28 13:02:49.462709-03
e9f5394f-5cfc-49b0-982c-09e6811035e6	d3133a4f-4abb-443c-ba07-7f5339d57f4a	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:21:00.083818-03	2026-04-29 00:21:01.696448-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-e9f5394f-5cfc-49b0-982c-09e6811035e6	2026-04-29 00:21:00.073758-03	2026-04-29 00:21:01.696457-03
7997677e-8572-42bb-8f24-bf4432705c9f	478b1e47-df07-49b7-b1e6-885700b39013	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:10:09.218464-03	2026-04-28 13:10:10.829298-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-7997677e-8572-42bb-8f24-bf4432705c9f	2026-04-28 13:10:09.214453-03	2026-04-28 13:10:10.829394-03
80e8153c-bb38-4e65-ade3-ced14c2835e0	28d2e7ad-4bad-46ce-9529-c23a0d27618a	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:12:32.236314-03	2026-04-28 13:12:33.851147-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-80e8153c-bb38-4e65-ade3-ced14c2835e0	2026-04-28 13:12:32.228332-03	2026-04-28 13:12:33.851161-03
9903d469-7c6c-45d4-9907-ab8649c2603e	e94fed74-be4f-4977-b79d-27c22d8f9b6a	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:42.323977-03	2026-04-29 07:16:43.937544-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-9903d469-7c6c-45d4-9907-ab8649c2603e	2026-04-29 07:16:42.317283-03	2026-04-29 07:16:43.937567-03
ad47f48b-c490-4b1a-b519-1da6707e668c	9c2849a0-4fad-42e4-a7ed-943de8f945f7	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:09.903498-03	2026-04-28 13:22:11.521037-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-ad47f48b-c490-4b1a-b519-1da6707e668c	2026-04-28 13:22:09.899509-03	2026-04-28 13:22:11.521047-03
cf5f356c-2cf6-47fe-85ed-896ded31d03e	e94fed74-be4f-4977-b79d-27c22d8f9b6a	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:42.512155-03	2026-04-29 07:16:44.159543-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-cf5f356c-2cf6-47fe-85ed-896ded31d03e	2026-04-29 07:16:42.509753-03	2026-04-29 07:16:44.159549-03
05b24a50-97de-4dd1-9033-1093d46a9a77	a5749515-4cc6-4a67-9ec1-d87e591ee838	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:10.803324-03	2026-04-29 07:24:12.504967-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-05b24a50-97de-4dd1-9033-1093d46a9a77	2026-04-29 07:24:10.799881-03	2026-04-29 07:24:12.504978-03
83bbdb5e-ff3b-4baf-a179-aba28e745860	68114b9f-c2c3-46b5-be96-ee53ea43fdfe	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:51:10.671586-03	2026-04-28 23:51:12.284618-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-83bbdb5e-ff3b-4baf-a179-aba28e745860	2026-04-28 23:51:10.579154-03	2026-04-28 23:51:12.28463-03
edfde383-6525-4fee-90bd-779632a15891	48744fc7-597e-4889-9792-d658794e35dc	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:51.285906-03	2026-04-29 07:25:52.985798-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-edfde383-6525-4fee-90bd-779632a15891	2026-04-29 07:25:51.281386-03	2026-04-29 07:25:52.985804-03
f6b75baf-22f6-421f-a8c0-2f09b51b0908	dbc5aef4-7411-44ea-8a32-6d1ad5afb98b	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:36:36.05729-03	2026-04-29 07:36:37.686877-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-f6b75baf-22f6-421f-a8c0-2f09b51b0908	2026-04-29 07:36:36.054569-03	2026-04-29 07:36:37.686882-03
ffb4d3fb-d00f-43b8-be18-407988f45130	20ee72ff-4e58-4ab2-ac76-1258cc969b0c	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:41:52.202706-03	2026-04-29 07:41:53.82472-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-ffb4d3fb-d00f-43b8-be18-407988f45130	2026-04-29 07:41:52.199324-03	2026-04-29 07:41:53.824726-03
6812cba6-5487-451f-ad95-23f41635c607	e54ecdaf-99c5-4a03-9e6b-d0c6d06f0493	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:04:20.256824-03	2026-04-28 13:04:21.869084-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-6812cba6-5487-451f-ad95-23f41635c607	2026-04-28 13:04:20.249251-03	2026-04-28 13:04:21.869099-03
da745973-2eea-433a-9d20-91fbb62cd235	d3133a4f-4abb-443c-ba07-7f5339d57f4a	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:21:00.405295-03	2026-04-29 00:21:02.07649-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-da745973-2eea-433a-9d20-91fbb62cd235	2026-04-29 00:21:00.400572-03	2026-04-29 00:21:02.076496-03
22223887-f489-439f-9530-35dbe99505d4	28d2e7ad-4bad-46ce-9529-c23a0d27618a	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:11:49.410181-03	2026-04-28 13:11:51.022354-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-22223887-f489-439f-9530-35dbe99505d4	2026-04-28 13:11:49.406941-03	2026-04-28 13:11:51.022368-03
50b02822-d85a-4d42-a073-c54e93373524	3ae254ba-7880-42b2-9469-9c6b3f5a897c	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:29.402097-03	2026-04-29 07:20:31.011953-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-50b02822-d85a-4d42-a073-c54e93373524	2026-04-29 07:20:29.378023-03	2026-04-29 07:20:31.011958-03
5d6b937f-0c71-490d-903f-cb092d15063e	acd75758-8c6d-460a-b0bc-2a3423ee586e	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:40:04.700866-03	2026-04-28 13:40:06.316551-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-5d6b937f-0c71-490d-903f-cb092d15063e	2026-04-28 13:40:04.695779-03	2026-04-28 13:40:06.316563-03
7a143efd-ce2a-4df3-9dda-ba511ae615fa	6a8330f5-4666-495b-b2cc-0c81489208de	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:44.068707-03	2026-04-29 07:24:45.67869-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-7a143efd-ce2a-4df3-9dda-ba511ae615fa	2026-04-29 07:24:44.064444-03	2026-04-29 07:24:45.678698-03
d7c40b72-b74c-42ee-b73c-861284273a26	f28eee6e-6c5e-4a09-903e-bc6a1737d2d8	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:00:19.796692-03	2026-04-28 15:00:21.410041-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-d7c40b72-b74c-42ee-b73c-861284273a26	2026-04-28 15:00:19.790042-03	2026-04-28 15:00:21.410058-03
e66cd922-81f2-4b7f-b23e-e4e56fc2f11a	5ab0d349-2dc2-4e2d-9394-23bae4c66f40	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:54.575652-03	2026-04-29 07:26:56.188429-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-e66cd922-81f2-4b7f-b23e-e4e56fc2f11a	2026-04-29 07:26:54.570752-03	2026-04-29 07:26:56.188438-03
fa31d124-4fc2-4265-a071-7e0c5fd7ea86	8cbec5aa-68ee-4fac-9356-4ace3494ac74	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:33.113423-03	2026-04-29 00:19:34.727674-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-fa31d124-4fc2-4265-a071-7e0c5fd7ea86	2026-04-29 00:19:33.108311-03	2026-04-29 00:19:34.727684-03
9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	4a8350fe-3df5-42a6-8bd8-66901a4a0389	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:40:19.309235-03	2026-04-29 07:40:20.924931-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	2026-04-29 07:40:19.282539-03	2026-04-29 07:40:20.924949-03
9209b9e6-f79e-473d-8791-d83bd67a91fd	43de96a4-2b8a-479a-8a82-7dff8bea81d7	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:05:20.690612-03	2026-04-28 13:05:22.301773-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-9209b9e6-f79e-473d-8791-d83bd67a91fd	2026-04-28 13:05:20.686261-03	2026-04-28 13:05:22.301781-03
ff94781e-ace5-4646-8800-e186425ef6ab	30886b92-fff2-4505-84e6-b074c9a023ab	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:22:26.997387-03	2026-04-29 00:22:28.605927-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-ff94781e-ace5-4646-8800-e186425ef6ab	2026-04-29 00:22:26.989107-03	2026-04-29 00:22:28.605935-03
69d38797-2753-4d7f-8522-c0e772beb2dd	e1c222bc-76d0-40d4-8cd5-ff69ff91bddf	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:17:01.095706-03	2026-04-28 13:17:02.708048-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-69d38797-2753-4d7f-8522-c0e772beb2dd	2026-04-28 13:17:01.091614-03	2026-04-28 13:17:02.708054-03
259fae0e-cc55-45b9-8fdb-b42a38d62730	3ae254ba-7880-42b2-9469-9c6b3f5a897c	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:29.654877-03	2026-04-29 07:20:31.359606-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-259fae0e-cc55-45b9-8fdb-b42a38d62730	2026-04-29 07:20:29.650947-03	2026-04-29 07:20:31.359642-03
3daa4489-d2be-4204-98cc-45c183ec4a2a	5dbf606b-a252-41a3-8678-4175cfcb1bde	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:33.98646-03	2026-04-28 13:22:35.597721-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-3daa4489-d2be-4204-98cc-45c183ec4a2a	2026-04-28 13:22:33.983816-03	2026-04-28 13:22:35.597741-03
86f7a25b-2137-479a-a406-4df371a75ea4	6a8330f5-4666-495b-b2cc-0c81489208de	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:44.342462-03	2026-04-29 07:24:46.144305-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-86f7a25b-2137-479a-a406-4df371a75ea4	2026-04-29 07:24:44.336756-03	2026-04-29 07:24:46.14431-03
49d9d0c6-86ae-4f1a-acc0-d97f2deaf98a	5ab0d349-2dc2-4e2d-9394-23bae4c66f40	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:54.851795-03	2026-04-29 07:26:56.519877-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-49d9d0c6-86ae-4f1a-acc0-d97f2deaf98a	2026-04-29 07:26:54.847007-03	2026-04-29 07:26:56.519881-03
c3d5a700-eb6f-4fd2-8c05-a519a114ea70	6cdee89c-be83-46a5-89f1-6334f075b668	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:18:59.106488-03	2026-04-28 15:19:00.722176-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-c3d5a700-eb6f-4fd2-8c05-a519a114ea70	2026-04-28 15:18:59.100941-03	2026-04-28 15:19:00.722187-03
8bb6feb6-265d-4811-ab35-bff19882d5cd	4a8350fe-3df5-42a6-8bd8-66901a4a0389	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:40:19.553165-03	2026-04-29 07:40:21.169402-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-8bb6feb6-265d-4811-ab35-bff19882d5cd	2026-04-29 07:40:19.548987-03	2026-04-29 07:40:21.169404-03
ceaec31e-dfe6-44c7-9f62-738a35ff5f52	8cbec5aa-68ee-4fac-9356-4ace3494ac74	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:33.252-03	2026-04-29 00:19:34.875143-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-ceaec31e-dfe6-44c7-9f62-738a35ff5f52	2026-04-29 00:19:33.246875-03	2026-04-29 00:19:34.875148-03
ee000a38-39fb-4adc-88b8-abd4a4bbebbb	0f0de3c8-a301-4cbb-a591-aa0e08b56180	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:08:35.945488-03	2026-04-28 13:08:37.563228-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-ee000a38-39fb-4adc-88b8-abd4a4bbebbb	2026-04-28 13:08:35.937109-03	2026-04-28 13:08:37.563241-03
d612091a-ee17-489e-aa1e-70fc974c04f5	30886b92-fff2-4505-84e6-b074c9a023ab	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:22:27.26403-03	2026-04-29 00:22:29.007982-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-d612091a-ee17-489e-aa1e-70fc974c04f5	2026-04-29 00:22:27.254873-03	2026-04-29 00:22:29.007998-03
d8196a04-fe64-4293-8483-847b582130a4	8a77f960-5f5d-4a0d-9f7c-efdf21d7c342	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:21:03.816815-03	2026-04-28 13:21:05.430821-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-d8196a04-fe64-4293-8483-847b582130a4	2026-04-28 13:21:03.811451-03	2026-04-28 13:21:05.430835-03
52e21588-1cb1-447a-aa04-41c37a0218b4	a5749515-4cc6-4a67-9ec1-d87e591ee838	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:10.528089-03	2026-04-29 07:24:12.165407-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-52e21588-1cb1-447a-aa04-41c37a0218b4	2026-04-29 07:24:10.523173-03	2026-04-29 07:24:12.165414-03
85ba7582-7d92-4b6d-ba80-d2434e6efe01	48744fc7-597e-4889-9792-d658794e35dc	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:51.012596-03	2026-04-29 07:25:52.705599-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-85ba7582-7d92-4b6d-ba80-d2434e6efe01	2026-04-29 07:25:51.008952-03	2026-04-29 07:25:52.705613-03
48293dc4-355c-41b2-bc94-329b91372949	dbc5aef4-7411-44ea-8a32-6d1ad5afb98b	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:36:35.76887-03	2026-04-29 07:36:37.382668-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-48293dc4-355c-41b2-bc94-329b91372949	2026-04-29 07:36:35.763717-03	2026-04-29 07:36:37.382684-03
c4a65dc8-c453-44b9-91e5-8b317d7d2ca8	8df40af1-fbd4-4f3d-a28a-6039586e3fb0	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:47:42.952919-03	2026-04-28 23:47:44.574526-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-c4a65dc8-c453-44b9-91e5-8b317d7d2ca8	2026-04-28 23:47:42.944637-03	2026-04-28 23:47:44.574542-03
53f5327d-ed02-4966-9ff6-e90290a81f65	20ee72ff-4e58-4ab2-ac76-1258cc969b0c	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	5a90ade4-6817-4a0b-a9c8-aa86f0007115	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:41:51.934502-03	2026-04-29 07:41:53.546308-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-53f5327d-ed02-4966-9ff6-e90290a81f65	2026-04-29 07:41:51.92368-03	2026-04-29 07:41:53.546316-03
18b4d7ff-a770-4bca-8e7d-8ff676912b29	ac2b11de-44cc-4e1f-914d-4c70fa3aed59	\N	a5d4dabd-5e00-4333-b7d5-86ef39103893	a71a7afb-0805-4980-beaa-10ff97ee310b	completed	5	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 09:14:01.992606-03	2026-04-28 09:14:03.625422-03	\N	\N	0	3	\N	analysis.default	dev-inline-worker	inline-18b4d7ff-a770-4bca-8e7d-8ff676912b29	2026-04-28 09:14:01.984071-03	2026-04-28 09:14:03.625433-03
\.


--
-- Data for Name: analysis_results; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.analysis_results (id, analysis_id, overall_score, technical_score, experience_score, education_score, communication_score, leadership_score, candidate_summary, seniority_level, total_experience_years, highest_education_level, highest_education_field, strengths, weaknesses, recommendations, keywords, extracted_data, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, processing_time_ms, raw_llm_response, prompt_version_used, created_at) FROM stdin;
09f1c5f1-120b-4a04-93a5-06e9ddf8c38d	b2baa9cc-cf84-4533-bc63-bfd8b4e498a4	74.00	77.00	69.00	66.00	75.00	64.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:02:49.46715-03
8cb14321-64f6-4fcf-8866-5e03aaf24ce0	6812cba6-5487-451f-ad95-23f41635c607	71.00	74.00	66.00	63.00	72.00	61.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:04:21.87073-03
2c174fb2-dcf0-46d5-ad86-04b6e00c34e2	9209b9e6-f79e-473d-8791-d83bd67a91fd	61.00	64.00	56.00	53.00	62.00	51.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:05:22.303243-03
26f98100-8fe1-4d5b-aedc-5382026c31cb	ad47f48b-c490-4b1a-b519-1da6707e668c	89.00	92.00	84.00	81.00	90.00	79.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:22:11.523036-03
548e93f9-1cdb-47b8-8821-d96d437cac2f	3daa4489-d2be-4204-98cc-45c183ec4a2a	62.00	65.00	57.00	54.00	63.00	52.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:22:35.599175-03
2fc55fe5-50ae-41d9-a7ab-6bb8dc09c256	c3d5a700-eb6f-4fd2-8c05-a519a114ea70	92.00	95.00	87.00	84.00	93.00	82.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 15:19:00.724908-03
4d3559b5-bdac-43d9-ae6c-492a3905bf75	ff94781e-ace5-4646-8800-e186425ef6ab	91.00	94.00	86.00	83.00	92.00	81.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 00:22:28.60758-03
4c9bd0d3-6062-47ea-b3fd-905ee810c1c4	05b24a50-97de-4dd1-9033-1093d46a9a77	65.00	68.00	60.00	57.00	66.00	55.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:24:12.673214-03
a074fc23-d49e-4234-8fde-4e7fdd7837b7	49d9d0c6-86ae-4f1a-acc0-d97f2deaf98a	78.00	81.00	73.00	70.00	79.00	68.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:26:56.541443-03
dafb1fea-76ab-4304-9369-9f8716723f98	ffb4d3fb-d00f-43b8-be18-407988f45130	89.00	92.00	84.00	81.00	90.00	79.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:41:53.825734-03
b0eccfb1-d1c8-469b-8b03-6cd68027d88a	ee000a38-39fb-4adc-88b8-abd4a4bbebbb	72.00	75.00	67.00	64.00	73.00	62.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:08:37.568047-03
a3fd349f-f9c5-44e7-bcf2-6ca623fd6bce	5d6b937f-0c71-490d-903f-cb092d15063e	83.00	86.00	78.00	75.00	84.00	73.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:40:06.320889-03
21391ef7-8d55-4d6e-912c-4c1ac606f88d	c4a65dc8-c453-44b9-91e5-8b317d7d2ca8	61.00	64.00	56.00	53.00	62.00	51.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 23:47:44.578645-03
fac32d07-8095-4c3b-9ca3-7403543bd904	d612091a-ee17-489e-aa1e-70fc974c04f5	68.00	71.00	63.00	60.00	69.00	58.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 00:22:29.00967-03
de7af3af-9b96-41ad-ae76-5d96422d6221	7a143efd-ce2a-4df3-9dda-ba511ae615fa	84.00	87.00	79.00	76.00	85.00	74.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:24:45.681377-03
f0d71358-dce2-42b4-9bde-59ed3e8e0a99	48293dc4-355c-41b2-bc94-329b91372949	63.00	66.00	58.00	55.00	64.00	53.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:36:37.386958-03
f8f351c7-e723-434b-8a3b-4b7ff8dfba8c	7997677e-8572-42bb-8f24-bf4432705c9f	67.00	70.00	62.00	59.00	68.00	57.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:10:10.831595-03
30195224-b26d-43ee-8f31-1d0c74e9584d	22223887-f489-439f-9530-35dbe99505d4	89.00	92.00	84.00	81.00	90.00	79.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:11:51.024539-03
859bdc8d-873b-4010-9179-52b31bd1f1a6	83bbdb5e-ff3b-4baf-a179-aba28e745860	82.00	85.00	77.00	74.00	83.00	72.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 23:51:12.28808-03
6918f298-3ad6-4055-bc89-fb89db7183d2	9903d469-7c6c-45d4-9907-ab8649c2603e	66.00	69.00	61.00	58.00	67.00	56.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:16:43.94136-03
8aa63fe8-c5b7-49e5-857e-700aa5a55e28	86f7a25b-2137-479a-a406-4df371a75ea4	65.00	68.00	60.00	57.00	66.00	55.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:24:46.145658-03
90043807-6b71-4c45-baeb-c82646327f3e	f6b75baf-22f6-421f-a8c0-2f09b51b0908	73.00	76.00	68.00	65.00	74.00	63.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:36:37.68844-03
6dbf75b4-e4f2-443e-8e7e-52c3bd772e1a	80e8153c-bb38-4e65-ade3-ced14c2835e0	86.00	89.00	81.00	78.00	87.00	76.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:12:33.853502-03
15932597-279e-4b3b-8816-c264bfb4e2e2	fa31d124-4fc2-4265-a071-7e0c5fd7ea86	83.00	86.00	78.00	75.00	84.00	73.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 00:19:34.731182-03
471a7551-2dfd-4546-8cb7-a130b9bfc21b	cf5f356c-2cf6-47fe-85ed-896ded31d03e	75.00	78.00	70.00	67.00	76.00	65.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:16:44.168915-03
fff8eec9-4e02-4c12-9a28-1795fc7d50b6	85ba7582-7d92-4b6d-ba80-d2434e6efe01	90.00	93.00	85.00	82.00	91.00	80.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:25:52.710643-03
63f6e3d7-3118-4406-9657-475f262748ae	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	72.00	75.00	67.00	64.00	73.00	62.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:40:20.928469-03
45c8f96a-c3b3-4d97-a9bc-f34ef1d682a2	69d38797-2753-4d7f-8522-c0e772beb2dd	91.00	94.00	86.00	83.00	92.00	81.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:17:02.710069-03
1d0f305b-fd46-4d30-9112-b4bcb1e4f7c4	ceaec31e-dfe6-44c7-9f62-738a35ff5f52	85.00	88.00	80.00	77.00	86.00	75.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 00:19:34.879081-03
7f973efe-b100-456c-bd8b-4e9a465b5cb8	50b02822-d85a-4d42-a073-c54e93373524	90.00	93.00	85.00	82.00	91.00	80.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:20:31.013257-03
e33b582d-558c-417b-aa9e-b1f3df6d5cdf	259fae0e-cc55-45b9-8fdb-b42a38d62730	63.00	66.00	58.00	55.00	64.00	53.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:20:31.365303-03
59451726-e461-40a2-bf3e-13788a3f9fa5	edfde383-6525-4fee-90bd-779632a15891	74.00	77.00	69.00	66.00	75.00	64.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:25:52.997613-03
51e9ab89-1834-4ad2-832f-beda562739e0	8bb6feb6-265d-4811-ab35-bff19882d5cd	78.00	81.00	73.00	70.00	79.00	68.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:40:21.170605-03
346108af-57d9-458b-b149-10d11ebdf788	d8196a04-fe64-4293-8483-847b582130a4	69.00	72.00	64.00	61.00	70.00	59.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 13:21:05.434245-03
d9604672-df84-49e0-abb2-5fc272160495	d7c40b72-b74c-42ee-b73c-861284273a26	86.00	89.00	81.00	78.00	87.00	76.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 15:00:21.414175-03
4edac8e7-cf58-4efe-888b-e1fbf6142a6e	e9f5394f-5cfc-49b0-982c-09e6811035e6	70.00	73.00	65.00	62.00	71.00	60.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 00:21:01.698567-03
fbf00a1b-31ae-4364-8043-ec0af42c986a	da745973-2eea-433a-9d20-91fbb62cd235	87.00	90.00	82.00	79.00	88.00	77.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 00:21:02.077599-03
e81d7778-9cb4-44cb-bbdc-a5ea4bd623d4	52e21588-1cb1-447a-aa04-41c37a0218b4	92.00	95.00	87.00	84.00	93.00	82.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:24:12.172518-03
d2f5a23c-7a4e-4f74-ad1d-e31ef26930bd	e66cd922-81f2-4b7f-b23e-e4e56fc2f11a	81.00	84.00	76.00	73.00	82.00	71.00	Candidato com perfil técnico consistente para vagas de tecnologia.	senior	6.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:26:56.191646-03
21f61d89-9a90-4d9f-85bb-56e91071f334	18b4d7ff-a770-4bca-8e7d-8ff676912b29	63.00	66.00	58.00	55.00	64.00	53.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-28 09:14:03.63808-03
ba5f9650-7242-46dd-b59f-ea142af2f2b9	53f5327d-ed02-4966-9ff6-e90290a81f65	61.00	64.00	56.00	53.00	62.00	51.00	Candidato com perfil técnico consistente para vagas de tecnologia.	mid	4.0	bachelor	Computação	["Fundamentos técnicos", "Boa comunicação"]	["Pouca evidência de liderança formal"]	["Aprofundar cases de impacto", "Detalhar resultados por projeto"]	["python", "sql", "api", "backend"]	{"education": [{"field": "Computação", "level": "bachelor"}], "languages": ["pt", "en"]}	1200	450	0	0	1600	{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}	dev_mock	2026-04-29 07:41:53.548237-03
\.


--
-- Data for Name: candidate_documents; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.candidate_documents (id, admission_id, document_requirement_id, file_path, status, structured_data, uploaded_at, validated_at) FROM stdin;
\.


--
-- Data for Name: candidate_job_scores; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.candidate_job_scores (id, candidate_id, job_id, version_id, final_score, decision_suggestion, breakdown, reason_codes, explanation_text, computed_at) FROM stdin;
0d1fd3af-2e31-42a2-b7a5-3ccf4daa6f1b	63187b76-e83b-4545-bdfe-61664ee094c3	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	37.55	rejected_suggested	{"final_score": 37.55, "penalty_score": 0.0, "education_score": 55.0, "skill_match_score": 0.0, "ai_confidence_score": 63.0, "seniority_match_score": 75.0, "experience_match_score": 58.0}	[{"type": "seniority", "field": "mid", "impact": 3.75, "description": "Senioridade parcialmente compatível"}, {"type": "experience", "field": "total_experience_years", "impact": 2.0, "description": "Experiência parcialmente compatível (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Lecino Lucas obteve score 37.5/100. Perfil: mid, 4 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
91515b65-5d99-4c30-bb0f-ec76e5bd900a	0db26fb0-8008-43b1-bf50-55e9b9518143	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	44.08	rejected_suggested	{"final_score": 44.08, "penalty_score": 0.0, "education_score": 81.0, "skill_match_score": 0.0, "ai_confidence_score": 89.0, "seniority_match_score": 40.5, "experience_match_score": 84.0}	[{"type": "seniority", "field": "senior", "impact": -1.43, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": 8.5, "description": "Experiência profissional relevante (6 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Hiago3 obteve score 44.1/100. Perfil: senior, 6 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
26928285-5aba-4233-ba1c-794f16cae224	0d53a1ff-fce7-4a49-b8c6-e83286bd7210	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	37.10	rejected_suggested	{"final_score": 37.1, "penalty_score": 0.0, "education_score": 54.0, "skill_match_score": 0.0, "ai_confidence_score": 62.0, "seniority_match_score": 75.0, "experience_match_score": 57.0}	[{"type": "seniority", "field": "mid", "impact": 3.75, "description": "Senioridade parcialmente compatível"}, {"type": "experience", "field": "total_experience_years", "impact": 1.75, "description": "Experiência parcialmente compatível (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Hiago 4 obteve score 37.1/100. Perfil: mid, 4 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
4b2e2cf5-d5e4-4de6-a9bc-a61ebd148d39	6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	42.50	rejected_suggested	{"final_score": 42.5, "penalty_score": 0.0, "education_score": 66.0, "skill_match_score": 0.0, "ai_confidence_score": 74.0, "seniority_match_score": 75.0, "experience_match_score": 69.0}	[{"type": "seniority", "field": "mid", "impact": 3.75, "description": "Senioridade parcialmente compatível"}, {"type": "experience", "field": "total_experience_years", "impact": 4.75, "description": "Experiência parcialmente compatível (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Marcos Cruz obteve score 42.5/100. Perfil: mid, 4 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
fc673752-f4bb-4ed4-8817-0761760c8cbe	f9b6fa2d-c337-4106-8a7b-a6d06c588561	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	41.15	rejected_suggested	{"final_score": 41.15, "penalty_score": 0.0, "education_score": 63.0, "skill_match_score": 0.0, "ai_confidence_score": 71.0, "seniority_match_score": 75.0, "experience_match_score": 66.0}	[{"type": "seniority", "field": "mid", "impact": 3.75, "description": "Senioridade parcialmente compatível"}, {"type": "experience", "field": "total_experience_years", "impact": 4.0, "description": "Experiência parcialmente compatível (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Gustavo Gonçalves obteve score 41.1/100. Perfil: mid, 4 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
1e6fe2e0-5d0a-40ce-ac4c-c22299c4cbeb	bb2632a2-c424-4ee9-9e36-7c6db2a35282	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	41.60	rejected_suggested	{"final_score": 41.6, "penalty_score": 0.0, "education_score": 64.0, "skill_match_score": 0.0, "ai_confidence_score": 72.0, "seniority_match_score": 75.0, "experience_match_score": 67.0}	[{"type": "seniority", "field": "mid", "impact": 3.75, "description": "Senioridade parcialmente compatível"}, {"type": "experience", "field": "total_experience_years", "impact": 4.25, "description": "Experiência parcialmente compatível (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Daniel Silva obteve score 41.6/100. Perfil: mid, 4 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
dae79978-0c66-485b-b367-2e8716dafb12	ba22024f-23df-4ced-8bc0-dc1cda884acb	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	40.25	rejected_suggested	{"final_score": 40.25, "penalty_score": 0.0, "education_score": 61.0, "skill_match_score": 0.0, "ai_confidence_score": 69.0, "seniority_match_score": 75.0, "experience_match_score": 64.0}	[{"type": "seniority", "field": "mid", "impact": 3.75, "description": "Senioridade parcialmente compatível"}, {"type": "experience", "field": "total_experience_years", "impact": 3.5, "description": "Experiência parcialmente compatível (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Hiago 2 obteve score 40.2/100. Perfil: mid, 4 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
1ddebd7e-eb6d-48fa-92d0-b7eb1dafe35a	f709039e-b5ba-4339-8714-21bd010d7c56	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	42.72	rejected_suggested	{"final_score": 42.72, "penalty_score": 0.0, "education_score": 78.0, "skill_match_score": 0.0, "ai_confidence_score": 86.0, "seniority_match_score": 40.5, "experience_match_score": 81.0}	[{"type": "seniority", "field": "senior", "impact": -1.43, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": 7.75, "description": "Experiência profissional relevante (6 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Hiago Dantas obteve score 42.7/100. Perfil: senior, 6 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
c543e84f-ff64-4e71-9ae6-f21371e6a9cc	ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	41.38	rejected_suggested	{"final_score": 41.38, "penalty_score": 0.0, "education_score": 75.0, "skill_match_score": 0.0, "ai_confidence_score": 83.0, "seniority_match_score": 40.5, "experience_match_score": 78.0}	[{"type": "seniority", "field": "senior", "impact": -1.43, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": 7.0, "description": "Experiência profissional relevante (6 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Hiago 6 obteve score 41.4/100. Perfil: senior, 6 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
0cf942f0-7e2f-4fbb-a92b-5e8cce3685df	dbbfea9e-1207-4a42-9c58-31ce837773db	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	39.35	rejected_suggested	{"final_score": 39.35, "penalty_score": 0.0, "education_score": 59.0, "skill_match_score": 0.0, "ai_confidence_score": 67.0, "seniority_match_score": 75.0, "experience_match_score": 62.0}	[{"type": "seniority", "field": "mid", "impact": 3.75, "description": "Senioridade parcialmente compatível"}, {"type": "experience", "field": "total_experience_years", "impact": 3.0, "description": "Experiência parcialmente compatível (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Matheus Vieira obteve score 39.4/100. Perfil: mid, 4 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
ab1b38c4-0bc4-4fca-badb-47764a5fe91f	ab0b2d73-ab7d-44a5-94c3-bf1c21733063	14d8391e-850f-4676-a7d4-96e05b05c633	1253564f-bc5e-4f85-b59d-fa07c9edca39	44.98	rejected_suggested	{"final_score": 44.98, "penalty_score": 0.0, "education_score": 83.0, "skill_match_score": 0.0, "ai_confidence_score": 91.0, "seniority_match_score": 40.5, "experience_match_score": 86.0}	[{"type": "seniority", "field": "senior", "impact": -1.43, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": 9.0, "description": "Experiência profissional relevante (6 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	Ariovaldo obteve score 45.0/100. Perfil: senior, 6 anos de experiência. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-28 14:12:43.391943-03
1aa8538d-ea0b-424f-81da-6ddc46560121	9ff5ad7e-c9aa-47e7-aa85-152bcae74799	8f6d2400-8c63-4d1b-82f3-926d488017d9	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA Deal Breaker Candidate 1777432776918 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 00:21:04.504754-03
6be06c25-8388-4745-b604-c36406ecf225	bb9c2755-fef1-4767-ac3e-b1581992cefe	8f6d2400-8c63-4d1b-82f3-926d488017d9	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA E2E 1777432857695 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 00:21:04.504754-03
a765af79-a02c-4099-9ad2-4c3375fae562	1d84d654-275b-47d7-ab91-348743e52040	df52f1c7-4cb7-4215-b8eb-921f82f89e2e	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA E2E 1777432944986 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 00:22:31.35885-03
3a1c8d39-b37b-4899-beef-3e2dae513bc9	db670570-7271-4513-9286-be386c347fcb	12fe640a-40a4-4004-9c06-7c4eac7997a0	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA Deal Breaker Candidate 1777457630688 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 07:16:46.576757-03
b20b8e23-4282-4870-9ba9-143fb3d54bc0	46333bfc-f564-45eb-a3bd-22117964fb2a	12fe640a-40a4-4004-9c06-7c4eac7997a0	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA E2E 1777457799870 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 07:16:46.576757-03
82885d39-d838-4f1e-825c-e4b9b1112310	d246ef01-5914-450c-8673-24572b977e8c	30cbb747-a5ad-45fc-829c-33f5519e2870	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA E2E 1777458027145 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 07:20:33.819025-03
3040534d-db19-4605-8417-219e6cf05bac	5ae9b847-fdc3-44e8-8885-0b36dfce4453	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA E2E 1777458248373 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 07:24:15.216037-03
6d28194c-6c28-4fd7-833d-073f01ec3fcb	25cbe08a-c93e-4a64-b661-94d0f7ff68f1	002c11b5-26b0-428b-8ae1-251211888bf6	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA E2E 1777458281673 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 07:24:48.443883-03
006724e8-0321-427f-8dc7-a790ecc1a98b	adccb07f-ba13-4ef1-b321-a9c901e3e677	3eb69bdb-df4b-4294-9636-b584e2d36530	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA E2E 1777458348824 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 07:25:55.374859-03
e40bec61-bf82-44a8-9351-9527619db23e	550364ec-d0b5-4ae3-8ff0-24ed1fe99793	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	1253564f-bc5e-4f85-b59d-fa07c9edca39	0.00	rejected_suggested	{"final_score": 0.0, "penalty_score": 0.0, "education_score": 0.0, "skill_match_score": 0.0, "ai_confidence_score": 0.0, "seniority_match_score": 0.0, "experience_match_score": 0.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "seniority", "impact": -7.5, "description": "Baixo fit para o nível de senioridade exigido"}, {"type": "experience", "field": "total_experience_years", "impact": -12.5, "description": "Experiência insuficiente para o cargo"}]	QA E2E 1777458412533 obteve score 0.0/100. Perfil: não identificado, experiência não quantificada. Perfil abaixo do threshold mínimo para esta vaga.	2026-04-29 07:26:58.954987-03
2318fb54-a004-44a8-982d-6239bdac9d92	d95ab262-c912-437d-ab16-66a7e94c98c0	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	1253564f-bc5e-4f85-b59d-fa07c9edca39	45.80	review	{"final_score": 45.8, "penalty_score": 0.0, "education_score": 65.0, "skill_match_score": 0.0, "ai_confidence_score": 73.0, "seniority_match_score": 100.0, "experience_match_score": 68.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "mid", "impact": 7.5, "description": "Nível de senioridade compatível com a vaga"}, {"type": "experience", "field": "total_experience_years", "impact": 4.5, "description": "Experiência parcialmente compatível (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	QA E2E 1777458993328 obteve score 45.8/100. Perfil: mid, 4 anos de experiência. Candidato requer avaliação adicional pelo recrutador.	2026-04-29 07:36:40.138513-03
2da273b4-54a4-4369-a320-f07f98f73819	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	3020b91e-658d-4e0a-9edf-93cb692b95a2	1253564f-bc5e-4f85-b59d-fa07c9edca39	48.05	review	{"final_score": 48.05, "penalty_score": 0.0, "education_score": 70.0, "skill_match_score": 0.0, "ai_confidence_score": 78.0, "seniority_match_score": 100.0, "experience_match_score": 73.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "mid", "impact": 7.5, "description": "Nível de senioridade compatível com a vaga"}, {"type": "experience", "field": "total_experience_years", "impact": 5.75, "description": "Experiência profissional relevante (4 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	QA E2E 1777459216980 obteve score 48.0/100. Perfil: mid, 4 anos de experiência. Candidato requer avaliação adicional pelo recrutador.	2026-04-29 07:41:56.301262-03
d777e97a-4b58-4561-9f72-9174406623f4	e839ead1-5147-4899-aa45-17d54b911501	3020b91e-658d-4e0a-9edf-93cb692b95a2	1253564f-bc5e-4f85-b59d-fa07c9edca39	49.25	review	{"final_score": 49.25, "penalty_score": 0.0, "education_score": 81.0, "skill_match_score": 0.0, "ai_confidence_score": 89.0, "seniority_match_score": 75.0, "experience_match_score": 84.0, "validation_penalty_score": 0.0, "deal_breaker_penalty_score": 0.0}	[{"type": "seniority", "field": "senior", "impact": 3.75, "description": "Senioridade parcialmente compatível"}, {"type": "experience", "field": "total_experience_years", "impact": 8.5, "description": "Experiência profissional relevante (6 anos)"}, {"type": "strength", "field": "profile", "impact": 2.0, "description": "Ponto forte: Fundamentos técnicos"}, {"type": "weakness", "field": "profile", "impact": -2.0, "description": "Ponto de atenção: Pouca evidência de liderança formal"}]	QA E2E 1777459309515 obteve score 49.2/100. Perfil: senior, 6 anos de experiência. Candidato requer avaliação adicional pelo recrutador.	2026-04-29 07:41:56.301262-03
\.


--
-- Data for Name: candidate_pipeline; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.candidate_pipeline (candidate_id, job_id, stage, match_score, created_at, updated_at, entered_at, last_moved_by, status) FROM stdin;
23806535-fd2c-480b-8651-79687104b3cf	053dd20d-1f46-452b-9b0d-64222546b0ba	entry	\N	2026-04-29 07:43:23.727286-03	2026-04-29 07:43:23.727286-03	2026-04-29 07:43:23.727286-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	de2170f8-6183-4581-8048-21256db5cb53	entry	74.50	2026-04-28 13:02:29.447026-03	2026-04-28 13:02:49.530898-03	2026-04-28 13:02:29.447026-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
63187b76-e83b-4545-bdfe-61664ee094c3	de2170f8-6183-4581-8048-21256db5cb53	entry	69.00	2026-04-28 09:14:03.733602-03	2026-04-28 09:14:03.733602-03	2026-04-28 09:14:03.733602-03	\N	active
6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	29.80	2026-04-28 13:02:49.554929-03	2026-04-28 13:02:49.554929-03	2026-04-28 13:02:49.554929-03	\N	active
63187b76-e83b-4545-bdfe-61664ee094c3	14d8391e-850f-4676-a7d4-96e05b05c633	entry	69.00	2026-04-28 09:13:41.497863-03	2026-04-28 09:14:03.73444-03	2026-04-28 09:13:41.497863-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
f9b6fa2d-c337-4106-8a7b-a6d06c588561	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	29.20	2026-04-28 13:04:21.911735-03	2026-04-28 13:04:21.911735-03	2026-04-28 13:04:21.911735-03	\N	active
63187b76-e83b-4545-bdfe-61664ee094c3	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	27.60	2026-04-28 09:14:03.782121-03	2026-04-28 09:14:03.782121-03	2026-04-28 09:14:03.782121-03	\N	active
fb8474ac-868f-4474-8c2e-2b9fc7bc2293	de2170f8-6183-4581-8048-21256db5cb53	entry	63.25	2026-04-28 15:00:21.478349-03	2026-04-28 15:00:21.478349-03	2026-04-28 15:00:21.478349-03	\N	active
bb2632a2-c424-4ee9-9e36-7c6db2a35282	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	29.40	2026-04-28 13:05:22.329946-03	2026-04-28 13:08:37.668357-03	2026-04-28 13:05:22.329946-03	\N	active
dbbfea9e-1207-4a42-9c58-31ce837773db	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	28.40	2026-04-28 13:10:10.874412-03	2026-04-28 13:10:10.874412-03	2026-04-28 13:10:10.874412-03	\N	active
fb8474ac-868f-4474-8c2e-2b9fc7bc2293	14d8391e-850f-4676-a7d4-96e05b05c633	entry	63.25	2026-04-28 15:00:10.404963-03	2026-04-28 15:00:21.482537-03	2026-04-28 15:00:10.404963-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
f709039e-b5ba-4339-8714-21bd010d7c56	de2170f8-6183-4581-8048-21256db5cb53	entry	63.25	2026-04-28 13:11:51.0575-03	2026-04-28 13:12:33.890205-03	2026-04-28 13:11:51.0575-03	\N	active
ab0b2d73-ab7d-44a5-94c3-bf1c21733063	de2170f8-6183-4581-8048-21256db5cb53	entry	65.75	2026-04-28 13:17:02.754707-03	2026-04-28 13:17:02.754707-03	2026-04-28 13:17:02.754707-03	\N	active
ba22024f-23df-4ced-8bc0-dc1cda884acb	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	84.50	2026-04-28 13:21:05.487109-03	2026-04-28 13:21:05.487109-03	2026-04-28 13:21:05.487109-03	\N	active
0db26fb0-8008-43b1-bf50-55e9b9518143	14d8391e-850f-4676-a7d4-96e05b05c633	entry	64.75	2026-04-28 13:22:11.567438-03	2026-04-28 13:22:11.567438-03	2026-04-28 13:22:11.567438-03	\N	active
0db26fb0-8008-43b1-bf50-55e9b9518143	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	82.00	2026-04-28 13:22:04.614456-03	2026-04-28 13:22:11.573527-03	2026-04-28 13:22:04.614456-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
41eb5f95-d632-4bc1-a591-d8b1d63e0de7	de2170f8-6183-4581-8048-21256db5cb53	entry	66.25	2026-04-28 15:18:44.107588-03	2026-04-28 15:19:00.763315-03	2026-04-28 15:18:44.107588-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
0d53a1ff-fce7-4a49-b8c6-e83286bd7210	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	53.50	2026-04-28 13:22:35.636915-03	2026-04-28 13:22:35.636915-03	2026-04-28 13:22:35.636915-03	\N	active
0d53a1ff-fce7-4a49-b8c6-e83286bd7210	14d8391e-850f-4676-a7d4-96e05b05c633	entry	68.50	2026-04-28 13:22:35.63739-03	2026-04-28 13:22:35.63739-03	2026-04-28 13:22:35.63739-03	\N	active
0d53a1ff-fce7-4a49-b8c6-e83286bd7210	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	81.00	2026-04-28 13:22:29.604554-03	2026-04-28 13:22:35.636548-03	2026-04-28 13:22:29.604554-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	79.00	2026-04-28 13:40:06.423073-03	2026-04-28 13:40:06.423073-03	2026-04-28 13:40:06.423073-03	\N	active
41eb5f95-d632-4bc1-a591-d8b1d63e0de7	14d8391e-850f-4676-a7d4-96e05b05c633	entry	66.25	2026-04-28 15:19:00.765585-03	2026-04-28 15:19:00.765585-03	2026-04-28 15:19:00.765585-03	\N	active
31de1cab-72f0-4936-8bc9-786ec606efe8	4b8fcc61-424c-4f6c-9228-2081bcfffa83	entry	\N	2026-04-28 22:17:52.717836-03	2026-04-28 22:17:52.717836-03	2026-04-28 22:17:52.717836-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
e23ec830-0ead-4e0c-82ce-6601babf0cf0	a5c12ab0-b165-4953-9bae-0bec45974919	entry	\N	2026-04-28 22:18:50.680824-03	2026-04-28 22:18:50.680824-03	2026-04-28 22:18:50.680824-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
262a9bd3-26f6-464d-bdac-8cbaab321a1f	a3e3696a-a0bb-4b21-a765-a05eea5475c6	entry	\N	2026-04-29 00:16:18.435995-03	2026-04-29 00:16:18.435995-03	2026-04-29 00:16:18.435995-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
9ff5ad7e-c9aa-47e7-aa85-152bcae74799	8f6d2400-8c63-4d1b-82f3-926d488017d9	entry	\N	2026-04-29 00:19:37.759025-03	2026-04-29 00:19:37.759025-03	2026-04-29 00:19:37.759025-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
95f32d95-8fc0-4065-a176-7aef049400c3	7f8b09b7-ec98-425e-aef1-81fb5d02b5ea	entry	\N	2026-04-29 07:01:03.340573-03	2026-04-29 07:01:03.340573-03	2026-04-29 07:01:03.340573-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
971f1bd2-0c13-46f2-8cd2-08da87d14c33	22b4ab76-5e55-4308-90b3-3bb56fe7e7fe	entry	\N	2026-04-29 07:05:53.546549-03	2026-04-29 07:05:53.546549-03	2026-04-29 07:05:53.546549-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
73602976-48f9-46a6-bedd-e37b6596695e	b535e5f1-b4da-4c54-add5-67e658e8af17	entry	\N	2026-04-29 07:08:10.514215-03	2026-04-29 07:08:10.514215-03	2026-04-29 07:08:10.514215-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
95f827b3-0934-4893-9194-09987b129b5f	21d1c5ad-1d0e-48ea-b63d-18505a92125f	entry	\N	2026-04-29 07:10:36.334097-03	2026-04-29 07:10:36.334097-03	2026-04-29 07:10:36.334097-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
d246ef01-5914-450c-8673-24572b977e8c	30cbb747-a5ad-45fc-829c-33f5519e2870	screening	\N	2026-04-29 07:20:28.777547-03	2026-04-29 07:20:34.852731-03	2026-04-29 07:20:28.777547-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
0f39a78f-71cd-4369-a46e-75ac2e410da6	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	entry	\N	2026-04-29 07:24:19.404043-03	2026-04-29 07:24:19.404043-03	2026-04-29 07:24:19.404043-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
48a8e909-3a2b-413d-85b7-231e33ac9d44	fc5b7d69-4693-4440-9811-87c32d7694d2	entry	\N	2026-04-29 07:25:18.246572-03	2026-04-29 07:25:18.246572-03	2026-04-29 07:25:18.246572-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
550364ec-d0b5-4ae3-8ff0-24ed1fe99793	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	screening	\N	2026-04-29 07:26:53.987219-03	2026-04-29 07:26:59.932279-03	2026-04-29 07:26:53.987219-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
d3188aee-919d-4e0d-90c4-b31b38b47ce7	0fbc2429-c5d4-4fb6-9af8-805306444952	entry	\N	2026-04-29 07:27:33.636366-03	2026-04-29 07:27:33.636366-03	2026-04-29 07:27:33.636366-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
d95ab262-c912-437d-ab16-66a7e94c98c0	de097a8b-1083-4ff9-9064-039da37ecc9c	entry	78.52	2026-04-29 07:36:37.549836-03	2026-04-29 07:36:37.750442-03	2026-04-29 07:36:37.549836-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	entry	78.52	2026-04-29 07:36:37.577521-03	2026-04-29 07:36:37.750729-03	2026-04-29 07:36:37.577521-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	bd726364-0421-4540-b1bb-ba549f2fd765	entry	78.52	2026-04-29 07:36:37.564089-03	2026-04-29 07:36:37.751113-03	2026-04-29 07:36:37.564089-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	248c13ce-cbd5-4f6e-b87b-bfddedf52797	entry	78.52	2026-04-29 07:36:37.624413-03	2026-04-29 07:36:37.832633-03	2026-04-29 07:36:37.624413-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	entry	78.52	2026-04-29 07:36:37.591115-03	2026-04-29 07:36:37.83638-03	2026-04-29 07:36:37.591115-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	30cbb747-a5ad-45fc-829c-33f5519e2870	entry	78.52	2026-04-29 07:36:37.625875-03	2026-04-29 07:36:37.837046-03	2026-04-29 07:36:37.625875-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	entry	80.65	2026-04-29 07:40:21.099349-03	2026-04-29 07:40:21.224184-03	2026-04-29 07:40:21.099349-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	131f29d1-1893-444f-a235-c9320c4fd62f	entry	80.65	2026-04-29 07:40:21.116287-03	2026-04-29 07:40:21.287288-03	2026-04-29 07:40:21.116287-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	fc5b7d69-4693-4440-9811-87c32d7694d2	entry	80.65	2026-04-29 07:40:21.138917-03	2026-04-29 07:40:21.28757-03	2026-04-29 07:40:21.138917-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	e7dd7099-5202-42d2-b56d-d300aad38692	entry	80.65	2026-04-29 07:40:21.150305-03	2026-04-29 07:40:21.289231-03	2026-04-29 07:40:21.150305-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	entry	80.65	2026-04-29 07:40:21.127286-03	2026-04-29 07:40:21.291367-03	2026-04-29 07:40:21.127286-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	7205cf80-5516-40c5-9c8a-b06506c44293	entry	80.65	2026-04-29 07:40:21.123739-03	2026-04-29 07:40:21.291586-03	2026-04-29 07:40:21.123739-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	3020b91e-658d-4e0a-9edf-93cb692b95a2	screening	80.65	2026-04-29 07:40:18.676797-03	2026-04-29 07:40:24.668782-03	2026-04-29 07:40:18.676797-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
e839ead1-5147-4899-aa45-17d54b911501	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	entry	73.45	2026-04-29 07:41:53.709271-03	2026-04-29 07:41:53.867951-03	2026-04-29 07:41:53.709271-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	entry	73.45	2026-04-29 07:41:53.725618-03	2026-04-29 07:41:53.867835-03	2026-04-29 07:41:53.725618-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	entry	73.45	2026-04-29 07:41:53.76599-03	2026-04-29 07:41:53.933251-03	2026-04-29 07:41:53.76599-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	e75e06be-bf4b-4452-a47c-f2009f6b798a	entry	73.45	2026-04-29 07:41:53.737309-03	2026-04-29 07:41:53.940298-03	2026-04-29 07:41:53.737309-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	002c11b5-26b0-428b-8ae1-251211888bf6	entry	73.45	2026-04-29 07:41:53.746432-03	2026-04-29 07:41:53.948686-03	2026-04-29 07:41:53.746432-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	3eb69bdb-df4b-4294-9636-b584e2d36530	entry	73.45	2026-04-29 07:41:53.783345-03	2026-04-29 07:41:53.948851-03	2026-04-29 07:41:53.783345-03	\N	active
6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	14d8391e-850f-4676-a7d4-96e05b05c633	entry	74.50	2026-04-28 13:02:49.529479-03	2026-04-28 13:02:49.529479-03	2026-04-28 13:02:49.529479-03	\N	active
63187b76-e83b-4545-bdfe-61664ee094c3	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	81.50	2026-04-28 09:14:03.781598-03	2026-04-28 09:14:03.781598-03	2026-04-28 09:14:03.781598-03	\N	active
fb8474ac-868f-4474-8c2e-2b9fc7bc2293	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	80.50	2026-04-28 15:00:21.531673-03	2026-04-28 15:00:21.531673-03	2026-04-28 15:00:21.531673-03	\N	active
f9b6fa2d-c337-4106-8a7b-a6d06c588561	14d8391e-850f-4676-a7d4-96e05b05c633	entry	73.00	2026-04-28 13:04:21.912387-03	2026-04-28 13:04:21.912387-03	2026-04-28 13:04:21.912387-03	\N	active
f9b6fa2d-c337-4106-8a7b-a6d06c588561	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	85.50	2026-04-28 13:04:12.854088-03	2026-04-28 13:04:21.9121-03	2026-04-28 13:04:12.854088-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
fb8474ac-868f-4474-8c2e-2b9fc7bc2293	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	80.50	2026-04-28 15:00:21.531267-03	2026-04-28 15:00:21.531267-03	2026-04-28 15:00:21.531267-03	\N	active
41eb5f95-d632-4bc1-a591-d8b1d63e0de7	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	83.50	2026-04-28 15:19:00.764803-03	2026-04-28 15:19:00.764803-03	2026-04-28 15:19:00.764803-03	\N	active
39d2d533-f333-4780-b8f3-c74ea2fc1b3e	874af82e-8541-4708-a603-92581ef40fe4	entry	\N	2026-04-28 22:22:27.796838-03	2026-04-28 22:22:27.796838-03	2026-04-28 22:22:27.796838-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
9a9cc1c1-d8d3-4058-99b0-4a4827711e80	e997b8a4-a221-4b30-80fb-6461fc5228e5	entry	\N	2026-04-29 00:18:48.619907-03	2026-04-29 00:18:48.619907-03	2026-04-29 00:18:48.619907-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
bb2632a2-c424-4ee9-9e36-7c6db2a35282	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	86.00	2026-04-28 13:05:16.106545-03	2026-04-28 13:08:37.623221-03	2026-04-28 13:05:16.106545-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
bb2632a2-c424-4ee9-9e36-7c6db2a35282	14d8391e-850f-4676-a7d4-96e05b05c633	entry	73.50	2026-04-28 13:05:22.335519-03	2026-04-28 13:08:37.629952-03	2026-04-28 13:05:22.335519-03	\N	active
bb2632a2-c424-4ee9-9e36-7c6db2a35282	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	58.50	2026-04-28 13:05:22.330572-03	2026-04-28 13:08:37.668647-03	2026-04-28 13:05:22.330572-03	\N	active
dbbfea9e-1207-4a42-9c58-31ce837773db	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	56.00	2026-04-28 13:10:10.876074-03	2026-04-28 13:10:10.876074-03	2026-04-28 13:10:10.876074-03	\N	active
9be1616a-dc31-44bd-8d14-3ac94a02c5b9	952b2c30-9465-4c55-9a69-9c1f9e0f8fb2	entry	\N	2026-04-29 07:43:26.688094-03	2026-04-29 07:43:26.688094-03	2026-04-29 07:43:26.688094-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
f709039e-b5ba-4339-8714-21bd010d7c56	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	80.50	2026-04-28 13:11:51.057942-03	2026-04-28 13:12:33.891011-03	2026-04-28 13:11:51.057942-03	\N	active
ab0b2d73-ab7d-44a5-94c3-bf1c21733063	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	83.00	2026-04-28 13:17:02.79964-03	2026-04-28 13:17:02.79964-03	2026-04-28 13:17:02.79964-03	\N	active
bb9c2755-fef1-4767-ac3e-b1581992cefe	8f6d2400-8c63-4d1b-82f3-926d488017d9	screening	\N	2026-04-29 00:20:59.427665-03	2026-04-29 00:21:05.504705-03	2026-04-29 00:20:59.427665-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
ba22024f-23df-4ced-8bc0-dc1cda884acb	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	57.00	2026-04-28 13:21:05.493027-03	2026-04-28 13:21:05.493027-03	2026-04-28 13:21:05.493027-03	\N	active
ba22024f-23df-4ced-8bc0-dc1cda884acb	14d8391e-850f-4676-a7d4-96e05b05c633	entry	72.00	2026-04-28 13:20:38.379664-03	2026-04-28 13:21:05.493344-03	2026-04-28 13:20:38.379664-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
0db26fb0-8008-43b1-bf50-55e9b9518143	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	37.80	2026-04-28 13:22:11.567842-03	2026-04-28 13:22:11.567842-03	2026-04-28 13:22:11.567842-03	\N	active
0d53a1ff-fce7-4a49-b8c6-e83286bd7210	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	27.40	2026-04-28 13:22:35.638068-03	2026-04-28 13:22:35.638068-03	2026-04-28 13:22:35.638068-03	\N	active
0d53a1ff-fce7-4a49-b8c6-e83286bd7210	de2170f8-6183-4581-8048-21256db5cb53	entry	68.50	2026-04-28 13:22:35.637739-03	2026-04-28 13:22:35.637739-03	2026-04-28 13:22:35.637739-03	\N	active
ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	36.60	2026-04-28 13:40:06.42339-03	2026-04-28 13:40:06.42339-03	2026-04-28 13:40:06.42339-03	\N	active
e4d46e65-9429-48d7-9ce6-e35351a8928f	7b144f65-41c4-449b-bd19-e2444eb53f89	entry	\N	2026-04-29 07:01:03.356435-03	2026-04-29 07:01:03.356435-03	2026-04-29 07:01:03.356435-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
ae77bed0-c0f6-4062-8272-dc7cf8a7e1e4	ebf724a6-142a-46ae-8c62-617c3aec3e8a	entry	\N	2026-04-29 07:05:53.556718-03	2026-04-29 07:05:53.556718-03	2026-04-29 07:05:53.556718-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
73602976-48f9-46a6-bedd-e37b6596695e	fac81a55-7d6d-4093-bd73-001bc77b864b	entry	\N	2026-04-29 07:08:10.525255-03	2026-04-29 07:08:10.525255-03	2026-04-29 07:08:10.525255-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
db670570-7271-4513-9286-be386c347fcb	12fe640a-40a4-4004-9c06-7c4eac7997a0	entry	\N	2026-04-29 07:13:52.088381-03	2026-04-29 07:13:52.088381-03	2026-04-29 07:13:52.088381-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
46333bfc-f564-45eb-a3bd-22117964fb2a	12fe640a-40a4-4004-9c06-7c4eac7997a0	screening	\N	2026-04-29 07:16:41.611302-03	2026-04-29 07:16:47.583391-03	2026-04-29 07:16:41.611302-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
4309edf3-f92c-4583-836a-6cfe3145deb8	248c13ce-cbd5-4f6e-b87b-bfddedf52797	entry	\N	2026-04-29 07:20:37.510934-03	2026-04-29 07:20:37.510934-03	2026-04-29 07:20:37.510934-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
9e1ae6da-73f0-491b-8976-b6af756c3642	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	entry	\N	2026-04-29 07:24:23.46034-03	2026-04-29 07:24:23.46034-03	2026-04-29 07:24:23.46034-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
adccb07f-ba13-4ef1-b321-a9c901e3e677	3eb69bdb-df4b-4294-9636-b584e2d36530	screening	\N	2026-04-29 07:25:50.407216-03	2026-04-29 07:25:56.383552-03	2026-04-29 07:25:50.407216-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
24495ca9-9ded-4fd9-94b5-30468145a1b8	7205cf80-5516-40c5-9c8a-b06506c44293	entry	\N	2026-04-29 07:27:02.580475-03	2026-04-29 07:27:02.580475-03	2026-04-29 07:27:02.580475-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
94336d21-3145-46bb-b6ed-4ae9458ebbc7	3791dfea-a98f-42da-b56c-4f59064d34a4	entry	\N	2026-04-29 07:27:33.658268-03	2026-04-29 07:27:33.658268-03	2026-04-29 07:27:33.658268-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
d95ab262-c912-437d-ab16-66a7e94c98c0	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	entry	78.52	2026-04-29 07:36:37.551235-03	2026-04-29 07:36:37.750178-03	2026-04-29 07:36:37.551235-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	e75e06be-bf4b-4452-a47c-f2009f6b798a	entry	78.52	2026-04-29 07:36:37.582212-03	2026-04-29 07:36:37.823407-03	2026-04-29 07:36:37.582212-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	e40a415a-723c-43d0-998e-ed81fe9f9c54	entry	78.52	2026-04-29 07:36:37.563943-03	2026-04-29 07:36:37.828757-03	2026-04-29 07:36:37.563943-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	36c21c41-5620-4c4d-a06e-ac7de5ff04c4	entry	78.52	2026-04-29 07:36:37.640818-03	2026-04-29 07:36:37.828566-03	2026-04-29 07:36:37.640818-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	002c11b5-26b0-428b-8ae1-251211888bf6	entry	78.52	2026-04-29 07:36:37.594906-03	2026-04-29 07:36:37.828926-03	2026-04-29 07:36:37.594906-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	4a8b0a32-338d-421d-b378-e8629a9975f8	entry	78.52	2026-04-29 07:36:37.62474-03	2026-04-29 07:36:37.834798-03	2026-04-29 07:36:37.62474-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	entry	80.65	2026-04-29 07:40:21.124608-03	2026-04-29 07:40:21.221395-03	2026-04-29 07:40:21.124608-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	de097a8b-1083-4ff9-9064-039da37ecc9c	entry	80.65	2026-04-29 07:40:21.114371-03	2026-04-29 07:40:21.22347-03	2026-04-29 07:40:21.114371-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	0fbc2429-c5d4-4fb6-9af8-805306444952	entry	80.65	2026-04-29 07:40:21.102178-03	2026-04-29 07:40:21.224042-03	2026-04-29 07:40:21.102178-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	7f3458b8-40c5-4814-8a5c-ea26e22ff026	entry	80.65	2026-04-29 07:40:21.014827-03	2026-04-29 07:40:21.224299-03	2026-04-29 07:40:21.014827-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	entry	80.65	2026-04-29 07:40:21.131507-03	2026-04-29 07:40:21.289437-03	2026-04-29 07:40:21.131507-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	30cbb747-a5ad-45fc-829c-33f5519e2870	entry	80.65	2026-04-29 07:40:21.141871-03	2026-04-29 07:40:21.290105-03	2026-04-29 07:40:21.141871-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	3791dfea-a98f-42da-b56c-4f59064d34a4	entry	73.45	2026-04-29 07:41:53.709457-03	2026-04-29 07:41:53.868417-03	2026-04-29 07:41:53.709457-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	de097a8b-1083-4ff9-9064-039da37ecc9c	entry	73.45	2026-04-29 07:41:53.729608-03	2026-04-29 07:41:53.873847-03	2026-04-29 07:41:53.729608-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	entry	73.45	2026-04-29 07:41:53.740808-03	2026-04-29 07:41:53.942326-03	2026-04-29 07:41:53.740808-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	248c13ce-cbd5-4f6e-b87b-bfddedf52797	entry	73.45	2026-04-29 07:41:53.784066-03	2026-04-29 07:41:53.942211-03	2026-04-29 07:41:53.784066-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	entry	73.45	2026-04-29 07:41:53.768373-03	2026-04-29 07:41:53.948135-03	2026-04-29 07:41:53.768373-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	e7dd7099-5202-42d2-b56d-d300aad38692	entry	73.45	2026-04-29 07:41:53.763736-03	2026-04-29 07:41:53.948482-03	2026-04-29 07:41:53.763736-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	3020b91e-658d-4e0a-9edf-93cb692b95a2	screening	73.45	2026-04-29 07:41:51.329483-03	2026-04-29 07:41:57.301428-03	2026-04-29 07:41:51.329483-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	87.00	2026-04-28 13:02:49.531768-03	2026-04-28 13:02:49.531768-03	2026-04-28 13:02:49.531768-03	\N	active
f9b6fa2d-c337-4106-8a7b-a6d06c588561	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	58.00	2026-04-28 13:04:21.911375-03	2026-04-28 13:04:21.911375-03	2026-04-28 13:04:21.911375-03	\N	active
fb8474ac-868f-4474-8c2e-2b9fc7bc2293	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	37.20	2026-04-28 15:00:21.532021-03	2026-04-28 15:00:21.532021-03	2026-04-28 15:00:21.532021-03	\N	active
dbbfea9e-1207-4a42-9c58-31ce837773db	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	83.50	2026-04-28 13:10:00.229587-03	2026-04-28 13:10:10.873555-03	2026-04-28 13:10:00.229587-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
dbbfea9e-1207-4a42-9c58-31ce837773db	de2170f8-6183-4581-8048-21256db5cb53	entry	71.00	2026-04-28 13:10:10.877217-03	2026-04-28 13:10:10.877217-03	2026-04-28 13:10:10.877217-03	\N	active
41eb5f95-d632-4bc1-a591-d8b1d63e0de7	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	38.40	2026-04-28 15:19:00.765255-03	2026-04-28 15:19:00.765255-03	2026-04-28 15:19:00.765255-03	\N	active
4234af6d-08b8-43e6-b0a5-d9179baf7d2c	f6b0b9bb-2a37-4c9b-ad5a-64dcd13b825f	entry	\N	2026-04-28 23:47:25.069085-03	2026-04-28 23:47:25.069085-03	2026-04-28 23:47:25.069085-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
f709039e-b5ba-4339-8714-21bd010d7c56	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	37.20	2026-04-28 13:11:51.058263-03	2026-04-28 13:12:33.889784-03	2026-04-28 13:11:51.058263-03	\N	active
f709039e-b5ba-4339-8714-21bd010d7c56	14d8391e-850f-4676-a7d4-96e05b05c633	entry	63.25	2026-04-28 13:11:51.058585-03	2026-04-28 13:12:33.890472-03	2026-04-28 13:11:51.058585-03	\N	active
ab0b2d73-ab7d-44a5-94c3-bf1c21733063	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	83.00	2026-04-28 13:17:02.799381-03	2026-04-28 13:17:02.799381-03	2026-04-28 13:17:02.799381-03	\N	active
ba22024f-23df-4ced-8bc0-dc1cda884acb	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	28.80	2026-04-28 13:21:05.48846-03	2026-04-28 13:21:05.48846-03	2026-04-28 13:21:05.48846-03	\N	active
0db26fb0-8008-43b1-bf50-55e9b9518143	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	82.00	2026-04-28 13:22:11.569101-03	2026-04-28 13:22:11.569101-03	2026-04-28 13:22:11.569101-03	\N	active
088e9350-845f-4dfd-b103-2df352820914	d0518c91-1a7a-4426-b892-3429e1bcbad9	entry	\N	2026-04-29 00:19:22.933214-03	2026-04-29 00:19:22.933214-03	2026-04-29 00:19:22.933214-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	14d8391e-850f-4676-a7d4-96e05b05c633	entry	61.75	2026-04-28 13:40:06.381964-03	2026-04-28 13:40:06.381964-03	2026-04-28 13:40:06.381964-03	\N	active
ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	79.00	2026-04-28 13:39:56.866583-03	2026-04-28 13:40:06.423672-03	2026-04-28 13:39:56.866583-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
74a2f845-fba6-4864-8db5-1e54233666a5	2afdf362-5dd2-45f8-b49b-db765790bc1e	entry	\N	2026-04-29 00:21:54.544905-03	2026-04-29 00:21:54.544905-03	2026-04-29 00:21:54.544905-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
9f4406f9-6f09-4474-8691-9d25930aef43	e2a1a79f-1dde-410f-ac17-6f5a9217b32b	entry	\N	2026-04-29 07:05:28.320635-03	2026-04-29 07:05:28.320635-03	2026-04-29 07:05:28.320635-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
0d6286c6-d712-42b0-b8b0-093b7a8f9aa1	2eb4cba8-d843-434e-a35a-611421cedf73	entry	\N	2026-04-29 07:10:33.143765-03	2026-04-29 07:10:33.143765-03	2026-04-29 07:10:33.143765-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
95f827b3-0934-4893-9194-09987b129b5f	43967b0f-2b93-45b3-ac8e-699006925ecd	entry	\N	2026-04-29 07:10:36.343178-03	2026-04-29 07:10:36.343178-03	2026-04-29 07:10:36.343178-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
181c9978-3d3b-4351-9615-45ddc092be5c	4a8b0a32-338d-421d-b378-e8629a9975f8	entry	\N	2026-04-29 07:16:50.704452-03	2026-04-29 07:16:50.704452-03	2026-04-29 07:16:50.704452-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
b5cb0a92-90d1-4346-8dc4-e474cd23f475	e7dd7099-5202-42d2-b56d-d300aad38692	entry	\N	2026-04-29 07:23:45.79246-03	2026-04-29 07:23:45.79246-03	2026-04-29 07:23:45.79246-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
25cbe08a-c93e-4a64-b661-94d0f7ff68f1	002c11b5-26b0-428b-8ae1-251211888bf6	screening	\N	2026-04-29 07:24:43.467369-03	2026-04-29 07:24:49.436226-03	2026-04-29 07:24:43.467369-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
533d093a-9ecb-4e3d-8e35-acd2146497d5	e75e06be-bf4b-4452-a47c-f2009f6b798a	entry	\N	2026-04-29 07:25:59.120411-03	2026-04-29 07:25:59.120411-03	2026-04-29 07:25:59.120411-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
788cdcec-ad09-4a9a-843b-c89622ca0285	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	entry	\N	2026-04-29 07:27:05.542163-03	2026-04-29 07:27:05.542163-03	2026-04-29 07:27:05.542163-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
d95ab262-c912-437d-ab16-66a7e94c98c0	131f29d1-1893-444f-a235-c9320c4fd62f	entry	78.52	2026-04-29 07:36:37.56376-03	2026-04-29 07:36:37.748018-03	2026-04-29 07:36:37.56376-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	0fbc2429-c5d4-4fb6-9af8-805306444952	entry	78.52	2026-04-29 07:36:37.551482-03	2026-04-29 07:36:37.748981-03	2026-04-29 07:36:37.551482-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	ca24747c-4f2b-4f75-875b-e65abeb2cf26	entry	78.52	2026-04-29 07:36:37.624935-03	2026-04-29 07:36:37.824615-03	2026-04-29 07:36:37.624935-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	3eb69bdb-df4b-4294-9636-b584e2d36530	entry	78.52	2026-04-29 07:36:37.581675-03	2026-04-29 07:36:37.826401-03	2026-04-29 07:36:37.581675-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	fc5b7d69-4693-4440-9811-87c32d7694d2	entry	78.52	2026-04-29 07:36:37.597359-03	2026-04-29 07:36:37.833067-03	2026-04-29 07:36:37.597359-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	12fe640a-40a4-4004-9c06-7c4eac7997a0	entry	78.52	2026-04-29 07:36:37.643738-03	2026-04-29 07:36:37.835668-03	2026-04-29 07:36:37.643738-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	screening	78.52	2026-04-29 07:36:35.152268-03	2026-04-29 07:36:41.125132-03	2026-04-29 07:36:35.152268-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	bd726364-0421-4540-b1bb-ba549f2fd765	entry	80.65	2026-04-29 07:40:21.1078-03	2026-04-29 07:40:21.222604-03	2026-04-29 07:40:21.1078-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	3791dfea-a98f-42da-b56c-4f59064d34a4	entry	80.65	2026-04-29 07:40:21.098111-03	2026-04-29 07:40:21.22248-03	2026-04-29 07:40:21.098111-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	e40a415a-723c-43d0-998e-ed81fe9f9c54	entry	80.65	2026-04-29 07:40:21.123498-03	2026-04-29 07:40:21.289985-03	2026-04-29 07:40:21.123498-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	entry	80.65	2026-04-29 07:40:21.134282-03	2026-04-29 07:40:21.289853-03	2026-04-29 07:40:21.134282-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	e75e06be-bf4b-4452-a47c-f2009f6b798a	entry	80.65	2026-04-29 07:40:21.124936-03	2026-04-29 07:40:21.29096-03	2026-04-29 07:40:21.124936-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	ca24747c-4f2b-4f75-875b-e65abeb2cf26	entry	80.65	2026-04-29 07:40:21.145142-03	2026-04-29 07:40:21.295786-03	2026-04-29 07:40:21.145142-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	entry	73.45	2026-04-29 07:41:53.731161-03	2026-04-29 07:41:53.867647-03	2026-04-29 07:41:53.731161-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	0fbc2429-c5d4-4fb6-9af8-805306444952	entry	73.45	2026-04-29 07:41:53.711438-03	2026-04-29 07:41:53.86829-03	2026-04-29 07:41:53.711438-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	7f3458b8-40c5-4814-8a5c-ea26e22ff026	entry	73.45	2026-04-29 07:41:53.647429-03	2026-04-29 07:41:53.870644-03	2026-04-29 07:41:53.647429-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	fc5b7d69-4693-4440-9811-87c32d7694d2	entry	73.45	2026-04-29 07:41:53.741809-03	2026-04-29 07:41:53.941353-03	2026-04-29 07:41:53.741809-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	entry	73.45	2026-04-29 07:41:53.766149-03	2026-04-29 07:41:53.941753-03	2026-04-29 07:41:53.766149-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	e40a415a-723c-43d0-998e-ed81fe9f9c54	entry	73.45	2026-04-29 07:41:53.76702-03	2026-04-29 07:41:53.941632-03	2026-04-29 07:41:53.76702-03	\N	active
63187b76-e83b-4545-bdfe-61664ee094c3	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	54.00	2026-04-28 09:14:03.781906-03	2026-04-28 09:14:03.781906-03	2026-04-28 09:14:03.781906-03	\N	active
6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	entry	59.50	2026-04-28 13:02:49.548046-03	2026-04-28 13:02:49.548046-03	2026-04-28 13:02:49.548046-03	\N	active
f9b6fa2d-c337-4106-8a7b-a6d06c588561	de2170f8-6183-4581-8048-21256db5cb53	entry	73.00	2026-04-28 13:04:21.910842-03	2026-04-28 13:04:21.910842-03	2026-04-28 13:04:21.910842-03	\N	active
41eb5f95-d632-4bc1-a591-d8b1d63e0de7	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	83.50	2026-04-28 15:19:00.764312-03	2026-04-28 15:19:00.764312-03	2026-04-28 15:19:00.764312-03	\N	active
bb2632a2-c424-4ee9-9e36-7c6db2a35282	de2170f8-6183-4581-8048-21256db5cb53	entry	73.50	2026-04-28 13:05:22.330274-03	2026-04-28 13:08:37.62443-03	2026-04-28 13:05:22.330274-03	\N	active
dbbfea9e-1207-4a42-9c58-31ce837773db	14d8391e-850f-4676-a7d4-96e05b05c633	entry	71.00	2026-04-28 13:10:10.872017-03	2026-04-28 13:10:10.872017-03	2026-04-28 13:10:10.872017-03	\N	active
ac1b670a-d6fe-4f0c-b4bc-9aab469320d1	4aeb3f03-98ca-428e-a7ed-8367e03452dd	entry	\N	2026-04-29 00:13:16.021275-03	2026-04-29 00:13:16.021275-03	2026-04-29 00:13:16.021275-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
9c8edb04-85a3-4c7e-8b28-daf501e6036a	78c76aa7-7fcd-4020-a682-9f719fb23219	entry	\N	2026-04-29 00:19:32.296686-03	2026-04-29 00:19:32.296686-03	2026-04-29 00:19:32.296686-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
f709039e-b5ba-4339-8714-21bd010d7c56	3a7d2f21-0a5a-4667-8605-92151d5a331d	entry	80.50	2026-04-28 13:11:43.023605-03	2026-04-28 13:12:33.890728-03	2026-04-28 13:11:43.023605-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
ab0b2d73-ab7d-44a5-94c3-bf1c21733063	14d8391e-850f-4676-a7d4-96e05b05c633	entry	65.75	2026-04-28 13:16:42.063463-03	2026-04-28 13:17:02.754073-03	2026-04-28 13:16:42.063463-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
ab0b2d73-ab7d-44a5-94c3-bf1c21733063	d75da52e-60db-48bf-a2a0-adddaf952c87	entry	38.20	2026-04-28 13:17:02.799833-03	2026-04-28 13:17:02.799833-03	2026-04-28 13:17:02.799833-03	\N	active
ba22024f-23df-4ced-8bc0-dc1cda884acb	de2170f8-6183-4581-8048-21256db5cb53	entry	72.00	2026-04-28 13:21:05.488787-03	2026-04-28 13:21:05.488787-03	2026-04-28 13:21:05.488787-03	\N	active
0db26fb0-8008-43b1-bf50-55e9b9518143	de2170f8-6183-4581-8048-21256db5cb53	entry	64.75	2026-04-28 13:22:11.57677-03	2026-04-28 13:22:11.57677-03	2026-04-28 13:22:11.57677-03	\N	active
ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	de2170f8-6183-4581-8048-21256db5cb53	entry	61.75	2026-04-28 13:40:06.383703-03	2026-04-28 13:40:06.383703-03	2026-04-28 13:40:06.383703-03	\N	active
1d84d654-275b-47d7-ab91-348743e52040	df52f1c7-4cb7-4215-b8eb-921f82f89e2e	screening	\N	2026-04-29 00:22:26.375856-03	2026-04-29 00:22:32.352832-03	2026-04-29 00:22:26.375856-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
6e6b3a3a-9626-4100-b57f-0d61c4dfe7d0	091e315a-a2a2-407a-abbf-231e23c8d5dd	entry	\N	2026-04-29 07:07:45.875475-03	2026-04-29 07:07:45.875475-03	2026-04-29 07:07:45.875475-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
f43debc1-0952-4c3d-a081-94f642e4420c	b535e5f1-b4da-4c54-add5-67e658e8af17	entry	\N	2026-04-29 07:08:10.505335-03	2026-04-29 07:08:10.505335-03	2026-04-29 07:08:10.505335-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
017fc9c6-215f-4e54-a821-c1d02ffbe074	21d1c5ad-1d0e-48ea-b63d-18505a92125f	entry	\N	2026-04-29 07:10:36.313132-03	2026-04-29 07:10:36.313132-03	2026-04-29 07:10:36.313132-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
0b0b65b5-f7cc-40e6-9f42-40a84c3e2c39	ca24747c-4f2b-4f75-875b-e65abeb2cf26	entry	\N	2026-04-29 07:16:58.583264-03	2026-04-29 07:16:58.583264-03	2026-04-29 07:16:58.583264-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
5ae9b847-fdc3-44e8-8885-0b36dfce4453	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	screening	\N	2026-04-29 07:24:09.932083-03	2026-04-29 07:24:16.360795-03	2026-04-29 07:24:09.932083-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
12fe0bc0-1ec4-49b5-85d7-5be8a8bcea05	e40a415a-723c-43d0-998e-ed81fe9f9c54	entry	\N	2026-04-29 07:24:52.565727-03	2026-04-29 07:24:52.565727-03	2026-04-29 07:24:52.565727-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
cace0b79-27b8-4aa8-b198-6ccf577d5ccf	131f29d1-1893-444f-a235-c9320c4fd62f	entry	\N	2026-04-29 07:26:23.719703-03	2026-04-29 07:26:23.719703-03	2026-04-29 07:26:23.719703-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
bb7e25da-71d7-4d24-8573-8972f241e5ba	de097a8b-1083-4ff9-9064-039da37ecc9c	entry	\N	2026-04-29 07:27:30.635519-03	2026-04-29 07:27:30.635519-03	2026-04-29 07:27:30.635519-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
94336d21-3145-46bb-b6ed-4ae9458ebbc7	0fbc2429-c5d4-4fb6-9af8-805306444952	entry	\N	2026-04-29 07:27:33.647475-03	2026-04-29 07:27:33.647475-03	2026-04-29 07:27:33.647475-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
d95ab262-c912-437d-ab16-66a7e94c98c0	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	entry	78.52	2026-04-29 07:36:37.551978-03	2026-04-29 07:36:37.748818-03	2026-04-29 07:36:37.551978-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	3791dfea-a98f-42da-b56c-4f59064d34a4	entry	78.52	2026-04-29 07:36:37.503373-03	2026-04-29 07:36:37.750885-03	2026-04-29 07:36:37.503373-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	7205cf80-5516-40c5-9c8a-b06506c44293	entry	78.52	2026-04-29 07:36:37.564243-03	2026-04-29 07:36:37.751004-03	2026-04-29 07:36:37.564243-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	entry	78.52	2026-04-29 07:36:37.586178-03	2026-04-29 07:36:37.824463-03	2026-04-29 07:36:37.586178-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	entry	78.52	2026-04-29 07:36:37.596993-03	2026-04-29 07:36:37.824861-03	2026-04-29 07:36:37.596993-03	\N	active
d95ab262-c912-437d-ab16-66a7e94c98c0	e7dd7099-5202-42d2-b56d-d300aad38692	entry	78.52	2026-04-29 07:36:37.626088-03	2026-04-29 07:36:37.82943-03	2026-04-29 07:36:37.626088-03	\N	active
076f3bf8-2453-4393-a3a3-2faa8725445c	0b852ec2-7a54-4b0b-b826-c563806e0226	entry	\N	2026-04-29 07:39:40.781988-03	2026-04-29 07:39:40.781988-03	2026-04-29 07:39:40.781988-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
df46beee-f5fa-44e2-87ae-d910ed6b22c5	7f3458b8-40c5-4814-8a5c-ea26e22ff026	entry	\N	2026-04-29 07:39:43.727989-03	2026-04-29 07:39:43.727989-03	2026-04-29 07:39:43.727989-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	entry	80.65	2026-04-29 07:40:21.108928-03	2026-04-29 07:40:21.222184-03	2026-04-29 07:40:21.108928-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	0b852ec2-7a54-4b0b-b826-c563806e0226	entry	80.65	2026-04-29 07:40:21.098315-03	2026-04-29 07:40:21.224421-03	2026-04-29 07:40:21.098315-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	entry	80.65	2026-04-29 07:40:21.137282-03	2026-04-29 07:40:21.285945-03	2026-04-29 07:40:21.137282-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	3eb69bdb-df4b-4294-9636-b584e2d36530	entry	80.65	2026-04-29 07:40:21.124187-03	2026-04-29 07:40:21.288251-03	2026-04-29 07:40:21.124187-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	002c11b5-26b0-428b-8ae1-251211888bf6	entry	80.65	2026-04-29 07:40:21.13016-03	2026-04-29 07:40:21.291155-03	2026-04-29 07:40:21.13016-03	\N	active
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	248c13ce-cbd5-4f6e-b87b-bfddedf52797	entry	80.65	2026-04-29 07:40:21.150078-03	2026-04-29 07:40:21.299123-03	2026-04-29 07:40:21.150078-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	0b852ec2-7a54-4b0b-b826-c563806e0226	entry	73.45	2026-04-29 07:41:53.703434-03	2026-04-29 07:41:53.868182-03	2026-04-29 07:41:53.703434-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	bd726364-0421-4540-b1bb-ba549f2fd765	entry	73.45	2026-04-29 07:41:53.719265-03	2026-04-29 07:41:53.868515-03	2026-04-29 07:41:53.719265-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	7205cf80-5516-40c5-9c8a-b06506c44293	entry	73.45	2026-04-29 07:41:53.731497-03	2026-04-29 07:41:53.93217-03	2026-04-29 07:41:53.731497-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	131f29d1-1893-444f-a235-c9320c4fd62f	entry	73.45	2026-04-29 07:41:53.745271-03	2026-04-29 07:41:53.932701-03	2026-04-29 07:41:53.745271-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	30cbb747-a5ad-45fc-829c-33f5519e2870	entry	73.45	2026-04-29 07:41:53.783665-03	2026-04-29 07:41:53.942533-03	2026-04-29 07:41:53.783665-03	\N	active
e839ead1-5147-4899-aa45-17d54b911501	ca24747c-4f2b-4f75-875b-e65abeb2cf26	entry	73.45	2026-04-29 07:41:53.766475-03	2026-04-29 07:41:53.942431-03	2026-04-29 07:41:53.766475-03	\N	active
\.


--
-- Data for Name: candidates; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.candidates (id, user_id, full_name, email, phone, location_city, location_state, location_country, linkedin_url, github_url, portfolio_url, internal_notes, tags, created_by, created_at, updated_at, deleted_at, cpf, data_quality_status, data_quality_reason, data_quality_marked_at) FROM stdin;
1d84d654-275b-47d7-ab91-348743e52040	\N	QA E2E 1777432944986	qa.e2e.1777432944986@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:22:26.347322-03	2026-04-29 00:22:26.976475-03	\N	\N	unknown	\N	\N
d4249e55-b83f-434d-b180-e21d111f4e58	\N	QA Sem Vaga 1777433728674	sem-vaga.1777433728674@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:35:31.153304-03	2026-04-29 00:35:31.153308-03	\N	\N	unknown	\N	\N
6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	\N	Marcos Cruz	marcos@gmail.com	\N	Principais competências Experiência Figma Rede Marajó UX	UI	BR	\N	\N	\N	\N	["linux", "node", "node.js", "python", "react", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:02:29.383421-03	2026-04-28 13:02:47.815919-03	\N	\N	unknown	\N	\N
c748bdec-ea00-4a29-8545-45fff750adfe	\N	QA Sem Vaga 1777433779646	sem-vaga.1777433779646@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:36:22.466448-03	2026-04-29 00:36:22.466452-03	\N	\N	unknown	\N	\N
f9b6fa2d-c337-4106-8a7b-a6d06c588561	\N	Gustavo Gonçalves	gustavo@gmail.com	\N	Execução e validação de pipelines CI	CD	BR	\N	\N	\N	\N	[".net", "postgresql", "react", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:04:12.823908-03	2026-04-28 13:04:20.237937-03	\N	\N	unknown	\N	\N
fb8474ac-868f-4474-8c2e-2b9fc7bc2293	\N	Christian Gray	cr@gmail.com	+55 62 99439-4161 (	\N	\N	BR	\N	\N	\N	\N	["git", "java", "javascript", "node", "node.js", "postgresql", "sql", "typescript"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:00:10.358852-03	2026-04-28 15:00:19.777837-03	\N	\N	unknown	\N	\N
41eb5f95-d632-4bc1-a591-d8b1d63e0de7	\N	hgjgh	jhjh@gmail.com	+55 62 99439-4161 (	\N	\N	BR	\N	\N	\N	\N	["git", "java", "javascript", "node", "node.js", "postgresql", "sql", "typescript"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:18:44.084671-03	2026-04-28 15:18:59.086169-03	\N	\N	unknown	\N	\N
bb2632a2-c424-4ee9-9e36-7c6db2a35282	\N	Daniel Silva	daniel@gmail.com	(62)99139-4797 (	Goiânia	GO	BR	\N	\N	\N	\N	["python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:05:16.069002-03	2026-04-28 13:08:35.924169-03	\N	\N	unknown	\N	\N
31de1cab-72f0-4936-8bc9-786ec606efe8	\N	QA Deal Breaker Candidate 1777425470961	qa.deal.breaker.1777425470961@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 22:17:52.698678-03	2026-04-28 22:17:52.698683-03	\N	\N	unknown	\N	\N
e23ec830-0ead-4e0c-82ce-6601babf0cf0	\N	QA Deal Breaker Candidate 1777425529210	qa.deal.breaker.1777425529210@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 22:18:50.667977-03	2026-04-28 22:18:50.667983-03	\N	\N	unknown	\N	\N
dbbfea9e-1207-4a42-9c58-31ce837773db	\N	Matheus Vieira	matheus@gmail.com	\N	\N	\N	BR	\N	\N	\N	\N	["git", "java", "javascript", "mysql", "node", "node.js", "postgresql", "react", "sql", "typescript"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:10:00.184059-03	2026-04-28 13:10:09.203252-03	\N	\N	unknown	\N	\N
39d2d533-f333-4780-b8f3-c74ea2fc1b3e	\N	QA Deal Breaker Candidate 1777425746294	qa.deal.breaker.1777425746294@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 22:22:27.783303-03	2026-04-28 22:22:27.783307-03	\N	\N	unknown	\N	\N
f709039e-b5ba-4339-8714-21bd010d7c56	\N	Hiago Dantas	hiago@gmail.com	\N	\N	\N	BR	\N	\N	\N	\N	["postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:11:42.997987-03	2026-04-28 13:11:49.394838-03	\N	\N	unknown	\N	\N
96eb4e02-4982-412f-b4ce-ccf439c78bb9	\N	QA Count Zero 1777456861852	qa.count.zero.1777456861852@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:01:03.304351-03	2026-04-29 07:01:03.304355-03	\N	\N	unknown	\N	\N
4234af6d-08b8-43e6-b0a5-d9179baf7d2c	\N	Christ 4	cr4@gmail.com	+55 62 99439-4161 (	\N	\N	BR	\N	\N	\N	\N	["git", "java", "javascript", "node", "node.js", "postgresql", "sql", "typescript"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:47:25.040693-03	2026-04-28 23:51:10.381455-03	\N	\N	unknown	\N	\N
ab0b2d73-ab7d-44a5-94c3-bf1c21733063	\N	Ariovaldo	ari@gmail.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:16:42.033257-03	2026-04-28 13:17:01.078516-03	\N	\N	unknown	\N	\N
ac1b670a-d6fe-4f0c-b4bc-9aab469320d1	\N	QA Deal Breaker Candidate 1777432394903	qa.deal.breaker.1777432394903@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:13:15.995827-03	2026-04-29 00:13:15.995829-03	\N	\N	unknown	\N	\N
262a9bd3-26f6-464d-bdac-8cbaab321a1f	\N	QA Deal Breaker Candidate 1777432576864	qa.deal.breaker.1777432576864@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:16:18.422676-03	2026-04-29 00:16:18.422691-03	\N	\N	unknown	\N	\N
ba22024f-23df-4ced-8bc0-dc1cda884acb	\N	Hiago 2	hiado@gmail.com	\N	\N	\N	BR	\N	\N	\N	\N	["postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:20:38.348939-03	2026-04-28 13:21:03.788415-03	\N	\N	unknown	\N	\N
9a9cc1c1-d8d3-4058-99b0-4a4827711e80	\N	QA Deal Breaker Candidate 1777432727518	qa.deal.breaker.1777432727518@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:18:48.593767-03	2026-04-29 00:18:48.593771-03	\N	\N	unknown	\N	\N
088e9350-845f-4dfd-b103-2df352820914	\N	QA Cache Candidate 1777432759978	qa.cache.1777432759978@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:22.914228-03	2026-04-29 00:19:22.914236-03	\N	\N	unknown	\N	\N
0db26fb0-8008-43b1-bf50-55e9b9518143	\N	Hiago3	giago@gmail.com	\N	\N	\N	BR	\N	\N	\N	\N	["postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:04.587043-03	2026-04-28 13:22:09.888204-03	\N	\N	unknown	\N	\N
9c8edb04-85a3-4c7e-8b28-daf501e6036a	\N	QA E2E 1777432770896	qa.e2e.1777432770896@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:32.274532-03	2026-04-29 00:19:33.096715-03	\N	\N	unknown	\N	\N
0d53a1ff-fce7-4a49-b8c6-e83286bd7210	\N	Hiago 4	giaodo@gmail.com	\N	\N	\N	BR	\N	\N	\N	\N	["postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:29.588943-03	2026-04-28 13:22:33.975129-03	\N	\N	unknown	\N	\N
9ff5ad7e-c9aa-47e7-aa85-152bcae74799	\N	QA Deal Breaker Candidate 1777432776918	qa.deal.breaker.1777432776918@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:37.744633-03	2026-04-29 00:19:37.744641-03	\N	\N	unknown	\N	\N
ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	\N	Hiago 6	hiasfsad@gmail.com	\N	\N	\N	BR	\N	\N	\N	\N	["postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:39:56.839533-03	2026-04-28 13:40:04.683825-03	\N	\N	unknown	\N	\N
bb9c2755-fef1-4767-ac3e-b1581992cefe	\N	QA E2E 1777432857695	qa.e2e.1777432857695@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:20:59.397403-03	2026-04-29 00:21:00.06323-03	\N	\N	unknown	\N	\N
95f32d95-8fc0-4065-a176-7aef049400c3	\N	QA Count One 1777456861852	qa.count.one.1777456861852@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:01:03.319545-03	2026-04-29 07:01:03.319547-03	\N	\N	unknown	\N	\N
74a2f845-fba6-4864-8db5-1e54233666a5	\N	QA Cache Candidate 1777432912083	qa.cache.1777432912083@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:21:54.531344-03	2026-04-29 00:21:54.531355-03	\N	\N	unknown	\N	\N
e4d46e65-9429-48d7-9ce6-e35351a8928f	\N	QA Count Multi 1777456861852	qa.count.multi.1777456861852@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:01:03.327826-03	2026-04-29 07:01:03.327829-03	\N	\N	unknown	\N	\N
6d0f98fd-1654-42c2-851d-590c97391392	\N	QA Sem Vaga 1777457120187	qa.sem.vaga.1777457120187@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:05:24.147587-03	2026-04-29 07:05:24.147839-03	\N	\N	unknown	\N	\N
9f4406f9-6f09-4474-8691-9d25930aef43	\N	QA Com Vaga 1777457127018	qa.com.vaga.1777457127018@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:05:28.297984-03	2026-04-29 07:05:28.298001-03	\N	\N	unknown	\N	\N
507f45ae-74c1-4fa8-9f4b-a89f8970edcc	\N	QA Count Zero 1777457151886	qa.count.zero.1777457151886@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:05:53.517628-03	2026-04-29 07:05:53.517642-03	\N	\N	unknown	\N	\N
971f1bd2-0c13-46f2-8cd2-08da87d14c33	\N	QA Count One 1777457151886	qa.count.one.1777457151886@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:05:53.527434-03	2026-04-29 07:05:53.527437-03	\N	\N	unknown	\N	\N
ae77bed0-c0f6-4062-8272-dc7cf8a7e1e4	\N	QA Count Multi 1777457151886	qa.count.multi.1777457151886@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:05:53.535436-03	2026-04-29 07:05:53.535438-03	\N	\N	unknown	\N	\N
192b813b-bb3a-487c-a358-947c9ebf801b	\N	QA Sem Pipeline 1777457174958	qa.sem.pipeline.1777457174958@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:06:16.640076-03	2026-04-29 07:06:16.640085-03	\N	\N	unknown	\N	\N
9a492c1a-6d48-4755-ac17-9ff5d208f794	\N	QA Sem Vaga 1777457262395	qa.sem.vaga.1777457262395@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:07:43.887994-03	2026-04-29 07:07:43.88804-03	\N	\N	unknown	\N	\N
6e6b3a3a-9626-4100-b57f-0d61c4dfe7d0	\N	QA Com Vaga 1777457264751	qa.com.vaga.1777457264751@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:07:45.862584-03	2026-04-29 07:07:45.862588-03	\N	\N	unknown	\N	\N
25a94995-b327-4e39-9fe4-57bcd6c4f1d7	\N	QA Count Zero 1777457289526	qa.count.zero.1777457289526@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:08:10.468781-03	2026-04-29 07:08:10.468789-03	\N	\N	unknown	\N	\N
f43debc1-0952-4c3d-a081-94f642e4420c	\N	QA Count One 1777457289526	qa.count.one.1777457289526@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:08:10.490719-03	2026-04-29 07:08:10.49072-03	\N	\N	unknown	\N	\N
73602976-48f9-46a6-bedd-e37b6596695e	\N	QA Count Multi 1777457289526	qa.count.multi.1777457289526@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:08:10.497507-03	2026-04-29 07:08:10.497508-03	\N	\N	unknown	\N	\N
f8388ff3-43ed-4abc-8e8f-4483ab24575c	\N	QA Sem Pipeline 1777457290959	qa.sem.pipeline.1777457290959@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:08:12.125045-03	2026-04-29 07:08:12.125049-03	\N	\N	unknown	\N	\N
63187b76-e83b-4545-bdfe-61664ee094c3	\N	Lecino Lucas	lecinolucas4@gmail.com	62996564756	\N	\N	BR	\N	\N	\N	\N	["docker", "git", "mysql", "node", "node.js", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 09:13:41.468692-03	2026-04-28 09:14:01.968218-03	\N	\N	unknown	\N	\N
95485cfc-d4cc-4179-9a26-967b136dee9e	\N	QA Sem Vaga 1777457429314	qa.sem.vaga.1777457429314@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:30.943052-03	2026-04-29 07:10:30.943057-03	\N	\N	unknown	\N	\N
0d6286c6-d712-42b0-b8b0-093b7a8f9aa1	\N	QA Com Vaga 1777457431958	qa.com.vaga.1777457431958@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:33.131705-03	2026-04-29 07:10:33.131707-03	\N	\N	unknown	\N	\N
e31a4a52-dff9-4e88-b769-b1874c893a1a	\N	QA Count Zero 1777457435373	qa.count.zero.1777457435373@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:36.284676-03	2026-04-29 07:10:36.284684-03	\N	\N	unknown	\N	\N
017fc9c6-215f-4e54-a821-c1d02ffbe074	\N	QA Count One 1777457435373	qa.count.one.1777457435373@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:36.292675-03	2026-04-29 07:10:36.292676-03	\N	\N	unknown	\N	\N
95f827b3-0934-4893-9194-09987b129b5f	\N	QA Count Multi 1777457435373	qa.count.multi.1777457435373@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:36.301501-03	2026-04-29 07:10:36.301504-03	\N	\N	unknown	\N	\N
f12a90f4-aa45-4bbb-b38c-0fd5c03d4953	\N	QA Sem Pipeline 1777457436719	qa.sem.pipeline.1777457436719@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:37.95476-03	2026-04-29 07:10:37.954763-03	\N	\N	unknown	\N	\N
db670570-7271-4513-9286-be386c347fcb	\N	QA Deal Breaker Candidate 1777457630688	qa.deal.breaker.1777457630688@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:13:52.068852-03	2026-04-29 07:13:52.068857-03	\N	\N	unknown	\N	\N
46333bfc-f564-45eb-a3bd-22117964fb2a	\N	QA E2E 1777457799870	qa.e2e.1777457799870@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:41.599654-03	2026-04-29 07:16:42.30583-03	\N	\N	unknown	\N	\N
181c9978-3d3b-4351-9615-45ddc092be5c	\N	QA Deal Breaker Candidate 1777457809796	qa.deal.breaker.1777457809796@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:50.683804-03	2026-04-29 07:16:50.683814-03	\N	\N	unknown	\N	\N
0b0b65b5-f7cc-40e6-9f42-40a84c3e2c39	\N	QA Cache Candidate 1777457816050	qa.cache.1777457816050@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:58.569923-03	2026-04-29 07:16:58.569934-03	\N	\N	unknown	\N	\N
d246ef01-5914-450c-8673-24572b977e8c	\N	QA E2E 1777458027145	qa.e2e.1777458027145@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:28.757459-03	2026-04-29 07:20:29.367149-03	\N	\N	unknown	\N	\N
4309edf3-f92c-4583-836a-6cfe3145deb8	\N	QA Deal Breaker Candidate 1777458036747	qa.deal.breaker.1777458036747@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:37.499466-03	2026-04-29 07:20:37.499474-03	\N	\N	unknown	\N	\N
b5cb0a92-90d1-4346-8dc4-e474cd23f475	\N	QA Cache Candidate 1777458222413	qa.cache.1777458222413@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:23:45.778396-03	2026-04-29 07:23:45.778403-03	\N	\N	unknown	\N	\N
5ae9b847-fdc3-44e8-8885-0b36dfce4453	\N	QA E2E 1777458248373	qa.e2e.1777458248373@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:09.91525-03	2026-04-29 07:24:10.510094-03	\N	\N	unknown	\N	\N
0f39a78f-71cd-4369-a46e-75ac2e410da6	\N	QA Deal Breaker Candidate 1777458258526	qa.deal.breaker.1777458258526@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:19.387644-03	2026-04-29 07:24:19.387649-03	\N	\N	unknown	\N	\N
9e1ae6da-73f0-491b-8976-b6af756c3642	\N	QA Cache Candidate 1777458260894	qa.cache.1777458260894@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:23.447157-03	2026-04-29 07:24:23.447168-03	\N	\N	unknown	\N	\N
25cbe08a-c93e-4a64-b661-94d0f7ff68f1	\N	QA E2E 1777458281673	qa.e2e.1777458281673@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:43.437468-03	2026-04-29 07:24:44.051744-03	\N	\N	unknown	\N	\N
12fe0bc0-1ec4-49b5-85d7-5be8a8bcea05	\N	QA Deal Breaker Candidate 1777458291782	qa.deal.breaker.1777458291782@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:52.553403-03	2026-04-29 07:24:52.55341-03	\N	\N	unknown	\N	\N
48a8e909-3a2b-413d-85b7-231e33ac9d44	\N	QA Cache Candidate 1777458315072	qa.cache.1777458315072@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:18.23135-03	2026-04-29 07:25:18.231359-03	\N	\N	unknown	\N	\N
adccb07f-ba13-4ef1-b321-a9c901e3e677	\N	QA E2E 1777458348824	qa.e2e.1777458348824@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:50.382375-03	2026-04-29 07:25:50.997554-03	\N	\N	unknown	\N	\N
533d093a-9ecb-4e3d-8e35-acd2146497d5	\N	QA Deal Breaker Candidate 1777458358214	qa.deal.breaker.1777458358214@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:59.108044-03	2026-04-29 07:25:59.108053-03	\N	\N	unknown	\N	\N
cace0b79-27b8-4aa8-b198-6ccf577d5ccf	\N	QA Cache Candidate 1777458381115	qa.cache.1777458381115@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:23.706736-03	2026-04-29 07:26:23.706746-03	\N	\N	unknown	\N	\N
550364ec-d0b5-4ae3-8ff0-24ed1fe99793	\N	QA E2E 1777458412533	qa.e2e.1777458412533@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:53.966166-03	2026-04-29 07:26:54.557492-03	\N	\N	unknown	\N	\N
24495ca9-9ded-4fd9-94b5-30468145a1b8	\N	QA Deal Breaker Candidate 1777458421758	qa.deal.breaker.1777458421758@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:02.566616-03	2026-04-29 07:27:02.566625-03	\N	\N	unknown	\N	\N
788cdcec-ad09-4a9a-843b-c89622ca0285	\N	QA Cache Candidate 1777458423014	qa.cache.1777458423014@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:05.529718-03	2026-04-29 07:27:05.529725-03	\N	\N	unknown	\N	\N
fc573bcb-b9af-42bf-9f93-0c5c1da173b9	\N	QA Sem Vaga 1777458447075	qa.sem.vaga.1777458447075@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:28.81364-03	2026-04-29 07:27:28.813644-03	\N	\N	unknown	\N	\N
bb7e25da-71d7-4d24-8573-8972f241e5ba	\N	QA Com Vaga 1777458449615	qa.com.vaga.1777458449615@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:30.621277-03	2026-04-29 07:27:30.621289-03	\N	\N	unknown	\N	\N
841edb59-6cc9-464a-83fa-fcf8ca535139	\N	QA Count Zero 1777458452780	qa.count.zero.1777458452780@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:33.60829-03	2026-04-29 07:27:33.608293-03	\N	\N	unknown	\N	\N
d3188aee-919d-4e0d-90c4-b31b38b47ce7	\N	QA Count One 1777458452780	qa.count.one.1777458452780@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:33.61609-03	2026-04-29 07:27:33.616092-03	\N	\N	unknown	\N	\N
94336d21-3145-46bb-b6ed-4ae9458ebbc7	\N	QA Count Multi 1777458452780	qa.count.multi.1777458452780@example.com	\N	São Paulo	SP	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:33.625596-03	2026-04-29 07:27:33.625599-03	\N	\N	unknown	\N	\N
ebe8b705-1ae2-4384-9150-01fb21bc2880	\N	QA Sem Pipeline 1777458454060	qa.sem.pipeline.1777458454060@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:35.022752-03	2026-04-29 07:27:35.022761-03	\N	\N	unknown	\N	\N
d95ab262-c912-437d-ab16-66a7e94c98c0	\N	QA E2E 1777458993328	qa.e2e.1777458993328@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:36:35.130263-03	2026-04-29 07:36:35.750384-03	\N	\N	unknown	\N	\N
076f3bf8-2453-4393-a3a3-2faa8725445c	\N	QA Deal Breaker Candidate 1777459179240	qa.deal.breaker.1777459179240@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:39:40.764959-03	2026-04-29 07:39:40.764963-03	\N	\N	unknown	\N	\N
df46beee-f5fa-44e2-87ae-d910ed6b22c5	\N	QA Cache Candidate 1777459181212	qa.cache.1777459181212@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:39:43.715733-03	2026-04-29 07:39:43.715762-03	\N	\N	unknown	\N	\N
c9babfc0-c47e-44d6-9c5d-e28d757d06bf	\N	QA E2E 1777459216980	qa.e2e.1777459216980@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:40:18.652184-03	2026-04-29 07:40:19.271286-03	\N	\N	unknown	\N	\N
e839ead1-5147-4899-aa45-17d54b911501	\N	QA E2E 1777459309515	qa.e2e.1777459309515@example.com	\N	\N	\N	BR	\N	\N	\N	\N	["fastapi", "postgresql", "python", "sql"]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:41:51.305047-03	2026-04-29 07:41:51.913427-03	\N	\N	unknown	\N	\N
23806535-fd2c-480b-8651-79687104b3cf	\N	QA Deal Breaker Candidate 1777459402258	qa.deal.breaker.1777459402258@example.com	\N	Rio de Janeiro	RJ	BRASIL	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:43:23.701708-03	2026-04-29 07:43:23.701716-03	\N	\N	unknown	\N	\N
9be1616a-dc31-44bd-8d14-3ac94a02c5b9	\N	QA Cache Candidate 1777459404163	qa.cache.1777459404163@example.com	\N	\N	\N	BR	\N	\N	\N	\N	[]	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:43:26.677474-03	2026-04-29 07:43:26.677483-03	\N	\N	unknown	\N	\N
\.


--
-- Data for Name: document_ai_analyses; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.document_ai_analyses (id, document_id, raw_text, clean_text, structured_data, confidence, status, model_used, created_at, error_message) FROM stdin;
\.


--
-- Data for Name: document_requirements; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.document_requirements (id, name, is_required) FROM stdin;
\.


--
-- Data for Name: job_required_skills; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.job_required_skills (id, job_id, skill_id, is_mandatory, minimum_level, minimum_years, weight) FROM stdin;
ceccfc52-ee51-4a83-b486-f3548cc07aab	d75da52e-60db-48bf-a2a0-adddaf952c87	79c16226-3b2d-41f3-9b06-ee873f11e8c7	f	\N	\N	1.00
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.jobs (id, title, description, requirements, status, seniority_level, work_model, location, salary_min, salary_max, salary_currency, created_by, published_at, closed_at, expires_at, created_at, updated_at, deleted_at, minimum_education_level, minimum_years_experience, deal_breakers) FROM stdin;
fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	Product Manager	Liderar roadmap de produto, priorizar entregas e articular stakeholders técnicos e de negócio.	Experiência em times ágeis, definição de métricas e validação de hipóteses.	published	lead	onsite	Rio de Janeiro - RJ	14000.00	20000.00	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-22 19:11:48.185385-03	\N	\N	2026-04-22 19:11:48.185385-03	2026-04-22 19:11:48.185385-03	\N	\N	\N	[]
f6b0b9bb-2a37-4c9b-ad5a-64dcd13b825f	Vaga Teste - Backend Pleno	Buscamos uma pessoa desenvolvedora backend pleno para atuar na evolucao de APIs, integracoes e rotinas de processamento. A pessoa vai trabalhar em parceria com produto e dados para construir servicos confiaveis, monitorados e preparados para escala.	Experiencia com Python, PostgreSQL e Docker. Vivencia com APIs REST, testes automatizados, versionamento com Git e boas praticas de observabilidade.	published	mid	remote	Remoto	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:04:33.263305-03	\N	\N	2026-04-28 23:04:17.303304-03	2026-04-28 23:04:33.263305-03	\N	bachelor	3.0	[{"field": "work_model", "value": "remote", "reason": "Esta vaga e somente remota.", "operator": "not_equals", "is_active": true}]
d75da52e-60db-48bf-a2a0-adddaf952c87	Engenheiro de Software - Backend	Desenvolver e manter serviços backend em Python (FastAPI). Fazer design de APIs, integrações com bancos e filas.	Experiência com Python, SQLAlchemy, PostgreSQL, testes automatizados.	published	senior	hybrid	São Paulo - SP	12000.00	18000.00	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-22 19:11:48.185385-03	\N	\N	2026-04-22 19:11:48.185385-03	2026-04-23 22:52:31.429445-03	\N	\N	\N	[]
3a7d2f21-0a5a-4667-8605-92151d5a331d	Analista de Dados	Buscamos Analista de Dados para atuar na coleta, tratamento e análise de dados, apoiando decisões do negócio.\n\nResponsável por extrair dados de bancos e sistemas internos, criar consultas SQL, desenvolver dashboards e identificar insights relevantes.\n\nRequisitos:\n- SQL avançado\n- Excel avançado\n- Experiência com ferramentas de BI (Power BI, Metabase ou similar)\n- Conhecimento em modelagem de dados\n\nDiferenciais:\n- Python para análise de dados\n- Experiência com ETL e automação\n- Conhecimento em dados de RH, vendas ou operações\n\nProcuramos alguém com pensamento analítico, boa comunicação e foco em resolver problemas reais com dados.	Analista de Dados com experiência em SQL, Excel e BI para coleta, modelagem e análise de dados. Atuação com dashboards, métricas e geração de insights para apoio à decisão. Diferencial: Python, ETL e experiência com dados de RH ou vendas.	published	mid	remote	Remoto	7000.00	11000.00	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-22 19:11:48.185385-03	\N	\N	2026-04-22 19:11:48.185385-03	2026-04-28 13:39:27.371821-03	\N	\N	\N	[]
de2170f8-6183-4581-8048-21256db5cb53	Analista de Sistema	💼 Vaga: Analista de Sistemas Pleno (Backend)\n\n📍 Local: Remoto ou Híbrido\n🕒 Tipo: CLT ou PJ\n\n🚀 Sobre a vaga\n\nEstamos em busca de um Analista de Sistemas Pleno com foco em backend, que goste de resolver problemas complexos, trabalhar com integrações e atuar próximo do time de produto e suporte. Você será responsável por desenvolver, manter e evoluir sistemas críticos para o negócio.\n\n🧠 Responsabilidades\nDesenvolver e manter APIs REST escaláveis\nModelar e otimizar bancos de dados (principalmente PostgreSQL)\nRealizar integrações com sistemas externos\nAtuar na sustentação e suporte técnico (N2/N3)\nParticipar de decisões técnicas e arquitetura de sistemas\nAutomatizar rotinas e processos internos\n🛠️ Requisitos\nExperiência sólida com backend (Python ou Node.js)\nConhecimento em banco de dados relacionais (PostgreSQL ou MySQL)\nExperiência com APIs REST\nVivência com versionamento usando Git\nConhecimento em Docker\nBoa comunicação e capacidade de resolver problemas\n⭐ Diferenciais\nExperiência com sistemas legados\nConhecimento em arquitetura de microsserviços\nExperiência com filas/processamento assíncrono\nVivência em ambientes de alta disponibilidade\n🎯 Perfil comportamental\nProativo e com senso de dono\nBoa comunicação com times técnicos e não técnicos\nOrganizado e focado em solução de problemas\nInteresse em evolução constante	\N	published	junior	hybrid	Goiania - GO 	2500.00	3500.00	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-24 12:26:19.312037-03	\N	\N	2026-04-23 21:00:27.310436-03	2026-04-24 12:26:19.312037-03	\N	\N	\N	[]
14d8391e-850f-4676-a7d4-96e05b05c633	Auxiliar Administrativo	• R$ 2.032,46+ Avaliação por Desempenho de até R$\n300,00.\n• VA + VT + Plano de Saúde e Odontológico + Seguro de Vida +\nDay Off no aniversário +	Ensino Superior em curso (Administraçãwwwo, Gestão\nFinanceira ou áreas afins).\n• Conhecimento em Informática Básica e Excel.\n• Experiência prática em rotinas bancárias e financeiras.\n• Diferencial: Experiência com o sistema Protheus (TOTVS).\n\nDe seg. a sexta-feira, das 08:00 as 18:00\n• Endereço: Jardim Goiás, Goiânia (GO)	published	junior	onsite	Goiania	2000.00	3000.00	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:40:37.056154-03	\N	\N	2026-04-27 11:47:42.691047-03	2026-04-28 13:40:37.056178-03	\N	\N	\N	[]
4aeb3f03-98ca-428e-a7ed-8367e03452dd	QA Deal Breaker 1777432394903	Descricao da vaga QA Deal Breaker 1777432394903	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 00:13:15.964071-03	2026-04-29 00:13:15.964076-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
a3e3696a-a0bb-4b21-a765-a05eea5475c6	QA Deal Breaker 1777432576864	Descricao da vaga QA Deal Breaker 1777432576864	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 00:16:18.408842-03	2026-04-29 00:16:18.408846-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
a4683140-de09-4948-99de-a5969a360918	QA Cache Job A 1777432576864	Descricao da vaga QA Cache Job A 1777432576864	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:16:19.743344-03	\N	\N	2026-04-29 00:16:19.560696-03	2026-04-29 00:16:19.743344-03	\N	\N	\N	[]
97b34f1d-5fcd-4d78-86b8-990432ef8186	QA Cache Job B 1777432576864	Descricao da vaga QA Cache Job B 1777432576864	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:16:20.262498-03	\N	\N	2026-04-29 00:16:20.081072-03	2026-04-29 00:16:20.262498-03	\N	\N	\N	[]
e997b8a4-a221-4b30-80fb-6461fc5228e5	QA Deal Breaker 1777432727518	Descricao da vaga QA Deal Breaker 1777432727518	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 00:18:48.551115-03	2026-04-29 00:18:48.551119-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
4b8fcc61-424c-4f6c-9228-2081bcfffa83	QA Deal Breaker 1777425470961	Descricao da vaga QA Deal Breaker 1777425470961	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-28 22:17:52.664011-03	2026-04-28 22:17:52.664016-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
a5c12ab0-b165-4953-9bae-0bec45974919	QA Deal Breaker 1777425529210	Descricao da vaga QA Deal Breaker 1777425529210	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-28 22:18:50.658561-03	2026-04-28 22:18:50.658563-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
874af82e-8541-4708-a603-92581ef40fe4	QA Deal Breaker 1777425746294	Descricao da vaga QA Deal Breaker 1777425746294	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-28 22:22:27.70449-03	2026-04-28 22:22:27.704494-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
30cbb747-a5ad-45fc-829c-33f5519e2870	QA Cache Job B 1777457816050	Descricao da vaga QA Cache Job B 1777457816050	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:58.137368-03	\N	\N	2026-04-29 07:16:57.967003-03	2026-04-29 07:16:58.137368-03	\N	\N	\N	[]
78c76aa7-7fcd-4020-a682-9f719fb23219	QA Cache Job B 1777432759978	Descricao da vaga QA Cache Job B 1777432759978	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:22.278314-03	\N	\N	2026-04-29 00:19:22.095432-03	2026-04-29 00:19:22.278314-03	\N	\N	\N	[]
d0518c91-1a7a-4426-b892-3429e1bcbad9	QA Cache Job A 1777432759978 Updated	Descricao da vaga QA Cache Job A 1777432759978	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:21.697366-03	\N	\N	2026-04-29 00:19:21.512927-03	2026-04-29 00:19:23.914587-03	\N	\N	\N	[]
8f6d2400-8c63-4d1b-82f3-926d488017d9	QA Deal Breaker 1777432776918	Descricao da vaga QA Deal Breaker 1777432776918	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 00:19:37.691162-03	2026-04-29 00:19:37.691166-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
21d1c5ad-1d0e-48ea-b63d-18505a92125f	QA Count Job A 1777457435373	Descricao da vaga QA Count Job A 1777457435373	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:10:36.267486-03	2026-04-29 07:10:36.267489-03	\N	\N	\N	[]
df52f1c7-4cb7-4215-b8eb-921f82f89e2e	QA Cache Job B 1777432912083	Descricao da vaga QA Cache Job B 1777432912083	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:21:54.198688-03	\N	\N	2026-04-29 00:21:54.015107-03	2026-04-29 00:21:54.198688-03	\N	\N	\N	[]
2afdf362-5dd2-45f8-b49b-db765790bc1e	QA Cache Job A 1777432912083 Updated	Descricao da vaga QA Cache Job A 1777432912083	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:21:53.618652-03	\N	\N	2026-04-29 00:21:53.437713-03	2026-04-29 00:21:55.511171-03	\N	\N	\N	[]
61a53c7f-abc8-46be-b5d0-44558ab6baa3	QA Vaga Publicada 1777433710148	Descricao da vaga QA Vaga Publicada 1777433710148	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:35:12.182141-03	\N	\N	2026-04-29 00:35:12.015571-03	2026-04-29 00:35:12.182141-03	\N	\N	\N	[]
6c74be1a-a373-4363-8778-d0a4dc435766	QA Vaga Publicada 1777433728674	Descricao da vaga QA Vaga Publicada 1777433728674	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:35:30.284567-03	\N	\N	2026-04-29 00:35:30.103113-03	2026-04-29 00:35:30.284567-03	\N	\N	\N	[]
edc1e561-12a3-4372-9f36-fa5c76312dd6	QA Vaga Rascunho 1777433728674	Descricao da vaga QA Vaga Rascunho 1777433728674	Python, FastAPI, PostgreSQL	draft	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 00:35:30.634152-03	2026-04-29 00:35:30.634156-03	\N	\N	\N	[]
2e4781fb-33ad-461f-a945-460248439979	QA Vaga Publicada 1777433779646	Descricao da vaga QA Vaga Publicada 1777433779646	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:36:21.565883-03	\N	\N	2026-04-29 00:36:21.412652-03	2026-04-29 00:36:21.565883-03	\N	\N	\N	[]
21ca31d8-1213-4660-afe9-f46b0035d70a	QA Vaga Rascunho 1777433779646	Descricao da vaga QA Vaga Rascunho 1777433779646	Python, FastAPI, PostgreSQL	draft	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 00:36:21.896346-03	2026-04-29 00:36:21.896353-03	\N	\N	\N	[]
343a7a93-2bb7-41f8-b220-27f9bed8a839	QA Pipeline Check 1777456792616	Descricao da vaga QA Pipeline Check 1777456792616	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 06:59:53.630239-03	2026-04-29 06:59:53.63025-03	\N	\N	\N	[]
c68a8681-2106-40e5-9c35-b24ad63c78dd	QA Job Publicada 1777456815550	Descricao da vaga QA Job Publicada 1777456815550	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:00:16.905713-03	2026-04-29 07:00:16.905715-03	\N	\N	\N	[]
90a89093-1451-423b-898c-845478e27b3e	QA Job Rascunho 1777456838302	Descricao da vaga QA Job Rascunho 1777456838302	Python, FastAPI, PostgreSQL	draft	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:00:39.157131-03	2026-04-29 07:00:39.157134-03	\N	\N	\N	[]
7f8b09b7-ec98-425e-aef1-81fb5d02b5ea	QA Count Job A 1777456861852	Descricao da vaga QA Count Job A 1777456861852	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:01:03.271592-03	2026-04-29 07:01:03.271593-03	\N	\N	\N	[]
7b144f65-41c4-449b-bd19-e2444eb53f89	QA Count Job B 1777456861852	Descricao da vaga QA Count Job B 1777456861852	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:01:03.283291-03	2026-04-29 07:01:03.283293-03	\N	\N	\N	[]
9c88bd34-46e3-45cc-97e4-18fe7627240e	QA Board Check 1777457047220	Descricao da vaga QA Board Check 1777457047220	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:04:08.670683-03	2026-04-29 07:04:08.670701-03	\N	\N	\N	[]
470a9ed1-43dc-489c-a8b7-fef76e0f4fa9	QA Pipeline Check 1777457120187	Descricao da vaga QA Pipeline Check 1777457120187	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:05:22.660222-03	2026-04-29 07:05:22.660227-03	\N	\N	\N	[]
e2a1a79f-1dde-410f-ac17-6f5a9217b32b	QA Job Publicada 1777457127018	Descricao da vaga QA Job Publicada 1777457127018	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:05:27.799214-03	2026-04-29 07:05:27.799217-03	\N	\N	\N	[]
9a2394d1-01f6-431e-98c0-bf73c24f1718	QA Job Rascunho 1777457129168	Descricao da vaga QA Job Rascunho 1777457129168	Python, FastAPI, PostgreSQL	draft	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:05:29.894723-03	2026-04-29 07:05:29.894728-03	\N	\N	\N	[]
22b4ab76-5e55-4308-90b3-3bb56fe7e7fe	QA Count Job A 1777457151886	Descricao da vaga QA Count Job A 1777457151886	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:05:53.491029-03	2026-04-29 07:05:53.491033-03	\N	\N	\N	[]
ebf724a6-142a-46ae-8c62-617c3aec3e8a	QA Count Job B 1777457151886	Descricao da vaga QA Count Job B 1777457151886	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:05:53.508543-03	2026-04-29 07:05:53.508546-03	\N	\N	\N	[]
44585b4e-74c0-4f03-9870-26e92f0e8bde	QA Board Check 1777457174958	Descricao da vaga QA Board Check 1777457174958	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:06:16.301604-03	2026-04-29 07:06:16.301605-03	\N	\N	\N	[]
760ffa0b-1245-4e15-82e5-29a6a1da46aa	QA Pipeline Check 1777457262395	Descricao da vaga QA Pipeline Check 1777457262395	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:07:43.32383-03	2026-04-29 07:07:43.323835-03	\N	\N	\N	[]
091e315a-a2a2-407a-abbf-231e23c8d5dd	QA Job Publicada 1777457264751	Descricao da vaga QA Job Publicada 1777457264751	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:07:45.472971-03	2026-04-29 07:07:45.472974-03	\N	\N	\N	[]
abeb1647-d63f-4e3a-a24e-d95c233d681a	QA Job Rascunho 1777457266679	Descricao da vaga QA Job Rascunho 1777457266679	Python, FastAPI, PostgreSQL	draft	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:07:47.525311-03	2026-04-29 07:07:47.525315-03	\N	\N	\N	[]
b535e5f1-b4da-4c54-add5-67e658e8af17	QA Count Job A 1777457289526	Descricao da vaga QA Count Job A 1777457289526	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:08:10.405524-03	2026-04-29 07:08:10.405528-03	\N	\N	\N	[]
fac81a55-7d6d-4093-bd73-001bc77b864b	QA Count Job B 1777457289526	Descricao da vaga QA Count Job B 1777457289526	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:08:10.460676-03	2026-04-29 07:08:10.46068-03	\N	\N	\N	[]
dc2db798-081e-44e0-803b-f70bc68df800	QA Board Check 1777457290959	Descricao da vaga QA Board Check 1777457290959	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:08:11.683401-03	2026-04-29 07:08:11.68341-03	\N	\N	\N	[]
bd021abe-8316-49d6-87e9-d164b62e7056	QA Pipeline Check 1777457429314	Descricao da vaga QA Pipeline Check 1777457429314	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:10:30.281956-03	2026-04-29 07:10:30.281965-03	\N	\N	\N	[]
2eb4cba8-d843-434e-a35a-611421cedf73	QA Job Publicada 1777457431958	Descricao da vaga QA Job Publicada 1777457431958	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:10:32.67245-03	2026-04-29 07:10:32.672453-03	\N	\N	\N	[]
ddb6b8df-40cd-45eb-8ad6-adb874ffbe5e	QA Job Rascunho 1777457433948	Descricao da vaga QA Job Rascunho 1777457433948	Python, FastAPI, PostgreSQL	draft	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:10:34.82258-03	2026-04-29 07:10:34.822585-03	\N	\N	\N	[]
43967b0f-2b93-45b3-ac8e-699006925ecd	QA Count Job B 1777457435373	Descricao da vaga QA Count Job B 1777457435373	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:10:36.275581-03	2026-04-29 07:10:36.275582-03	\N	\N	\N	[]
36c21c41-5620-4c4d-a06e-ac7de5ff04c4	QA Board Check 1777457436719	Descricao da vaga QA Board Check 1777457436719	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:10:37.56626-03	2026-04-29 07:10:37.566262-03	\N	\N	\N	[]
12fe640a-40a4-4004-9c06-7c4eac7997a0	QA Deal Breaker 1777457630688	Descricao da vaga QA Deal Breaker 1777457630688	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:13:52.024602-03	2026-04-29 07:13:52.024607-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
4a8b0a32-338d-421d-b378-e8629a9975f8	QA Deal Breaker 1777457809796	Descricao da vaga QA Deal Breaker 1777457809796	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:16:50.654562-03	2026-04-29 07:16:50.654566-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
ca24747c-4f2b-4f75-875b-e65abeb2cf26	QA Cache Job A 1777457816050 Updated	Descricao da vaga QA Cache Job A 1777457816050	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:57.572537-03	\N	\N	2026-04-29 07:16:57.383056-03	2026-04-29 07:16:59.649163-03	\N	\N	\N	[]
248c13ce-cbd5-4f6e-b87b-bfddedf52797	QA Deal Breaker 1777458036747	Descricao da vaga QA Deal Breaker 1777458036747	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:20:37.48834-03	2026-04-29 07:20:37.488342-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
802a66d1-dea3-49ae-8e0f-f82e6b204e8b	QA Job Rascunho 1777458451498	Descricao da vaga QA Job Rascunho 1777458451498	Python, FastAPI, PostgreSQL	draft	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:27:32.205715-03	2026-04-29 07:27:32.205719-03	\N	\N	\N	[]
14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	QA Cache Job B 1777458222413	Descricao da vaga QA Cache Job B 1777458222413	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:23:45.182914-03	\N	\N	2026-04-29 07:23:45.00125-03	2026-04-29 07:23:45.182914-03	\N	\N	\N	[]
e7dd7099-5202-42d2-b56d-d300aad38692	QA Cache Job A 1777458222413 Updated	Descricao da vaga QA Cache Job A 1777458222413	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:23:44.583949-03	\N	\N	2026-04-29 07:23:44.405673-03	2026-04-29 07:23:46.664566-03	\N	\N	\N	[]
a8f4df1e-2a65-4e8b-89a5-48f8f163629a	QA Deal Breaker 1777458258526	Descricao da vaga QA Deal Breaker 1777458258526	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:24:19.372618-03	2026-04-29 07:24:19.372623-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
0fbc2429-c5d4-4fb6-9af8-805306444952	QA Count Job A 1777458452780	Descricao da vaga QA Count Job A 1777458452780	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:27:33.579338-03	2026-04-29 07:27:33.579343-03	\N	\N	\N	[]
002c11b5-26b0-428b-8ae1-251211888bf6	QA Cache Job B 1777458260894	Descricao da vaga QA Cache Job B 1777458260894	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:23.032203-03	\N	\N	2026-04-29 07:24:22.819203-03	2026-04-29 07:24:23.032203-03	\N	\N	\N	[]
0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	QA Cache Job A 1777458260894 Updated	Descricao da vaga QA Cache Job A 1777458260894	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:22.415802-03	\N	\N	2026-04-29 07:24:22.23557-03	2026-04-29 07:24:24.296226-03	\N	\N	\N	[]
e40a415a-723c-43d0-998e-ed81fe9f9c54	QA Deal Breaker 1777458291782	Descricao da vaga QA Deal Breaker 1777458291782	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:24:52.542675-03	2026-04-29 07:24:52.54268-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
3791dfea-a98f-42da-b56c-4f59064d34a4	QA Count Job B 1777458452780	Descricao da vaga QA Count Job B 1777458452780	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:27:33.594033-03	2026-04-29 07:27:33.594041-03	\N	\N	\N	[]
3eb69bdb-df4b-4294-9636-b584e2d36530	QA Cache Job B 1777458315072	Descricao da vaga QA Cache Job B 1777458315072	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:17.73134-03	\N	\N	2026-04-29 07:25:17.552896-03	2026-04-29 07:25:17.73134-03	\N	\N	\N	[]
fc5b7d69-4693-4440-9811-87c32d7694d2	QA Cache Job A 1777458315072 Updated	Descricao da vaga QA Cache Job A 1777458315072	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:17.330862-03	\N	\N	2026-04-29 07:25:17.150939-03	2026-04-29 07:25:19.16502-03	\N	\N	\N	[]
e75e06be-bf4b-4452-a47c-f2009f6b798a	QA Deal Breaker 1777458358214	Descricao da vaga QA Deal Breaker 1777458358214	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:25:59.096992-03	2026-04-29 07:25:59.096996-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	QA Board Check 1777458454060	Descricao da vaga QA Board Check 1777458454060	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:27:34.782754-03	2026-04-29 07:27:34.782758-03	\N	\N	\N	[]
6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	QA Cache Job B 1777458381115	Descricao da vaga QA Cache Job B 1777458381115	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:23.095066-03	\N	\N	2026-04-29 07:26:22.91809-03	2026-04-29 07:26:23.095066-03	\N	\N	\N	[]
131f29d1-1893-444f-a235-c9320c4fd62f	QA Cache Job A 1777458381115 Updated	Descricao da vaga QA Cache Job A 1777458381115	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:22.596948-03	\N	\N	2026-04-29 07:26:22.41899-03	2026-04-29 07:26:24.556676-03	\N	\N	\N	[]
7205cf80-5516-40c5-9c8a-b06506c44293	QA Deal Breaker 1777458421758	Descricao da vaga QA Deal Breaker 1777458421758	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:27:02.551414-03	2026-04-29 07:27:02.551416-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
0b852ec2-7a54-4b0b-b826-c563806e0226	QA Deal Breaker 1777459179240	Descricao da vaga QA Deal Breaker 1777459179240	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:39:40.745399-03	2026-04-29 07:39:40.745404-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
0abdf932-256b-4fff-8ff0-f1ddc0ecc398	QA Cache Job B 1777458423014	Descricao da vaga QA Cache Job B 1777458423014	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:05.010528-03	\N	\N	2026-04-29 07:27:04.829213-03	2026-04-29 07:27:05.010528-03	\N	\N	\N	[]
15c22ef4-eb43-4a8d-bd27-a6fae183baa9	QA Cache Job A 1777458423014 Updated	Descricao da vaga QA Cache Job A 1777458423014	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:04.429055-03	\N	\N	2026-04-29 07:27:04.240892-03	2026-04-29 07:27:06.547649-03	\N	\N	\N	[]
bd726364-0421-4540-b1bb-ba549f2fd765	QA Pipeline Check 1777458447075	Descricao da vaga QA Pipeline Check 1777458447075	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:27:28.182807-03	2026-04-29 07:27:28.182813-03	\N	\N	\N	[]
de097a8b-1083-4ff9-9064-039da37ecc9c	QA Job Publicada 1777458449615	Descricao da vaga QA Job Publicada 1777458449615	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:27:30.324583-03	2026-04-29 07:27:30.324585-03	\N	\N	\N	[]
3020b91e-658d-4e0a-9edf-93cb692b95a2	QA Cache Job B 1777459181212	Descricao da vaga QA Cache Job B 1777459181212	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:39:43.314668-03	\N	\N	2026-04-29 07:39:43.143025-03	2026-04-29 07:39:43.314668-03	\N	\N	\N	[]
7f3458b8-40c5-4814-8a5c-ea26e22ff026	QA Cache Job A 1777459181212 Updated	Descricao da vaga QA Cache Job A 1777459181212	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:39:42.702467-03	\N	\N	2026-04-29 07:39:42.511495-03	2026-04-29 07:39:44.560202-03	\N	\N	\N	[]
053dd20d-1f46-452b-9b0d-64222546b0ba	QA Deal Breaker 1777459402258	Descricao da vaga QA Deal Breaker 1777459402258	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	\N	\N	\N	2026-04-29 07:43:23.67588-03	2026-04-29 07:43:23.675885-03	\N	\N	\N	[{"field": "location", "value": "São Paulo", "reason": "A vaga exige atuação presencial em São Paulo.", "operator": "equals", "is_active": true}]
45cb2aee-6418-4d59-825f-ef727e0727ca	QA Cache Job B 1777459404163	Descricao da vaga QA Cache Job B 1777459404163	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:43:26.145031-03	\N	\N	2026-04-29 07:43:25.961046-03	2026-04-29 07:43:26.145031-03	\N	\N	\N	[]
952b2c30-9465-4c55-9a69-9c1f9e0f8fb2	QA Cache Job A 1777459404163 Updated	Descricao da vaga QA Cache Job A 1777459404163	Python, FastAPI, PostgreSQL	published	\N	\N	\N	\N	\N	BRL	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:43:25.561948-03	\N	\N	2026-04-29 07:43:25.384115-03	2026-04-29 07:43:27.595065-03	\N	\N	\N	[]
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: pipeline_events; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.pipeline_events (id, event_type, entity_id, payload, created_at) FROM stdin;
\.


--
-- Data for Name: pipeline_stage_transitions; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.pipeline_stage_transitions (id, candidate_id, job_id, from_stage, to_stage, moved_by, moved_at, trigger, notes, reason) FROM stdin;
06f5994c-8d44-42d0-bd71-806bafb5e449	6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:02:29.447026-03	manual	\N	Adicionado manualmente a outra vaga
3dd8953a-cbb9-4a72-b02f-1e567e5f4431	f9b6fa2d-c337-4106-8a7b-a6d06c588561	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:04:21.911735-03	auto_match	\N	\N
4aba8021-2d80-4709-817e-a06a6fa9926a	bb2632a2-c424-4ee9-9e36-7c6db2a35282	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:05:22.329946-03	auto_match	\N	\N
b899275a-fe36-4e6d-824c-6b263ddf6456	dbbfea9e-1207-4a42-9c58-31ce837773db	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:10:10.877217-03	auto_match	\N	\N
1f082fe6-3efc-4ea6-af62-cac9ac4f8ff3	f709039e-b5ba-4339-8714-21bd010d7c56	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 13:11:51.058585-03	auto_match	\N	\N
36ce9abe-1f1f-41a7-9d13-8fb8134e4ffc	0db26fb0-8008-43b1-bf50-55e9b9518143	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:22:11.57677-03	auto_match	\N	\N
30da6200-d580-4739-8847-b72c84212164	4234af6d-08b8-43e6-b0a5-d9179baf7d2c	f6b0b9bb-2a37-4c9b-ad5a-64dcd13b825f	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:47:25.069085-03	manual	\N	Adicionado manualmente a outra vaga
2cc723f9-038f-4b49-a850-02b5b899acaa	bb9c2755-fef1-4767-ac3e-b1581992cefe	8f6d2400-8c63-4d1b-82f3-926d488017d9	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:21:05.504705-03	manual	\N	\N
838183d8-cc22-4419-8961-70b4f74f27c3	73602976-48f9-46a6-bedd-e37b6596695e	b535e5f1-b4da-4c54-add5-67e658e8af17	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:08:10.514215-03	manual	\N	Adicionado manualmente a outra vaga
95028bc3-d820-4c87-916e-2dc52b2b1741	0b0b65b5-f7cc-40e6-9f42-40a84c3e2c39	ca24747c-4f2b-4f75-875b-e65abeb2cf26	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:58.583264-03	manual	\N	Adicionado manualmente a outra vaga
4d0bb964-f0ae-4e99-9f48-eb1e0daf8954	9e1ae6da-73f0-491b-8976-b6af756c3642	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:23.46034-03	manual	\N	Adicionado manualmente a outra vaga
6edf0ecf-67b8-421e-ae2d-d76931793976	cace0b79-27b8-4aa8-b198-6ccf577d5ccf	131f29d1-1893-444f-a235-c9320c4fd62f	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:23.719703-03	manual	\N	Adicionado manualmente a outra vaga
08194757-5934-47c2-ae85-8cff02d5bf96	d95ab262-c912-437d-ab16-66a7e94c98c0	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:36:35.152268-03	manual	\N	Adicionado manualmente a outra vaga
7a480f4f-0009-44c2-89cf-3ef08defbe89	d95ab262-c912-437d-ab16-66a7e94c98c0	e40a415a-723c-43d0-998e-ed81fe9f9c54	\N	entry	\N	2026-04-29 07:36:37.563943-03	auto_match	\N	\N
3e5973ae-424e-47ee-9c41-3f84854e3140	d95ab262-c912-437d-ab16-66a7e94c98c0	fc5b7d69-4693-4440-9811-87c32d7694d2	\N	entry	\N	2026-04-29 07:36:37.597359-03	auto_match	\N	\N
dc2ba10a-ff22-459a-8848-36a104d4b7fe	d95ab262-c912-437d-ab16-66a7e94c98c0	12fe640a-40a4-4004-9c06-7c4eac7997a0	\N	entry	\N	2026-04-29 07:36:37.643738-03	auto_match	\N	\N
f9f9976e-4ebe-43be-ba16-b818996cb528	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	bd726364-0421-4540-b1bb-ba549f2fd765	\N	entry	\N	2026-04-29 07:40:21.1078-03	auto_match	\N	\N
fecbe255-0b5c-4a02-97b9-6c158862e297	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	\N	entry	\N	2026-04-29 07:40:21.137282-03	auto_match	\N	\N
0e47817c-68d5-46ca-b61a-37713a23e753	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	\N	entry	\N	2026-04-29 07:40:21.131507-03	auto_match	\N	\N
319906b6-4bb6-4c07-b3b1-3719aa49e1e5	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	3020b91e-658d-4e0a-9edf-93cb692b95a2	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:40:24.668782-03	manual	\N	\N
a6949842-c3ae-40a4-b5d1-3d574a023b72	e839ead1-5147-4899-aa45-17d54b911501	0fbc2429-c5d4-4fb6-9af8-805306444952	\N	entry	\N	2026-04-29 07:41:53.711438-03	auto_match	\N	\N
9cdc841d-8401-4955-b7a8-b163428dc14b	e839ead1-5147-4899-aa45-17d54b911501	7205cf80-5516-40c5-9c8a-b06506c44293	\N	entry	\N	2026-04-29 07:41:53.731497-03	auto_match	\N	\N
a010b290-ce05-4f4b-bdac-4aeb42b23b63	e839ead1-5147-4899-aa45-17d54b911501	e40a415a-723c-43d0-998e-ed81fe9f9c54	\N	entry	\N	2026-04-29 07:41:53.76702-03	auto_match	\N	\N
84b5fb0a-becd-451f-8e0f-77092f18934f	6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	\N	2026-04-28 13:02:49.531768-03	auto_match	\N	\N
f1327737-3e21-456d-b337-590ed75afa5c	f9b6fa2d-c337-4106-8a7b-a6d06c588561	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:04:21.911375-03	auto_match	\N	\N
2751f50f-cc95-481f-918d-c8c91d6e90ba	dbbfea9e-1207-4a42-9c58-31ce837773db	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:10:10.876074-03	auto_match	\N	\N
4f86c043-2744-4e9d-8b72-80e577568f11	f709039e-b5ba-4339-8714-21bd010d7c56	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:11:51.057942-03	auto_match	\N	\N
654311f3-4ac8-4976-9f6e-85bdd4b95939	ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:39:56.866583-03	manual	\N	Adicionado manualmente a outra vaga
606db63a-1e2c-4992-abdc-734fbcd8cf1e	ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 13:40:06.381964-03	auto_match	\N	\N
85b52b2d-2325-4552-a9a2-0730ff9abba8	fb8474ac-868f-4474-8c2e-2b9fc7bc2293	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:00:10.404963-03	manual	\N	Adicionado manualmente a outra vaga
7c9b3791-ff76-4a29-bba6-635a48b14e1a	fb8474ac-868f-4474-8c2e-2b9fc7bc2293	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 15:00:21.478349-03	auto_match	\N	\N
e5ee4443-98b2-416c-bf0b-d62f07bebd46	41eb5f95-d632-4bc1-a591-d8b1d63e0de7	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:18:44.107588-03	manual	\N	Adicionado manualmente a outra vaga
68ff9aaa-90e8-4455-a527-ba724769234d	41eb5f95-d632-4bc1-a591-d8b1d63e0de7	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 15:19:00.765585-03	auto_match	\N	\N
40aba4cf-9d09-4b1c-b442-9cc5fdf9e0cf	ac1b670a-d6fe-4f0c-b4bc-9aab469320d1	4aeb3f03-98ca-428e-a7ed-8367e03452dd	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:13:16.021275-03	manual	\N	Adicionado manualmente a outra vaga
1a9bf39f-380a-4967-95eb-b5929c6debba	74a2f845-fba6-4864-8db5-1e54233666a5	2afdf362-5dd2-45f8-b49b-db765790bc1e	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:21:54.544905-03	manual	\N	Adicionado manualmente a outra vaga
94c7df84-51b1-4433-a1eb-fa7f7f43b40e	73602976-48f9-46a6-bedd-e37b6596695e	fac81a55-7d6d-4093-bd73-001bc77b864b	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:08:10.525255-03	manual	\N	Adicionado manualmente a outra vaga
2fa028ef-0336-40b9-9533-ddffe7dabfc8	d246ef01-5914-450c-8673-24572b977e8c	30cbb747-a5ad-45fc-829c-33f5519e2870	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:28.777547-03	manual	\N	Adicionado manualmente a outra vaga
59c46af5-cebf-4d9e-8a54-3528699432bf	25cbe08a-c93e-4a64-b661-94d0f7ff68f1	002c11b5-26b0-428b-8ae1-251211888bf6	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:43.467369-03	manual	\N	Adicionado manualmente a outra vaga
45b239cd-a2b8-459b-b8bf-8b46cbe166e6	550364ec-d0b5-4ae3-8ff0-24ed1fe99793	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:53.987219-03	manual	\N	Adicionado manualmente a outra vaga
c41304f3-643c-4154-b0ed-b1eed2d2f2be	d95ab262-c912-437d-ab16-66a7e94c98c0	3791dfea-a98f-42da-b56c-4f59064d34a4	\N	entry	\N	2026-04-29 07:36:37.503373-03	auto_match	\N	\N
98b2c06e-5735-4d89-bafe-b1a273abcf75	d95ab262-c912-437d-ab16-66a7e94c98c0	bd726364-0421-4540-b1bb-ba549f2fd765	\N	entry	\N	2026-04-29 07:36:37.564089-03	auto_match	\N	\N
4d8c51d9-306c-468a-be68-170de9f720f8	d95ab262-c912-437d-ab16-66a7e94c98c0	002c11b5-26b0-428b-8ae1-251211888bf6	\N	entry	\N	2026-04-29 07:36:37.594906-03	auto_match	\N	\N
e5fe3fac-ca5c-4582-8653-d399c9c0d1e5	076f3bf8-2453-4393-a3a3-2faa8725445c	0b852ec2-7a54-4b0b-b826-c563806e0226	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:39:40.781988-03	manual	\N	Adicionado manualmente a outra vaga
3f428ad5-2df4-4c47-934f-fba8a787d3d4	df46beee-f5fa-44e2-87ae-d910ed6b22c5	7f3458b8-40c5-4814-8a5c-ea26e22ff026	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:39:43.727989-03	manual	\N	Adicionado manualmente a outra vaga
4c319210-98ac-4e1b-ad64-8650fb27b664	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	\N	entry	\N	2026-04-29 07:40:21.108928-03	auto_match	\N	\N
df479ed7-d230-4ce7-9cb9-cca5dda88400	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	\N	entry	\N	2026-04-29 07:40:21.134282-03	auto_match	\N	\N
069cb71e-87c0-471d-9ec3-a05b485c13f9	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	e7dd7099-5202-42d2-b56d-d300aad38692	\N	entry	\N	2026-04-29 07:40:21.150305-03	auto_match	\N	\N
ee4143bb-abd6-4497-8ee5-27c413182028	e839ead1-5147-4899-aa45-17d54b911501	bd726364-0421-4540-b1bb-ba549f2fd765	\N	entry	\N	2026-04-29 07:41:53.719265-03	auto_match	\N	\N
7aa8c23f-37f3-4ef6-811f-09d1975fb77c	e839ead1-5147-4899-aa45-17d54b911501	131f29d1-1893-444f-a235-c9320c4fd62f	\N	entry	\N	2026-04-29 07:41:53.745271-03	auto_match	\N	\N
b09f0411-3263-4544-aff4-69c31c279996	e839ead1-5147-4899-aa45-17d54b911501	30cbb747-a5ad-45fc-829c-33f5519e2870	\N	entry	\N	2026-04-29 07:41:53.783665-03	auto_match	\N	\N
5e33a9dd-639c-41c2-8c95-eac92843096a	6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 13:02:49.529479-03	auto_match	\N	\N
ea5dff0e-f166-482e-9d2b-556b0887a27e	f9b6fa2d-c337-4106-8a7b-a6d06c588561	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:04:12.854088-03	manual	\N	Adicionado manualmente a outra vaga
02ae8dc6-5291-4e68-8ba3-ef5ba54dfc49	f9b6fa2d-c337-4106-8a7b-a6d06c588561	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 13:04:21.912387-03	auto_match	\N	\N
aeb19c78-744b-482f-8ca1-253deeb97a76	bb2632a2-c424-4ee9-9e36-7c6db2a35282	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:05:22.330572-03	auto_match	\N	\N
6b5448ad-bb81-43e1-84c9-bce758a785ec	dbbfea9e-1207-4a42-9c58-31ce837773db	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:10:10.874412-03	auto_match	\N	\N
2e7e7d36-1fd5-404f-bdb2-c8587ed3c330	f709039e-b5ba-4339-8714-21bd010d7c56	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:11:51.0575-03	auto_match	\N	\N
5b3351a0-a420-428a-a3ae-580a1eaf5efa	ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:40:06.383703-03	auto_match	\N	\N
9fd8b447-d0a6-46a3-8f58-700aecd1d717	fb8474ac-868f-4474-8c2e-2b9fc7bc2293	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 15:00:21.532021-03	auto_match	\N	\N
63eac06a-90cc-410b-b4c5-20244639874b	41eb5f95-d632-4bc1-a591-d8b1d63e0de7	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 15:19:00.765255-03	auto_match	\N	\N
350c0cab-9fb7-442d-8707-d5641986b443	262a9bd3-26f6-464d-bdac-8cbaab321a1f	a3e3696a-a0bb-4b21-a765-a05eea5475c6	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:16:18.435995-03	manual	\N	Adicionado manualmente a outra vaga
c17a7517-5dcd-4e0e-ab43-db8787c948ef	1d84d654-275b-47d7-ab91-348743e52040	df52f1c7-4cb7-4215-b8eb-921f82f89e2e	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:22:26.375856-03	manual	\N	Adicionado manualmente a outra vaga
dc418bd4-2359-45f7-8b7c-b73c2877a7a5	0d6286c6-d712-42b0-b8b0-093b7a8f9aa1	2eb4cba8-d843-434e-a35a-611421cedf73	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:33.143765-03	manual	\N	Adicionado manualmente a outra vaga
f55c9930-b767-4246-bab5-75a21ff07091	95f827b3-0934-4893-9194-09987b129b5f	43967b0f-2b93-45b3-ac8e-699006925ecd	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:36.343178-03	manual	\N	Adicionado manualmente a outra vaga
8d062d8b-1dd4-4727-9aa7-eebf4942c1e3	d246ef01-5914-450c-8673-24572b977e8c	30cbb747-a5ad-45fc-829c-33f5519e2870	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:34.852731-03	manual	\N	\N
0eaff8e7-ebef-4c96-8814-fc6ea0146d18	25cbe08a-c93e-4a64-b661-94d0f7ff68f1	002c11b5-26b0-428b-8ae1-251211888bf6	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:49.436226-03	manual	\N	\N
64248a94-32b3-47a0-b100-b14521294b79	550364ec-d0b5-4ae3-8ff0-24ed1fe99793	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:59.932279-03	manual	\N	\N
75c8256c-f94f-4129-9adb-e894fcb81aa7	d95ab262-c912-437d-ab16-66a7e94c98c0	de097a8b-1083-4ff9-9064-039da37ecc9c	\N	entry	\N	2026-04-29 07:36:37.549836-03	auto_match	\N	\N
732074d6-dce5-489a-b265-84d10504302b	d95ab262-c912-437d-ab16-66a7e94c98c0	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	\N	entry	\N	2026-04-29 07:36:37.577521-03	auto_match	\N	\N
8d550bda-148f-4011-a3ad-dca10f2093b0	d95ab262-c912-437d-ab16-66a7e94c98c0	248c13ce-cbd5-4f6e-b87b-bfddedf52797	\N	entry	\N	2026-04-29 07:36:37.624413-03	auto_match	\N	\N
8d9b32aa-9c02-4187-b3af-53a535639246	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	3020b91e-658d-4e0a-9edf-93cb692b95a2	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:40:18.676797-03	manual	\N	Adicionado manualmente a outra vaga
4a689939-7601-46c0-b7f1-5837721fb00a	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	131f29d1-1893-444f-a235-c9320c4fd62f	\N	entry	\N	2026-04-29 07:40:21.116287-03	auto_match	\N	\N
d8ecbc57-a9cb-40b9-8c63-f38b18c7c9c0	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	fc5b7d69-4693-4440-9811-87c32d7694d2	\N	entry	\N	2026-04-29 07:40:21.138917-03	auto_match	\N	\N
9f8302b5-6cf5-4743-933c-e95daaf3b470	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	248c13ce-cbd5-4f6e-b87b-bfddedf52797	\N	entry	\N	2026-04-29 07:40:21.150078-03	auto_match	\N	\N
ce80becf-ed8c-43de-b01a-297dbfec7522	e839ead1-5147-4899-aa45-17d54b911501	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	\N	entry	\N	2026-04-29 07:41:53.725618-03	auto_match	\N	\N
46989b73-1fb4-48ec-a57e-91a10b407b09	e839ead1-5147-4899-aa45-17d54b911501	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	\N	entry	\N	2026-04-29 07:41:53.731161-03	auto_match	\N	\N
3d93b277-b0a6-410d-a3b1-69e28c974f79	e839ead1-5147-4899-aa45-17d54b911501	248c13ce-cbd5-4f6e-b87b-bfddedf52797	\N	entry	\N	2026-04-29 07:41:53.784066-03	auto_match	\N	\N
c7328332-b124-4840-a55f-5a28105309a2	e839ead1-5147-4899-aa45-17d54b911501	3020b91e-658d-4e0a-9edf-93cb692b95a2	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:41:57.301428-03	manual	\N	\N
f7bef0d8-72a5-45ba-aa20-0c73f26712ae	6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:02:49.548046-03	auto_match	\N	\N
7c4a9532-860a-4e30-a6c6-9cc6c24f9fbf	f9b6fa2d-c337-4106-8a7b-a6d06c588561	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:04:21.910842-03	auto_match	\N	\N
385aa6e2-e4d7-452a-902e-ce9c9e7ead50	bb2632a2-c424-4ee9-9e36-7c6db2a35282	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:05:22.330274-03	auto_match	\N	\N
ab427b70-e547-4e4c-9d1e-f472329dec3f	ab0b2d73-ab7d-44a5-94c3-bf1c21733063	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:16:42.063463-03	manual	\N	Adicionado manualmente a outra vaga
5a090ac6-238f-40fb-907d-f501fc43c6a1	ba22024f-23df-4ced-8bc0-dc1cda884acb	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:21:05.488787-03	auto_match	\N	\N
20384b3b-61be-419e-b74f-797aec5a95f3	0d53a1ff-fce7-4a49-b8c6-e83286bd7210	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:22:35.636915-03	auto_match	\N	\N
576dfb3a-ac26-4ff9-84be-e792679efcfb	ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:40:06.423073-03	auto_match	\N	\N
ab7a7706-f510-48aa-8f2a-8dadbf09828e	fb8474ac-868f-4474-8c2e-2b9fc7bc2293	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	\N	2026-04-28 15:00:21.531267-03	auto_match	\N	\N
fd05c440-3aa7-4fb0-a4d1-d42d48e7b26d	9a9cc1c1-d8d3-4058-99b0-4a4827711e80	e997b8a4-a221-4b30-80fb-6461fc5228e5	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:18:48.619907-03	manual	\N	Adicionado manualmente a outra vaga
69a0d9ce-8819-48b0-9e7f-d06318ef4650	1d84d654-275b-47d7-ab91-348743e52040	df52f1c7-4cb7-4215-b8eb-921f82f89e2e	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:22:32.352832-03	manual	\N	\N
16d0b3a3-b5b4-44ac-abda-6315cbcf2754	017fc9c6-215f-4e54-a821-c1d02ffbe074	21d1c5ad-1d0e-48ea-b63d-18505a92125f	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:36.313132-03	manual	\N	Adicionado manualmente a outra vaga
96a20eec-c120-47f1-966d-4701cfbed2c7	4309edf3-f92c-4583-836a-6cfe3145deb8	248c13ce-cbd5-4f6e-b87b-bfddedf52797	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:37.510934-03	manual	\N	Adicionado manualmente a outra vaga
2417a283-1aa1-4b23-beca-c182a94b0188	12fe0bc0-1ec4-49b5-85d7-5be8a8bcea05	e40a415a-723c-43d0-998e-ed81fe9f9c54	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:52.565727-03	manual	\N	Adicionado manualmente a outra vaga
0bf3066b-2447-4912-b796-3edb37a09f82	24495ca9-9ded-4fd9-94b5-30468145a1b8	7205cf80-5516-40c5-9c8a-b06506c44293	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:02.580475-03	manual	\N	Adicionado manualmente a outra vaga
4680902b-415e-4fcd-9943-226fa321a667	d95ab262-c912-437d-ab16-66a7e94c98c0	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	\N	entry	\N	2026-04-29 07:36:37.551235-03	auto_match	\N	\N
b6a24eba-4f2d-40bd-98ff-fce0f2596634	d95ab262-c912-437d-ab16-66a7e94c98c0	3eb69bdb-df4b-4294-9636-b584e2d36530	\N	entry	\N	2026-04-29 07:36:37.581675-03	auto_match	\N	\N
5ed2bc5d-2157-40fa-b157-359070869bba	d95ab262-c912-437d-ab16-66a7e94c98c0	ca24747c-4f2b-4f75-875b-e65abeb2cf26	\N	entry	\N	2026-04-29 07:36:37.624935-03	auto_match	\N	\N
e19d1942-08d6-4d21-8d9f-cfa60c53036c	d95ab262-c912-437d-ab16-66a7e94c98c0	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:36:41.125132-03	manual	\N	\N
c4678abc-1ab8-4398-9d7a-08c5540fe7bf	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	7f3458b8-40c5-4814-8a5c-ea26e22ff026	\N	entry	\N	2026-04-29 07:40:21.014827-03	auto_match	\N	\N
8a91b6f6-63a3-4fb5-bf4f-35514aad7408	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	de097a8b-1083-4ff9-9064-039da37ecc9c	\N	entry	\N	2026-04-29 07:40:21.114371-03	auto_match	\N	\N
5e526a25-21c7-479a-9dfb-0e737628fd11	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	\N	entry	\N	2026-04-29 07:40:21.124608-03	auto_match	\N	\N
05c98af3-a9ac-4299-8ab1-91e930d1fdee	e839ead1-5147-4899-aa45-17d54b911501	3020b91e-658d-4e0a-9edf-93cb692b95a2	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:41:51.329483-03	manual	\N	Adicionado manualmente a outra vaga
8356fef0-1238-41e8-8262-0c4dcb6a44be	e839ead1-5147-4899-aa45-17d54b911501	de097a8b-1083-4ff9-9064-039da37ecc9c	\N	entry	\N	2026-04-29 07:41:53.729608-03	auto_match	\N	\N
86750ca2-ec11-4e31-803f-5840cec3ac03	e839ead1-5147-4899-aa45-17d54b911501	e7dd7099-5202-42d2-b56d-d300aad38692	\N	entry	\N	2026-04-29 07:41:53.763736-03	auto_match	\N	\N
19843ec9-a44a-44e6-9c7c-43b69daed6f4	e839ead1-5147-4899-aa45-17d54b911501	3eb69bdb-df4b-4294-9636-b584e2d36530	\N	entry	\N	2026-04-29 07:41:53.783345-03	auto_match	\N	\N
7c47d418-2e48-4eed-bb9b-711ad5440666	6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:02:49.554929-03	auto_match	\N	\N
f3a87710-01f8-4dd7-92de-581dec70c59a	ab0b2d73-ab7d-44a5-94c3-bf1c21733063	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:17:02.754707-03	auto_match	\N	\N
3f59cc7d-1026-4890-ba5d-fd3cf23c1f82	ba22024f-23df-4ced-8bc0-dc1cda884acb	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	\N	2026-04-28 13:21:05.487109-03	auto_match	\N	\N
83e91534-2bc5-4e2a-b050-b133d315efef	0db26fb0-8008-43b1-bf50-55e9b9518143	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:22:11.567842-03	auto_match	\N	\N
b66f9d12-3869-4449-b35a-89ccc5b7eb71	0d53a1ff-fce7-4a49-b8c6-e83286bd7210	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:22:35.638068-03	auto_match	\N	\N
c9a76387-7efc-4187-adf1-ef9d92ef0479	ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:40:06.42339-03	auto_match	\N	\N
eff4397d-a8a7-4c29-bed8-3ef84da06639	fb8474ac-868f-4474-8c2e-2b9fc7bc2293	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 15:00:21.531673-03	auto_match	\N	\N
b20bd2a8-38fb-49fa-8c08-8eb2785fd664	41eb5f95-d632-4bc1-a591-d8b1d63e0de7	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 15:19:00.764803-03	auto_match	\N	\N
6f6ccc16-c1d7-4580-a0e3-ffbd3efdd5ef	088e9350-845f-4dfd-b103-2df352820914	d0518c91-1a7a-4426-b892-3429e1bcbad9	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:22.933214-03	manual	\N	Adicionado manualmente a outra vaga
e923311a-9b32-4878-837b-01ecd4c05d34	95f32d95-8fc0-4065-a176-7aef049400c3	7f8b09b7-ec98-425e-aef1-81fb5d02b5ea	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:01:03.340573-03	manual	\N	Adicionado manualmente a outra vaga
5a95543a-2666-4094-bd88-a34549f2b87a	971f1bd2-0c13-46f2-8cd2-08da87d14c33	22b4ab76-5e55-4308-90b3-3bb56fe7e7fe	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:05:53.546549-03	manual	\N	Adicionado manualmente a outra vaga
47e7fc70-6f4e-4be5-b60b-9c16cc613070	95f827b3-0934-4893-9194-09987b129b5f	21d1c5ad-1d0e-48ea-b63d-18505a92125f	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:10:36.334097-03	manual	\N	Adicionado manualmente a outra vaga
8c85b3ee-72da-4a08-90c2-726da27e5d8a	b5cb0a92-90d1-4346-8dc4-e474cd23f475	e7dd7099-5202-42d2-b56d-d300aad38692	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:23:45.79246-03	manual	\N	Adicionado manualmente a outra vaga
e1a338a9-12b9-4017-8b37-2b220dd43bfd	48a8e909-3a2b-413d-85b7-231e33ac9d44	fc5b7d69-4693-4440-9811-87c32d7694d2	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:18.246572-03	manual	\N	Adicionado manualmente a outra vaga
5db819d3-51fe-489c-b491-c85cb4f73766	788cdcec-ad09-4a9a-843b-c89622ca0285	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:05.542163-03	manual	\N	Adicionado manualmente a outra vaga
584480b1-8461-451f-9c85-c7d0be6b3632	d95ab262-c912-437d-ab16-66a7e94c98c0	0fbc2429-c5d4-4fb6-9af8-805306444952	\N	entry	\N	2026-04-29 07:36:37.551482-03	auto_match	\N	\N
955a3825-7b1a-480e-bad6-0c9f36ed2fc4	d95ab262-c912-437d-ab16-66a7e94c98c0	e75e06be-bf4b-4452-a47c-f2009f6b798a	\N	entry	\N	2026-04-29 07:36:37.582212-03	auto_match	\N	\N
6f7c47b5-82d6-4da0-a3c0-e99cae41c3c6	d95ab262-c912-437d-ab16-66a7e94c98c0	e7dd7099-5202-42d2-b56d-d300aad38692	\N	entry	\N	2026-04-29 07:36:37.626088-03	auto_match	\N	\N
420c6fb6-7f27-448d-81d5-396a0a9476bd	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	3791dfea-a98f-42da-b56c-4f59064d34a4	\N	entry	\N	2026-04-29 07:40:21.098111-03	auto_match	\N	\N
6ed6d797-87d3-4821-a54d-a713ee46a54e	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	e40a415a-723c-43d0-998e-ed81fe9f9c54	\N	entry	\N	2026-04-29 07:40:21.123498-03	auto_match	\N	\N
dfd6e458-15e0-4dd0-9dbc-09319d344d9c	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	30cbb747-a5ad-45fc-829c-33f5519e2870	\N	entry	\N	2026-04-29 07:40:21.141871-03	auto_match	\N	\N
1390683a-920a-4239-a481-5b1976211945	e839ead1-5147-4899-aa45-17d54b911501	7f3458b8-40c5-4814-8a5c-ea26e22ff026	\N	entry	\N	2026-04-29 07:41:53.647429-03	auto_match	\N	\N
5f1ff470-3363-459a-bb4c-bcbd528c19b6	e839ead1-5147-4899-aa45-17d54b911501	002c11b5-26b0-428b-8ae1-251211888bf6	\N	entry	\N	2026-04-29 07:41:53.746432-03	auto_match	\N	\N
d3d12d66-f69c-4e4a-ab66-5ffce99346e0	e839ead1-5147-4899-aa45-17d54b911501	ca24747c-4f2b-4f75-875b-e65abeb2cf26	\N	entry	\N	2026-04-29 07:41:53.766475-03	auto_match	\N	\N
a427668e-5205-44fc-8c2f-a8c32c9a1902	23806535-fd2c-480b-8651-79687104b3cf	053dd20d-1f46-452b-9b0d-64222546b0ba	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:43:23.727286-03	manual	\N	Adicionado manualmente a outra vaga
49ee1a3f-0b9e-4613-a339-8fafb26b2ca7	bb2632a2-c424-4ee9-9e36-7c6db2a35282	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:05:16.106545-03	manual	\N	Adicionado manualmente a outra vaga
12ec2e29-4462-4cde-9069-485a02ec66a9	bb2632a2-c424-4ee9-9e36-7c6db2a35282	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 13:05:22.335519-03	auto_match	\N	\N
1fe3412f-a050-483a-8c4b-96912a703365	ab0b2d73-ab7d-44a5-94c3-bf1c21733063	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:17:02.799833-03	auto_match	\N	\N
7189a524-a63f-4688-98ba-abe1ead365e0	0d53a1ff-fce7-4a49-b8c6-e83286bd7210	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 13:22:35.637739-03	auto_match	\N	\N
c92894de-7306-4071-8b0d-e0ed3b6175b6	41eb5f95-d632-4bc1-a591-d8b1d63e0de7	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	\N	2026-04-28 15:19:00.764312-03	auto_match	\N	\N
87585d00-72e8-4565-98ca-bb0cdedb4f3c	9c8edb04-85a3-4c7e-8b28-daf501e6036a	78c76aa7-7fcd-4020-a682-9f719fb23219	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:32.296686-03	manual	\N	Adicionado manualmente a outra vaga
69d16dd7-5116-4bd9-af2e-d79eccee4aa7	e4d46e65-9429-48d7-9ce6-e35351a8928f	7b144f65-41c4-449b-bd19-e2444eb53f89	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:01:03.356435-03	manual	\N	Adicionado manualmente a outra vaga
72f0c2b5-efc1-48a9-afca-67017f7e8a26	ae77bed0-c0f6-4062-8272-dc7cf8a7e1e4	ebf724a6-142a-46ae-8c62-617c3aec3e8a	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:05:53.556718-03	manual	\N	Adicionado manualmente a outra vaga
a07694eb-7666-4c7f-9c19-8a70d7af7b67	db670570-7271-4513-9286-be386c347fcb	12fe640a-40a4-4004-9c06-7c4eac7997a0	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:13:52.088381-03	manual	\N	Adicionado manualmente a outra vaga
10f54272-06d2-4b6e-a764-2cb9c7ca23fb	46333bfc-f564-45eb-a3bd-22117964fb2a	12fe640a-40a4-4004-9c06-7c4eac7997a0	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:41.611302-03	manual	\N	Adicionado manualmente a outra vaga
fd24c054-93a2-4028-93dc-3540a87fb9b6	5ae9b847-fdc3-44e8-8885-0b36dfce4453	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:09.932083-03	manual	\N	Adicionado manualmente a outra vaga
a5c788ee-8fce-46d7-a735-3180c1c2552d	adccb07f-ba13-4ef1-b321-a9c901e3e677	3eb69bdb-df4b-4294-9636-b584e2d36530	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:50.407216-03	manual	\N	Adicionado manualmente a outra vaga
f7945d6c-ed26-4670-9127-c532ec21c703	bb7e25da-71d7-4d24-8573-8972f241e5ba	de097a8b-1083-4ff9-9064-039da37ecc9c	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:30.635519-03	manual	\N	Adicionado manualmente a outra vaga
443d7fe1-6b82-4724-9df1-d578fac9899f	94336d21-3145-46bb-b6ed-4ae9458ebbc7	0fbc2429-c5d4-4fb6-9af8-805306444952	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:33.647475-03	manual	\N	Adicionado manualmente a outra vaga
1f5ea8bd-92da-4c96-9b59-dd191cf22efd	d95ab262-c912-437d-ab16-66a7e94c98c0	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	\N	entry	\N	2026-04-29 07:36:37.551978-03	auto_match	\N	\N
ebeb9d57-118b-4fca-86eb-c317609e99f2	d95ab262-c912-437d-ab16-66a7e94c98c0	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	\N	entry	\N	2026-04-29 07:36:37.586178-03	auto_match	\N	\N
c4b03c48-ba1f-4d47-bd1d-972146a023b9	d95ab262-c912-437d-ab16-66a7e94c98c0	30cbb747-a5ad-45fc-829c-33f5519e2870	\N	entry	\N	2026-04-29 07:36:37.625875-03	auto_match	\N	\N
0dd91726-52a6-4e12-a4ae-c22bd521f091	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	0b852ec2-7a54-4b0b-b826-c563806e0226	\N	entry	\N	2026-04-29 07:40:21.098315-03	auto_match	\N	\N
98995d89-f66e-45be-bc72-610228fbc66d	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	7205cf80-5516-40c5-9c8a-b06506c44293	\N	entry	\N	2026-04-29 07:40:21.123739-03	auto_match	\N	\N
4dfa3532-122d-4d9f-85c8-e9d703987024	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	e75e06be-bf4b-4452-a47c-f2009f6b798a	\N	entry	\N	2026-04-29 07:40:21.124936-03	auto_match	\N	\N
40114030-7eb7-4682-a11f-06f4784d283d	e839ead1-5147-4899-aa45-17d54b911501	0b852ec2-7a54-4b0b-b826-c563806e0226	\N	entry	\N	2026-04-29 07:41:53.703434-03	auto_match	\N	\N
3d4cabcb-e1c2-460c-a1f5-5bcf47aee059	e839ead1-5147-4899-aa45-17d54b911501	e75e06be-bf4b-4452-a47c-f2009f6b798a	\N	entry	\N	2026-04-29 07:41:53.737309-03	auto_match	\N	\N
5c4efb21-45ff-4da3-a9eb-31cc7b52319e	e839ead1-5147-4899-aa45-17d54b911501	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	\N	entry	\N	2026-04-29 07:41:53.766149-03	auto_match	\N	\N
33605625-0849-40d5-9b8e-025822fd3ccd	9be1616a-dc31-44bd-8d14-3ac94a02c5b9	952b2c30-9465-4c55-9a69-9c1f9e0f8fb2	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:43:26.688094-03	manual	\N	Adicionado manualmente a outra vaga
f1da55ad-8c40-41d4-9bca-c580de9002ca	63187b76-e83b-4545-bdfe-61664ee094c3	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 09:13:41.497863-03	manual	\N	Adicionado manualmente a outra vaga
787dc7f3-bf15-4283-8116-31142c17234c	63187b76-e83b-4545-bdfe-61664ee094c3	de2170f8-6183-4581-8048-21256db5cb53	\N	entry	\N	2026-04-28 09:14:03.733602-03	auto_match	\N	\N
5fb4e7eb-1cfb-439b-ab24-51268d968a1e	dbbfea9e-1207-4a42-9c58-31ce837773db	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:10:00.229587-03	manual	\N	Adicionado manualmente a outra vaga
ca21fb0d-ee8a-4ba9-b250-7a9b789ac33c	f709039e-b5ba-4339-8714-21bd010d7c56	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:11:51.058263-03	auto_match	\N	\N
a5d2cede-fb56-4d3f-a9f0-dc006c8b2afa	ab0b2d73-ab7d-44a5-94c3-bf1c21733063	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:17:02.79964-03	auto_match	\N	\N
6da45a02-695e-417c-bc94-96fbc4308882	ba22024f-23df-4ced-8bc0-dc1cda884acb	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:20:38.379664-03	manual	\N	Adicionado manualmente a outra vaga
e79a085c-0eec-4b63-9e06-063a5f516e02	ba22024f-23df-4ced-8bc0-dc1cda884acb	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:21:05.493027-03	auto_match	\N	\N
f88ebbaa-23f8-463e-abf7-d35949da749a	0db26fb0-8008-43b1-bf50-55e9b9518143	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:04.614456-03	manual	\N	Adicionado manualmente a outra vaga
be81fede-2bee-42a5-9277-ddd86fe6b9b2	0db26fb0-8008-43b1-bf50-55e9b9518143	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 13:22:11.567438-03	auto_match	\N	\N
ae56d499-29da-44f7-8878-8c423c667c2d	0d53a1ff-fce7-4a49-b8c6-e83286bd7210	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:29.604554-03	manual	\N	Adicionado manualmente a outra vaga
e9abc3ae-74c5-4680-bfd6-f5c424b7ac62	0d53a1ff-fce7-4a49-b8c6-e83286bd7210	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 13:22:35.63739-03	auto_match	\N	\N
a43128cf-f008-4465-9933-7a27256625eb	31de1cab-72f0-4936-8bc9-786ec606efe8	4b8fcc61-424c-4f6c-9228-2081bcfffa83	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 22:17:52.717836-03	manual	\N	Adicionado manualmente a outra vaga
07472ee5-d101-44cf-a24e-e93a900c9f90	e23ec830-0ead-4e0c-82ce-6601babf0cf0	a5c12ab0-b165-4953-9bae-0bec45974919	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 22:18:50.680824-03	manual	\N	Adicionado manualmente a outra vaga
1a7703ad-4fcf-47b5-b954-77d9f2267394	9ff5ad7e-c9aa-47e7-aa85-152bcae74799	8f6d2400-8c63-4d1b-82f3-926d488017d9	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:37.759025-03	manual	\N	Adicionado manualmente a outra vaga
dbf883d1-892b-41f8-8b22-8e9b56c0f91c	9f4406f9-6f09-4474-8691-9d25930aef43	e2a1a79f-1dde-410f-ac17-6f5a9217b32b	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:05:28.320635-03	manual	\N	Adicionado manualmente a outra vaga
356e7a76-eefc-436c-a119-023385ed1c93	46333bfc-f564-45eb-a3bd-22117964fb2a	12fe640a-40a4-4004-9c06-7c4eac7997a0	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:47.583391-03	manual	\N	\N
32b7a49e-349b-4586-9ffd-1af885dab0b4	5ae9b847-fdc3-44e8-8885-0b36dfce4453	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:16.360795-03	manual	\N	\N
a1e435f5-dc26-4716-82e7-380c71421a61	adccb07f-ba13-4ef1-b321-a9c901e3e677	3eb69bdb-df4b-4294-9636-b584e2d36530	entry	screening	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:56.383552-03	manual	\N	\N
cf9aa376-0a09-43d9-b4a7-3a904623533b	d3188aee-919d-4e0d-90c4-b31b38b47ce7	0fbc2429-c5d4-4fb6-9af8-805306444952	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:33.636366-03	manual	\N	Adicionado manualmente a outra vaga
a4e0fe3a-b75f-4be0-a70d-b2291df8a0e0	d95ab262-c912-437d-ab16-66a7e94c98c0	131f29d1-1893-444f-a235-c9320c4fd62f	\N	entry	\N	2026-04-29 07:36:37.56376-03	auto_match	\N	\N
6d3c25a7-551f-4400-822f-02c8d0b09c53	d95ab262-c912-437d-ab16-66a7e94c98c0	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	\N	entry	\N	2026-04-29 07:36:37.591115-03	auto_match	\N	\N
79972adc-b1d2-49ad-a886-13108c140035	d95ab262-c912-437d-ab16-66a7e94c98c0	4a8b0a32-338d-421d-b378-e8629a9975f8	\N	entry	\N	2026-04-29 07:36:37.62474-03	auto_match	\N	\N
a00d7a90-23db-4d3f-bfb6-7f9f034c01c2	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	\N	entry	\N	2026-04-29 07:40:21.099349-03	auto_match	\N	\N
3a80da79-3a99-45b9-808d-07cc65767f05	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	3eb69bdb-df4b-4294-9636-b584e2d36530	\N	entry	\N	2026-04-29 07:40:21.124187-03	auto_match	\N	\N
4338f831-d865-480f-b410-3a69754f4c82	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	ca24747c-4f2b-4f75-875b-e65abeb2cf26	\N	entry	\N	2026-04-29 07:40:21.145142-03	auto_match	\N	\N
f65d725c-6274-4e67-8ff2-7461118773a8	e839ead1-5147-4899-aa45-17d54b911501	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	\N	entry	\N	2026-04-29 07:41:53.709271-03	auto_match	\N	\N
93237303-886e-41bf-b095-f8c0475ec48c	e839ead1-5147-4899-aa45-17d54b911501	fc5b7d69-4693-4440-9811-87c32d7694d2	\N	entry	\N	2026-04-29 07:41:53.741809-03	auto_match	\N	\N
357dce2b-8ad6-41b7-b33c-321c425a5753	e839ead1-5147-4899-aa45-17d54b911501	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	\N	entry	\N	2026-04-29 07:41:53.768373-03	auto_match	\N	\N
6c983a69-b0e9-43d5-8ac7-6d03f786fa75	dbbfea9e-1207-4a42-9c58-31ce837773db	14d8391e-850f-4676-a7d4-96e05b05c633	\N	entry	\N	2026-04-28 13:10:10.872017-03	auto_match	\N	\N
5d9c10a7-544c-458f-9d1a-ac7164f770b5	f709039e-b5ba-4339-8714-21bd010d7c56	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:11:43.023605-03	manual	\N	Adicionado manualmente a outra vaga
c5a5145c-9e2c-4a4e-86a7-3a6ec76e9518	ab0b2d73-ab7d-44a5-94c3-bf1c21733063	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	\N	2026-04-28 13:17:02.799381-03	auto_match	\N	\N
efb10d23-7679-488a-a3f5-1fb9996e7565	ba22024f-23df-4ced-8bc0-dc1cda884acb	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 13:21:05.48846-03	auto_match	\N	\N
c285e481-ece3-4b86-a3ed-2387824935e3	0db26fb0-8008-43b1-bf50-55e9b9518143	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 13:22:11.569101-03	auto_match	\N	\N
3d8d777d-f381-45df-9947-b45936fb407a	39d2d533-f333-4780-b8f3-c74ea2fc1b3e	874af82e-8541-4708-a603-92581ef40fe4	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 22:22:27.796838-03	manual	\N	Adicionado manualmente a outra vaga
5f1fb5a4-c53d-4105-8770-0efff29cd5b4	bb9c2755-fef1-4767-ac3e-b1581992cefe	8f6d2400-8c63-4d1b-82f3-926d488017d9	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:20:59.427665-03	manual	\N	Adicionado manualmente a outra vaga
8e5fd18c-e41f-4651-bd13-a2dc6ddf6aa6	6e6b3a3a-9626-4100-b57f-0d61c4dfe7d0	091e315a-a2a2-407a-abbf-231e23c8d5dd	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:07:45.875475-03	manual	\N	Adicionado manualmente a outra vaga
542964b1-c661-4070-8f3e-77d700525af6	f43debc1-0952-4c3d-a081-94f642e4420c	b535e5f1-b4da-4c54-add5-67e658e8af17	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:08:10.505335-03	manual	\N	Adicionado manualmente a outra vaga
58be8ac6-ea28-4a0e-a170-e7f5f2e5ccff	181c9978-3d3b-4351-9615-45ddc092be5c	4a8b0a32-338d-421d-b378-e8629a9975f8	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:50.704452-03	manual	\N	Adicionado manualmente a outra vaga
22e51450-00fe-4aa4-8fb5-66e831c9f227	0f39a78f-71cd-4369-a46e-75ac2e410da6	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:19.404043-03	manual	\N	Adicionado manualmente a outra vaga
d60e5a25-adca-434e-b805-af5a5b072a60	533d093a-9ecb-4e3d-8e35-acd2146497d5	e75e06be-bf4b-4452-a47c-f2009f6b798a	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:59.120411-03	manual	\N	Adicionado manualmente a outra vaga
f1588d75-7837-40c4-8bd5-e49c7c0228c9	94336d21-3145-46bb-b6ed-4ae9458ebbc7	3791dfea-a98f-42da-b56c-4f59064d34a4	\N	entry	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:27:33.658268-03	manual	\N	Adicionado manualmente a outra vaga
4f8d3d90-1a98-43a6-93cf-d4a59b8ab45f	d95ab262-c912-437d-ab16-66a7e94c98c0	7205cf80-5516-40c5-9c8a-b06506c44293	\N	entry	\N	2026-04-29 07:36:37.564243-03	auto_match	\N	\N
41280ee9-03ab-407e-a498-88a25e5c607e	d95ab262-c912-437d-ab16-66a7e94c98c0	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	\N	entry	\N	2026-04-29 07:36:37.596993-03	auto_match	\N	\N
10429d67-8df9-48b9-a4f7-8b84e17209a5	d95ab262-c912-437d-ab16-66a7e94c98c0	36c21c41-5620-4c4d-a06e-ac7de5ff04c4	\N	entry	\N	2026-04-29 07:36:37.640818-03	auto_match	\N	\N
261ef03c-319c-4a89-95b5-230a85c923dc	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	0fbc2429-c5d4-4fb6-9af8-805306444952	\N	entry	\N	2026-04-29 07:40:21.102178-03	auto_match	\N	\N
3764d95c-b603-48a9-b5d4-c3f6eb454de9	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	002c11b5-26b0-428b-8ae1-251211888bf6	\N	entry	\N	2026-04-29 07:40:21.13016-03	auto_match	\N	\N
c7348f3a-7e75-4273-b4c9-67a2582c618e	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	\N	entry	\N	2026-04-29 07:40:21.127286-03	auto_match	\N	\N
8deb4fd7-c30a-423c-8580-d5a2a55501c9	e839ead1-5147-4899-aa45-17d54b911501	3791dfea-a98f-42da-b56c-4f59064d34a4	\N	entry	\N	2026-04-29 07:41:53.709457-03	auto_match	\N	\N
c7720f56-bf56-4470-8f9c-10c28dfa06da	e839ead1-5147-4899-aa45-17d54b911501	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	\N	entry	\N	2026-04-29 07:41:53.740808-03	auto_match	\N	\N
2d441a93-2bf2-43f4-bb2c-2bb800c540d5	e839ead1-5147-4899-aa45-17d54b911501	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	\N	entry	\N	2026-04-29 07:41:53.76599-03	auto_match	\N	\N
03d85961-c1fc-4dfe-a607-639815c03ddd	63187b76-e83b-4545-bdfe-61664ee094c3	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	\N	entry	\N	2026-04-28 09:14:03.781906-03	auto_match	\N	\N
170ff2eb-2b32-4a0d-80ec-cfaf8ff20e81	63187b76-e83b-4545-bdfe-61664ee094c3	3a7d2f21-0a5a-4667-8605-92151d5a331d	\N	entry	\N	2026-04-28 09:14:03.781598-03	auto_match	\N	\N
cfa28cbe-8600-42b4-b5de-804b2d952f6b	63187b76-e83b-4545-bdfe-61664ee094c3	d75da52e-60db-48bf-a2a0-adddaf952c87	\N	entry	\N	2026-04-28 09:14:03.782121-03	auto_match	\N	\N
\.


--
-- Data for Name: prompt_templates; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.prompt_templates (id, name, version, description, template_type, system_prompt, user_prompt_template, output_schema, max_tokens, temperature, is_active, activated_at, deactivated_at, created_by, created_at) FROM stdin;
a71a7afb-0805-4980-beaa-10ff97ee310b	full_analysis	1	Template padrao de analise para ambiente de desenvolvimento	full_analysis	Analise o curriculo e retorne um parecer objetivo.	Curriculo:\n{{resume_text}}	\N	2048	0.10	f	2026-04-22 18:38:05.347719-03	2026-04-28 16:16:26.28081-03	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-22 18:38:05.347719-03
5a90ade4-6817-4a0b-a9c8-aa86f0007115	full_analysis	2	Template padrao de analise de curriculos para ambiente de desenvolvimento	full_analysis	Você é um especialista sênior em recrutamento técnico e análise estruturada de currículos.\n\nSua função é extrair, normalizar e avaliar informações de currículos (PT/EN) com ALTA PRECISÃO, SEM inferência indevida.\n\n========================\nPRINCÍPIO FUNDAMENTAL\n========================\n\n- Não inventar informações.\n- Não inferir além do que está explicitamente escrito.\n- Não completar lacunas.\n- Em caso de ausência, ambiguidade ou conflito → usar null ou a classificação mais conservadora.\n\n========================\nREGRAS CRÍTICAS (ANTI-ERRO)\n========================\n\n1. Extraia somente conteúdo explícito no texto.\n2. Não deduza:\n   - tecnologias\n   - senioridade\n   - responsabilidades\n3. Não assuma progressão de carreira.\n4. Não use conhecimento externo sobre empresas/cargos.\n5. Em conflito de dados:\n   - priorizar informação mais recente OU mais detalhada\n   - se persistir ambiguidade → null\n\n========================\nNORMALIZAÇÃO\n========================\n\nDatas:\n- Formato: YYYY-MM\n- Apenas ano → YYYY-01\n- Sem data → null\n\nExperiência atual:\n- end_date = null\n- is_current = true\n\nDuração:\n- Calcular duration_months SOMENTE se start_date e end_date forem válidos\n- Caso contrário → null\n\n========================\nEXPERIÊNCIA PROFISSIONAL\n========================\n\nPara cada experiência:\n- company\n- role_title\n- start_date\n- end_date\n- is_current\n- duration_months\n- description (texto original resumido sem alterar sentido)\n\nProibições:\n- Não reescrever responsabilidades com interpretação\n- Não adicionar tecnologias não citadas\n\n========================\nGAPS DE EMPREGO\n========================\n\n- Detectar apenas com datas confiáveis\n- Gap = intervalo > 1 mês entre experiências\n- Datas incompletas → não gerar gap\n\n========================\nSKILLS (REGRA DE OURO)\n========================\n\n- Extrair apenas skills explicitamente mencionadas\n\nProibido:\n- Inferir por cargo\n- Inferir por empresa\n- Inferir por contexto implícito\n\nClassificação:\n\n- basic → apenas citado\n- intermediate → usado em contexto de trabalho/projeto\n- advanced → uso recorrente ou responsabilidade clara\n- expert → domínio explícito (arquitetura, liderança técnica, referência)\n\nRegra:\n- Sem evidência → basic\n\n========================\nLIDERANÇA\n========================\n\nMarcar TRUE apenas com evidência textual direta:\n\n- has_management → gestão de pessoas explícita\n- has_project_lead → liderança formal de projeto\n- has_mentoring → treinamento/mentoria explícita\n- has_cross_team → atuação entre múltiplos times/stakeholders\n\nSem evidência explícita → FALSE\n\n========================\nEDUCAÇÃO\n========================\n\n- degree\n- field\n- institution\n- start_date\n- end_date\n\nRelevância:\n\n- Sem contexto de vaga → "medium"\n- Não assumir relevância automaticamente\n\n========================\nIDIOMAS\n========================\n\nExtrair apenas se declarado:\n\n- language\n- level (conforme descrito ou null)\n\n========================\nQUALIDADE DO CURRÍCULO (0–100)\n========================\n\nCritérios objetivos:\n\n- structure (0–25)\n- clarity (0–25)\n- professionalism (0–25)\n- completeness (0–25)\n\nRegras:\n- Penalizar ausência de seções essenciais\n- Penalizar ambiguidade e falta de datas\n- Não usar julgamento subjetivo\n\n========================\nCONSISTÊNCIA INTERNA\n========================\n\nAntes de responder:\n\n- Verificar coerência de datas\n- Verificar sobreposição inválida\n- Garantir que nenhuma skill foi inferida\n- Garantir que nenhum campo contém suposição\n\nSe inconsistência não resolvida → manter dados e sinalizar com null onde necessário\n\n========================\nOUTPUT\n========================\n\n- Retornar APENAS JSON válido\n- Nenhum texto fora do JSON\n- Nenhuma explicação adicional	Analise o seguinte currículo e retorne um JSON estruturado.\n{job_context}\n\n## CURRÍCULO\n\n{resume_text}\n\n## FORMATO DE SAÍDA OBRIGATÓRIO\n\n```json\n{{\n  "personal_info": {{\n    "name": "string | null",\n    "email": "string | null",\n    "phone": "string | null",\n    "location": "string | null"\n  }},\n  "experience": [\n    {{\n      "company": "string | null",\n      "role_title": "string | null",\n      "start_date": "YYYY-MM | null",\n      "end_date": "YYYY-MM | null",\n      "is_current": "boolean",\n      "duration_months": "number | null",\n      "description": "string | null"\n    }}\n  ],\n  "skills": [\n    {{\n      "name": "string",\n      "proficiency": "basic | intermediate | advanced | expert"\n    }}\n  ],\n  "leadership": {{\n    "has_management": "boolean",\n    "has_project_lead": "boolean",\n    "has_mentoring": "boolean",\n    "has_cross_team": "boolean"\n  }},\n  "education": [\n    {{\n      "degree": "string | null",\n      "field": "string | null",\n      "institution": "string | null",\n      "start_date": "YYYY-MM | null",\n      "end_date": "YYYY-MM | null"\n    }}\n  ],\n  "languages": [\n    {{\n      "language": "string",\n      "level": "string | null"\n    }}\n  ],\n  "employment_gaps": [\n    {{\n      "start_date": "YYYY-MM",\n      "end_date": "YYYY-MM",\n      "duration_months": "number"\n    }}\n  ],\n  "cv_quality_score": {{\n    "structure": "number",\n    "clarity": "number",\n    "professionalism": "number",\n    "completeness": "number",\n    "total": "number"\n  }}\n}}\n```	\N	2048	0.10	t	2026-04-29 07:40:12.90104-03	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 16:16:26.28081-03
\.


--
-- Data for Name: resume_job_matches; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.resume_job_matches (id, analysis_id, job_id, match_score, skills_match_score, experience_match_score, seniority_match_score, matched_skills, missing_skills, bonus_skills, match_summary, recommendation, created_at, score_model_version_id, validation_status, missing_evidence, rejection_reasons, weights_source) FROM stdin;
944b027d-f054-4169-abe6-bf87ec7ca413	b2baa9cc-cf84-4533-bc63-bfd8b4e498a4	14d8391e-850f-4676-a7d4-96e05b05c633	74.50	0.00	69.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:02:49.507934-03	\N	pass	[]	[]	fallback_hardcoded
16afd7c1-f191-4dba-aa42-fe9bbfc3abbf	6812cba6-5487-451f-ad95-23f41635c607	14d8391e-850f-4676-a7d4-96e05b05c633	73.00	0.00	66.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:04:21.897549-03	\N	pass	[]	[]	fallback_hardcoded
7128a824-f995-4135-a8a8-741c1e46cf21	9209b9e6-f79e-473d-8791-d83bd67a91fd	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	53.00	0.00	56.00	45.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:05:22.322382-03	\N	pass	[]	[]	fallback_hardcoded
a02379bb-1df3-4cad-846f-03ed47b7b71a	d7c40b72-b74c-42ee-b73c-861284273a26	14d8391e-850f-4676-a7d4-96e05b05c633	63.25	0.00	81.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 15:00:21.461661-03	\N	pass	[]	[]	fallback_hardcoded
f811bcce-813b-4365-8a8c-b0f262630e91	c3d5a700-eb6f-4fd2-8c05-a519a114ea70	3a7d2f21-0a5a-4667-8605-92151d5a331d	83.50	0.00	87.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 15:19:00.755125-03	\N	pass	[]	[]	fallback_hardcoded
e8e4363a-6649-4175-868b-9a2c04b73ccc	f6b75baf-22f6-421f-a8c0-2f09b51b0908	3eb69bdb-df4b-4294-9636-b584e2d36530	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.809871-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
05ec4a08-0e89-4c4c-b98f-94058cc9d126	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.110299-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
8c4096a8-2453-4aed-89c1-f0a20c71fd20	53f5327d-ed02-4966-9ff6-e90290a81f65	e75e06be-bf4b-4452-a47c-f2009f6b798a	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.708844-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
d6c38113-4f7d-43b1-abf7-27489d47d872	b2baa9cc-cf84-4533-bc63-bfd8b4e498a4	de2170f8-6183-4581-8048-21256db5cb53	74.50	0.00	69.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:02:49.509241-03	\N	pass	[]	[]	fallback_hardcoded
6227fac4-d4d1-4014-ab7d-316bc39a0934	6812cba6-5487-451f-ad95-23f41635c607	d75da52e-60db-48bf-a2a0-adddaf952c87	29.20	0.00	66.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:04:21.899462-03	\N	pass	[]	[]	fallback_hardcoded
1106a2ee-993f-44a2-b410-0726b66abb18	9209b9e6-f79e-473d-8791-d83bd67a91fd	d75da52e-60db-48bf-a2a0-adddaf952c87	27.20	0.00	56.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:05:22.322745-03	\N	pass	[]	[]	fallback_hardcoded
9e9e321d-6b75-4813-87aa-dcb31b1d8f82	d7c40b72-b74c-42ee-b73c-861284273a26	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	80.50	0.00	81.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 15:00:21.519722-03	\N	pass	[]	[]	fallback_hardcoded
4d4f7e37-0247-49ac-bc3e-5d4dde85cb09	d7c40b72-b74c-42ee-b73c-861284273a26	3a7d2f21-0a5a-4667-8605-92151d5a331d	80.50	0.00	81.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 15:00:21.520261-03	\N	pass	[]	[]	fallback_hardcoded
20bd17e1-8ffb-4bcf-aa72-e52ee5deac74	c3d5a700-eb6f-4fd2-8c05-a519a114ea70	de2170f8-6183-4581-8048-21256db5cb53	66.25	0.00	87.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 15:19:00.752398-03	\N	pass	[]	[]	fallback_hardcoded
d8b4e589-836e-40e3-a481-874e850db40a	c3d5a700-eb6f-4fd2-8c05-a519a114ea70	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	83.50	0.00	87.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 15:19:00.754602-03	\N	pass	[]	[]	fallback_hardcoded
6ac442d1-d64d-4eb2-a2fd-cd68cc24aca5	f6b75baf-22f6-421f-a8c0-2f09b51b0908	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.809668-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
25914bc2-3e5f-4d34-8faf-d53a7beba849	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	fc5b7d69-4693-4440-9811-87c32d7694d2	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.112376-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
2c19c901-7818-40a3-b1aa-69d1f775a259	53f5327d-ed02-4966-9ff6-e90290a81f65	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.712501-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
4f08d425-32de-488a-ba62-8bebfd00cfc5	b2baa9cc-cf84-4533-bc63-bfd8b4e498a4	3a7d2f21-0a5a-4667-8605-92151d5a331d	87.00	0.00	69.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:02:49.509683-03	\N	pass	[]	[]	fallback_hardcoded
568c6e5a-23db-4168-86a0-1f4b9a0fe6f3	6812cba6-5487-451f-ad95-23f41635c607	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	58.00	0.00	66.00	45.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:04:21.899071-03	\N	pass	[]	[]	fallback_hardcoded
cfd2930a-acf1-4941-9418-69d85a074a48	d7c40b72-b74c-42ee-b73c-861284273a26	d75da52e-60db-48bf-a2a0-adddaf952c87	37.20	0.00	81.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 15:00:21.520699-03	\N	pass	[]	[]	fallback_hardcoded
3c1a2fac-0621-4d1d-ba4d-511da668c87c	c3d5a700-eb6f-4fd2-8c05-a519a114ea70	d75da52e-60db-48bf-a2a0-adddaf952c87	38.40	0.00	87.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 15:19:00.754053-03	\N	pass	[]	[]	fallback_hardcoded
392e64fc-18d0-42f4-a6c0-6506e62d2dc6	f6b75baf-22f6-421f-a8c0-2f09b51b0908	36c21c41-5620-4c4d-a06e-ac7de5ff04c4	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.812868-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
3bc742f9-6ea4-441f-a521-9ad7b0862d78	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	30cbb747-a5ad-45fc-829c-33f5519e2870	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.122665-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
9f7dfad2-cb2b-4aae-a81a-47a595352401	53f5327d-ed02-4966-9ff6-e90290a81f65	fc5b7d69-4693-4440-9811-87c32d7694d2	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.712233-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
92cfb197-be03-4221-9a08-6ad3daf1bc4b	b2baa9cc-cf84-4533-bc63-bfd8b4e498a4	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	59.50	0.00	69.00	45.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:02:49.541316-03	\N	pass	[]	[]	fallback_hardcoded
af55c85e-4b5b-4245-9077-1a774c7c37e5	6812cba6-5487-451f-ad95-23f41635c607	de2170f8-6183-4581-8048-21256db5cb53	73.00	0.00	66.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:04:21.898661-03	\N	pass	[]	[]	fallback_hardcoded
832293cd-7170-4ade-892d-60188f3ba229	9209b9e6-f79e-473d-8791-d83bd67a91fd	de2170f8-6183-4581-8048-21256db5cb53	68.00	0.00	56.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:05:22.321351-03	\N	pass	[]	[]	fallback_hardcoded
acd27f01-ae2f-4722-9dde-74218734a746	48293dc4-355c-41b2-bc94-329b91372949	3791dfea-a98f-42da-b56c-4f59064d34a4	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.453635-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
f5420d81-1d70-4e9f-b344-dc2fee9a4b6c	f6b75baf-22f6-421f-a8c0-2f09b51b0908	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.733478-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
520ea532-664c-44c3-a819-b5bfd4120387	f6b75baf-22f6-421f-a8c0-2f09b51b0908	002c11b5-26b0-428b-8ae1-251211888bf6	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.813385-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
d5d05207-c9e5-4952-8d5d-4786a47552a1	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	ca24747c-4f2b-4f75-875b-e65abeb2cf26	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.126878-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
aa4f94fd-75d2-4d38-b86b-452027495fcd	53f5327d-ed02-4966-9ff6-e90290a81f65	131f29d1-1893-444f-a235-c9320c4fd62f	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.718121-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
1a1de549-a4b2-4056-a70b-8ad323674b0e	b2baa9cc-cf84-4533-bc63-bfd8b4e498a4	d75da52e-60db-48bf-a2a0-adddaf952c87	29.80	0.00	69.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:02:49.544279-03	\N	pass	[]	[]	fallback_hardcoded
d6fa0110-5e9d-4ee5-882f-ea6db2101023	6812cba6-5487-451f-ad95-23f41635c607	3a7d2f21-0a5a-4667-8605-92151d5a331d	85.50	0.00	66.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:04:21.89817-03	\N	pass	[]	[]	fallback_hardcoded
a59ef096-3a4e-4cc4-b7d7-b7a83283f6d4	9209b9e6-f79e-473d-8791-d83bd67a91fd	3a7d2f21-0a5a-4667-8605-92151d5a331d	80.50	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:05:22.321938-03	\N	pass	[]	[]	fallback_hardcoded
66ead91d-24ac-49a9-aee3-ec565f5eec6d	48293dc4-355c-41b2-bc94-329b91372949	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.452262-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
2b1f1df6-138c-4baf-9e2d-666ec635b95e	f6b75baf-22f6-421f-a8c0-2f09b51b0908	e40a415a-723c-43d0-998e-ed81fe9f9c54	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.813874-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
1334f008-215f-46cf-be32-6b0b2b00179e	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	248c13ce-cbd5-4f6e-b87b-bfddedf52797	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.129015-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
4dd19bc7-a5db-4446-a562-bcd6702eb446	8bb6feb6-265d-4811-ab35-bff19882d5cd	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.210738-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
f6614981-ebc7-456f-acd2-98b1636fc6f0	53f5327d-ed02-4966-9ff6-e90290a81f65	002c11b5-26b0-428b-8ae1-251211888bf6	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.72262-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
5890186b-7772-4764-9557-c67c74e03b5a	ffb4d3fb-d00f-43b8-be18-407988f45130	bd726364-0421-4540-b1bb-ba549f2fd765	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.857291-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
d6f382a0-1849-45dd-bf7f-c01267e3bb79	9209b9e6-f79e-473d-8791-d83bd67a91fd	14d8391e-850f-4676-a7d4-96e05b05c633	68.00	0.00	56.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:05:22.327848-03	\N	pass	[]	[]	fallback_hardcoded
e841d342-814d-4962-bff1-71d1ef46372b	48293dc4-355c-41b2-bc94-329b91372949	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.526976-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
26eec201-df19-413c-8577-903052facf4e	f6b75baf-22f6-421f-a8c0-2f09b51b0908	bd726364-0421-4540-b1bb-ba549f2fd765	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.741077-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
cda4c480-9ca1-4875-9473-db6b37a5c4e1	f6b75baf-22f6-421f-a8c0-2f09b51b0908	e7dd7099-5202-42d2-b56d-d300aad38692	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.814324-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
27094043-80ba-4082-9c65-f9b58cc17805	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	e7dd7099-5202-42d2-b56d-d300aad38692	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.128249-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
7103a288-4163-46cb-a11f-40ab77b10983	53f5327d-ed02-4966-9ff6-e90290a81f65	ca24747c-4f2b-4f75-875b-e65abeb2cf26	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.732486-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
6f3fae4e-ab4c-4f8f-999b-2f45c59e35a3	ee000a38-39fb-4adc-88b8-abd4a4bbebbb	de2170f8-6183-4581-8048-21256db5cb53	73.50	0.00	67.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:08:37.608434-03	\N	pass	[]	[]	fallback_hardcoded
57620581-12e0-4c9a-b4a8-9112e30efd52	7997677e-8572-42bb-8f24-bf4432705c9f	3a7d2f21-0a5a-4667-8605-92151d5a331d	83.50	0.00	62.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:10:10.862267-03	\N	pass	[]	[]	fallback_hardcoded
17ceb019-05a1-4cad-b8ab-b01eead54f3b	22223887-f489-439f-9530-35dbe99505d4	d75da52e-60db-48bf-a2a0-adddaf952c87	37.80	0.00	84.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:11:51.050402-03	\N	pass	[]	[]	fallback_hardcoded
fc225c49-e991-4ba4-94a2-ca381ca08649	80e8153c-bb38-4e65-ade3-ced14c2835e0	de2170f8-6183-4581-8048-21256db5cb53	63.25	0.00	81.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:12:33.881546-03	\N	pass	[]	[]	fallback_hardcoded
160d6a88-4c82-4d0f-be2b-78428c013744	48293dc4-355c-41b2-bc94-329b91372949	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.528061-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
917f180c-2081-47ec-9c76-fca1d805f736	f6b75baf-22f6-421f-a8c0-2f09b51b0908	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.732319-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
c0625c0a-bea0-4825-a638-0a0707e72d50	f6b75baf-22f6-421f-a8c0-2f09b51b0908	fc5b7d69-4693-4440-9811-87c32d7694d2	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.81451-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
c5df84b1-0042-4e0b-afff-ae41242fb728	8bb6feb6-265d-4811-ab35-bff19882d5cd	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.268671-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
f1c823f0-630b-444f-9acb-2812e80e8194	53f5327d-ed02-4966-9ff6-e90290a81f65	e40a415a-723c-43d0-998e-ed81fe9f9c54	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.732206-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
338378e1-8466-40a4-b030-9b2b8fcc2c17	ee000a38-39fb-4adc-88b8-abd4a4bbebbb	3a7d2f21-0a5a-4667-8605-92151d5a331d	86.00	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:08:37.610057-03	\N	pass	[]	[]	fallback_hardcoded
c53df938-e549-4369-a7bc-a882deb5f726	7997677e-8572-42bb-8f24-bf4432705c9f	14d8391e-850f-4676-a7d4-96e05b05c633	71.00	0.00	62.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:10:10.86106-03	\N	pass	[]	[]	fallback_hardcoded
cd8b707a-07bd-4566-a91a-5e50b47a5550	22223887-f489-439f-9530-35dbe99505d4	3a7d2f21-0a5a-4667-8605-92151d5a331d	82.00	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:11:51.047903-03	\N	pass	[]	[]	fallback_hardcoded
6c2e21d8-97df-440f-836d-2fc924435795	80e8153c-bb38-4e65-ade3-ced14c2835e0	3a7d2f21-0a5a-4667-8605-92151d5a331d	80.50	0.00	81.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:12:33.881974-03	\N	pass	[]	[]	fallback_hardcoded
1cc8f8bd-5e06-49ac-a706-9cb855440b14	48293dc4-355c-41b2-bc94-329b91372949	de097a8b-1083-4ff9-9064-039da37ecc9c	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.528731-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
c154c4e1-54d0-4bad-ad32-b979d8965d43	f6b75baf-22f6-421f-a8c0-2f09b51b0908	131f29d1-1893-444f-a235-c9320c4fd62f	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.728162-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
b184e667-35f6-4bb9-b6ef-68abb733774d	f6b75baf-22f6-421f-a8c0-2f09b51b0908	248c13ce-cbd5-4f6e-b87b-bfddedf52797	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.81515-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
660606f6-8487-49da-b601-f25582647555	8bb6feb6-265d-4811-ab35-bff19882d5cd	fc5b7d69-4693-4440-9811-87c32d7694d2	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.270433-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
cfa1f83f-d942-4e20-b7ef-be33f9eec1d6	53f5327d-ed02-4966-9ff6-e90290a81f65	e7dd7099-5202-42d2-b56d-d300aad38692	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.73558-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
2711fbb7-5d30-4e50-870d-6439ab8b723b	ee000a38-39fb-4adc-88b8-abd4a4bbebbb	14d8391e-850f-4676-a7d4-96e05b05c633	73.50	0.00	67.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:08:37.612454-03	\N	pass	[]	[]	fallback_hardcoded
ac798311-0b40-4abf-8ea8-b7c3e3ba1e38	7997677e-8572-42bb-8f24-bf4432705c9f	de2170f8-6183-4581-8048-21256db5cb53	71.00	0.00	62.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:10:10.863599-03	\N	pass	[]	[]	fallback_hardcoded
fcfebb0f-670d-4505-ae73-f0c08b9192ed	22223887-f489-439f-9530-35dbe99505d4	14d8391e-850f-4676-a7d4-96e05b05c633	64.75	0.00	84.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:11:51.049222-03	\N	pass	[]	[]	fallback_hardcoded
29b471d7-3887-4089-a0e2-083f1315e839	80e8153c-bb38-4e65-ade3-ced14c2835e0	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	80.50	0.00	81.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:12:33.882351-03	\N	pass	[]	[]	fallback_hardcoded
d4b726b5-3a84-4bd3-9467-b4b8fcd57ac9	48293dc4-355c-41b2-bc94-329b91372949	0fbc2429-c5d4-4fb6-9af8-805306444952	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.529229-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
71ad7743-d665-44cd-bf21-ff30d9e5934f	f6b75baf-22f6-421f-a8c0-2f09b51b0908	de097a8b-1083-4ff9-9064-039da37ecc9c	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.739193-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
20ae0b0e-b10a-4ed3-b736-e403394b2f43	f6b75baf-22f6-421f-a8c0-2f09b51b0908	12fe640a-40a4-4004-9c06-7c4eac7997a0	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.818827-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
09004314-e175-4ec5-8d80-48de6b7decae	8bb6feb6-265d-4811-ab35-bff19882d5cd	131f29d1-1893-444f-a235-c9320c4fd62f	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.269412-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
3d0675e7-da4c-4b1c-a55a-357d01fd841e	53f5327d-ed02-4966-9ff6-e90290a81f65	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.737933-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
dc75d150-107b-4867-80e4-c7c98298ba5d	ee000a38-39fb-4adc-88b8-abd4a4bbebbb	d75da52e-60db-48bf-a2a0-adddaf952c87	29.40	0.00	67.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:08:37.658326-03	\N	pass	[]	[]	fallback_hardcoded
258e98c9-72cc-4353-b3f6-90ebd186d4de	7997677e-8572-42bb-8f24-bf4432705c9f	d75da52e-60db-48bf-a2a0-adddaf952c87	28.40	0.00	62.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:10:10.863227-03	\N	pass	[]	[]	fallback_hardcoded
1a56ea95-09ab-40ae-a147-3ba4ff654cc6	22223887-f489-439f-9530-35dbe99505d4	de2170f8-6183-4581-8048-21256db5cb53	64.75	0.00	84.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:11:51.048596-03	\N	pass	[]	[]	fallback_hardcoded
f9b45871-6cba-4197-9726-916319752551	80e8153c-bb38-4e65-ade3-ced14c2835e0	d75da52e-60db-48bf-a2a0-adddaf952c87	37.20	0.00	81.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:12:33.880872-03	\N	pass	[]	[]	fallback_hardcoded
03457887-a150-432d-941d-953434ffd803	48293dc4-355c-41b2-bc94-329b91372949	7205cf80-5516-40c5-9c8a-b06506c44293	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.534241-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
591f625d-0682-4374-b15e-0d8acb8d3fc4	f6b75baf-22f6-421f-a8c0-2f09b51b0908	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.740195-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
a6d2f778-1872-41e6-b01f-0a9b3454b153	f6b75baf-22f6-421f-a8c0-2f09b51b0908	4a8b0a32-338d-421d-b378-e8629a9975f8	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.819094-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
1b37ec28-74e8-4407-bf40-74eadf27ab05	8bb6feb6-265d-4811-ab35-bff19882d5cd	3eb69bdb-df4b-4294-9636-b584e2d36530	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.270749-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
7c454b37-2d3b-4cc5-ad9c-ad7713a185b8	53f5327d-ed02-4966-9ff6-e90290a81f65	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.738385-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
6a2c24c2-0b4f-41c3-8c28-ca64a452d9eb	ee000a38-39fb-4adc-88b8-abd4a4bbebbb	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	58.50	0.00	67.00	45.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:08:37.657707-03	\N	pass	[]	[]	fallback_hardcoded
239088c0-9bcb-4852-9908-17ce8dc62f48	7997677e-8572-42bb-8f24-bf4432705c9f	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	56.00	0.00	62.00	45.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:10:10.862825-03	\N	pass	[]	[]	fallback_hardcoded
27bb2bcf-5ccd-4f6b-8395-520dcbd2283b	22223887-f489-439f-9530-35dbe99505d4	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	82.00	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:11:51.049867-03	\N	pass	[]	[]	fallback_hardcoded
eaf88bc7-d381-4711-af91-13ffa905f497	80e8153c-bb38-4e65-ade3-ced14c2835e0	14d8391e-850f-4676-a7d4-96e05b05c633	63.25	0.00	81.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:12:33.88271-03	\N	pass	[]	[]	fallback_hardcoded
c9b268a6-40f9-4990-9f3e-7496b687ce41	48293dc4-355c-41b2-bc94-329b91372949	bd726364-0421-4540-b1bb-ba549f2fd765	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.535998-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
ebd4cdc2-e563-4d1c-b3f2-a261347a66eb	f6b75baf-22f6-421f-a8c0-2f09b51b0908	3791dfea-a98f-42da-b56c-4f59064d34a4	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.74088-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
8011b087-7535-46a1-b572-7e039054fe0c	f6b75baf-22f6-421f-a8c0-2f09b51b0908	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.820797-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
3191dacd-42b5-4389-8eaf-16424ab03656	8bb6feb6-265d-4811-ab35-bff19882d5cd	e40a415a-723c-43d0-998e-ed81fe9f9c54	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.270956-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
8a287e9b-dc76-48fe-8140-bfa898c0d7d0	53f5327d-ed02-4966-9ff6-e90290a81f65	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.740538-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
c70f9743-54b8-4e14-8b9f-b0c879e94bbd	69d38797-2753-4d7f-8522-c0e772beb2dd	14d8391e-850f-4676-a7d4-96e05b05c633	65.75	0.00	86.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:17:02.741745-03	\N	pass	[]	[]	fallback_hardcoded
ba5cff23-6907-439a-b61d-fbccab2a9cfe	d8196a04-fe64-4293-8483-847b582130a4	de2170f8-6183-4581-8048-21256db5cb53	72.00	0.00	64.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:21:05.480055-03	\N	pass	[]	[]	fallback_hardcoded
02942f6c-4ad0-427b-83bd-64025d28e1f1	3daa4489-d2be-4204-98cc-45c183ec4a2a	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	53.50	0.00	57.00	45.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:22:35.625594-03	\N	pass	[]	[]	fallback_hardcoded
1d02b780-fe9d-4fbf-bc94-c734923fdf7c	48293dc4-355c-41b2-bc94-329b91372949	131f29d1-1893-444f-a235-c9320c4fd62f	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.536853-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
f53a52d2-8a93-4053-ad38-6f8bf94234df	f6b75baf-22f6-421f-a8c0-2f09b51b0908	0fbc2429-c5d4-4fb6-9af8-805306444952	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.730669-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
a075123a-9dd1-4f0f-8a1a-1bde2dab6e53	f6b75baf-22f6-421f-a8c0-2f09b51b0908	30cbb747-a5ad-45fc-829c-33f5519e2870	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.820576-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
c4e66465-bac5-4599-bc26-8b366cb45bdb	8bb6feb6-265d-4811-ab35-bff19882d5cd	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.271183-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
5b98ce89-1f74-48fe-918e-524321e952f9	53f5327d-ed02-4966-9ff6-e90290a81f65	30cbb747-a5ad-45fc-829c-33f5519e2870	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.743082-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
29f1e171-61e1-4e5b-aa2a-9964f29391a1	69d38797-2753-4d7f-8522-c0e772beb2dd	de2170f8-6183-4581-8048-21256db5cb53	65.75	0.00	86.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:17:02.743034-03	\N	pass	[]	[]	fallback_hardcoded
d5e29477-61e4-4a59-8afe-19abfb6a0c81	d8196a04-fe64-4293-8483-847b582130a4	3a7d2f21-0a5a-4667-8605-92151d5a331d	84.50	0.00	64.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:21:05.479371-03	\N	pass	[]	[]	fallback_hardcoded
5ed17df6-0fc4-4f77-8b06-5a7d519f9138	ad47f48b-c490-4b1a-b519-1da6707e668c	d75da52e-60db-48bf-a2a0-adddaf952c87	37.80	0.00	84.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:22:11.55639-03	\N	pass	[]	[]	fallback_hardcoded
2969d516-8681-41eb-ad43-5fcc52eaec2b	3daa4489-d2be-4204-98cc-45c183ec4a2a	d75da52e-60db-48bf-a2a0-adddaf952c87	27.40	0.00	57.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:22:35.626881-03	\N	pass	[]	[]	fallback_hardcoded
41c664af-70f8-48ca-afff-cb1b61e267b5	48293dc4-355c-41b2-bc94-329b91372949	e40a415a-723c-43d0-998e-ed81fe9f9c54	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.537568-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
0930dc83-5781-4e4e-9d67-222b9b8347db	f6b75baf-22f6-421f-a8c0-2f09b51b0908	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.738001-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
1d22cf33-c6a8-42b1-9066-a6e97afa3a97	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	3020b91e-658d-4e0a-9edf-93cb692b95a2	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:20.990147-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
e9f062b3-5009-4cbf-b669-937a4a067a84	8bb6feb6-265d-4811-ab35-bff19882d5cd	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.209514-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
83a56079-a229-4293-ba11-d3667911b9ff	8bb6feb6-265d-4811-ab35-bff19882d5cd	002c11b5-26b0-428b-8ae1-251211888bf6	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.272278-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
bb915ef3-2550-471b-b992-36ddf269dde1	53f5327d-ed02-4966-9ff6-e90290a81f65	248c13ce-cbd5-4f6e-b87b-bfddedf52797	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.742387-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
95531a6c-43db-4e57-a123-2770ef9762ef	69d38797-2753-4d7f-8522-c0e772beb2dd	d75da52e-60db-48bf-a2a0-adddaf952c87	38.20	0.00	86.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:17:02.792441-03	\N	pass	[]	[]	fallback_hardcoded
b803c300-5f9a-4869-bc0e-98a25e4eb4bd	d8196a04-fe64-4293-8483-847b582130a4	14d8391e-850f-4676-a7d4-96e05b05c633	72.00	0.00	64.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:21:05.48128-03	\N	pass	[]	[]	fallback_hardcoded
464c6422-4737-46fa-a306-b17d313a3c52	ad47f48b-c490-4b1a-b519-1da6707e668c	3a7d2f21-0a5a-4667-8605-92151d5a331d	82.00	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:22:11.56405-03	\N	pass	[]	[]	fallback_hardcoded
9db9d87d-bb10-4c8f-94d9-47f2cf3c754c	3daa4489-d2be-4204-98cc-45c183ec4a2a	de2170f8-6183-4581-8048-21256db5cb53	68.50	0.00	57.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:22:35.627376-03	\N	pass	[]	[]	fallback_hardcoded
0f0e6823-c5a9-4d90-b7d9-60415748a9f9	48293dc4-355c-41b2-bc94-329b91372949	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.540513-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
265dec93-693a-4452-a47f-cfce94ccd28d	f6b75baf-22f6-421f-a8c0-2f09b51b0908	7205cf80-5516-40c5-9c8a-b06506c44293	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.740666-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
123d507f-e2c1-42a0-9295-b05eb4ef9b11	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	7f3458b8-40c5-4814-8a5c-ea26e22ff026	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:20.992976-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
6e2861ad-02ae-41f2-a902-62e8ca1f0d4b	8bb6feb6-265d-4811-ab35-bff19882d5cd	e75e06be-bf4b-4452-a47c-f2009f6b798a	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.27333-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
08ea6ad8-4a44-40fc-9b3d-e76c61373de3	53f5327d-ed02-4966-9ff6-e90290a81f65	3eb69bdb-df4b-4294-9636-b584e2d36530	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.742852-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
36f59182-3f2a-4e60-bd08-8978080a3a7f	69d38797-2753-4d7f-8522-c0e772beb2dd	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	83.00	0.00	86.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:17:02.79281-03	\N	pass	[]	[]	fallback_hardcoded
b36d5f77-f049-4405-b962-ac4532905359	d8196a04-fe64-4293-8483-847b582130a4	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	57.00	0.00	64.00	45.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:21:05.480823-03	\N	pass	[]	[]	fallback_hardcoded
aa930d09-1e99-4582-ac1d-d8ae11fa0302	ad47f48b-c490-4b1a-b519-1da6707e668c	14d8391e-850f-4676-a7d4-96e05b05c633	64.75	0.00	84.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:22:11.555456-03	\N	pass	[]	[]	fallback_hardcoded
08c3ba0a-de25-4bfb-b72a-18d77f3d916c	3daa4489-d2be-4204-98cc-45c183ec4a2a	14d8391e-850f-4676-a7d4-96e05b05c633	68.50	0.00	57.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:22:35.62782-03	\N	pass	[]	[]	fallback_hardcoded
a3b696b4-8079-40a4-813a-4d1603e79008	48293dc4-355c-41b2-bc94-329b91372949	e75e06be-bf4b-4452-a47c-f2009f6b798a	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.547805-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
0fa293e8-7882-40d7-8079-e456b9cd0d76	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	3791dfea-a98f-42da-b56c-4f59064d34a4	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.071658-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
dd61b7e9-72f0-4dea-97b4-54fbd3f85027	8bb6feb6-265d-4811-ab35-bff19882d5cd	7f3458b8-40c5-4814-8a5c-ea26e22ff026	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.214108-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
73f54d82-6bdf-4b75-8714-72fb62487013	8bb6feb6-265d-4811-ab35-bff19882d5cd	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.274516-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
9ee1df54-2521-4dab-bcb4-ae5000f9c09d	ffb4d3fb-d00f-43b8-be18-407988f45130	7205cf80-5516-40c5-9c8a-b06506c44293	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.918356-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
12d1c608-5976-4426-9522-2c7334c63333	69d38797-2753-4d7f-8522-c0e772beb2dd	3a7d2f21-0a5a-4667-8605-92151d5a331d	83.00	0.00	86.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:17:02.793052-03	\N	pass	[]	[]	fallback_hardcoded
07f725c2-6693-48ca-bb51-ebede7ca16ea	d8196a04-fe64-4293-8483-847b582130a4	d75da52e-60db-48bf-a2a0-adddaf952c87	28.80	0.00	64.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:21:05.480451-03	\N	pass	[]	[]	fallback_hardcoded
12dcdc8a-79ec-4308-b72f-02c10bac004a	ad47f48b-c490-4b1a-b519-1da6707e668c	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	82.00	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	strong_match	2026-04-28 13:22:11.558786-03	\N	pass	[]	[]	fallback_hardcoded
9d73c706-0676-42ba-b4f1-7bb5a21f54b4	48293dc4-355c-41b2-bc94-329b91372949	3eb69bdb-df4b-4294-9636-b584e2d36530	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.549115-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
ef5fc187-842f-4246-8a21-9cecc48db5ca	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	0b852ec2-7a54-4b0b-b826-c563806e0226	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.074905-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
259dd8a7-109f-46eb-96c6-7f1dd742c9ca	8bb6feb6-265d-4811-ab35-bff19882d5cd	3020b91e-658d-4e0a-9edf-93cb692b95a2	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.211812-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
0c3962de-c766-434a-a8cc-fc45584da6cb	8bb6feb6-265d-4811-ab35-bff19882d5cd	30cbb747-a5ad-45fc-829c-33f5519e2870	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.275539-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
900f6978-5e66-4519-a0ae-94d3209a4697	ffb4d3fb-d00f-43b8-be18-407988f45130	131f29d1-1893-444f-a235-c9320c4fd62f	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.919682-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
491cf9f8-cf9e-4a10-90b0-dbbafdc422f5	ad47f48b-c490-4b1a-b519-1da6707e668c	de2170f8-6183-4581-8048-21256db5cb53	64.75	0.00	84.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:22:11.568671-03	\N	pass	[]	[]	fallback_hardcoded
92e12534-c280-46a4-a3e7-4b0d9e087df4	3daa4489-d2be-4204-98cc-45c183ec4a2a	3a7d2f21-0a5a-4667-8605-92151d5a331d	81.00	0.00	57.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:22:35.62632-03	\N	pass	[]	[]	fallback_hardcoded
701fb197-fc21-448a-96a5-264e258437a8	48293dc4-355c-41b2-bc94-329b91372949	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.550946-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
54e40275-6994-47c9-a145-ec36ee616c48	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.076296-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
f8fdc142-82f1-4eb7-9952-b3d71759faba	8bb6feb6-265d-4811-ab35-bff19882d5cd	0b852ec2-7a54-4b0b-b826-c563806e0226	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.214492-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
839b69a2-9acb-4f36-af8d-d76334c0fe5d	8bb6feb6-265d-4811-ab35-bff19882d5cd	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.275837-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
6e2829d6-8ab4-4957-9bd2-111170e5fee2	ffb4d3fb-d00f-43b8-be18-407988f45130	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.920246-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
0ee21479-d91d-4a60-a3dd-7715d605957b	5d6b937f-0c71-490d-903f-cb092d15063e	de2170f8-6183-4581-8048-21256db5cb53	61.75	0.00	78.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:40:06.370682-03	\N	pass	[]	[]	fallback_hardcoded
4cfb491a-380e-4e1b-a727-44809cfae2d3	48293dc4-355c-41b2-bc94-329b91372949	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.557295-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
2085271d-99f7-4342-abbb-90e2c31d6749	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	0fbc2429-c5d4-4fb6-9af8-805306444952	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.079303-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
01e94df9-cfb0-45cd-9a31-744885ab5013	8bb6feb6-265d-4811-ab35-bff19882d5cd	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.213263-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
dca087ec-9edf-412e-bf0f-ee3f1b05476d	8bb6feb6-265d-4811-ab35-bff19882d5cd	7205cf80-5516-40c5-9c8a-b06506c44293	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.276404-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
d6f8ae72-6b69-4c62-b9a9-ab54b8fcef9a	ffb4d3fb-d00f-43b8-be18-407988f45130	fc5b7d69-4693-4440-9811-87c32d7694d2	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.922492-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
3200aab8-3fce-4305-b2d8-cd1dc37d3662	5d6b937f-0c71-490d-903f-cb092d15063e	14d8391e-850f-4676-a7d4-96e05b05c633	61.75	0.00	78.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 13:40:06.372513-03	\N	pass	[]	[]	fallback_hardcoded
404fcd5f-bf19-4def-9170-e6c550f520d8	48293dc4-355c-41b2-bc94-329b91372949	002c11b5-26b0-428b-8ae1-251211888bf6	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.559482-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
0bd8da13-0349-4efa-89bc-9e8925dbd4e4	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	bd726364-0421-4540-b1bb-ba549f2fd765	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.082363-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
0d5e2921-eeba-4360-924b-cf701e864550	8bb6feb6-265d-4811-ab35-bff19882d5cd	3791dfea-a98f-42da-b56c-4f59064d34a4	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.211422-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
c0c9df76-b73c-4ac7-a9ef-d3a0eb096dad	8bb6feb6-265d-4811-ab35-bff19882d5cd	e7dd7099-5202-42d2-b56d-d300aad38692	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.274804-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
84d555f6-54c1-400b-8869-7161ae4de153	ffb4d3fb-d00f-43b8-be18-407988f45130	e75e06be-bf4b-4452-a47c-f2009f6b798a	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.923144-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
120586e4-bbe8-4ed1-879f-406a20f4a8d3	5d6b937f-0c71-490d-903f-cb092d15063e	d75da52e-60db-48bf-a2a0-adddaf952c87	36.60	0.00	78.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 13:40:06.413468-03	\N	pass	[]	[]	fallback_hardcoded
773ef712-169a-4214-a121-14b02bdffb60	48293dc4-355c-41b2-bc94-329b91372949	fc5b7d69-4693-4440-9811-87c32d7694d2	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.561136-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
99e2b1d9-68c1-4885-a867-31dae0a94a1d	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.085528-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
5d013592-a760-4d38-8651-af30d90bf426	8bb6feb6-265d-4811-ab35-bff19882d5cd	0fbc2429-c5d4-4fb6-9af8-805306444952	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.21359-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
e25ad49f-b127-431b-afb5-be726d67fc62	8bb6feb6-265d-4811-ab35-bff19882d5cd	ca24747c-4f2b-4f75-875b-e65abeb2cf26	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.278782-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
4c4dcc6c-4f54-4a4e-9ead-2cca30cbd9cc	ffb4d3fb-d00f-43b8-be18-407988f45130	30cbb747-a5ad-45fc-829c-33f5519e2870	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.924513-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
bc43a2e3-09a5-46b7-854d-d87af44ed642	5d6b937f-0c71-490d-903f-cb092d15063e	3a7d2f21-0a5a-4667-8605-92151d5a331d	79.00	0.00	78.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:40:06.413007-03	\N	pass	[]	[]	fallback_hardcoded
4a0eaf31-2348-4b6a-bcc9-3a59abeda888	48293dc4-355c-41b2-bc94-329b91372949	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.564407-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
0275e169-fa53-4820-8014-7fde3e957ad5	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	de097a8b-1083-4ff9-9064-039da37ecc9c	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.089813-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
46f365b7-30ed-4db4-8d48-1484e69a536e	8bb6feb6-265d-4811-ab35-bff19882d5cd	bd726364-0421-4540-b1bb-ba549f2fd765	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.210203-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
749895e4-7104-44a9-8498-9cce5681db5c	8bb6feb6-265d-4811-ab35-bff19882d5cd	248c13ce-cbd5-4f6e-b87b-bfddedf52797	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.279556-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
2fe14275-0f97-48b2-ab26-39bb241a2ded	ffb4d3fb-d00f-43b8-be18-407988f45130	ca24747c-4f2b-4f75-875b-e65abeb2cf26	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.924281-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
7b72b7b9-043c-4d46-839a-9759b1348722	5d6b937f-0c71-490d-903f-cb092d15063e	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	79.00	0.00	78.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 13:40:06.416763-03	\N	pass	[]	[]	fallback_hardcoded
a4415045-7e1a-43c1-8dc5-37e04c462e4d	48293dc4-355c-41b2-bc94-329b91372949	e7dd7099-5202-42d2-b56d-d300aad38692	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.562222-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
520a3cca-2537-46d7-88de-426acda85b6f	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	131f29d1-1893-444f-a235-c9320c4fd62f	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.090132-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
8a4f8ea6-3d31-4bf7-8994-a222546d63c1	8bb6feb6-265d-4811-ab35-bff19882d5cd	de097a8b-1083-4ff9-9064-039da37ecc9c	80.65	0.00	73.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.212033-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
2e928b5b-6a07-46fe-851b-de786a2c73ad	53f5327d-ed02-4966-9ff6-e90290a81f65	7f3458b8-40c5-4814-8a5c-ea26e22ff026	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.623541-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
93b09e15-6d38-48a0-ac39-991b62d8578a	53f5327d-ed02-4966-9ff6-e90290a81f65	3020b91e-658d-4e0a-9edf-93cb692b95a2	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.6207-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
abbfeb5a-e196-4512-8c15-54f745609159	ffb4d3fb-d00f-43b8-be18-407988f45130	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.853533-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
888ae225-6599-46fe-9648-b781553a3612	ffb4d3fb-d00f-43b8-be18-407988f45130	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.855717-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
9ae0b39f-87fa-4778-9af1-d2917d68fe69	ffb4d3fb-d00f-43b8-be18-407988f45130	a8f4df1e-2a65-4e8b-89a5-48f8f163629a	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.9247-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
0f9ea0e9-7c1b-4bf6-89a1-90a2e96b1437	48293dc4-355c-41b2-bc94-329b91372949	30cbb747-a5ad-45fc-829c-33f5519e2870	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.567461-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
b21776c1-9032-4cd3-b69c-5378206c83be	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	7205cf80-5516-40c5-9c8a-b06506c44293	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.091352-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
92bca500-2ed0-4c79-a659-3e685f1e8ee2	53f5327d-ed02-4966-9ff6-e90290a81f65	0b852ec2-7a54-4b0b-b826-c563806e0226	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.682143-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
5d9fe958-618a-40a0-9016-e1751cc4db8c	ffb4d3fb-d00f-43b8-be18-407988f45130	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.854425-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
26cd095f-ab32-40e0-934b-901601eed8df	ffb4d3fb-d00f-43b8-be18-407988f45130	e40a415a-723c-43d0-998e-ed81fe9f9c54	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.92487-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
91cc165b-7ba6-4360-95e8-95bcac269f98	48293dc4-355c-41b2-bc94-329b91372949	4a8b0a32-338d-421d-b378-e8629a9975f8	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.570915-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
00de95ac-0b76-4e89-b62c-260cc20c3817	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	3eb69bdb-df4b-4294-9636-b584e2d36530	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.093959-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
b439212c-d565-45c0-9b2f-1cd1ad484116	53f5327d-ed02-4966-9ff6-e90290a81f65	3791dfea-a98f-42da-b56c-4f59064d34a4	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.682537-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
e28a51b3-6cc0-47c1-b86d-4c4fc8eb0aa9	ffb4d3fb-d00f-43b8-be18-407988f45130	7f3458b8-40c5-4814-8a5c-ea26e22ff026	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.858937-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
bf226153-ebcb-4436-9758-8d106627484b	ffb4d3fb-d00f-43b8-be18-407988f45130	248c13ce-cbd5-4f6e-b87b-bfddedf52797	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.925218-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
ca404c28-c933-45cb-ac20-7208ec6d4c5c	48293dc4-355c-41b2-bc94-329b91372949	ca24747c-4f2b-4f75-875b-e65abeb2cf26	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.573983-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
55b0bcd6-5d27-4132-828c-e73987b5d05a	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.093585-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
03c1eda6-2cdd-4cb6-bde7-63a99ec1aeb3	53f5327d-ed02-4966-9ff6-e90290a81f65	fd303dfb-a5e9-42c5-9c68-2b26d6a2bd82	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.683502-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
20c82ee2-620c-44d2-80df-5e851d578564	ffb4d3fb-d00f-43b8-be18-407988f45130	3020b91e-658d-4e0a-9edf-93cb692b95a2	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.856935-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
fc396304-2375-45f2-ae78-5825a66101b3	ffb4d3fb-d00f-43b8-be18-407988f45130	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.925968-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
57cb7303-f84a-4553-8bbd-c30d99a8a524	48293dc4-355c-41b2-bc94-329b91372949	248c13ce-cbd5-4f6e-b87b-bfddedf52797	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.583335-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
b0065fd8-46e2-4500-8b0b-a3a8b54e1016	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	e40a415a-723c-43d0-998e-ed81fe9f9c54	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.095811-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
96da7ca6-f23b-4ef3-9173-de6227c16758	53f5327d-ed02-4966-9ff6-e90290a81f65	0fbc2429-c5d4-4fb6-9af8-805306444952	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.688614-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
76490b89-a16a-408d-8e9f-a812f181e9b2	18b4d7ff-a770-4bca-8e7d-8ff676912b29	14d8391e-850f-4676-a7d4-96e05b05c633	69.00	0.00	58.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 09:14:03.713672-03	\N	pass	[]	[]	fallback_hardcoded
53217e32-1780-44db-b897-ed6bb378b5aa	ffb4d3fb-d00f-43b8-be18-407988f45130	0b852ec2-7a54-4b0b-b826-c563806e0226	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.858256-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
2e577cca-33bb-4d02-b898-92ff3dcad390	ffb4d3fb-d00f-43b8-be18-407988f45130	002c11b5-26b0-428b-8ae1-251211888bf6	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.927793-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
ff906271-b2b8-4740-b6b9-1c2cea27058f	48293dc4-355c-41b2-bc94-329b91372949	12fe640a-40a4-4004-9c06-7c4eac7997a0	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.596232-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
fd36da80-21e3-4261-b474-6d2858098c76	18b4d7ff-a770-4bca-8e7d-8ff676912b29	de2170f8-6183-4581-8048-21256db5cb53	69.00	0.00	58.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 09:14:03.712743-03	\N	pass	[]	[]	fallback_hardcoded
0955f9f0-7668-47f8-bf4d-c79659112f43	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	e75e06be-bf4b-4452-a47c-f2009f6b798a	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.096928-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
b3df9106-bb5b-42d9-9512-6f76f6f9a229	53f5327d-ed02-4966-9ff6-e90290a81f65	bd726364-0421-4540-b1bb-ba549f2fd765	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.695316-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
fd37d6ad-5e72-404a-846e-b17cd5cb8e8f	ffb4d3fb-d00f-43b8-be18-407988f45130	3791dfea-a98f-42da-b56c-4f59064d34a4	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.855407-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
85641f5e-2e84-4a68-a9d6-324e5801c4cc	ffb4d3fb-d00f-43b8-be18-407988f45130	e7dd7099-5202-42d2-b56d-d300aad38692	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.928428-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
6e90cd50-11ae-4548-aab2-7ef9b37d542f	48293dc4-355c-41b2-bc94-329b91372949	36c21c41-5620-4c4d-a06e-ac7de5ff04c4	74.28	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.601215-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
2172e484-1db1-4aaf-9136-8c30fba5338a	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	002c11b5-26b0-428b-8ae1-251211888bf6	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.098924-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
468f2e0b-ee64-4530-92fc-caaa7e8a7290	53f5327d-ed02-4966-9ff6-e90290a81f65	15c22ef4-eb43-4a8d-bd27-a6fae183baa9	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.698707-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
052a24fb-d47f-456c-9b27-60977dd558bd	ffb4d3fb-d00f-43b8-be18-407988f45130	0fbc2429-c5d4-4fb6-9af8-805306444952	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.858531-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
037d6a8e-086d-4f30-85f0-3c6cb9c9aa49	ffb4d3fb-d00f-43b8-be18-407988f45130	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.928068-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
4472c413-6067-4b19-945c-9c4540aaa0aa	f6b75baf-22f6-421f-a8c0-2f09b51b0908	e75e06be-bf4b-4452-a47c-f2009f6b798a	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.80749-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
29cb5faf-dd56-427b-88a3-e9d586dc571d	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	6f7eff2a-fe73-49a0-98c9-2abbdb0929fe	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.098671-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
8016f480-37eb-4df4-adea-1d9649cf02b3	53f5327d-ed02-4966-9ff6-e90290a81f65	de097a8b-1083-4ff9-9064-039da37ecc9c	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.69921-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
cae74e77-55cd-450f-9e29-5f0187315212	18b4d7ff-a770-4bca-8e7d-8ff676912b29	3a7d2f21-0a5a-4667-8605-92151d5a331d	81.50	0.00	58.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 09:14:03.76717-03	\N	pass	[]	[]	fallback_hardcoded
f56b6354-4e6d-4368-a597-0550a41d4914	ffb4d3fb-d00f-43b8-be18-407988f45130	de097a8b-1083-4ff9-9064-039da37ecc9c	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.858744-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
e8cb8eaf-5911-40b3-9e3c-39f6985edb96	ffb4d3fb-d00f-43b8-be18-407988f45130	3eb69bdb-df4b-4294-9636-b584e2d36530	73.45	0.00	84.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.940557-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
1e901ccc-d5d6-4622-8caa-143cd73223ec	f6b75baf-22f6-421f-a8c0-2f09b51b0908	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.808829-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
c8002508-63a7-4218-bd07-a08c1bae19c7	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	0f06a3d5-8e6a-4ff4-af7c-5c957b768c65	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.103176-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
05e430ea-f59b-45e0-b568-afbc4baa8c1b	53f5327d-ed02-4966-9ff6-e90290a81f65	7205cf80-5516-40c5-9c8a-b06506c44293	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.701485-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
35a7aae2-44a4-461d-bc4f-a74e15acf970	18b4d7ff-a770-4bca-8e7d-8ff676912b29	fb8fb2f2-45b3-4b81-b7c2-c5b87c47afd2	54.00	0.00	58.00	45.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 09:14:03.767696-03	\N	pass	[]	[]	fallback_hardcoded
25326b26-4872-46ee-be41-147ecee6e522	d7c40b72-b74c-42ee-b73c-861284273a26	de2170f8-6183-4581-8048-21256db5cb53	63.25	0.00	81.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	potential	2026-04-28 15:00:21.463117-03	\N	pass	[]	[]	fallback_hardcoded
bddd3fc2-1caa-46c9-9171-0546bb885cca	c3d5a700-eb6f-4fd2-8c05-a519a114ea70	14d8391e-850f-4676-a7d4-96e05b05c633	66.25	0.00	87.00	40.50	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-28 15:19:00.753417-03	\N	pass	[]	[]	fallback_hardcoded
edf571c2-d2b8-4675-a72c-4007a5f975be	f6b75baf-22f6-421f-a8c0-2f09b51b0908	ca24747c-4f2b-4f75-875b-e65abeb2cf26	78.52	0.00	68.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:36:37.810649-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
74104bc6-bf6f-4923-9faf-af954ee30cb3	9cace8c1-9807-4bed-8ad8-3ebac8cbcaba	14eb0b60-4bc2-4420-a0c1-2bb3a4a41866	78.10	0.00	67.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:40:21.105268-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
bcd2bc41-4f59-4ccc-95ae-947588fc2b29	18b4d7ff-a770-4bca-8e7d-8ff676912b29	d75da52e-60db-48bf-a2a0-adddaf952c87	27.60	0.00	58.00	75.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/1 skills opcionais atendidas.	not_recommended	2026-04-28 09:14:03.767493-03	\N	pass	[]	[]	fallback_hardcoded
a7f2c5d7-911c-45c1-8816-b645a6f5e4a6	53f5327d-ed02-4966-9ff6-e90290a81f65	0abdf932-256b-4fff-8ff0-f1ddc0ecc398	73.42	0.00	56.00	100.00	[]	[]	["api", "backend", "python", "sql"]	0/0 skills obrigatórias e 0/0 skills opcionais atendidas.	good_match	2026-04-29 07:41:53.701889-03	1253564f-bc5e-4f85-b59d-fa07c9edca39	pass	[]	[]	score_model_version
\.


--
-- Data for Name: resume_versions; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.resume_versions (id, resume_id, version_number, s3_bucket, s3_key, s3_etag, s3_version_id, original_file_name, file_size_bytes, file_hash_sha256, mime_type, extracted_text, extraction_status, extraction_error, page_count, word_count, language_detected, uploaded_by, uploaded_at) FROM stdin;
8cbec5aa-68ee-4fac-9356-4ace3494ac74	ef1c5b08-f009-424d-9ec8-f119bce3842a	1	resume-ai-dev-uploads	resumes/9c8edb04-85a3-4c7e-8b28-daf501e6036a/ef1c5b08-f009-424d-9ec8-f119bce3842a/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:33.096715-03
a5749515-4cc6-4a67-9ec1-d87e591ee838	859aac2f-6172-4458-896c-2b98c6ccfaa6	1	resume-ai-dev-uploads	resumes/5ae9b847-fdc3-44e8-8885-0b36dfce4453/859aac2f-6172-4458-896c-2b98c6ccfaa6/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:10.510094-03
4a8350fe-3df5-42a6-8bd8-66901a4a0389	156b19e1-3d8b-442c-a8f6-3f5a8e3525b0	1	resume-ai-dev-uploads	resumes/c9babfc0-c47e-44d6-9c5d-e28d757d06bf/156b19e1-3d8b-442c-a8f6-3f5a8e3525b0/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:40:19.271286-03
d3133a4f-4abb-443c-ba07-7f5339d57f4a	2aec890f-a855-4d17-a905-9a995de2a4ee	1	resume-ai-dev-uploads	resumes/bb9c2755-fef1-4767-ac3e-b1581992cefe/2aec890f-a855-4d17-a905-9a995de2a4ee/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:21:00.06323-03
6a8330f5-4666-495b-b2cc-0c81489208de	10b93c17-beb2-4f28-a215-155a9338e4f1	1	resume-ai-dev-uploads	resumes/25cbe08a-c93e-4a64-b661-94d0f7ff68f1/10b93c17-beb2-4f28-a215-155a9338e4f1/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:44.051744-03
20ee72ff-4e58-4ab2-ac76-1258cc969b0c	7d7d7b96-d3af-420f-840e-f39f24f105c7	1	resume-ai-dev-uploads	resumes/e839ead1-5147-4899-aa45-17d54b911501/7d7d7b96-d3af-420f-840e-f39f24f105c7/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:41:51.913427-03
f28eee6e-6c5e-4a09-903e-bc6a1737d2d8	6b7b19ce-11c1-4353-8892-0c293ca96faf	1	resume-ai-dev-uploads	resumes/fb8474ac-868f-4474-8c2e-2b9fc7bc2293/6b7b19ce-11c1-4353-8892-0c293ca96faf/v1_original.pdf	\N	\N	Profile (8).pdf	37280	8572a58039d37ccce094a2be9ba7c950ac4bd885c83e7a44aed8c953e38c6155	application/pdf	Contato Christian Prado +55 62 99439-4161 (Mobile) christianprado@outlook.com. Nodejs | Typescript | Javascript | SQL | DevOps | Google Cloud br Platform | GitHub | ADVPL/TLPP (Protheus Totvs) Aparecida de Goiânia, Goiás, Brasil www.linkedin.com/in/christian- prado-6a113a228 (LinkedIn) Experiência Principais competências Rede Marajó Desenvolvimento de back-end Desenvolvedor backend Node.js outubro de 2020 - Present (5 anos 7 meses) PostgreSQL Goiânia, Goiás, Brasil Page 1 of 1	completed	\N	1	67	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:00:19.777837-03
30886b92-fff2-4505-84e6-b074c9a023ab	b5f5ce2a-9d06-4106-9971-c00d7bbe337c	1	resume-ai-dev-uploads	resumes/1d84d654-275b-47d7-ab91-348743e52040/b5f5ce2a-9d06-4106-9971-c00d7bbe337c/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:22:26.976475-03
48744fc7-597e-4889-9792-d658794e35dc	eb6f6272-65a2-4a37-ad5d-77666872e726	1	resume-ai-dev-uploads	resumes/adccb07f-ba13-4ef1-b321-a9c901e3e677/eb6f6272-65a2-4a37-ad5d-77666872e726/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:50.997554-03
6cdee89c-be83-46a5-89f1-6334f075b668	1cb3867d-bc22-4050-88cf-d7f1c8b29091	1	resume-ai-dev-uploads	resumes/41eb5f95-d632-4bc1-a591-d8b1d63e0de7/1cb3867d-bc22-4050-88cf-d7f1c8b29091/v1_original.pdf	\N	\N	Profile (8).pdf	37280	8572a58039d37ccce094a2be9ba7c950ac4bd885c83e7a44aed8c953e38c6155	application/pdf	Contato Christian Prado +55 62 99439-4161 (Mobile) christianprado@outlook.com. Nodejs | Typescript | Javascript | SQL | DevOps | Google Cloud br Platform | GitHub | ADVPL/TLPP (Protheus Totvs) Aparecida de Goiânia, Goiás, Brasil www.linkedin.com/in/christian- prado-6a113a228 (LinkedIn) Experiência Principais competências Rede Marajó Desenvolvimento de back-end Desenvolvedor backend Node.js outubro de 2020 - Present (5 anos 7 meses) PostgreSQL Goiânia, Goiás, Brasil Page 1 of 1	completed	\N	1	67	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:18:59.086169-03
e94fed74-be4f-4977-b79d-27c22d8f9b6a	128d667c-b82e-4007-914b-99ee2345a26a	1	resume-ai-dev-uploads	resumes/46333bfc-f564-45eb-a3bd-22117964fb2a/128d667c-b82e-4007-914b-99ee2345a26a/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:42.30583-03
5ab0d349-2dc2-4e2d-9394-23bae4c66f40	53debea4-cc24-497d-a954-6898c213a505	1	resume-ai-dev-uploads	resumes/550364ec-d0b5-4ae3-8ff0-24ed1fe99793/53debea4-cc24-497d-a954-6898c213a505/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:54.557492-03
ac2b11de-44cc-4e1f-914d-4c70fa3aed59	caca42e1-9e69-44b8-9e25-03fff89d0243	1	resume-ai-dev-uploads	resumes/63187b76-e83b-4545-bdfe-61664ee094c3/caca42e1-9e69-44b8-9e25-03fff89d0243/v1_original.pdf	\N	\N	curriculo_analista_pleno.pdf	2417	9851e2e591798d12d7b94c5fc5911baada9ad497eeb9c21d207828cfee84da12	application/pdf	CURRÍCULO - ANALISTA DE SISTEMAS PLENO Nome: João da Silva Email: joao.silva@email.com Telefone: (11) 99999-9999 Resumo Profissional: Analista de Sistemas com mais de 5 anos de experiência em desenvolvimento, manutenção e implantação de sistemas. Forte atuação com backend, banco de dados e integrações, com foco em performance e escalabilidade. Experiência Profissional: Empresa XYZ (2021 - Atual) - Analista de Sistemas Pleno - Desenvolvimento de APIs REST - Modelagem de banco de dados (PostgreSQL) - Integração com sistemas externos - Suporte técnico N2/N3 Empresa ABC (2019 - 2021) - Desenvolvedor Backend - Desenvolvimento em Python e Node.js - Criação de rotinas automatizadas - Manutenção de sistemas legados Formação: Bacharel em Análise e Desenvolvimento de Sistemas - Universidade Exemplo Habilidades Técnicas: - Python, Node.js - PostgreSQL, MySQL - APIs REST - Docker - Git	completed	\N	1	121	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 09:14:01.968218-03
e9fe7ddb-7d05-421c-95f0-f3a6828a9495	ff0de6df-7a55-468c-a203-0dd9b1778b05	1	resume-ai-dev-uploads	resumes/6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56/ff0de6df-7a55-468c-a203-0dd9b1778b05/v1_original.pdf	\N	\N	Profile (1).pdf	42264	245eea162ebb8042149d478157c7ac9f83ebaebd83e6352377890c6e3dafa383	application/pdf	Contato Marcos Vinicius www.linkedin.com/in/marcos- React | React Native | Node.js | DevOps | Infra | SQL | Python vinicius-301628119 (LinkedIn) Goiânia, Goiás, Brasil Principais competências Experiência Figma Rede Marajó UX/UI Design Desenvolvedor web React Native novembro de 2023 - Present (2 anos 6 meses) Goiânia, Goiás, Brasil Certifications Desenvolvo aplicações móveis com React Native e interfaces web com NLW Pocket: Mobile - React Native React.js, criando experiências intuitivas e eficientes para os usuários. Atuo Comunicação: como se expressar bem e ser compreendido na otimização de performance e usabilidade, integrando soluções front-end Python para Data Science a sistemas robustos. Colaborei em projetos que aumentaram o engajamento Scrum: agilidade em seu projeto dos clientes, aplicando boas práticas de código e design centrado no usuário. NLW Pocket | Iniciantes - Fullstack Rede Frota Assistente de TI agosto de 2021 - outubro de 2023 (2 anos 3 meses) Gerenciei servidores Linux e monitorei infraestrutura com Zabbix, reduzindo downtimes. Configurei firewalls e soluções na Google Cloud, garantindo segurança e escalabilidade em projetos de TI. Rede Marajó Auxiliar de eletricista junho de 2018 - agosto de 2023 (5 anos 3 meses) Prestei suporte técnico em infraestrutura elétrica, desenvolvendo habilidades de resolução de problemas e trabalho em equipe em projetos operacionais. Formação acadêmica Alura Page 1 of 1	completed	\N	1	208	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:02:47.815919-03
e54ecdaf-99c5-4a03-9e6b-d0c6d06f0493	a9502bd4-fc53-4caf-ac6a-998704b330a2	1	resume-ai-dev-uploads	resumes/f9b6fa2d-c337-4106-8a7b-a6d06c588561/a9502bd4-fc53-4caf-ac6a-998704b330a2/v1_original.pdf	\N	\N	Profile (2).pdf	43701	6c0693f7d017f527f253858449853029b2420a3016bebeba45ce397543286ede	application/pdf	Contact Gustavo Gonçalves e Souza arcanoide_loko@hotmail.com Program Manager at No company www.linkedin.com/in/gustavo- Goiânia, Goiás, Brazil gonçalves-e-souza-4b1071201 (LinkedIn) Experience Top Skills No company Data Reduction Program Manager Debugging Reducing Operating Costs Rede Marajó Desenvolvedor de software May 2022 - Present (4 years) Goiânia, Goiás, Brasil Rede de Postos Marajó Full Stack Engineer 2019 - Present (7 years) ● Desenvolvimento de APIs REST com ASP.NET Core ● Implementação frontend com React ● Modelagem e manutenção de banco SQL Server e PostgreSQL ● Aplicação de Clean Architecture e princípios SOLID ● Levantamento de requisitos junto às áreas de negócio ● Modernização e evolução de sistemas legados ● Execução e validação de pipelines CI/CD ● Revisão e aprovação de Pull Requests ● Liberação de builds para ambientes TST, HML e PRD Engegraph Sistemas Developer 2020 - 2021 (1 year) ● Desenvolvimento e manutenção de sistemas corporativos ● Correção de bugs e melhorias evolutivas ● Testes e documentação técnica ● Substituição do gestor técnico em período de férias Education UNOPAR - Universidade Norte do Paraná Ensino Superior, Análise de Sistemas de Computação · (January 2016 - December 2018) Anhanguera Minas Page 1 of 2 Technical Degree in System Analysis and Development Page 2 of 2	completed	\N	2	192	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:04:20.237937-03
43de96a4-2b8a-479a-8a82-7dff8bea81d7	3fb0407e-f349-49b1-b922-d71a4209b9d2	1	resume-ai-dev-uploads	resumes/bb2632a2-c424-4ee9-9e36-7c6db2a35282/3fb0407e-f349-49b1-b922-d71a4209b9d2/v1_original.pdf	\N	\N	Profile (3).pdf	47849	e46058ba591aa2bdd44b4705d9558ec05db1ba23cd9fbe6894031b874e3cb8b4	application/pdf	Contato Daniel Silva Pereira Rua RB29A, Res. Recanto do Bosque, Goiânia-GO BI Analyst | Data Analyst | BI Consultant | Data Science | SQL | ETL | (62)99139-4797 (Mobile) SSIS | Python | Predictive Analytics | PySpark Goiânia, Goiás, Brasil www.linkedin.com/in/daniel-silva- pereira-17224219a (LinkedIn) Resumo Principais competências Profissional dedicado e apaixonado por Business Intelligence Análise de dados (BI), com uma jornada que me levou de auditor pleno a analista Integração de sistemas de dados. Nos últimos anos, desenvolvi uma sólida expertise em programação e automação análise e domínio de dados, com ampla experiência na integração de sistemas como Protheus e SAP Business One. Meu foco está em Certifications traduzir dados complexos em insights estratégicos que impulsionam Formação Microsoft SQL Server o sucesso organizacional, otimizam processos e elevam a eficiência 2022 operacional. Estou motivado por transformar informações em ações práticas que geram valor e suportam o crescimento dos negócios. Experiência Rede Marajó Analista de dados junho de 2023 - Present (2 anos 11 meses) Goiânia, Goiás, Brasil Atuo na coleta, integração e estruturação de dados de múltiplas fontes, transformando informações brutas em análises estratégicas. Desenvolvo dashboards interativos e visualmente intuitivos utilizando ferramentas como Power BI, Tableau, Qlik Sense e Google Data Studio, além de identificar tendências e padrões para embasar decisões de negócio. Crio automações e aplicativos em Python, incorporando soluções de inteligência artificial como machine learn para análises preditivas, otimizando processos e gerando insights. Colaboração de forma integrada com diferentes equipes, assegurando a confiabilidade dos dados e promovendo decisões mais assertivas e orientadas por evidências. Ok Dados Analytics Business Intelligence setembro de 2022 - julho de 2023 (11 meses) Goiânia Consultoria e entrega de insights que capacitem gestores e profissionais a compreender o desempenho do negócio, identificar tendências, explorar Page 1 of 2 oportunidades. Utilizando técnicas como mineração de dados com Python e R, análise estatística com Excel e SQL, gerenciamento de banco de dados com SQL Server, processos de ETL com SSIS, pentaho, além de visualização de dados e criação de dashboards interativos em Power BI, Tableau e Looker, google studio e outros com foco em UX para garantir usabilidade e design intuitivo. Rennova Auditor Interno Pleno janeiro de 2020 - setembro de 2022 (2 anos 9 meses) Goiânia, Goiás, Brasil Revisar, analisar e consolidar os dados de perdas operacionais. Buscando identificar similaridades, apurar divergências e tomar medidas corretivas para garantir a precisão dos dados além propor melhorias nos controles internos Brainfarma Analista de ativos imobilizados março de 2014 - abril de 2019 (5 anos 2 meses) Anápolis e Região, Brasil Contribui com a estruturação do departamento de ativos imobilizados, realizando inventários patrimoniais. Coordenei leilões de ativos descontinuados garantindo um controle eficiente dos ativos do grupo, otimização dos recursos e melhorias dos resultados financeiros da organização. Formação acadêmica UNIALFA - Centro Universitário Alves Faria Bacharelado/Licenciatura, Tecnologia da Informação · (janeiro de 2022 - dezembro de 2025) Faculdade Padrão Bacharelado em Administração, Administração de Empresas · (janeiro de 2009 - dezembro de 2012) Page 2 of 2	completed	\N	2	488	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:05:20.670884-03
0f0de3c8-a301-4cbb-a591-aa0e08b56180	aef4bc3b-0efc-4fa0-8197-a2cd6336fd3b	1	resume-ai-dev-uploads	resumes/bb2632a2-c424-4ee9-9e36-7c6db2a35282/aef4bc3b-0efc-4fa0-8197-a2cd6336fd3b/v1_original.pdf	\N	\N	Profile (3).pdf	47849	e46058ba591aa2bdd44b4705d9558ec05db1ba23cd9fbe6894031b874e3cb8b4	application/pdf	Contato Daniel Silva Pereira Rua RB29A, Res. Recanto do Bosque, Goiânia-GO BI Analyst | Data Analyst | BI Consultant | Data Science | SQL | ETL | (62)99139-4797 (Mobile) SSIS | Python | Predictive Analytics | PySpark Goiânia, Goiás, Brasil www.linkedin.com/in/daniel-silva- pereira-17224219a (LinkedIn) Resumo Principais competências Profissional dedicado e apaixonado por Business Intelligence Análise de dados (BI), com uma jornada que me levou de auditor pleno a analista Integração de sistemas de dados. Nos últimos anos, desenvolvi uma sólida expertise em programação e automação análise e domínio de dados, com ampla experiência na integração de sistemas como Protheus e SAP Business One. Meu foco está em Certifications traduzir dados complexos em insights estratégicos que impulsionam Formação Microsoft SQL Server o sucesso organizacional, otimizam processos e elevam a eficiência 2022 operacional. Estou motivado por transformar informações em ações práticas que geram valor e suportam o crescimento dos negócios. Experiência Rede Marajó Analista de dados junho de 2023 - Present (2 anos 11 meses) Goiânia, Goiás, Brasil Atuo na coleta, integração e estruturação de dados de múltiplas fontes, transformando informações brutas em análises estratégicas. Desenvolvo dashboards interativos e visualmente intuitivos utilizando ferramentas como Power BI, Tableau, Qlik Sense e Google Data Studio, além de identificar tendências e padrões para embasar decisões de negócio. Crio automações e aplicativos em Python, incorporando soluções de inteligência artificial como machine learn para análises preditivas, otimizando processos e gerando insights. Colaboração de forma integrada com diferentes equipes, assegurando a confiabilidade dos dados e promovendo decisões mais assertivas e orientadas por evidências. Ok Dados Analytics Business Intelligence setembro de 2022 - julho de 2023 (11 meses) Goiânia Consultoria e entrega de insights que capacitem gestores e profissionais a compreender o desempenho do negócio, identificar tendências, explorar Page 1 of 2 oportunidades. Utilizando técnicas como mineração de dados com Python e R, análise estatística com Excel e SQL, gerenciamento de banco de dados com SQL Server, processos de ETL com SSIS, pentaho, além de visualização de dados e criação de dashboards interativos em Power BI, Tableau e Looker, google studio e outros com foco em UX para garantir usabilidade e design intuitivo. Rennova Auditor Interno Pleno janeiro de 2020 - setembro de 2022 (2 anos 9 meses) Goiânia, Goiás, Brasil Revisar, analisar e consolidar os dados de perdas operacionais. Buscando identificar similaridades, apurar divergências e tomar medidas corretivas para garantir a precisão dos dados além propor melhorias nos controles internos Brainfarma Analista de ativos imobilizados março de 2014 - abril de 2019 (5 anos 2 meses) Anápolis e Região, Brasil Contribui com a estruturação do departamento de ativos imobilizados, realizando inventários patrimoniais. Coordenei leilões de ativos descontinuados garantindo um controle eficiente dos ativos do grupo, otimização dos recursos e melhorias dos resultados financeiros da organização. Formação acadêmica UNIALFA - Centro Universitário Alves Faria Bacharelado/Licenciatura, Tecnologia da Informação · (janeiro de 2022 - dezembro de 2025) Faculdade Padrão Bacharelado em Administração, Administração de Empresas · (janeiro de 2009 - dezembro de 2012) Page 2 of 2	completed	\N	2	488	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:08:35.924169-03
478b1e47-df07-49b7-b1e6-885700b39013	863924b4-fac8-4831-8765-b53f2eb12ca3	1	resume-ai-dev-uploads	resumes/dbbfea9e-1207-4a42-9c58-31ce837773db/863924b4-fac8-4831-8765-b53f2eb12ca3/v1_original.pdf	\N	\N	Profile (4).pdf	45561	2ce922433fcfa8db62b75201f47a6c707651544718ac4f0c77b94e5ce19527d4	application/pdf	Contato Matheus De Jesus Vieira www.linkedin.com/in/matheus-de- Barros jesus-vieira-barros-9046571b3 (LinkedIn) Desenvolvedor Full Stack | Soluções web e mobile com foco em performance, usabilidade e arquitetura limpa Principais competências Aparecida de Goiânia, Goiás, Brasil TypeScript Resumo Desenvolvimento full stack React.js Sou desenvolvedor Full Stack com mais de 4 anos de experiência na construção de aplicações web e mobile. Certifications JavaScript: Interfaces e Herança em Atuo do front ao back-end, com foco em criar soluções funcionais, Orientação a Objetos escaláveis e com boa experiência para o usuário. Acredito que Fundamentos de UX: Entenda a experiência de usuário código limpo, arquitetura bem pensada e clareza na comunicação JavaScript: Programando a fazem tanta diferença quanto a tecnologia escolhida. Orientação a Objetos React: Automatizando os testes em Tenho experiência no desenvolvimento de aplicações e sistemas aplicações front-end corporativos, incluindo a criação e consumo de APIs RESTful, React Router: Navegação em uma SPA integração entre front-end e back-end, modelagem de dados e utilização de ORMs, sempre buscando equilíbrio entre performance, usabilidade e manutenção a longo prazo. Também atuo na criação de landing pages e interfaces focadas em usabilidade, conversão e clareza para o usuário final. Principais tecnologias: Front-end: HTML, CSS, JavaScript, TypeScript, React, Next.js, React Native, Tailwind CSS Back-end: Node.js (APIs RESTful, ORMs) Banco de dados: PostgreSQL, MySQL Outros: Git, boas práticas de arquitetura, código limpo e código escalável Interesso-me por crescimento profissional em tecnologia, aprendizado contínuo e uso consciente da tecnologia. Experiência Rede Marajó Page 1 of 2 4 anos 7 meses Analista de sistema abril de 2024 - Present (2 anos 1 mês) Goiânia, Goiás, Brasil Assistente de TI outubro de 2021 - Present (4 anos 7 meses) Formação acadêmica CENTRO UNIVERSITÁRIO UNIFANAP Curso Superior de Tecnologia (CST), Tecnologia em Tecnologia da Informação/Sistemas da Informação · (janeiro de 2021 - dezembro de 2023) Universidade de Rio verde técnico , informática para internet · (2018 - 2018) Page 2 of 2	completed	\N	2	326	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:10:09.203252-03
28d2e7ad-4bad-46ce-9529-c23a0d27618a	8ef78e41-c127-4126-ab2c-bdbe2a8c2bec	1	resume-ai-dev-uploads	resumes/f709039e-b5ba-4339-8714-21bd010d7c56/8ef78e41-c127-4126-ab2c-bdbe2a8c2bec/v1_original.pdf	\N	\N	Profile (5).pdf	43403	1cee79b747c6b21ae96d1f26727d2a30f1ac8eeeb354ef81b696cc7933dd42b7	application/pdf	Contato Hiago Dantas www.linkedin.com/in/hiago- Especialista em Dados | Power BI | Dax | Python | ETL | DBA (SQL dantas-8b0245191 (LinkedIn) Server, PostgreSql) | Data Science | IA | BI Analyst | Data Analyst | BI Consultant | SSIS | Predictive Analytics Aparecida de Goiânia, Goiás, Brasil Principais competências ETL (Extração, transformação e carregamento) Resumo Python Resumo Profissional: Microsoft Power BI Profissional com ampla experiência em análise de dados, suporte Certifications técnico e desenvolvimento de soluções inteligentes para negócios. Formação SQL com Microsoft SQL Minha trajetória começou no atendimento ao cliente, passando Server 2017 por funções operacionais e de suporte, até me consolidar como Business Intelligence: Introdução à inteligência empresarial especialista em bancos de dados, BI e inteligência artificial aplicada Fundamentos de Data Science e ao varejo de combustíveis. Inteligência Artificial Certificado de autoridade: SQL Atualmente, atuo como DBA e especialista em dados, garantindo a integridade, performance e segurança do banco de dados SQL Server (5TB+), além de desenvolver e otimizar procedimentos armazenados, ETL e automação de rotinas. Tenho forte domínio de índices, particionamento, tuning de queries e estratégias para lidar com tabelas massivas (500M+ registros). Minha expertise se estende ao ERP Protheus, onde forneço suporte estratégico nos módulos de Faturamento e Varejo, garantindo operações fluidas e auxiliando na tomada de decisões. Paralelamente, sou especialista em Power BI, desenvolvendo dashboards dinâmicos e interativos que fornecem insights estratégicos em tempo real para a gestão. Meu foco é otimizar a performance das consultas e reduzir o impacto no banco de dados, garantindo análises eficientes mesmo em ambientes de alto volume de dados. Com conhecimentos sólidos em Python e IA, estou explorando a aplicação de modelos preditivos e soluções generativas para aprimorar a gestão de preços e margens de combustíveis, visando otimizar a rentabilidade da empresa. Page 1 of 2 Minha missão é transformar dados em decisões inteligentes, aliando tecnologia, automação e inteligência artificial para impulsionar a eficiência e a competitividade do negócio. Experiência Marajó Postos de Serviços S/A Analista de dados sênior março de 2016 - Present (10 anos 2 meses) Goiânia, Goiás, Brasil Formação acadêmica UNOPAR - Universidade Norte do Paraná Bacharelado em Análise e Desenvolvimento de Sistemas, Analise e desenvolvimento de sistemas · (2019 - 2022) Page 2 of 2	completed	\N	2	360	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:11:49.394838-03
8df40af1-fbd4-4f3d-a28a-6039586e3fb0	c6bf0b21-194d-4e6f-b42f-b9186aa18144	1	resume-ai-dev-uploads	resumes/4234af6d-08b8-43e6-b0a5-d9179baf7d2c/c6bf0b21-194d-4e6f-b42f-b9186aa18144/v1_original.pdf	\N	\N	Profile (8).pdf	37280	8572a58039d37ccce094a2be9ba7c950ac4bd885c83e7a44aed8c953e38c6155	application/pdf	Contato Christian Prado +55 62 99439-4161 (Mobile) christianprado@outlook.com. Nodejs | Typescript | Javascript | SQL | DevOps | Google Cloud br Platform | GitHub | ADVPL/TLPP (Protheus Totvs) Aparecida de Goiânia, Goiás, Brasil www.linkedin.com/in/christian- prado-6a113a228 (LinkedIn) Experiência Principais competências Rede Marajó Desenvolvimento de back-end Desenvolvedor backend Node.js outubro de 2020 - Present (5 anos 7 meses) PostgreSQL Goiânia, Goiás, Brasil Page 1 of 1	completed	\N	1	67	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:47:42.928506-03
e1c222bc-76d0-40d4-8cd5-ff69ff91bddf	728d3174-d90e-4720-9e2e-d6e27af20804	1	resume-ai-dev-uploads	resumes/ab0b2d73-ab7d-44a5-94c3-bf1c21733063/728d3174-d90e-4720-9e2e-d6e27af20804/v1_original.pdf	\N	\N	Profile (6).pdf	39925	4682facf73307a78b600c273c43e73167756a84b9289507cc7c8e2472c844436	application/pdf	Contato ARIOVALDO FRANCISCO www.linkedin.com/in/ariovaldo- PURCINO francisco-purcino-a29aa770 (LinkedIn) ANALISTA DE SISTEMAS na Marajó Aparecida de Goiânia, Goiás, Brasil Principais competências desenvolvedor em advpl Resumo Microsoft Office 21 Anos de experiência em sistemas ERP, Microsiga Protheus: Microsoft Excel Analista de sistemas(sênior) e Suporte. Experiência Cicopal Indústria e Comércio de Produtos LTDA ANALISTA DE SISTEMAS setembro de 2014 - agosto de 2023 (9 anos) SENADOR CANEDO biopele analista de sistemas maio de 2007 - julho de 2014 (7 anos 3 meses) ABELHA RAINHA COSMÉTICOS Analista de sistema abril de 2007 - junho de 2014 (7 anos 3 meses) Aparecida de Goiânia, Goiás, Brasil termoeste analista janeiro de 2002 - outubro de 2006 (4 anos 10 meses) Formação acadêmica IPOG - Instituto de Pós-Graduação e Graduação Perito criminal florense · (2012 - 2013) Page 1 of 1	completed	\N	1	134	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:17:01.078516-03
8a77f960-5f5d-4a0d-9f7c-efdf21d7c342	9e598afe-ebd8-4944-a6cd-b450ac5bff67	1	resume-ai-dev-uploads	resumes/ba22024f-23df-4ced-8bc0-dc1cda884acb/9e598afe-ebd8-4944-a6cd-b450ac5bff67/v1_original.pdf	\N	\N	Profile (7).pdf	43403	98587085399998e0485c3779a7d1f61c48c4f9af3090dbd8d41a50242d7742c7	application/pdf	Contato Hiago Dantas www.linkedin.com/in/hiago- Especialista em Dados | Power BI | Dax | Python | ETL | DBA (SQL dantas-8b0245191 (LinkedIn) Server, PostgreSql) | Data Science | IA | BI Analyst | Data Analyst | BI Consultant | SSIS | Predictive Analytics Aparecida de Goiânia, Goiás, Brasil Principais competências ETL (Extração, transformação e carregamento) Resumo Python Resumo Profissional: Microsoft Power BI Profissional com ampla experiência em análise de dados, suporte Certifications técnico e desenvolvimento de soluções inteligentes para negócios. Formação SQL com Microsoft SQL Minha trajetória começou no atendimento ao cliente, passando Server 2017 por funções operacionais e de suporte, até me consolidar como Business Intelligence: Introdução à inteligência empresarial especialista em bancos de dados, BI e inteligência artificial aplicada Fundamentos de Data Science e ao varejo de combustíveis. Inteligência Artificial Certificado de autoridade: SQL Atualmente, atuo como DBA e especialista em dados, garantindo a integridade, performance e segurança do banco de dados SQL Server (5TB+), além de desenvolver e otimizar procedimentos armazenados, ETL e automação de rotinas. Tenho forte domínio de índices, particionamento, tuning de queries e estratégias para lidar com tabelas massivas (500M+ registros). Minha expertise se estende ao ERP Protheus, onde forneço suporte estratégico nos módulos de Faturamento e Varejo, garantindo operações fluidas e auxiliando na tomada de decisões. Paralelamente, sou especialista em Power BI, desenvolvendo dashboards dinâmicos e interativos que fornecem insights estratégicos em tempo real para a gestão. Meu foco é otimizar a performance das consultas e reduzir o impacto no banco de dados, garantindo análises eficientes mesmo em ambientes de alto volume de dados. Com conhecimentos sólidos em Python e IA, estou explorando a aplicação de modelos preditivos e soluções generativas para aprimorar a gestão de preços e margens de combustíveis, visando otimizar a rentabilidade da empresa. Page 1 of 2 Minha missão é transformar dados em decisões inteligentes, aliando tecnologia, automação e inteligência artificial para impulsionar a eficiência e a competitividade do negócio. Experiência Marajó Postos de Serviços S/A Analista de dados sênior março de 2016 - Present (10 anos 2 meses) Goiânia, Goiás, Brasil Formação acadêmica UNOPAR - Universidade Norte do Paraná Bacharelado em Análise e Desenvolvimento de Sistemas, Analise e desenvolvimento de sistemas · (2019 - 2022) Page 2 of 2	completed	\N	2	360	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:21:03.788415-03
9c2849a0-4fad-42e4-a7ed-943de8f945f7	b6f7f85f-3537-4226-a808-756a2ba6d03f	1	resume-ai-dev-uploads	resumes/0db26fb0-8008-43b1-bf50-55e9b9518143/b6f7f85f-3537-4226-a808-756a2ba6d03f/v1_original.pdf	\N	\N	Profile (7).pdf	43403	98587085399998e0485c3779a7d1f61c48c4f9af3090dbd8d41a50242d7742c7	application/pdf	Contato Hiago Dantas www.linkedin.com/in/hiago- Especialista em Dados | Power BI | Dax | Python | ETL | DBA (SQL dantas-8b0245191 (LinkedIn) Server, PostgreSql) | Data Science | IA | BI Analyst | Data Analyst | BI Consultant | SSIS | Predictive Analytics Aparecida de Goiânia, Goiás, Brasil Principais competências ETL (Extração, transformação e carregamento) Resumo Python Resumo Profissional: Microsoft Power BI Profissional com ampla experiência em análise de dados, suporte Certifications técnico e desenvolvimento de soluções inteligentes para negócios. Formação SQL com Microsoft SQL Minha trajetória começou no atendimento ao cliente, passando Server 2017 por funções operacionais e de suporte, até me consolidar como Business Intelligence: Introdução à inteligência empresarial especialista em bancos de dados, BI e inteligência artificial aplicada Fundamentos de Data Science e ao varejo de combustíveis. Inteligência Artificial Certificado de autoridade: SQL Atualmente, atuo como DBA e especialista em dados, garantindo a integridade, performance e segurança do banco de dados SQL Server (5TB+), além de desenvolver e otimizar procedimentos armazenados, ETL e automação de rotinas. Tenho forte domínio de índices, particionamento, tuning de queries e estratégias para lidar com tabelas massivas (500M+ registros). Minha expertise se estende ao ERP Protheus, onde forneço suporte estratégico nos módulos de Faturamento e Varejo, garantindo operações fluidas e auxiliando na tomada de decisões. Paralelamente, sou especialista em Power BI, desenvolvendo dashboards dinâmicos e interativos que fornecem insights estratégicos em tempo real para a gestão. Meu foco é otimizar a performance das consultas e reduzir o impacto no banco de dados, garantindo análises eficientes mesmo em ambientes de alto volume de dados. Com conhecimentos sólidos em Python e IA, estou explorando a aplicação de modelos preditivos e soluções generativas para aprimorar a gestão de preços e margens de combustíveis, visando otimizar a rentabilidade da empresa. Page 1 of 2 Minha missão é transformar dados em decisões inteligentes, aliando tecnologia, automação e inteligência artificial para impulsionar a eficiência e a competitividade do negócio. Experiência Marajó Postos de Serviços S/A Analista de dados sênior março de 2016 - Present (10 anos 2 meses) Goiânia, Goiás, Brasil Formação acadêmica UNOPAR - Universidade Norte do Paraná Bacharelado em Análise e Desenvolvimento de Sistemas, Analise e desenvolvimento de sistemas · (2019 - 2022) Page 2 of 2	completed	\N	2	360	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:09.888204-03
5dbf606b-a252-41a3-8678-4175cfcb1bde	0ee1dc1a-ff5d-4ce1-86d7-5dd017dd27af	1	resume-ai-dev-uploads	resumes/0d53a1ff-fce7-4a49-b8c6-e83286bd7210/0ee1dc1a-ff5d-4ce1-86d7-5dd017dd27af/v1_original.pdf	\N	\N	Profile (7).pdf	43403	98587085399998e0485c3779a7d1f61c48c4f9af3090dbd8d41a50242d7742c7	application/pdf	Contato Hiago Dantas www.linkedin.com/in/hiago- Especialista em Dados | Power BI | Dax | Python | ETL | DBA (SQL dantas-8b0245191 (LinkedIn) Server, PostgreSql) | Data Science | IA | BI Analyst | Data Analyst | BI Consultant | SSIS | Predictive Analytics Aparecida de Goiânia, Goiás, Brasil Principais competências ETL (Extração, transformação e carregamento) Resumo Python Resumo Profissional: Microsoft Power BI Profissional com ampla experiência em análise de dados, suporte Certifications técnico e desenvolvimento de soluções inteligentes para negócios. Formação SQL com Microsoft SQL Minha trajetória começou no atendimento ao cliente, passando Server 2017 por funções operacionais e de suporte, até me consolidar como Business Intelligence: Introdução à inteligência empresarial especialista em bancos de dados, BI e inteligência artificial aplicada Fundamentos de Data Science e ao varejo de combustíveis. Inteligência Artificial Certificado de autoridade: SQL Atualmente, atuo como DBA e especialista em dados, garantindo a integridade, performance e segurança do banco de dados SQL Server (5TB+), além de desenvolver e otimizar procedimentos armazenados, ETL e automação de rotinas. Tenho forte domínio de índices, particionamento, tuning de queries e estratégias para lidar com tabelas massivas (500M+ registros). Minha expertise se estende ao ERP Protheus, onde forneço suporte estratégico nos módulos de Faturamento e Varejo, garantindo operações fluidas e auxiliando na tomada de decisões. Paralelamente, sou especialista em Power BI, desenvolvendo dashboards dinâmicos e interativos que fornecem insights estratégicos em tempo real para a gestão. Meu foco é otimizar a performance das consultas e reduzir o impacto no banco de dados, garantindo análises eficientes mesmo em ambientes de alto volume de dados. Com conhecimentos sólidos em Python e IA, estou explorando a aplicação de modelos preditivos e soluções generativas para aprimorar a gestão de preços e margens de combustíveis, visando otimizar a rentabilidade da empresa. Page 1 of 2 Minha missão é transformar dados em decisões inteligentes, aliando tecnologia, automação e inteligência artificial para impulsionar a eficiência e a competitividade do negócio. Experiência Marajó Postos de Serviços S/A Analista de dados sênior março de 2016 - Present (10 anos 2 meses) Goiânia, Goiás, Brasil Formação acadêmica UNOPAR - Universidade Norte do Paraná Bacharelado em Análise e Desenvolvimento de Sistemas, Analise e desenvolvimento de sistemas · (2019 - 2022) Page 2 of 2	completed	\N	2	360	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:33.975129-03
acd75758-8c6d-460a-b0bc-2a3423ee586e	77381421-9609-4379-8c85-111a10a17192	1	resume-ai-dev-uploads	resumes/ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9/77381421-9609-4379-8c85-111a10a17192/v1_original.pdf	\N	\N	Profile (7).pdf	43403	98587085399998e0485c3779a7d1f61c48c4f9af3090dbd8d41a50242d7742c7	application/pdf	Contato Hiago Dantas www.linkedin.com/in/hiago- Especialista em Dados | Power BI | Dax | Python | ETL | DBA (SQL dantas-8b0245191 (LinkedIn) Server, PostgreSql) | Data Science | IA | BI Analyst | Data Analyst | BI Consultant | SSIS | Predictive Analytics Aparecida de Goiânia, Goiás, Brasil Principais competências ETL (Extração, transformação e carregamento) Resumo Python Resumo Profissional: Microsoft Power BI Profissional com ampla experiência em análise de dados, suporte Certifications técnico e desenvolvimento de soluções inteligentes para negócios. Formação SQL com Microsoft SQL Minha trajetória começou no atendimento ao cliente, passando Server 2017 por funções operacionais e de suporte, até me consolidar como Business Intelligence: Introdução à inteligência empresarial especialista em bancos de dados, BI e inteligência artificial aplicada Fundamentos de Data Science e ao varejo de combustíveis. Inteligência Artificial Certificado de autoridade: SQL Atualmente, atuo como DBA e especialista em dados, garantindo a integridade, performance e segurança do banco de dados SQL Server (5TB+), além de desenvolver e otimizar procedimentos armazenados, ETL e automação de rotinas. Tenho forte domínio de índices, particionamento, tuning de queries e estratégias para lidar com tabelas massivas (500M+ registros). Minha expertise se estende ao ERP Protheus, onde forneço suporte estratégico nos módulos de Faturamento e Varejo, garantindo operações fluidas e auxiliando na tomada de decisões. Paralelamente, sou especialista em Power BI, desenvolvendo dashboards dinâmicos e interativos que fornecem insights estratégicos em tempo real para a gestão. Meu foco é otimizar a performance das consultas e reduzir o impacto no banco de dados, garantindo análises eficientes mesmo em ambientes de alto volume de dados. Com conhecimentos sólidos em Python e IA, estou explorando a aplicação de modelos preditivos e soluções generativas para aprimorar a gestão de preços e margens de combustíveis, visando otimizar a rentabilidade da empresa. Page 1 of 2 Minha missão é transformar dados em decisões inteligentes, aliando tecnologia, automação e inteligência artificial para impulsionar a eficiência e a competitividade do negócio. Experiência Marajó Postos de Serviços S/A Analista de dados sênior março de 2016 - Present (10 anos 2 meses) Goiânia, Goiás, Brasil Formação acadêmica UNOPAR - Universidade Norte do Paraná Bacharelado em Análise e Desenvolvimento de Sistemas, Analise e desenvolvimento de sistemas · (2019 - 2022) Page 2 of 2	completed	\N	2	360	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:40:04.683825-03
68114b9f-c2c3-46b5-be96-ee53ea43fdfe	12e88ab9-2d10-4bb9-a7fc-345395f7e6bf	1	resume-ai-dev-uploads	resumes/4234af6d-08b8-43e6-b0a5-d9179baf7d2c/12e88ab9-2d10-4bb9-a7fc-345395f7e6bf/v1_original.pdf	\N	\N	Profile (8).pdf	37280	8572a58039d37ccce094a2be9ba7c950ac4bd885c83e7a44aed8c953e38c6155	application/pdf	Contato Christian Prado +55 62 99439-4161 (Mobile) christianprado@outlook.com. Nodejs | Typescript | Javascript | SQL | DevOps | Google Cloud br Platform | GitHub | ADVPL/TLPP (Protheus Totvs) Aparecida de Goiânia, Goiás, Brasil www.linkedin.com/in/christian- prado-6a113a228 (LinkedIn) Experiência Principais competências Rede Marajó Desenvolvimento de back-end Desenvolvedor backend Node.js outubro de 2020 - Present (5 anos 7 meses) PostgreSQL Goiânia, Goiás, Brasil Page 1 of 1	completed	\N	1	67	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:51:10.381455-03
3ae254ba-7880-42b2-9469-9c6b3f5a897c	895edcf0-0dd7-4229-8198-bc7d15a97937	1	resume-ai-dev-uploads	resumes/d246ef01-5914-450c-8673-24572b977e8c/895edcf0-0dd7-4229-8198-bc7d15a97937/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:29.367149-03
dbc5aef4-7411-44ea-8a32-6d1ad5afb98b	1ce2d2f2-132d-451f-8166-e1cb007f2ce8	1	resume-ai-dev-uploads	resumes/d95ab262-c912-437d-ab16-66a7e94c98c0/1ce2d2f2-132d-451f-8166-e1cb007f2ce8/v1_original.pdf	\N	\N	backend-profile.pdf	845	2bc41b657a28954d8de814b64f1dbb6fa63d6b535d37173ca0c279801669d578	application/pdf	Curriculo de teste ATS com IA Nome: QA E2E Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI. Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados. Experiencia: 6 anos com servicos backend e integraˆ§ˆ(cid:181)es.	completed	\N	1	38	\N	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:36:35.750384-03
\.


--
-- Data for Name: resumes; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.resumes (id, candidate_id, title, status, current_version, created_by, created_at, updated_at, deleted_at) FROM stdin;
6b7b19ce-11c1-4353-8892-0c293ca96faf	fb8474ac-868f-4474-8c2e-2b9fc7bc2293	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:00:19.638196-03	2026-04-28 15:00:19.777837-03	\N
1cb3867d-bc22-4050-88cf-d7f1c8b29091	41eb5f95-d632-4bc1-a591-d8b1d63e0de7	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 15:18:59.013067-03	2026-04-28 15:18:59.086169-03	\N
8ef78e41-c127-4126-ab2c-bdbe2a8c2bec	f709039e-b5ba-4339-8714-21bd010d7c56	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:11:49.281072-03	2026-04-28 13:11:49.394838-03	\N
728d3174-d90e-4720-9e2e-d6e27af20804	ab0b2d73-ab7d-44a5-94c3-bf1c21733063	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:17:00.911004-03	2026-04-28 13:17:01.078516-03	\N
c6bf0b21-194d-4e6f-b42f-b9186aa18144	4234af6d-08b8-43e6-b0a5-d9179baf7d2c	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:47:42.589219-03	2026-04-28 23:47:42.928506-03	\N
12e88ab9-2d10-4bb9-a7fc-345395f7e6bf	4234af6d-08b8-43e6-b0a5-d9179baf7d2c	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 23:51:10.189964-03	2026-04-28 23:51:10.381455-03	\N
9e598afe-ebd8-4944-a6cd-b450ac5bff67	ba22024f-23df-4ced-8bc0-dc1cda884acb	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:21:03.686892-03	2026-04-28 13:21:03.788415-03	\N
b6f7f85f-3537-4226-a808-756a2ba6d03f	0db26fb0-8008-43b1-bf50-55e9b9518143	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:09.769093-03	2026-04-28 13:22:09.888204-03	\N
0ee1dc1a-ff5d-4ce1-86d7-5dd017dd27af	0d53a1ff-fce7-4a49-b8c6-e83286bd7210	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:22:33.892456-03	2026-04-28 13:22:33.975129-03	\N
ef1c5b08-f009-424d-9ec8-f119bce3842a	9c8edb04-85a3-4c7e-8b28-daf501e6036a	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:19:32.813841-03	2026-04-29 00:19:33.096715-03	\N
77381421-9609-4379-8c85-111a10a17192	ecd8b232-0eb1-44b4-82bd-8fafbf5ebbd9	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:40:04.50241-03	2026-04-28 13:40:04.683825-03	\N
2aec890f-a855-4d17-a905-9a995de2a4ee	bb9c2755-fef1-4767-ac3e-b1581992cefe	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:20:59.997608-03	2026-04-29 00:21:00.06323-03	\N
b5f5ce2a-9d06-4106-9971-c00d7bbe337c	1d84d654-275b-47d7-ab91-348743e52040	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 00:22:26.850005-03	2026-04-29 00:22:26.976475-03	\N
128d667c-b82e-4007-914b-99ee2345a26a	46333bfc-f564-45eb-a3bd-22117964fb2a	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:16:42.09512-03	2026-04-29 07:16:42.30583-03	\N
895edcf0-0dd7-4229-8198-bc7d15a97937	d246ef01-5914-450c-8673-24572b977e8c	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:20:29.250332-03	2026-04-29 07:20:29.367149-03	\N
859aac2f-6172-4458-896c-2b98c6ccfaa6	5ae9b847-fdc3-44e8-8885-0b36dfce4453	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:10.39762-03	2026-04-29 07:24:10.510094-03	\N
10b93c17-beb2-4f28-a215-155a9338e4f1	25cbe08a-c93e-4a64-b661-94d0f7ff68f1	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:24:43.932077-03	2026-04-29 07:24:44.051744-03	\N
eb6f6272-65a2-4a37-ad5d-77666872e726	adccb07f-ba13-4ef1-b321-a9c901e3e677	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:25:50.880127-03	2026-04-29 07:25:50.997554-03	\N
53debea4-cc24-497d-a954-6898c213a505	550364ec-d0b5-4ae3-8ff0-24ed1fe99793	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:26:54.444598-03	2026-04-29 07:26:54.557492-03	\N
1ce2d2f2-132d-451f-8166-e1cb007f2ce8	d95ab262-c912-437d-ab16-66a7e94c98c0	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:36:35.637266-03	2026-04-29 07:36:35.750384-03	\N
156b19e1-3d8b-442c-a8f6-3f5a8e3525b0	c9babfc0-c47e-44d6-9c5d-e28d757d06bf	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:40:19.147387-03	2026-04-29 07:40:19.271286-03	\N
7d7d7b96-d3af-420f-840e-f39f24f105c7	e839ead1-5147-4899-aa45-17d54b911501	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-29 07:41:51.795339-03	2026-04-29 07:41:51.913427-03	\N
caca42e1-9e69-44b8-9e25-03fff89d0243	63187b76-e83b-4545-bdfe-61664ee094c3	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 09:14:01.757825-03	2026-04-28 09:14:01.968218-03	\N
ff0de6df-7a55-468c-a203-0dd9b1778b05	6d8de5dc-a0e9-49c5-b0d2-f30a99b41c56	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:02:47.444035-03	2026-04-28 13:02:47.815919-03	\N
a9502bd4-fc53-4caf-ac6a-998704b330a2	f9b6fa2d-c337-4106-8a7b-a6d06c588561	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:04:20.133891-03	2026-04-28 13:04:20.237937-03	\N
3fb0407e-f349-49b1-b922-d71a4209b9d2	bb2632a2-c424-4ee9-9e36-7c6db2a35282	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:05:20.551592-03	2026-04-28 13:05:20.670884-03	\N
aef4bc3b-0efc-4fa0-8197-a2cd6336fd3b	bb2632a2-c424-4ee9-9e36-7c6db2a35282	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:08:35.681731-03	2026-04-28 13:08:35.924169-03	\N
863924b4-fac8-4831-8765-b53f2eb12ca3	dbbfea9e-1207-4a42-9c58-31ce837773db	Currículo principal	active	1	3f6456a8-4a9a-4e53-91cc-ac1148f793f3	2026-04-28 13:10:09.105983-03	2026-04-28 13:10:09.203252-03	\N
\.


--
-- Data for Name: score_model_versions; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.score_model_versions (id, version, weights, thresholds, is_active, created_at) FROM stdin;
1253564f-bc5e-4f85-b59d-fa07c9edca39	v1	{"education": 0.10, "skill_match": 0.40, "ai_confidence": 0.10, "seniority_match": 0.15, "experience_match": 0.25}	{"low": 45.0, "high": 70.0}	t	2026-04-26 22:43:35.48166-03
\.


--
-- Data for Name: skills; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.skills (id, name, normalized_name, category, aliases, is_verified, created_at, updated_at, deleted_at) FROM stdin;
79c16226-3b2d-41f3-9b06-ee873f11e8c7	PythonTeste	pythonteste	\N	[]	f	2026-04-23 00:32:11.053138-03	2026-04-23 00:32:11.053142-03	\N
4327e861-2f4d-47cc-a0bc-01a776c8158a	GoTestSkill	gotestskill	backend	["golang"]	t	2026-04-23 00:37:53.402995-03	2026-04-23 00:37:53.534118-03	2026-04-23 00:37:53.534118-03
4a8f92ff-df7e-4faf-90c2-688074b7255a	Liderença em IA	liderença em ia	N8N 	[]	f	2026-04-23 12:16:21.893521-03	2026-04-23 20:53:13.277821-03	\N
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.user_sessions (id, user_id, token_hash, user_agent, ip_address, device_fingerprint, last_used_at, expires_at, revoked_at, revoke_reason, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: LecinoLucas
--

COPY public.users (id, email, email_verified_at, password_hash, role, status, full_name, avatar_url, last_login_at, login_count, failed_login_count, locked_until, created_at, updated_at, deleted_at, must_change_password) FROM stdin;
28bf2830-867c-4b26-a95c-b9137d3b2923	jujuba@gmail.com	2026-04-28 12:34:32.344745-03	$2b$12$xDLjPFRkMYPWRb0PpqQa/uubmIdlNEG.vjZLsID9Ehs57LEC0uK9O	recruiter	active	Jujuba	\N	\N	0	0	\N	2026-04-28 12:33:38.744995-03	2026-04-28 12:59:16.424244-03	\N	t
10258ff1-aea4-4c85-9d66-745b78efd936	wesley@gatao.com	2026-04-28 14:41:37.331684-03	$2b$12$vTVh8UbKUlKEfztmHdLx7eCDZ9/U5YL5L79mGeWzo3jVBGnG568C2	recruiter	inactive	Gatão	\N	\N	0	0	\N	2026-04-28 14:41:37.331684-03	2026-04-28 23:32:27.734192-03	2026-04-28 23:32:27.734192-03	t
213f285b-f1d4-4303-b85a-e8c0e48dfb1c	lucas@gmail.com	2026-04-24 22:01:14.993722-03	$2b$12$Js.84VNII3BLzF0qS3SfmO1KVpZ3YQHJ8lypFaIvcLFd3BMHpAFKG	recruiter	active	Lecino Lucas	\N	2026-04-24 22:01:36.39326-03	1	0	\N	2026-04-24 22:01:06.433417-03	2026-04-27 11:43:28.446574-03	\N	f
3f6456a8-4a9a-4e53-91cc-ac1148f793f3	admin@resume.ai	2026-04-22 17:57:29.367029-03	$2b$12$S58cl0yggbLT1O052qofIeMUimxpz2jzRF/g9ZFeC9MlFCOD8KDUi	admin	active	Administrador Dev	/uploads/avatars/3f6456a8-4a9a-4e53-91cc-ac1148f793f3.jpg?v=1777430780	2026-04-29 07:43:24.753602-03	228	0	\N	2026-04-22 17:57:29.366662-03	2026-04-29 07:43:24.754544-03	\N	f
bf975e4a-33bb-43f5-837e-9de8146d3e58	anne@marajo.com	2026-04-28 12:18:22.692122-03	$2b$12$gSeDwM2ESQj6dL4FkXqkUOq.Jbh1RjOjXCITf0rCwx2PrYQDhQZhi	recruiter	active	Anne	\N	\N	0	0	\N	2026-04-28 12:18:16.908685-03	2026-04-28 12:18:22.692122-03	\N	f
53e55b5e-2459-4687-9353-27d1358136e4	candidato@gmail.com	2026-04-24 22:11:11.476142-03	$2b$12$jTl62rkT7nLPmIYxZg.lTuo/.TFO/1M2dlIeeJ7.FjyfpaSO2yliq	candidate	active	Candidato	\N	2026-04-24 22:15:50.756452-03	2	0	\N	2026-04-24 22:11:06.251879-03	2026-04-24 22:15:50.759066-03	\N	f
\.


--
-- Name: admissions admissions_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_pkey PRIMARY KEY (id);


--
-- Name: ai_models ai_models_model_id_key; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_model_id_key UNIQUE (model_id);


--
-- Name: ai_models ai_models_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: analyses analyses_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: analyses analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_pkey PRIMARY KEY (id);


--
-- Name: analysis_results analysis_results_analysis_id_key; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analysis_results
    ADD CONSTRAINT analysis_results_analysis_id_key UNIQUE (analysis_id);


--
-- Name: analysis_results analysis_results_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analysis_results
    ADD CONSTRAINT analysis_results_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id, "timestamp");


--
-- Name: candidate_documents candidate_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_documents
    ADD CONSTRAINT candidate_documents_pkey PRIMARY KEY (id);


--
-- Name: candidate_job_scores candidate_job_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_job_scores
    ADD CONSTRAINT candidate_job_scores_pkey PRIMARY KEY (id);


--
-- Name: candidate_pipeline candidate_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_pipeline
    ADD CONSTRAINT candidate_pipeline_pkey PRIMARY KEY (candidate_id, job_id);


--
-- Name: candidates candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_pkey PRIMARY KEY (id);


--
-- Name: document_ai_analyses document_ai_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.document_ai_analyses
    ADD CONSTRAINT document_ai_analyses_pkey PRIMARY KEY (id);


--
-- Name: document_requirements document_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.document_requirements
    ADD CONSTRAINT document_requirements_pkey PRIMARY KEY (id);


--
-- Name: job_required_skills job_required_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.job_required_skills
    ADD CONSTRAINT job_required_skills_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: pipeline_events pipeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.pipeline_events
    ADD CONSTRAINT pipeline_events_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stage_transitions pipeline_stage_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.pipeline_stage_transitions
    ADD CONSTRAINT pipeline_stage_transitions_pkey PRIMARY KEY (id);


--
-- Name: prompt_templates prompt_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_pkey PRIMARY KEY (id);


--
-- Name: resume_job_matches resume_job_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_job_matches
    ADD CONSTRAINT resume_job_matches_pkey PRIMARY KEY (id);


--
-- Name: resume_versions resume_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_versions
    ADD CONSTRAINT resume_versions_pkey PRIMARY KEY (id);


--
-- Name: resumes resumes_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resumes
    ADD CONSTRAINT resumes_pkey PRIMARY KEY (id);


--
-- Name: score_model_versions score_model_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.score_model_versions
    ADD CONSTRAINT score_model_versions_pkey PRIMARY KEY (id);


--
-- Name: score_model_versions score_model_versions_version_key; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.score_model_versions
    ADD CONSTRAINT score_model_versions_version_key UNIQUE (version);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: admissions uq_admissions_candidate_job; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT uq_admissions_candidate_job UNIQUE (candidate_id, job_id);


--
-- Name: candidate_documents uq_candidate_documents_admission_requirement; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_documents
    ADD CONSTRAINT uq_candidate_documents_admission_requirement UNIQUE (admission_id, document_requirement_id);


--
-- Name: candidate_job_scores uq_candidate_job_score_version; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_job_scores
    ADD CONSTRAINT uq_candidate_job_score_version UNIQUE (candidate_id, job_id, version_id);


--
-- Name: job_required_skills uq_job_skill; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.job_required_skills
    ADD CONSTRAINT uq_job_skill UNIQUE (job_id, skill_id);


--
-- Name: prompt_templates uq_prompt_template_version; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT uq_prompt_template_version UNIQUE (name, version);


--
-- Name: resume_job_matches uq_resume_job_match; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_job_matches
    ADD CONSTRAINT uq_resume_job_match UNIQUE (analysis_id, job_id);


--
-- Name: resume_versions uq_resume_version; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_versions
    ADD CONSTRAINT uq_resume_version UNIQUE (resume_id, version_number);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_analyses_created_at; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_analyses_created_at ON public.analyses USING btree (created_at);


--
-- Name: idx_analyses_status_created_at; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_analyses_status_created_at ON public.analyses USING btree (status, created_at);


--
-- Name: idx_candidate_job_scores_candidate_job; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidate_job_scores_candidate_job ON public.candidate_job_scores USING btree (candidate_id, job_id);


--
-- Name: idx_candidate_job_scores_job_id; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidate_job_scores_job_id ON public.candidate_job_scores USING btree (job_id, final_score);


--
-- Name: idx_candidate_pipeline_job_score; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidate_pipeline_job_score ON public.candidate_pipeline USING btree (job_id, match_score);


--
-- Name: idx_candidate_pipeline_job_stage; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidate_pipeline_job_stage ON public.candidate_pipeline USING btree (job_id, stage);


--
-- Name: idx_candidate_pipeline_last_moved_by; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidate_pipeline_last_moved_by ON public.candidate_pipeline USING btree (last_moved_by);


--
-- Name: idx_candidate_pipeline_status; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidate_pipeline_status ON public.candidate_pipeline USING btree (job_id, status);


--
-- Name: idx_candidates_cpf; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidates_cpf ON public.candidates USING btree (cpf);


--
-- Name: idx_candidates_data_quality_status; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidates_data_quality_status ON public.candidates USING btree (data_quality_status);


--
-- Name: idx_candidates_email; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidates_email ON public.candidates USING btree (email);


--
-- Name: idx_candidates_user_id; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_candidates_user_id ON public.candidates USING btree (user_id);


--
-- Name: idx_document_ai_analyses_document_created; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_document_ai_analyses_document_created ON public.document_ai_analyses USING btree (document_id, created_at);


--
-- Name: idx_document_ai_analyses_status; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_document_ai_analyses_status ON public.document_ai_analyses USING btree (status);


--
-- Name: idx_pipeline_events_created_at; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_pipeline_events_created_at ON public.pipeline_events USING btree (created_at);


--
-- Name: idx_pipeline_events_entity_created; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_pipeline_events_entity_created ON public.pipeline_events USING btree (entity_id, created_at);


--
-- Name: idx_pipeline_events_event_type_created; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_pipeline_events_event_type_created ON public.pipeline_events USING btree (event_type, created_at);


--
-- Name: idx_pipeline_transitions_entry_time; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_pipeline_transitions_entry_time ON public.pipeline_stage_transitions USING btree (candidate_id, job_id, moved_at);


--
-- Name: idx_pipeline_transitions_job_time; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_pipeline_transitions_job_time ON public.pipeline_stage_transitions USING btree (job_id, moved_at);


--
-- Name: idx_pipeline_transitions_moved_by; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_pipeline_transitions_moved_by ON public.pipeline_stage_transitions USING btree (moved_by);


--
-- Name: idx_resume_job_matches_analysis_id; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_resume_job_matches_analysis_id ON public.resume_job_matches USING btree (analysis_id);


--
-- Name: idx_resume_job_matches_job_id; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_resume_job_matches_job_id ON public.resume_job_matches USING btree (job_id, match_score);


--
-- Name: idx_resumes_candidate_id; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_resumes_candidate_id ON public.resumes USING btree (candidate_id);


--
-- Name: idx_score_model_versions_active; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE INDEX idx_score_model_versions_active ON public.score_model_versions USING btree (is_active);


--
-- Name: uq_candidates_active_cpf; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE UNIQUE INDEX uq_candidates_active_cpf ON public.candidates USING btree (cpf) WHERE ((deleted_at IS NULL) AND (cpf IS NOT NULL));


--
-- Name: uq_candidates_active_email; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE UNIQUE INDEX uq_candidates_active_email ON public.candidates USING btree (lower((email)::text)) WHERE ((deleted_at IS NULL) AND (email IS NOT NULL));


--
-- Name: uq_candidates_user_id_not_null; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE UNIQUE INDEX uq_candidates_user_id_not_null ON public.candidates USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: uq_document_ai_analyses_document_processing; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE UNIQUE INDEX uq_document_ai_analyses_document_processing ON public.document_ai_analyses USING btree (document_id) WHERE ((status)::text = 'processing'::text);


--
-- Name: uq_skills_normalized_name_active; Type: INDEX; Schema: public; Owner: LecinoLucas
--

CREATE UNIQUE INDEX uq_skills_normalized_name_active ON public.skills USING btree (normalized_name) WHERE (deleted_at IS NULL);


--
-- Name: admissions admissions_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id);


--
-- Name: admissions admissions_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: analyses analyses_ai_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_ai_model_id_fkey FOREIGN KEY (ai_model_id) REFERENCES public.ai_models(id);


--
-- Name: analyses analyses_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: analyses analyses_prompt_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_prompt_template_id_fkey FOREIGN KEY (prompt_template_id) REFERENCES public.prompt_templates(id);


--
-- Name: analyses analyses_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: analyses analyses_resume_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analyses
    ADD CONSTRAINT analyses_resume_version_id_fkey FOREIGN KEY (resume_version_id) REFERENCES public.resume_versions(id);


--
-- Name: analysis_results analysis_results_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.analysis_results
    ADD CONSTRAINT analysis_results_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.analyses(id);


--
-- Name: audit_logs audit_logs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.user_sessions(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: candidate_documents candidate_documents_admission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_documents
    ADD CONSTRAINT candidate_documents_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES public.admissions(id);


--
-- Name: candidate_documents candidate_documents_document_requirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_documents
    ADD CONSTRAINT candidate_documents_document_requirement_id_fkey FOREIGN KEY (document_requirement_id) REFERENCES public.document_requirements(id);


--
-- Name: candidate_job_scores candidate_job_scores_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_job_scores
    ADD CONSTRAINT candidate_job_scores_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id);


--
-- Name: candidate_job_scores candidate_job_scores_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_job_scores
    ADD CONSTRAINT candidate_job_scores_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: candidate_job_scores candidate_job_scores_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_job_scores
    ADD CONSTRAINT candidate_job_scores_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.score_model_versions(id);


--
-- Name: candidate_pipeline candidate_pipeline_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_pipeline
    ADD CONSTRAINT candidate_pipeline_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id);


--
-- Name: candidate_pipeline candidate_pipeline_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_pipeline
    ADD CONSTRAINT candidate_pipeline_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: candidate_pipeline candidate_pipeline_last_moved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidate_pipeline
    ADD CONSTRAINT candidate_pipeline_last_moved_by_fkey FOREIGN KEY (last_moved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: candidates candidates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: candidates candidates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.candidates
    ADD CONSTRAINT candidates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_ai_analyses document_ai_analyses_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.document_ai_analyses
    ADD CONSTRAINT document_ai_analyses_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.candidate_documents(id) ON DELETE CASCADE;


--
-- Name: pipeline_stage_transitions fk_transition_pipeline_entry; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.pipeline_stage_transitions
    ADD CONSTRAINT fk_transition_pipeline_entry FOREIGN KEY (candidate_id, job_id) REFERENCES public.candidate_pipeline(candidate_id, job_id) ON DELETE CASCADE;


--
-- Name: job_required_skills job_required_skills_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.job_required_skills
    ADD CONSTRAINT job_required_skills_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: job_required_skills job_required_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.job_required_skills
    ADD CONSTRAINT job_required_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id);


--
-- Name: jobs jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: pipeline_stage_transitions pipeline_stage_transitions_moved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.pipeline_stage_transitions
    ADD CONSTRAINT pipeline_stage_transitions_moved_by_fkey FOREIGN KEY (moved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: prompt_templates prompt_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: resume_job_matches resume_job_matches_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_job_matches
    ADD CONSTRAINT resume_job_matches_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.analyses(id);


--
-- Name: resume_job_matches resume_job_matches_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_job_matches
    ADD CONSTRAINT resume_job_matches_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: resume_job_matches resume_job_matches_score_model_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_job_matches
    ADD CONSTRAINT resume_job_matches_score_model_version_id_fkey FOREIGN KEY (score_model_version_id) REFERENCES public.score_model_versions(id);


--
-- Name: resume_versions resume_versions_resume_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_versions
    ADD CONSTRAINT resume_versions_resume_id_fkey FOREIGN KEY (resume_id) REFERENCES public.resumes(id);


--
-- Name: resume_versions resume_versions_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resume_versions
    ADD CONSTRAINT resume_versions_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: resumes resumes_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resumes
    ADD CONSTRAINT resumes_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.candidates(id);


--
-- Name: resumes resumes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.resumes
    ADD CONSTRAINT resumes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: LecinoLucas
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict ysGfyr7WNFJZueA9gk6dmU3DDca7Et8fxzlXcHOQwdHb480MGjynpM9I1AFLLmJ

