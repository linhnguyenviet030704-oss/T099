-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. CANDIDATE NODES (Knowledge Graph - Entities)
-- ============================================================
CREATE TABLE IF NOT EXISTS candidate_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL CHECK (node_type IN (
        'project', 'skill', 'experience', 'education',
        'repo', 'certification', 'publication', 'open_source'
    )),
    name TEXT NOT NULL,          -- e.g. "owner/repo" for project nodes
    description TEXT,
    properties JSONB DEFAULT '{}',
    embedding VECTOR(1536),     -- text-embedding-v4, dim=1536
    source TEXT DEFAULT 'cv_parse' CHECK (source IN (
        'cv_parse', 'manual', 'agent_eval', 'agent_gen'
    )),
    confidence FLOAT DEFAULT 1.0,
    is_active BOOLEAN DEFAULT TRUE,  -- soft delete
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cn_candidate ON candidate_nodes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_cn_type ON candidate_nodes(candidate_id, node_type);
CREATE INDEX IF NOT EXISTS idx_cn_embedding ON candidate_nodes
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_cn_active ON candidate_nodes(candidate_id) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_cn_updated ON candidate_nodes;
CREATE TRIGGER trg_cn_updated BEFORE UPDATE ON candidate_nodes
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================
-- 2. CANDIDATE EDGES (Knowledge Graph - Relationships)
-- ============================================================
CREATE TABLE IF NOT EXISTS candidate_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    from_node UUID NOT NULL REFERENCES candidate_nodes(id) ON DELETE CASCADE,
    to_node UUID NOT NULL REFERENCES candidate_nodes(id) ON DELETE CASCADE,
    edge_type TEXT NOT NULL CHECK (edge_type IN (
        'uses_skill', 'worked_on', 'during_period', 'depends_on',
        'demonstrates', 'collaborated_with', 'part_of', 'evaluated_by'
    )),
    properties JSONB DEFAULT '{}',
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_node, to_node, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_ce_candidate ON candidate_edges(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ce_from ON candidate_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_ce_to ON candidate_edges(to_node);

-- ============================================================
-- 3. PROJECT EVALUATIONS (Agent 1 Output) — Versioned
-- ============================================================
CREATE TABLE IF NOT EXISTS candidate_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    repo_url TEXT NOT NULL,
    repo_full_name TEXT NOT NULL,  -- Normalized in app layer: "owner/repo"
    repo_owner TEXT NOT NULL,     -- Parsed in app layer
    repo_name TEXT NOT NULL,      -- Parsed in app layer
    default_branch TEXT,
    language TEXT,

    -- Tier 1: Heuristic metrics
    heuristic_metrics JSONB,

    -- Tier 2: LLM evaluation
    evaluation_scores JSONB NOT NULL,       -- {completeness: 7, complexity: 5, ...}
    evaluation_breakdown JSONB,             -- Full structured result from LLM
    weighted_score FLOAT GENERATED ALWAYS AS (
        COALESCE((evaluation_scores->>'completeness')::float, 0.0) * 0.20 +
        COALESCE((evaluation_scores->>'complexity')::float, 0.0) * 0.25 +
        COALESCE((evaluation_scores->>'optimization')::float, 0.0) * 0.15 +
        COALESCE((evaluation_scores->>'code_cleanliness')::float, 0.0) * 0.20 +
        COALESCE((evaluation_scores->>'project_understanding')::float, 0.0) * 0.20
    ) STORED,

    summary TEXT,
    red_flags JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    evaluation_tier TEXT NOT NULL DEFAULT 'full'
        CHECK (evaluation_tier IN ('heuristic_only', 'full', 'cached')),
    model_used TEXT DEFAULT 'qwen-plus',
    token_count_input INT,
    token_count_output INT,
    latency_ms INT,

    -- Versioning
    version INT DEFAULT 1,
    is_current BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'complete'
        CHECK (status IN ('pending', 'tier1_complete', 'complete', 'failed')),
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(candidate_id, repo_full_name, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cp_current ON candidate_projects(candidate_id, repo_full_name)
    WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_cp_candidate ON candidate_projects(candidate_id);
CREATE INDEX IF NOT EXISTS idx_cp_score ON candidate_projects(candidate_id, weighted_score DESC);
CREATE INDEX IF NOT EXISTS idx_cp_status ON candidate_projects(status) WHERE status != 'complete';

DROP TRIGGER IF EXISTS trg_cp_updated ON candidate_projects;
CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON candidate_projects
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================
-- 4. REPO CACHE
-- ============================================================
CREATE TABLE IF NOT EXISTS repo_cache (
    repo_full_name TEXT PRIMARY KEY,
    last_commit_sha TEXT NOT NULL,       -- Cache invalidation key
    metadata JSONB NOT NULL,
    file_tree JSONB,
    file_tree_size INT,
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    hit_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rc_expires ON repo_cache(expires_at);

-- ============================================================
-- 5. INTERVIEW SESSIONS & QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    job_id UUID REFERENCES job_posts(id) ON DELETE SET NULL,

    status TEXT DEFAULT 'generated' CHECK (status IN (
        'generating', 'generated', 'reviewed', 'in_progress',
        'completed', 'abandoned'
    )),

    question_distribution JSONB,
    total_questions INT DEFAULT 0,
    coverage_ratio FLOAT DEFAULT 0.0,
    coverage_threshold FLOAT DEFAULT 0.80,  -- recruiter-set
    model_used TEXT,
    generation_latency_ms INT,

    reviewer_notes TEXT,
    is_approved BOOLEAN DEFAULT FALSE,  -- Recruiter must approve before use

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_is_candidate ON interview_sessions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_is_job ON interview_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_is_status ON interview_sessions(status);

DROP TRIGGER IF EXISTS trg_is_updated ON interview_sessions;
CREATE TRIGGER trg_is_updated BEFORE UPDATE ON interview_sessions
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS interview_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,

    text TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'technical', 'behavioral', 'system_design', 'code_review',
        'project_deep_dive', 'problem_solving', 'culture_fit'
    )),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),

    project_reference TEXT,
    jd_requirement_mapped TEXT,
    skills_tested JSONB DEFAULT '[]'::jsonb,

    expected_answer_outline TEXT,
    rubric JSONB,
    follow_ups JSONB DEFAULT '[]'::jsonb,

    question_order INT NOT NULL,
    embedding VECTOR(1536),  -- For similarity/dedup
    is_custom BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, question_order)
);

