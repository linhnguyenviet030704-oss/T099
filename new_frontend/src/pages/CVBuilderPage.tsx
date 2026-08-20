import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { supabase } from "../lib/supabase";
import type { UserProfileLine } from "../types";
import { CvBuilderContainer } from "../components/cv/CvBuilderContainer";
import AnimatedPage from "../components/AnimatedPage";
import LoadingScreen from "../components/LoadingScreen";

export default function CVBuilderPage() {
  const { user } = useAuth();
  const { profile, loading } = useCurrentProfile();
  const navigate = useNavigate();
  const [lines, setLines] = useState<UserProfileLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase || !user) return;
    void supabase.from("profile_lines").select("*").eq("user_id", user.id).order("display_order").then(({ data }) => {
      setLines((data || []) as UserProfileLine[]);
      setReady(true);
    });
  }, [user]);

  if (loading || !ready || !profile) return <LoadingScreen text="Đang tải hồ sơ..." />;

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-200 mb-4">
          <ArrowLeft size={18} />
        </button>
        <CvBuilderContainer
          profile={profile}
          email={profile.email || user?.email || ""}
          sourceLines={lines}
          onClose={() => navigate("/cv-vault")}
          onCreated={() => navigate("/cv-vault")}
        />
      </div>
    </AnimatedPage>
  );
}
