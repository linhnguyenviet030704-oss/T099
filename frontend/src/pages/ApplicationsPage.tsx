import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ExternalLink } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useLang } from "../context/LangContext";
import { supabase, handleSupabaseError } from "../lib/supabase";
import type { Application, ApplicationStage } from "../types";
import { getEnumLabels, formatDate } from "../lib/format";
import { APP_STATUS_COLORS, TERMINAL_APP_STATUSES } from "../lib/ui";
import AnimatedPage from "../components/AnimatedPage";
import ConfirmModal from "../components/ConfirmModal";
import { ApplicationSkeleton } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";
import { motion } from "framer-motion";

export default function ApplicationsPage() {
  const { user } = useAuth();
  const { lang, t } = useLang();
  const { success, error: toastError } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [stagesMap, setStagesMap] = useState<Record<string, ApplicationStage[]>>({});
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  const enumLabels = getEnumLabels(lang);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setLoading(true);
      const { data: appsData, error } = await supabase
        .from("job_submits")
        .select("*, job_posts(*, companies(*))")
        .eq("applicant_user_id", user.id)
        .order("applied_at", { ascending: false });
      if (error) {
        toastError(lang === "en" ? "Failed to load applications" : "Không tải được danh sách đơn", handleSupabaseError(error));
        return;
      }
      const items = ((appsData || []) as any[]).map((app) => ({
        ...app,
        job_post: { ...app.job_posts, company: app.job_posts?.companies },
      })) as Application[];
      setApplications(items);
      if (items.length > 0) {
        const { data: stagesData } = await supabase.from("application_stages").select("*").in("application_id", items.map((i) => i.id)).order("created_at", { ascending: false });
        const groups: Record<string, ApplicationStage[]> = {};
        (stagesData || []).forEach((stg: ApplicationStage) => {
          groups[stg.application_id] = groups[stg.application_id] || [];
          groups[stg.application_id].push(stg);
        });
        setStagesMap(groups);
      }
    } finally {
      setLoading(false);
    }
  }, [user, toastError, lang]);

  useEffect(() => { void load(); }, [load]);

  const handleWithdraw = async () => {
    if (!supabase || !user || !withdrawId) return;
    setWithdrawing(true);
    try {
      const { error } = await supabase.from("application_stages").insert({
        application_id: withdrawId,
        changed_by_user_id: user.id,
        stage: "withdrawn",
        note: lang === "en" ? "Candidate withdrew application" : "Ứng viên rút đơn",
        is_system_generated: false,
      });
      if (error) throw error;
      setWithdrawId(null);
      success(t.withdrawnSuccess);
      await load();
    } catch (err: unknown) {
      toastError(lang === "en" ? "Failed to withdraw application" : "Không rút được đơn", handleSupabaseError(err));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white mb-8">{t.myApplications}</h1>
        {loading ? (
          <div className="space-y-4">
            <ApplicationSkeleton count={3} />
          </div>
        ) : applications.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-16 text-center">
            <p className="font-medium text-slate-700 dark:text-slate-300 mb-4">{t.noApplications}</p>
            <Link to="/jobs" className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md transition-colors">
              <Search size={15} /> {t.findJobs}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => {
              const job = app.job_post;
              const isInterview = app.current_status === "interview";
              const canWithdraw = !TERMINAL_APP_STATUSES.includes(app.current_status);
              return (
                <div key={app.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link to={`/applications/${app.id}`} className="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1 transition-colors">
                        {job?.title || "Vị trí tuyển dụng"}
                      </Link>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{job?.company?.name || "Doanh nghiệp"} · {t.appliedAt(formatDate(app.applied_at, false, lang))}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${APP_STATUS_COLORS[app.current_status]}`}>
                      {enumLabels.application_status[app.current_status]}
                    </span>
                  </div>

                  {/* Banner nổi bật khi có lời mời phỏng vấn */}
                  {isInterview && (
                    <div className="mt-3 p-3 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 rounded-xl flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span>{lang === "en" ? "Interview invitation received!" : "Bạn có lời mời hẹn phỏng vấn!"}</span>
                      </div>
                      <Link
                        to={`/applications/${app.id}`}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
                      >
                        {t.selectInterviewSchedule || "Chọn lịch phỏng vấn →"}
                      </Link>
                    </div>
                  )}

                  {(stagesMap[app.id] || []).length > 0 && (
                    <ul className="mt-3 text-xs text-slate-500 dark:text-slate-400 space-y-1 bg-slate-50 dark:bg-slate-700/40 p-3 rounded-xl">
                      {stagesMap[app.id].map((s) => (
                        <li key={s.id}>{formatDate(s.created_at, true, lang)} · {enumLabels.application_status[s.stage]} {s.note ? `— ${s.note}` : ""}</li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    <Link
                      to={`/applications/${app.id}`}
                      className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                    >
                      {t.viewApplicationDetail || "Chi tiết đơn & Tiến trình →"}
                    </Link>

                    {canWithdraw && (
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => setWithdrawId(app.id)} className="text-xs text-red-500 hover:underline font-medium cursor-pointer">
                        {t.withdrawApp}
                      </motion.button>
                    )}
                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>
      <ConfirmModal
        open={Boolean(withdrawId)}
        title={t.withdrawApp}
        message={t.withdrawAppMsg}
        confirmLabel={t.withdrawApp}
        cancelLabel={t.cancel}
        danger
        isLoading={withdrawing}
        onConfirm={() => void handleWithdraw()}
        onCancel={() => setWithdrawId(null)}
      />
    </AnimatedPage>
  );
}

