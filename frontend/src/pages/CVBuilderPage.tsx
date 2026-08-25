import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { supabase } from "../lib/supabase";
import type { UserProfileLine, Resume } from "../types";
import { CvBuilderContainer } from "../components/cv/CvBuilderContainer";
import { CvLine, CvHeader, parseMarkdownToCvLines } from "../lib/cv";
import AnimatedPage from "../components/AnimatedPage";
import LoadingScreen from "../components/LoadingScreen";

export default function CVBuilderPage() {
  const { user } = useAuth();
  const { profile, loading } = useCurrentProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const editId = searchParams.get("id") || searchParams.get("editId");
  const cloneId = searchParams.get("cloneId");
  const targetResumeId = editId || cloneId;

  const [lines, setLines] = useState<UserProfileLine[]>([]);
  const [initialLines, setInitialLines] = useState<CvLine[] | undefined>(undefined);
  const [initialTitle, setInitialTitle] = useState<string>("");
  const [initialHeader, setInitialHeader] = useState<Partial<CvHeader> | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client || !user) return;

    const loadData = async () => {
      // 1. Load user profile lines
      const { data: profileLinesData } = await client
        .from("profile_lines")
        .select("*")
        .eq("user_id", user.id)
        .order("display_order");

      const loadedLines = (profileLinesData || []) as UserProfileLine[];
      setLines(loadedLines);

      // 2. If editing or cloning an existing resume, load its content
      if (targetResumeId) {
        try {
          const { data: resumeData } = await client
            .from("resumes")
            .select("*")
            .eq("id", targetResumeId)
            .eq("user_id", user.id)
            .maybeSingle();

          if (resumeData) {
            const resume = resumeData as Resume;
            const rawTitle = resume.title || resume.original_filename || "CV";
            setInitialTitle(cloneId ? `[Bản sao] ${rawTitle}` : rawTitle);

            // Fetch parsed markdown from embedded_resumes
            const { data: embeddedData } = await client
              .from("embedded_resumes")
              .select("markdown, clean_markdown, metadata")
              .eq("resume_id", targetResumeId)
              .maybeSingle();

            if (embeddedData) {
              const md = embeddedData.clean_markdown || embeddedData.markdown || "";
              if (md.trim()) {
                const parsed = parseMarkdownToCvLines(md);
                if (parsed.lines.length > 0) {
                  setInitialLines(parsed.lines);
                  setInitialHeader(parsed.header);
                }
              }
            }
          }
        } catch (err) {
          console.warn("Could not load target resume data:", err);
        }
      }

      setReady(true);
    };

    void loadData();
  }, [user, targetResumeId, cloneId]);

  if (loading || !ready || !profile) return <LoadingScreen text="Đang tải hồ sơ..." />;

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 mb-4 cursor-pointer">
          <ArrowLeft size={18} />
        </button>
        <CvBuilderContainer
          profile={profile}
          email={profile.email || user?.email || ""}
          sourceLines={lines}
          initialLines={initialLines}
          initialTitle={initialTitle}
          initialHeader={initialHeader}
          onClose={() => navigate("/cv-vault")}
          onCreated={() => navigate("/cv-vault")}
        />
      </div>
    </AnimatedPage>
  );
}
