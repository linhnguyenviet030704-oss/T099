-- ============================================================
-- REPO SEARCH & RESEARCH HISTORY
-- Stores search/evaluation history for CV project repo searches and direct repo evaluations.
-- ============================================================

CREATE TABLE IF NOT EXISTS repo_search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    search_type TEXT NOT NULL CHECK (search_type IN ('cv', 'direct_url')),
    title TEXT NOT NULL,
    resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
    cv_preview TEXT,
    profile_url TEXT,
    extracted_repos JSONB DEFAULT '[]'::jsonb,
    evaluation_results JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'completed' CHECK (status IN ('starting', 'evaluating', 'completed', 'no_repos', 'failed')),
    report_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsh_user_id ON repo_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_rsh_created_at ON repo_search_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rsh_search_type ON repo_search_history(search_type);

DROP TRIGGER IF EXISTS trg_rsh_updated ON repo_search_history;
CREATE TRIGGER trg_rsh_updated BEFORE UPDATE ON repo_search_history
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Enable RLS
ALTER TABLE repo_search_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own search history" ON repo_search_history;
CREATE POLICY "Users can view own search history" ON repo_search_history
    FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own search history" ON repo_search_history;
CREATE POLICY "Users can insert own search history" ON repo_search_history
    FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own search history" ON repo_search_history;
CREATE POLICY "Users can update own search history" ON repo_search_history
    FOR UPDATE USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own search history" ON repo_search_history;
CREATE POLICY "Users can delete own search history" ON repo_search_history
    FOR DELETE USING (user_id IS NULL OR user_id = auth.uid());

-- Grants
GRANT ALL ON repo_search_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON repo_search_history TO authenticated;
GRANT SELECT, INSERT ON repo_search_history TO anon;
