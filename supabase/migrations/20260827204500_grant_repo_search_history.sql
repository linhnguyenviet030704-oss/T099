-- Grants for repo_search_history table
GRANT ALL ON repo_search_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON repo_search_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON repo_search_history TO anon;
