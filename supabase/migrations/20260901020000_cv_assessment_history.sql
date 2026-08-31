-- ============================================================
-- LỊCH SỬ ĐÁNH GIÁ CV CỦA ỨNG VIÊN (CV ASSESSMENT HISTORY)
-- Lưu trữ kết quả đánh giá năng lực CV theo ngành nghề mục tiêu và trạng thái checklist hành động.
-- ============================================================

CREATE TABLE IF NOT EXISTS cv_assessment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    target_role TEXT NOT NULL,
    target_level TEXT NOT NULL,
    overall_score FLOAT NOT NULL,
    resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
    cv_title TEXT,
    cv_preview TEXT,
    assessment_data JSONB NOT NULL,
    checklist_state JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chỉ mục tối ưu hóa truy vấn theo người dùng và thời gian tạo
CREATE INDEX IF NOT EXISTS idx_cvah_user_id ON cv_assessment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_cvah_created_at ON cv_assessment_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cvah_target_role ON cv_assessment_history(target_role);

-- Trigger cập nhật thời gian updated_at tự động
DROP TRIGGER IF EXISTS trg_cvah_updated ON cv_assessment_history;
CREATE TRIGGER trg_cvah_updated BEFORE UPDATE ON cv_assessment_history
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Kích hoạt Row Level Security (RLS)
ALTER TABLE cv_assessment_history ENABLE ROW LEVEL SECURITY;

-- Chính sách RLS: Người dùng chỉ xem lịch sử của chính mình
DROP POLICY IF EXISTS "Users can view own cv assessments" ON cv_assessment_history;
CREATE POLICY "Users can view own cv assessments" ON cv_assessment_history
    FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

-- Chính sách RLS: Người dùng có thể thêm lịch sử của chính mình
DROP POLICY IF EXISTS "Users can insert own cv assessments" ON cv_assessment_history;
CREATE POLICY "Users can insert own cv assessments" ON cv_assessment_history
    FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Chính sách RLS: Người dùng có thể cập nhật lịch sử của chính mình
DROP POLICY IF EXISTS "Users can update own cv assessments" ON cv_assessment_history;
CREATE POLICY "Users can update own cv assessments" ON cv_assessment_history
    FOR UPDATE USING (user_id IS NULL OR user_id = auth.uid());

-- Chính sách RLS: Người dùng có thể xóa lịch sử của chính mình
DROP POLICY IF EXISTS "Users can delete own cv assessments" ON cv_assessment_history;
CREATE POLICY "Users can delete own cv assessments" ON cv_assessment_history
    FOR DELETE USING (user_id IS NULL OR user_id = auth.uid());

-- Phân quyền truy cập bảng
GRANT ALL ON cv_assessment_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON cv_assessment_history TO authenticated;
GRANT SELECT, INSERT ON cv_assessment_history TO anon;