CREATE INDEX IF NOT EXISTS idx_iq_session ON interview_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_iq_category ON interview_questions(session_id, category);
CREATE INDEX IF NOT EXISTS idx_iq_embedding ON interview_questions
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE candidate_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;

-- Candidates see own data
DROP POLICY IF EXISTS "Users see own nodes" ON candidate_nodes;
CREATE POLICY "Users see own nodes" ON candidate_nodes
    FOR ALL USING (candidate_id = auth.uid());

DROP POLICY IF EXISTS "Users see own edges" ON candidate_edges;
CREATE POLICY "Users see own edges" ON candidate_edges
    FOR ALL USING (candidate_id = auth.uid());

DROP POLICY IF EXISTS "Users see own projects" ON candidate_projects;
CREATE POLICY "Users see own projects" ON candidate_projects
    FOR ALL USING (candidate_id = auth.uid());

DROP POLICY IF EXISTS "Users see own sessions" ON interview_sessions;
CREATE POLICY "Users see own sessions" ON interview_sessions
    FOR SELECT USING (candidate_id = auth.uid());

-- Recruiters see interview sessions assigned to their jobs
DROP POLICY IF EXISTS "Recruiters see assigned sessions" ON interview_sessions;
CREATE POLICY "Recruiters see assigned sessions" ON interview_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM job_posts jp
            WHERE jp.id = job_id
            AND jp.recruiter_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Recruiters see session questions" ON interview_questions;
CREATE POLICY "Recruiters see session questions" ON interview_questions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM interview_sessions s
            LEFT JOIN job_posts jp ON jp.id = s.job_id
            WHERE s.id = session_id
            AND (s.candidate_id = auth.uid() OR jp.recruiter_id = auth.uid())
        )
    );

-- ============================================================
-- 7. GRAPH TRAVERSAL FUNCTIONS
-- ============================================================

-- Get all project nodes + eval scores for a candidate
CREATE OR REPLACE FUNCTION get_candidate_projects(p_candidate_id UUID)
RETURNS TABLE(node_id UUID, repo_full_name TEXT, properties JSONB, scores JSONB, weighted_score FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT cn.id, cn.name, cn.properties, cp.evaluation_scores, cp.weighted_score
    FROM candidate_nodes cn
    JOIN candidate_projects cp ON cp.repo_full_name = cn.name AND cp.candidate_id = cn.candidate_id
    WHERE cn.candidate_id = p_candidate_id
      AND cn.node_type = 'project'
      AND cn.is_active = TRUE
      AND cp.is_current = TRUE;
END;
$$;
